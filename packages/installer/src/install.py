#!/usr/bin/env python3
"""The Python side of the install in one pass: unpacks the game, shuts the
client down, writes both VDFs, lays out the artwork, brings the client back
and verifies that the edits survived.

    install.py --recipe R --game-dir D --archive Z --proton NAME [--art A] [--dry-run]
    install.py --recipe R --game-dir D --uninstall

Everything it has to say goes to stdout the moment it happens, and setup.sh
copies that into install.log, tracebacks included. The log is there for the
install that went wrong, so it cannot wait for the install to get far enough
to write it.

Exit codes: 0 installed; 1 failed; 2 Steam kept undoing the edit; 3 the Steam
account has to be chosen; 4 (PARTIAL) the game is in the library, but a step
after the shortcut did not go through.
"""

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
import textwrap
import time
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import steam_install as si
import steamctl
import unpack
import vdf

PARTIAL = 4
PROGRESS_REF = None
QDBUS = shutil.which('qdbus6') or shutil.which('qdbus')
# True while the client is down because of us. Every way out of main(), an
# exception included, brings it back: left down, Steam looks to the player as
# if the installer broke it.
STEAM_STOPPED = False


def log(msg=''):
    print(msg, flush=True)


def progress(pct=None, text=None):
    """Drives the progress bar opened by the shell wrapper. Silently does
    nothing when running without a GUI - the install does not depend on it."""
    if not PROGRESS_REF or not QDBUS:
        return
    try:
        if pct is not None:
            subprocess.run([QDBUS] + PROGRESS_REF.split() + ['Set', '', 'value', str(pct)],
                           capture_output=True, timeout=5)
        if text is not None:
            subprocess.run([QDBUS] + PROGRESS_REF.split() + ['setLabelText', text],
                           capture_output=True, timeout=5)
    except Exception:
        pass


def stop_steam():
    global STEAM_STOPPED
    if not steamctl.shutdown(log=log):
        return False
    STEAM_STOPPED = True
    return True


def start_steam():
    global STEAM_STOPPED
    STEAM_STOPPED = False
    return steamctl.start(log=log)


def step(what, fn, *args, **kwargs):
    """Runs one edit the others do not depend on. True if it went through.

    A failure is logged with its traceback instead of ending the install. The
    shortcut, the Proton mapping and the artwork live in separate files, so
    one of them failing is no reason to skip the rest: a game in the library
    with its artwork and without Proton is one setting away from starting.
    Stopping at the first error left it with neither, and the client down.
    """
    try:
        fn(*args, **kwargs)
        return True
    except Exception:
        log('  %s FAILED:' % what)
        log(textwrap.indent(traceback.format_exc().rstrip(), '    '))
        return False


def system_line():
    """What the install ran on, for whoever reads the log."""
    try:
        with open('/etc/os-release', encoding='utf-8') as f:
            info = dict(line.rstrip('\n').split('=', 1) for line in f if '=' in line)
    except OSError:
        info = {}
    words = [info[k].strip('"') for k in ('NAME', 'VERSION_ID', 'BUILD_ID') if k in info]
    return '%s, Python %s' % (' '.join(words) or platform.system(),
                              platform.python_version())


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--recipe')
    ap.add_argument('--game-dir',
                    help='where the archive goes (the recipe path lives inside)')
    ap.add_argument('--archive', default='',
                    help='the zip to unpack first, the .run itself will do')
    ap.add_argument('--proton', default='')
    ap.add_argument('--art', default='')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--uninstall', action='store_true')
    ap.add_argument('--list-proton', action='store_true')
    ap.add_argument('--list-users', action='store_true')
    ap.add_argument('--steam-user', default='',
                    help='userdata folder to install into, when there is a choice')
    ap.add_argument('--purge', action='store_true',
                    help='on uninstall, also remove the game folder and the prefix')
    ap.add_argument('--progress-ref', default='',
                    help='DBus reference to the progress bar opened by the shell')
    a, _ = ap.parse_known_args(argv)

    if a.list_proton:
        for human, val in si.list_proton():
            print('%s\t%s' % (val, human))
        return 0

    if a.list_users:
        for uid, human in si.list_users():
            print('%s\t%s' % (uid, human))
        return 0

    if not a.recipe or not a.game_dir:
        ap.error('--recipe and --game-dir are required')
    global PROGRESS_REF
    PROGRESS_REF = a.progress_ref or None

    log('Plumber %s log' % ('uninstall' if a.uninstall else 'install'))
    log('%s, %s\n' % (time.strftime('%Y-%m-%d %H:%M:%S'), system_line()))
    try:
        return run(a)
    except Exception:
        # Whatever it is, the log has to name it: the log is all the player
        # has to send back
        log('\nUNEXPECTED ERROR')
        log(traceback.format_exc().rstrip())
        return 1
    finally:
        if STEAM_STOPPED:
            log('\nSteam is still down, starting it again')
            start_steam()


