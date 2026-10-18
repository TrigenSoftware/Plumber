#!/usr/bin/env python3
"""Compares the installed state against what the recipe says it should be.

Kept separate from install.py on purpose: the checking should be done by code
that wrote nothing. Useful both as an acceptance run right after an install and
as a diagnostic later on.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config_surgery
import steam_install as si


def main(recipe_path, game_dir, expect_tool, art_dir='', steam_user=''):
    recipe = json.load(open(recipe_path, encoding='utf-8'))
    exe = os.path.join(os.path.abspath(game_dir), recipe['exe'])
    appid = si.make_appid('"%s"' % exe, recipe['name'])
    try:
        uid = si.find_user(log=lambda m: None, chosen=steam_user)
    except si.AmbiguousUser as exc:
        print('More than one Steam account here; say which to check:')
        for cand, human in exc.candidates:
            print('  %s  %s' % (cand, human))
        return 3
    fails = []

    def check(label, cond, detail=''):
        print('  %-46s %s%s' % (label, 'OK' if cond else 'FAILED',
                                '' if cond else '  ' + detail))
        if not cond:
            fails.append(label)

    print('appid: %d\n' % appid)
    check('exe in place', os.path.isfile(exe), exe)

    _, entry = si.find_shortcut(uid, appid=appid)
    check('shortcut present', bool(entry))
    if entry:
        check(
            '  AppName', entry.get('AppName') == recipe['name'],
            repr(entry.get('AppName')))
        check('  Exe is quoted', entry.get('Exe') == '"%s"' % exe)
        check('  StartDir', entry.get('StartDir') == os.path.dirname(exe) + '/')
        wrappers = si.wrappers_from(recipe, exe, log=lambda m: None)
        check(
            '  LaunchOptions for wrappers %s' % (wrappers or 'none'),
            entry.get('LaunchOptions') == si.launch_options_for(wrappers),
            repr(entry.get('LaunchOptions')))
        if art_dir and os.path.isfile(os.path.join(art_dir, 'icon.png')):
            check(
                '  icon points into grid',
                entry.get('icon', '').endswith('%d_icon.png' % appid),
                repr(entry.get('icon')))

    cfg = open(
        os.path.join(si.STEAM_ROOT, 'config', 'config.vdf'),
        encoding='utf-8', errors='surrogateescape').read()
    got = config_surgery.get_mapping(cfg, appid)
    check(
        'CompatToolMapping = %s' % expect_tool,
        bool(got) and got.get('name') == expect_tool, repr(got))
    if got:
        check('  priority = 250', got.get('priority') == '250')

    grid = os.path.join(si.user_config(uid), 'grid')
    for kind, suffix in si.ART_SUFFIX.items():
        if not art_dir:
            break
        has_src = any(
            os.path.isfile(os.path.join(art_dir, kind + e))
            for e in ('.png', '.jpg', '.jpeg'))
        if not has_src:
            continue
        found = [
            f for f in os.listdir(grid)
            if f.startswith(str(appid))
            and os.path.splitext(f)[0] == '%d%s' % (appid, suffix)]
        check('artwork %s' % kind, bool(found), 'no %d%s.*' % (appid, suffix))

    print()
    if fails:
        print('FAILURES: %d' % len(fails))
        return 1
    print('EVERYTHING MATCHES THE RECIPE')
    return 0


if __name__ == '__main__':
    if len(sys.argv) < 4:
        sys.exit(
            'usage: check-install.py <recipe> <game-dir> <proton-tool> '
            '[art-dir] [steam-user]')
    sys.exit(main(*sys.argv[1:6]))