def run(a):
    recipe = json.load(open(a.recipe, encoding='utf-8'))
    name = recipe['name']
    exe = os.path.join(os.path.abspath(a.game_dir), recipe['exe'])
    appid = si.make_appid('"%s"' % exe, name)

    log('game:   %s' % name)
    log('exe:    %s' % exe)
    log('appid:  %d' % appid)

    try:
        uid = si.find_user(log=log, chosen=a.steam_user)
    except si.AmbiguousUser as exc:
        # 5.1.1 step 5: ask rather than guess. The shell has the dialogs, so it
        # re-runs us with --steam-user once the human has picked.
        log('More than one Steam account here and nothing decides between them:')
        for cand, human in exc.candidates:
            log('  %s  %s' % (cand, human))
        log('Pass --steam-user <folder> to choose.')
        return 3
    sc_path = os.path.join(si.user_config(uid), 'shortcuts.vdf')
    cfg_path = os.path.join(si.STEAM_ROOT, 'config', 'config.vdf')

    if a.uninstall:
        return do_uninstall(uid, appid, '"%s"' % exe, a)

    names = set()
    if a.archive:
        names = unpack_game(a, recipe)
        if names is None:
            return 1

    # A dry run unpacks nothing, so the archive is where the exe has to be
    if not os.path.isfile(exe) and not (a.dry_run and recipe['exe'] in names):
        log('ERROR: The game\'s exe is not where the recipe says: %s' % recipe['exe'])
        return 1

    # Empty folders for user data go next to the exe, not into the extraction
    # root: the game looks for them relative to itself.
    for ud in recipe.get('user_data', []):
        d = os.path.join(os.path.dirname(exe), ud)
        if not a.dry_run and not os.path.isdir(d):
            os.makedirs(d, exist_ok=True)
            log('created %s' % d)

    wrappers = si.wrappers_from(recipe, exe, log=log)
    lopts = si.launch_options_for(wrappers)
    if wrappers:
        log('  -> %s' % lopts)

    icon = ''
    if a.art:
        for ext in ('.png', '.jpg', '.jpeg'):
            if os.path.isfile(os.path.join(a.art, 'icon' + ext)):
                icon = os.path.join(si.user_config(uid), 'grid',
                                    '%d_icon%s' % (appid, ext))
                break

    entry = si.build_entry(appid, name, exe, icon=icon, launch_options=lopts)

    if a.dry_run:
        log('\n--- dry run, nothing is modified ---')
        log('shortcut:')
        for k, v in entry.items():
            log('  %-20s %r' % (k, v))
        log('CompatToolMapping[%d] = %s' % (appid, a.proton or '(not set)'))
        log('artwork from: %s' % (a.art or '(none)'))
        log('files: %s' % sc_path)
        log('       %s' % cfg_path)
        return 0

    # What did not go through while the game itself did. The install still
    # runs to the end and returns PARTIAL, so the dialog can say what is left
    # to do by hand.
    problems = []
    if a.proton:
        log('proton: %s' % a.proton)
    else:
        # The list of installed versions came back empty. Without a tool the
        # client runs the exe as a Linux program, and it does not start.
        log('proton: none chosen, it has to be picked in the game\'s Properties')
        problems.append('Proton')

    progress(82, 'Closing Steam...')
    if not stop_steam():
        log('Steam did not shut down - aborting without touching anything')
        return 1

    # One backup, taken before the first write, and it is also what every retry
    # starts from. A backup taken after a failed attempt captures whatever Steam
    # rolled the file back to, which is exactly the state we are trying to undo
    # (5.1.0, rule 4).
    progress(85, 'Backing up Steam settings...')
    sc_backup = si.backup(sc_path, log=log)
    si.backup(cfg_path, log=log)

    for attempt in (1, 2, 3):
        log('\n--- attempt %d ---' % attempt)
        failed = []

        if attempt > 1:
            progress(82, 'Closing Steam...')
            if not stop_steam():
                log('Steam did not shut down - stopping, the backup is intact')
                return 1
            # Steam may have put its own state here while it was up. Start from
            # the list as we found it, or the shortcuts it dropped stay dropped.
            si.restore(sc_backup, sc_path, log=log)

        progress(88, 'Adding the game to your library...')
        expect = si.add_shortcut(uid, entry, log=log)
        proton = a.proton
        if proton and not step('Proton', si.set_proton, appid, proton, log=log):
            failed.append('Proton')
            # It raised, so it raises again on the next attempt: checking for
            # it would fail all three and take the game back out of the library
            proton = ''
        if a.art:
            progress(91, 'Installing artwork...')
            if not step('artwork', si.install_art, uid, appid, a.art, log=log):
                failed.append('artwork')

        mtime = os.stat(sc_path).st_mtime
        progress(93, 'Starting Steam again...')
        if not start_steam():
            # Without a running client nothing has rewritten the file, so a
            # check now would only be reading back our own write (5.1.0).
            log('Steam did not come back up - cannot tell whether the edit stuck')
            si.restore(sc_backup, sc_path, log=log)
            return 1

        progress(96, 'Waiting for Steam to save the library...')
        rewritten = steamctl.wait_rewrite(sc_path, mtime, log=log)
        time.sleep(5)

        progress(99, 'Verifying...')
        log('verification after restart:')
        if not rewritten:
            log('  Steam never rewrote the file, so this proves nothing yet')

        if si.verify(uid, appid, proton, expect_count=expect, log=log) and rewritten:
            if not step('uninstaller', install_uninstaller,
                        os.path.abspath(a.game_dir), a.recipe, log=log):
                failed.append('uninstaller')
            problems += failed
            if problems:
                log('\nINSTALLED on attempt %d, without: %s'
                    % (attempt, ', '.join(problems)))
                return PARTIAL
            log('\nINSTALLED on attempt %d' % attempt)
            return 0
        log('changes did not survive, retrying')

    # Out of attempts. Leave the shortcut list as we found it rather than as
    # whatever the last round happened to produce.
    log('\nFAILED after three attempts, restoring the shortcut list')
    if stop_steam():
        si.restore(sc_backup, sc_path, log=log)
        start_steam()
    else:
        log('  Steam would not shut down; the backup is at %s' % sc_backup)
    return 2


def unpack_game(a, recipe):
    """Step 2 of 5.1, before Steam is touched: minutes of unpacking are no
    reason to keep the client down. -> the paths in the archive, None if it
    failed."""
    game_dir = os.path.abspath(a.game_dir)
    log('\n--- unpacking ---')
    log('archive: %s' % a.archive)
    progress(2, 'Reading the archive...')
    try:
        with unpack.open_archive(a.archive) as zf:
            items, kept = unpack.plan(zf, game_dir, keep=recipe.get('user_data', []))
            size = sum(info.file_size for info, _, is_dir in items if not is_dir)
            log('%d entries, %s' % (len(items), unpack.human(size)))
            log('packed with: %s' % ', '.join('%s x%d' % mn for mn in unpack.packing(items)))
            unpack.check_methods(items)
            if any(info.compress_type == unpack.DEFLATE64 for info, _, _ in items):
                log('Deflate64 goes through %s' % (
                    unpack.funzip() or "the installer's own decoder: slower than the rest"))
            for folder in kept:
                log('keeping %s as it is, it is already there' % folder)
            names = {os.path.relpath(target, game_dir) for _, target, _ in items}
            if a.dry_run:
                return names

            need, free = unpack.check_space(items, game_dir)
            log('space: %s needed, %s free' % (unpack.human(need), unpack.human(free)))
            t0 = time.time()
            unpack.extract(zf, items, progress=unpack_progress())
            log('unpacked in %.0fs' % (time.time() - t0))
            return names
    except unpack.UnpackError as exc:
        log('ERROR: %s' % exc)
        return None


def unpack_progress():
    """Moves the bar from 3 to 80 percent as the bytes come out, a couple of
    times a second at most: every move is two qdbus processes."""
    last = [0.0]

    def report(done, total):
        now = time.time()
        if now - last[0] < 0.5 and done < total:
            return
        last[0] = now
        progress(3 + 77 * done // max(total, 1),
                 'Extracting: %s of %s' % (unpack.human(done), unpack.human(total)))
    return report


def install_uninstaller(game_dir, recipe_path, log=print):
    """Drops everything needed for an uninstall into the game folder.

    Without this the only way to remove the game is the original `.run`, and
    that weighs as much as the game itself - nobody keeps it around. The
    working modules go into a dot directory; a single executable file is what
    shows up outside.
    """
    here = os.path.dirname(os.path.abspath(__file__))
    lib = os.path.join(game_dir, '.plumber')
    os.makedirs(lib, exist_ok=True)

    # copyfile, not copy2: meta comes with zero mtimes (see install_art), and
    # an uninstall.run dated 1970 looks broken in the file manager
    for name in ('install.py', 'steam_install.py', 'steamctl.py', 'unpack.py',
                 'vdf.py', 'config_surgery.py'):
        src = os.path.join(here, name)
        if os.path.isfile(src):
            shutil.copyfile(src, os.path.join(lib, name))
    shutil.copyfile(recipe_path, os.path.join(lib, 'recipe.json'))

    tpl = os.path.join(here, 'uninstall-template.sh')
    dst = os.path.join(game_dir, 'uninstall.run')
    if os.path.isfile(tpl):
        shutil.copyfile(tpl, dst)
        os.chmod(dst, 0o755)      # created locally, so set the bit right away
        log('  uninstaller: %s' % dst)
    else:
        log('  uninstall-template.sh not found, uninstaller not installed')


def do_uninstall(uid, appid, exe_quoted, a):
    log('\n--- uninstall ---')
    idx, found = si.find_shortcut(uid, appid=appid, exe_quoted=exe_quoted)
    if found:
        real = vdf.as_unsigned32(found.get('appid', 0))
        log('  found shortcut "%s": %s, appid=%d'
            % (idx, found.get('AppName'), real))
        appid = real
    else:
        log('  no shortcut with this Exe, using computed appid=%d' % appid)
    if a.dry_run:
        log('dry run: would remove shortcut %d, its CompatToolMapping and artwork' % appid)
        return 0
    if not stop_steam():
        log('Steam did not shut down - aborting')
        return 1
    sc_path = os.path.join(si.user_config(uid), 'shortcuts.vdf')
    si.backup(sc_path, log=log)
    si.backup(os.path.join(si.STEAM_ROOT, 'config', 'config.vdf'), log=log)
    si.remove_shortcut(uid, appid=appid, log=log)
    si.unset_proton(appid, log=log)
    si.remove_art(uid, appid, log=log)

    if a.purge:
        pfx = os.path.join(si.STEAM_ROOT, 'steamapps', 'compatdata', str(appid))
        gd = os.path.abspath(a.game_dir)
        # portable games keep their saves next to the exe - warn about it
        saves = [os.path.join(r, f) for r, _, fs in os.walk(gd)
                 for f in fs if os.sep + 'SAVES' + os.sep in os.path.join(r, f)]
        if saves:
            log('  WARNING: %d files in SAVES/ inside the game folder - they '
                'will be deleted with it' % len(saves))
        for extra in (os.path.join(gd, '.plumber'),):
            if os.path.isdir(extra):
                shutil.rmtree(extra, ignore_errors=True)
        for path, what in ((gd, 'game folder'), (pfx, 'prefix')):
            if os.path.isdir(path):
                shutil.rmtree(path, ignore_errors=True)
                log('  removed: %s (%s)' % (what, path))

    start_steam()
    if not a.purge:
        log('done (game folder and prefix kept - see --purge)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
