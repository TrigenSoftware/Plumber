#!/usr/bin/env python3
"""Self-test for the installer's pure logic.

    python3 packages/installer/src/selftest.py

No dependencies and no pytest: the modules next to it go into a bundle as they
are, so they may not grow requirements. Nothing here touches a live Steam - every test
builds a throwaway `~/.steam/steam` in a temp directory and points the module at
it.

What is deliberately NOT covered: steamctl itself, the part that talks to a
running client. That was verified by hand on a Deck; see section 9 of the spec.
install.py runs here against a stand-in for it, and setup.sh runs whole with
a stub in place of install.py.
"""

import contextlib
import io
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import zipfile
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
# make-run.sh lives a level up: it builds a .run, it is not part of one
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import config_surgery
import deflate64
import install
import steam_install as si
import steamctl
import unpack
import vdf

CASES = []
FAILED = []


def case(fn):
    """Registers a test. The docstring's first line is the title."""
    CASES.append(fn)
    return fn


def eq(got, want, what):
    if got != want:
        raise AssertionError('%s:\n    got  %r\n    want %r' % (what, got, want))


def ok(cond, what):
    if not cond:
        raise AssertionError(what)


def quiet(_msg=''):
    pass


# ------------------------------------------------------------------ fixtures

def fake_steam(tmp, users=('12345678',), accounts=None):
    """A Steam root with the files the installer reads.

    `accounts` maps a userdata folder to (persona, timestamp, autologin).
    """
    root = os.path.join(tmp, 'steam')
    for uid in users:
        os.makedirs(os.path.join(root, 'userdata', uid, 'config'), exist_ok=True)
    os.makedirs(os.path.join(root, 'config'), exist_ok=True)

    if accounts:
        body = ''
        for uid, (persona, stamp, auto) in accounts.items():
            body += (
                '\t"%d"\n\t{\n\t\t"PersonaName"\t\t"%s"\n'
                '\t\t"Timestamp"\t\t"%d"\n\t\t"AutoLogin"\t\t"%s"\n\t}\n'
                % (int(uid) + si.STEAMID64_BASE, persona, stamp, '1' if auto else '0'))
        with open(os.path.join(root, 'config', 'loginusers.vdf'), 'w') as f:
            f.write('"users"\n{\n%s}\n' % body)

    with open(os.path.join(root, 'config', 'config.vdf'), 'w') as f:
        f.write(CONFIG_WITH_CTM)

    si.STEAM_ROOT = root
    return root


CONFIG_WITH_CTM = '''"InstallConfigStore"
{
\t"Software"
\t{
\t\t"Valve"
\t\t{
\t\t\t"Steam"
\t\t\t{
\t\t\t\t"KeepEverything"\t\t"1"
\t\t\t\t"CompatToolMapping"
\t\t\t\t{
\t\t\t\t\t"3786021133"
\t\t\t\t\t{
\t\t\t\t\t\t"name"\t\t"GE-Proton9-11"
\t\t\t\t\t\t"config"\t\t""
\t\t\t\t\t\t"priority"\t\t"250"
\t\t\t\t\t}
\t\t\t\t}
\t\t\t}
\t\t}
\t}
}
'''

CONFIG_WITHOUT_CTM = '''"InstallConfigStore"
{
\t"Software"
\t{
\t\t"Valve"
\t\t{
\t\t\t"Steam"
\t\t\t{
\t\t\t\t"KeepEverything"\t\t"1"
\t\t\t\t"Accounts"
\t\t\t\t{
\t\t\t\t\t"deck"
\t\t\t\t\t{
\t\t\t\t\t\t"SteamID"\t\t"76561197972611406"
\t\t\t\t\t}
\t\t\t\t}
\t\t\t}
\t\t}
\t}
}
'''


def shortcut(appid, name, exe):
    return si.build_entry(appid, name, exe)


# ----------------------------------------------------------------------- vdf

@case
def test_shortcuts_round_trip():
    """vdf: a file read and written back is byte-identical"""
    # The check section 9 calls decisive: it proves the format is understood
    # whole, with no "almost parsed" places that a rewrite would drop.
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, 'shortcuts.vdf')
        data = {
            '0': shortcut(0x81111111, 'Chrome', '/usr/bin/chrome'),
            '1': shortcut(
                0x8fabcdef, 'Need for Speed: Most Wanted',
                '/home/deck/Games/nfsmw/game/speed.exe')
        }
        vdf.write_shortcuts(path, data)
        first = open(path, 'rb').read()

        root, back, raw, endpos = vdf.read_shortcuts(path)
        eq(root, 'shortcuts', 'root key')
        eq(back, data, 'parsed entries')

        vdf.write_shortcuts(path, back, root=root, tail=raw[endpos:])
        eq(open(path, 'rb').read(), first, 'bytes after a round-trip')


@case
def test_binary_tail_is_preserved():
    """vdf: whatever follows the root object survives a rewrite"""
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, 'shortcuts.vdf')
        vdf.write_shortcuts(path, {'0': shortcut(0x80000001, 'X', '/x')}, tail=b'\x08')
        _, data, raw, endpos = vdf.read_shortcuts(path)
        eq(raw[endpos:], b'\x08', 'tail')


@case
def test_unknown_tag_is_refused():
    """vdf: an unknown type tag raises instead of guessing"""
    # The set of fields evolves - `sortas` appeared in an entry Steam wrote
    # today (5.2) - so the parser skips by type tag. An unknown tag means the
    # format moved and quietly carrying on would corrupt the file.
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, 'broken.vdf')
        with open(path, 'wb') as f:
            f.write(b'\x00shortcuts\x00\x7fmystery\x00\x08\x08')
        try:
            vdf.read_shortcuts(path)
        except ValueError as exc:
            ok('unknown tag' in str(exc), 'error names the tag: %s' % exc)
        else:
            raise AssertionError('a 0x7f tag was accepted')


@case
def test_appid_formula():
    """vdf: appid is CRC32 of the quoted Exe plus AppName, high bit set"""
    exe = '"/home/deck/Games/nfsmw/game/speed.exe"'
    name = 'Need for Speed: Most Wanted'
    appid = vdf.shortcut_appid(exe, name)

    ok(appid & 0x80000000, 'high bit set')
    eq(appid, si.make_appid(exe, name), 'both spellings agree')
    eq(vdf.shortcut_appid(exe, name), appid, 'same input, same number')
    ok(vdf.shortcut_appid(exe, 'Other') != appid, 'a different name moves it')


@case
def test_signed_unsigned_round_trip():
    """vdf: appid survives the trip through a signed int32 field"""
    # It is stored signed and read back unsigned; artwork file names use the
    # unsigned form, so a slip here detaches every cover (7.5).
    for value in (0x80000000, 0x8fabcdef, 0xffffffff, 0x00000001):
        eq(vdf.as_unsigned32(vdf.as_signed32(value)), value, 'round-trip of %#x' % value)


@case
def test_text_keyvalues():
    """vdf: text KeyValues parse into nested dicts, lookup ignores case"""
    parsed = vdf.text_loads(CONFIG_WITH_CTM)
    ctm = vdf.find_path(parsed, 'installconfigstore', 'SOFTWARE', 'valve',
                        'Steam', 'compattoolmapping')
    ok(ctm is not None, 'found the block through mixed case')
    eq(ctm['3786021133']['name'], 'GE-Proton9-11', 'mapping name')
    eq(vdf.find_path(parsed, 'nope'), None, 'missing key gives None')


# ------------------------------------------------------------ config surgery

@case
def test_mapping_added_to_existing_block():
    """config.vdf: an entry is added and nothing else moves"""
    out = config_surgery.set_mapping(CONFIG_WITH_CTM, 2411661295, 'proton_9')

    eq(
        config_surgery.get_mapping(out, 2411661295),
        {'name': 'proton_9', 'config': '', 'priority': '250'}, 'the new entry')
    ok('"KeepEverything"\t\t"1"' in out, 'unrelated key untouched')
    ok(config_surgery.get_mapping(out, 3786021133) is not None, 'existing entry kept')


@case
def test_mapping_block_is_created_when_absent():
    """config.vdf: with no compat tool ever set, the block gets made"""
    # Before this, set_mapping raised - and it raised after the client was
    # already down and the shortcut already written, leaving a half-done
    # install. Section 5.2 step 2 says create it.
    ok(config_surgery._locate_ctm(CONFIG_WITHOUT_CTM) is None, 'no block to start with')

    out = config_surgery.set_mapping(CONFIG_WITHOUT_CTM, 2411661295, 'proton_9')

    eq(
        config_surgery.get_mapping(out, 2411661295),
        {'name': 'proton_9', 'config': '', 'priority': '250'}, 'the entry')
    ok('"SteamID"\t\t"76561197972611406"' in out, 'nested block untouched')
    eq(out.count('{'), out.count('}'), 'braces balanced')


@case
def test_mapping_replaced_not_duplicated():
    """config.vdf: setting the same appid twice leaves one entry"""
    once = config_surgery.set_mapping(CONFIG_WITH_CTM, 2411661295, 'proton_9')
    twice = config_surgery.set_mapping(once, 2411661295, 'proton_10')

    eq(twice.count('"2411661295"'), 1, 'entries for the appid')
    eq(config_surgery.get_mapping(twice, 2411661295)['name'], 'proton_10', 'the tool')


@case
def test_mapping_removal_restores_the_file():
    """config.vdf: adding then removing gives back the original bytes"""
    out = config_surgery.set_mapping(CONFIG_WITH_CTM, 2411661295, 'proton_9')
    eq(config_surgery.remove_mapping(out, 2411661295), CONFIG_WITH_CTM, 'the file')


@case
def test_missing_path_is_an_error():
    """config.vdf: a file without the Valve/Steam path is refused"""
    # There is no safe guess here: writing into the wrong place breaks every
    # client setting at once (2.2).
    try:
        config_surgery.set_mapping('"Something"\n{\n}\n', 1, 'proton_9')
    except KeyError:
        pass
    else:
        raise AssertionError('a config without the path was accepted')


@case
def test_path_is_found_in_any_case():
    """config.vdf: the path is found in whatever case the client wrote it"""
    # Steam reads keys case-insensitively and writes "valve" as well as
    # "Valve". A case-sensitive search raises on such a file after the
    # shortcut is written, and the game comes up without Proton and artwork.
    lower = CONFIG_WITH_CTM.replace('"Valve"', '"valve"').replace(
        '"CompatToolMapping"', '"compattoolmapping"')
    out = config_surgery.set_mapping(lower, 2411661295, 'proton_9')

    eq(config_surgery.get_mapping(out, 2411661295)['name'], 'proton_9', 'the entry')
    eq(out.lower().count('"compattoolmapping"'), 1, 'the block found, not made again')
    eq(config_surgery.remove_mapping(out, 2411661295), lower, 'removal gives the file back')

    bare = CONFIG_WITHOUT_CTM.replace('"Valve"', '"valve"').replace('"Steam"', '"steam"')
    out = config_surgery.set_mapping(bare, 2411661295, 'proton_9')
    eq(
        config_surgery.get_mapping(out, 2411661295)['name'], 'proton_9',
        'a block made in a lower-case path')


@case
def test_a_value_is_not_a_block():
    """config.vdf: a value named like a block on the path is passed over"""
    # The old search took a key at the start of a line and then the next '{'
    # wherever it was: after a value line, the '{' of whatever block follows.
    text = CONFIG_WITH_CTM.replace(
        '\t\t\t"Steam"\n',
        '\t\t\t"Steam"\t\t"1"\n\t\t\t"Cloud"\n\t\t\t{\n\t\t\t}\n\t\t\t"Steam"\n', 1)
    out = config_surgery.set_mapping(text, 2411661295, 'proton_9')

    # Read back by the parser, not by the search under test
    eq(
        vdf.find_path(
            vdf.text_loads(out), 'InstallConfigStore', 'Software', 'Valve',
            'Steam', 'CompatToolMapping', '2411661295', 'name'),
        'proton_9', 'the entry where the client reads it')


# ------------------------------------------------------------- DLL overrides

@case
def test_wrappers_come_from_the_recipe():
    """overrides: the recipe decides, and an empty list is a decision"""
    with tempfile.TemporaryDirectory() as tmp:
        exe = os.path.join(tmp, 'speed.exe')
        for name in ('speed.exe', 'dinput8.dll', 'server.dll'):
            open(os.path.join(tmp, name), 'w').close()

        eq(
            si.wrappers_from({'dll_overrides': ['dinput8']}, exe, log=quiet),
            ['dinput8'], 'an explicit list is used as given')
        eq(
            si.wrappers_from({'dll_overrides': []}, exe, log=quiet),
            [], 'an empty list overrides nothing')
        # A bundle built before the field existed has to install as it always did.
        eq(
            si.wrappers_from({}, exe, log=quiet),
            ['dinput8'], 'no field falls back to detection')


@case
def test_detect_wrappers_looks_only_beside_the_exe():
    """overrides: a wrapper in another folder is not the game's"""
    with tempfile.TemporaryDirectory() as tmp:
        os.makedirs(os.path.join(tmp, 'plugins'))
        exe = os.path.join(tmp, 'speed.exe')
        open(exe, 'w').close()
        open(os.path.join(tmp, 'server.dll'), 'w').close()
        open(os.path.join(tmp, 'plugins', 'd3d9.dll'), 'w').close()

        eq(si.detect_wrappers(exe), [], 'nothing next to the exe')

        open(os.path.join(tmp, 'DINPUT8.DLL'), 'w').close()
        eq(si.detect_wrappers(exe), ['dinput8'], 'matched regardless of case')


@case
def test_launch_options():
    """overrides: the launch option is the line that fixed the live game"""
    eq(
        si.launch_options_for(['dinput8']),
        'WINEDLLOVERRIDES="dinput8=n,b" %command%', 'one wrapper')
    eq(
        si.launch_options_for(['dinput8', 'd3d9']),
        'WINEDLLOVERRIDES="dinput8,d3d9=n,b" %command%', 'two wrappers')
    eq(si.launch_options_for([]), '', 'nothing to override')


# ------------------------------------------------------------------ shortcut

@case
def test_entry_shape():
    """shortcut: Exe is quoted, StartDir ends with a slash"""
    # The quotes are part of the value, and the appid is computed from the
    # string as stored - including them (5.2).
    exe = '/home/deck/Games/nfsmw/game/speed.exe'
    entry = si.build_entry(0x8fabcdef, 'NFS', exe, launch_options='X %command%')

    eq(entry['Exe'], '"%s"' % exe, 'Exe')
    eq(entry['StartDir'], '/home/deck/Games/nfsmw/game/', 'StartDir')
    eq(entry['AppName'], 'NFS', 'AppName')
    eq(entry['tags'], {}, 'tags is an object, not a string')
    eq(vdf.as_unsigned32(entry['appid']), 0x8fabcdef, 'appid stored signed')


@case
def test_replacing_a_shortcut_keeps_what_it_does_not_set():
    """shortcut: replacing does not blank an icon that already worked"""
    # Installing without art/ once emptied the icon path and the icon vanished
    # from the library while the file sat on disk (5.1).
    with tempfile.TemporaryDirectory() as tmp:
        fake_steam(tmp)
        uid = '12345678'
        exe = '/games/speed.exe'

        first = si.build_entry(
            0x8fabcdef, 'NFS', exe,
            icon='/grid/icon.png', launch_options='OLD %command%')
        si.add_shortcut(uid, first, log=quiet)

        again = si.build_entry(0x8fabcdef, 'NFS', exe)
        count = si.add_shortcut(uid, again, log=quiet)

        eq(count, 1, 'still one entry, not two')
        _, entry = si.find_shortcut(uid, exe_quoted='"%s"' % exe)
        eq(entry['icon'], '/grid/icon.png', 'icon carried over')
        eq(entry['LaunchOptions'], 'OLD %command%', 'launch options carried over')


@case
def test_shortcut_is_found_by_exe():
    """shortcut: lookup by Exe works when Steam made the entry itself"""
    # Steam picks appids at random, so one it created will not match ours;
    # the Exe is what identifies the entry at uninstall time (2.3, 5.4).
    with tempfile.TemporaryDirectory() as tmp:
        fake_steam(tmp)
        uid = '12345678'
        exe = '/games/speed.exe'
        entry = si.build_entry(0x11223344, 'NFS', exe)
        si.add_shortcut(uid, entry, log=quiet)

        idx, found = si.find_shortcut(uid, appid=0xdeadbeef, exe_quoted='"%s"' % exe)
        ok(found, 'found despite the wrong appid')
        eq(found['AppName'], 'NFS', 'the right entry')

        ok(si.remove_shortcut(uid, exe_quoted='"%s"' % exe, log=quiet), 'removed')
        eq(si.find_shortcut(uid, exe_quoted='"%s"' % exe)[1], {}, 'gone')


@case
def test_verify_notices_a_shorter_list():
    """verify: our shortcut present is not enough if the list shrank"""
    # This is the 5.1.0 failure: the client replaces the list with an older one,
    # our second write puts the game back into it, and checking only the appid
    # would call that a success while somebody's shortcuts stay lost.
    with tempfile.TemporaryDirectory() as tmp:
        root = fake_steam(tmp)
        uid = '12345678'
        exe = '/games/speed.exe'
        appid = 0x8fabcdef

        with open(os.path.join(root, 'config', 'config.vdf'), 'w') as f:
            f.write(config_surgery.set_mapping(CONFIG_WITH_CTM, appid, 'proton_9'))

        path = os.path.join(si.user_config(uid), 'shortcuts.vdf')
        vdf.write_shortcuts(path, {
            '0': shortcut(0x81111111, 'Chrome', '/usr/bin/chrome'),
            '1': shortcut(0x82222222, 'chiaki4deck', '/usr/bin/chiaki')
        })
        written = si.add_shortcut(uid, si.build_entry(appid, 'NFS', exe), log=quiet)
        eq(written, 3, 'three entries written')

        ok(
            si.verify(uid, appid, 'proton_9', expect_count=3, log=quiet),
            'passes when the file is as we left it')

        # Steam rolls back, dropping chiaki4deck; a retry appends us to that.
        vdf.write_shortcuts(path, {
            '0': shortcut(0x81111111, 'Chrome', '/usr/bin/chrome'),
            '1': si.build_entry(appid, 'NFS', exe)
        })
        ok(
            si.verify(uid, appid, 'proton_9', log=quiet),
            'the old check, appid only, still says yes')
        ok(
            not si.verify(uid, appid, 'proton_9', expect_count=3, log=quiet),
            'counting the entries catches it')


@case
def test_restore_puts_the_backup_back():
    """backup: restore returns the list to the state we found it in"""
    with tempfile.TemporaryDirectory() as tmp:
        fake_steam(tmp)
        uid = '12345678'
        path = os.path.join(si.user_config(uid), 'shortcuts.vdf')
        before = {
            '0': shortcut(0x81111111, 'Chrome', '/usr/bin/chrome'),
            '1': shortcut(0x82222222, 'chiaki4deck', '/usr/bin/chiaki')}
        vdf.write_shortcuts(path, before)

        backup = si.backup(path, log=quiet)
        ok(backup and os.path.isfile(backup), 'backup written')

        vdf.write_shortcuts(path, {'0': before['0']})
        eq(len(vdf.read_shortcuts(path)[1]), 1, 'rolled back to one')

        ok(si.restore(backup, path, log=quiet), 'restored')
        eq(vdf.read_shortcuts(path)[1], before, 'both shortcuts are back')
        ok(
            not si.restore(os.path.join(tmp, 'nope'), path, log=quiet),
            'a missing backup is reported, not raised')


# ---------------------------------------------------------------------- user

@case
def test_single_user_folder():
    """user: one folder in userdata is the answer"""
    with tempfile.TemporaryDirectory() as tmp:
        fake_steam(tmp)
        eq(si.find_user(log=quiet), '12345678', 'the only account')


@case
def test_user_from_autologin_then_timestamp():
    """user: AutoLogin decides, and failing that the most recent login"""
    with tempfile.TemporaryDirectory() as tmp:
        fake_steam(tmp, users=('12345678', '11112222'), accounts={
            '12345678': ('deck', 100, True),
            '11112222': ('other', 900, False)
        })
        eq(si.find_user(log=quiet), '12345678', 'AutoLogin wins')

        fake_steam(tmp + '/b', users=('12345678', '11112222'), accounts={
            '12345678': ('deck', 100, False),
            '11112222': ('other', 900, False)
        })
        eq(si.find_user(log=quiet), '11112222', 'newest Timestamp wins')


@case
def test_ambiguous_user_is_asked_about():
    """user: with nothing to decide on, ask rather than guess"""
    # Guessing installs the game into somebody else's library when the
    # client is shared, and the person who ran the installer sees nothing
    # (5.1.1 step 5).
    with tempfile.TemporaryDirectory() as tmp:
        fake_steam(tmp, users=('12345678', '11112222'))
        try:
            si.find_user(log=quiet)
        except si.AmbiguousUser as exc:
            eq(
                sorted(uid for uid, _ in exc.candidates),
                ['11112222', '12345678'], 'both offered')
        else:
            raise AssertionError('an account was guessed')

        eq(si.find_user(log=quiet, chosen='11112222'), '11112222', 'an explicit choice')
        try:
            si.find_user(log=quiet, chosen='99999999')
        except RuntimeError:
            pass
        else:
            raise AssertionError('a nonexistent folder was accepted')


@case
def test_list_users_puts_the_likely_one_first():
    """user: the picker's first item is the one AutoLogin points at"""
    with tempfile.TemporaryDirectory() as tmp:
        fake_steam(tmp, users=('12345678', '11112222'), accounts={
            '12345678': ('deck', 100, True),
            '11112222': ('other', 900, False)
        })
        listed = si.list_users()
        eq([uid for uid, _ in listed], ['12345678', '11112222'], 'order')
        eq(dict(listed)['12345678'], 'deck', 'shown by persona name')


# -------------------------------------------------------------------- Proton

@case
def test_official_tool_name():
    """proton: the CompatToolMapping name comes from the version file"""
    # It is not the directory name: the client writes `proton_9` for a folder
    # called "Proton 9.0 (Beta)" (5.2).
    with tempfile.TemporaryDirectory() as tmp:
        def tool(version):
            d = os.path.join(tmp, version.replace(' ', '_'))
            os.makedirs(d, exist_ok=True)
            with open(os.path.join(d, 'version'), 'w') as f:
                f.write('1600000000 %s\n' % version)
            return si.official_tool_name(d)

        eq(tool('proton-9.0-4f'), 'proton_9', 'stable')
        eq(tool('proton-10.0-4b'), 'proton_10', 'two digits')
        eq(tool('experimental-11.0-20250101'), 'proton_experimental', 'experimental')
        eq(
            si.official_tool_name(os.path.join(tmp, 'nothing-here')), None,
            'a folder without a version file')


@case
def test_proton_in_another_library():
    """proton: a version installed on the SD card is offered too"""
    # Looking at the internal library alone finds nothing then, and the game
    # goes in without Proton.
    with tempfile.TemporaryDirectory() as tmp:
        root = fake_steam(tmp)
        card = os.path.join(tmp, 'card')
        steamapps = os.path.join(card, 'steamapps')
        os.makedirs(os.path.join(steamapps, 'common', 'Proton 9.0 (Beta)'))
        with open(os.path.join(steamapps, 'common', 'Proton 9.0 (Beta)', 'version'), 'w') as f:
            f.write('1700000000 proton-9.0-4f\n')
        with open(os.path.join(steamapps, 'appmanifest_2805730.acf'), 'w') as f:
            f.write('"AppState"\n{\n\t"name"\t\t"Proton 9.0"\n'
                    '\t"installdir"\t\t"Proton 9.0 (Beta)"\n}\n')

        os.makedirs(os.path.join(root, 'steamapps'))
        with open(os.path.join(root, 'steamapps', 'libraryfolders.vdf'), 'w') as f:
            f.write('"libraryfolders"\n{\n'
                    '\t"0"\n\t{\n\t\t"path"\t\t"%s"\n\t}\n'
                    '\t"1"\n\t{\n\t\t"path"\t\t"%s"\n\t}\n}\n' % (root, card))

        eq(si.list_proton(), [('Proton 9.0', 'proton_9')], 'named as the client names it')


# ------------------------------------------------------------------- artwork

@case
def test_artwork_names():
    """artwork: files are named from the unsigned appid with Steam's suffixes"""
    with tempfile.TemporaryDirectory() as tmp:
        fake_steam(tmp)
        uid = '12345678'
        appid = 0x8fabcdef          # 2410771439 unsigned, negative when signed
        art = os.path.join(tmp, 'art')
        os.makedirs(art)
        for name in ('portrait.png', 'wide.png', 'hero.jpg', 'logo.png', 'icon.png'):
            with open(os.path.join(art, name), 'wb') as f:
                f.write(b'\x89PNG')

        placed = si.install_art(uid, appid, art, log=quiet)
        got = sorted(os.path.basename(p) for p in placed.values())
        eq(got, sorted([
            '%d.png' % appid,
            '%d_hero.jpg' % appid,
            '%d_icon.png' % appid,
            '%d_logo.png' % appid,
            '%dp.png' % appid
        ]), 'file names')

        eq(si.remove_art(uid, appid, log=quiet), 5, 'all five removed')


@case
def test_artwork_is_dated_now():
    """artwork: the files are dated now, not 1970 like everything in meta"""
    # meta is packed with zero mtimes, and Steam takes a grid image dated 1970
    # for no image at all: on a live Deck only the icon showed, as it goes by
    # the path in the shortcut.
    with tempfile.TemporaryDirectory() as tmp:
        fake_steam(tmp)
        art = os.path.join(tmp, 'art')
        os.makedirs(art)
        with open(os.path.join(art, 'hero.jpg'), 'wb') as f:
            f.write(b'\xff\xd8')
        os.utime(os.path.join(art, 'hero.jpg'), (0, 0))

        placed = si.install_art('12345678', 0x8fabcdef, art, log=quiet)

        ok(
            os.stat(placed['hero']).st_mtime > time.time() - 60,
            'dated %s' % time.ctime(os.stat(placed['hero']).st_mtime))


# -------------------------------------------------------------------- unpack

# What sits in front of the zip in a .run: the header script and the meta
PREFIX = b'#' * 8192


def game_zip(path, entries, zip64=False):
    """A zip of `entries` {name: bytes} behind a .run's prefix, at `path`.

    `zip64` gives it the Zip64 end records a game over 4 GiB carries, without
    writing 4 GiB: zipfile's limit on the entry count is lowered meanwhile.
    """
    limit = zipfile.ZIP_FILECOUNT_LIMIT
    if zip64:
        zipfile.ZIP_FILECOUNT_LIMIT = 1
    buf = io.BytesIO()
    try:
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
            for name, data in entries.items():
                z.writestr(name, data)
    finally:
        zipfile.ZIP_FILECOUNT_LIMIT = limit
    with open(path, 'wb') as f:
        f.write(PREFIX + buf.getvalue())
    return path


def unpack_into(dest, archive, keep=()):
    with unpack.open_archive(archive) as zf:
        items, kept = unpack.plan(zf, dest, keep=keep)
        unpack.extract(zf, items)
    return kept


def read(*parts):
    with open(os.path.join(*parts), 'rb') as f:
        return f.read()


@case
def test_unpack_zip64_behind_a_prefix():
    """unpack: a Zip64 archive is read out of the .run, prefix and all"""
    # Where bsdtar gives up with "Damaged Zip archive": every game over 4 GiB.
    with tempfile.TemporaryDirectory() as tmp:
        run = game_zip(os.path.join(tmp, 'game.run'), {
            'Game/speed.exe': b'MZ',
            'Game/data/a.big': b'x' * 5000
        }, zip64=True)
        ok(b'PK\x06\x07' in read(run)[-200:], 'the archive carries the Zip64 locator')

        unpack_into(os.path.join(tmp, 'game'), run)

        eq(read(tmp, 'game', 'Game', 'data', 'a.big'), b'x' * 5000, 'the content')
        eq(read(tmp, 'game', 'Game', 'speed.exe'), b'MZ', 'the exe')


@case
def test_unpack_keeps_saves():
    """unpack: a save folder already there is left alone, spaces and all"""
    # Portable games rewrite settings and saves next to the exe; unpacking
    # over them puts the factory ones back (5.1, step 3).
    with tempfile.TemporaryDirectory() as tmp:
        run = game_zip(os.path.join(tmp, 'game.run'), {
            'Game/speed.exe': b'MZ',
            'Game/Saved Games/Settings.ini': b'factory',
            'Game/SAVES/profile.sav': b'factory'
        })
        dest = os.path.join(tmp, 'game')
        os.makedirs(os.path.join(dest, 'Game', 'Saved Games'))
        os.makedirs(os.path.join(dest, 'Game', 'SAVES'))
        with open(os.path.join(dest, 'Game', 'Saved Games', 'Settings.ini'), 'wb') as f:
            f.write(b'mine')

        kept = unpack_into(dest, run, keep=['Saved Games', 'SAVES'])

        eq(kept, [os.path.join(dest, 'Game', 'Saved Games')], 'the folders kept')
        eq(read(dest, 'Game', 'Saved Games', 'Settings.ini'), b'mine', 'settings untouched')
        eq(read(dest, 'Game', 'SAVES', 'profile.sav'), b'factory', 'an empty folder is filled')


@case
def test_unpack_names():
    """unpack: backslashes separate, raw names stay raw, nothing leaves the folder"""
    with tempfile.TemporaryDirectory() as tmp:
        run = game_zip(os.path.join(tmp, 'game.run'), {'Game\\data\\a.big': b'a'})
        unpack_into(os.path.join(tmp, 'game'), run)
        eq(read(tmp, 'game', 'Game', 'data', 'a.big'), b'a', 'a Windows-style name')

        # A name not marked UTF-8 reaches zipfile as cp437; its bytes are what counts
        info = zipfile.ZipInfo('ゲーム/ファイル.txt'.encode('utf-8').decode('cp437'))
        eq(unpack.relative_path(info), os.path.join('ゲーム', 'ファイル.txt'), 'an unmarked UTF-8 name')

        evil = game_zip(os.path.join(tmp, 'evil.run'), {'Game/../../evil.txt': b'x'})
        try:
            unpack_into(os.path.join(tmp, 'game'), evil)
        except unpack.UnpackError as exc:
            ok('leads out of the game folder' in str(exc), str(exc))
        else:
            raise AssertionError('a path out of the folder was unpacked')
        ok(not os.path.exists(os.path.join(tmp, 'evil.txt')), 'nothing written outside')


@case
def test_unpack_checks_space_first():
    """unpack: a drive too small is refused before anything is written"""
    with tempfile.TemporaryDirectory() as tmp:
        run = game_zip(os.path.join(tmp, 'game.run'), {'Game/a.big': b'x' * 100000})
        dest = os.path.join(tmp, 'game')
        disk_usage = shutil.disk_usage
        shutil.disk_usage = lambda path: disk_usage(path)._replace(free=50000)
        try:
            with unpack.open_archive(run) as zf:
                unpack.check_space(unpack.plan(zf, dest)[0], dest)
        except unpack.UnpackError as exc:
            ok(str(exc).startswith('Not enough free space'), str(exc))
        else:
            raise AssertionError('a full drive was not noticed')
        finally:
            shutil.disk_usage = disk_usage
        ok(not os.path.exists(dest), 'nothing unpacked')


@case
def test_unpack_leaves_room_for_steamos():
    """unpack: a game that fits but leaves less than RESERVE free is refused"""
    # A drive filled to the last byte leaves Steam unable to save its own files
    with tempfile.TemporaryDirectory() as tmp:
        run = game_zip(os.path.join(tmp, 'game.run'), {'Game/a.big': b'x' * 100000})
        dest = os.path.join(tmp, 'game')
        disk_usage = shutil.disk_usage
        try:
            with unpack.open_archive(run) as zf:
                items = unpack.plan(zf, dest)[0]
                for free, fits in ((unpack.RESERVE + 50000, False), (unpack.RESERVE + 200000, True)):
                    shutil.disk_usage = lambda path, free=free: disk_usage(path)._replace(free=free)
                    try:
                        unpack.check_space(items, dest)
                    except unpack.UnpackError as exc:
                        ok(not fits, str(exc))
                        ok('2.0 GB has to stay free' in str(exc), str(exc))
                    else:
                        ok(fits, 'a drive with %d free taken' % free)
        finally:
            shutil.disk_usage = disk_usage


@case
def test_unpack_failure_is_explained():
    """unpack: a write that fails ends in a message, not a traceback"""
    with tempfile.TemporaryDirectory() as tmp:
        run = game_zip(os.path.join(tmp, 'game.run'), {'Game/a.big': b'x'})
        os.makedirs(os.path.join(tmp, 'game', 'Game', 'a.big'))   # in the way
        try:
            unpack_into(os.path.join(tmp, 'game'), run)
        except unpack.UnpackError as exc:
            ok(str(exc).startswith('Cannot unpack Game/a.big:'), str(exc))
        else:
            raise AssertionError('the failed write went unnoticed')


# ----------------------------------------------------------------- deflate64

class Bits:
    """A Deflate bit stream written by hand: values go LSB first, Huffman
    codes MSB first, the way the format lays them out."""

    def __init__(self):
        self.out = bytearray()
        self.acc = 0
        self.n = 0

    def put(self, value, count):
        self.acc |= value << self.n
        self.n += count
        while self.n >= 8:
            self.out.append(self.acc & 0xFF)
            self.acc >>= 8
            self.n -= 8

    def code(self, code, length):
        self.put(int(format(code, '0%db' % length)[::-1], 2), length)

    def align(self):
        if self.n:
            self.put(0, 8 - self.n)

    def bytes(self):
        self.align()
        return bytes(self.out)


def deflate64_sample():
    """A stream that only reads right as Deflate64, with what it decodes to.

    A stored block lays down 60000 bytes; a block of fixed codes then reaches
    back past 49152 (distance code 31) and past 32768 (code 30) with lengths
    of length code 285 and its 16 extra bits, and copies over itself. zlib
    would take 285 for 258 and refuse both distances. -> (stream, data)
    """
    window = bytes((i * 7919 + (i >> 7) * 31) & 0xFF for i in range(60000))
    bits = Bits()
    bits.put(0, 1)                   # not the last block
    bits.put(0, 2)                   # stored
    bits.align()
    bits.put(len(window), 16)
    bits.put(len(window) ^ 0xFFFF, 16)
    out = bytearray(bits.bytes() + window)
    bits = Bits()
    bits.put(1, 1)                   # the last block
    bits.put(1, 2)                   # fixed codes
    data = bytearray(window)

    bits.code(0x30 + ord('A'), 8)    # a literal
    data += b'A'

    def match(length, distance, sym, dist_sym):
        start = len(data) - distance
        for i in range(length):
            data.append(data[start + i])
        if sym == 285:
            bits.code(0xC0 + 5, 8)
            bits.put(length - 3, 16)
        else:                        # 257..264: lengths 3..10, 7-bit codes
            bits.code(sym - 256, 7)
        bits.code(dist_sym, 5)
        base, extra = deflate64.DIST_BASE[dist_sym], deflate64.DIST_EXTRA[dist_sym]
        bits.put(distance - base, extra)

    match(1000, 60001, 285, 31)      # back to the very start
    match(300, 35000, 285, 30)
    match(10, 1, 264, 0)             # over itself: the last byte ten times
    bits.code(0, 7)                  # end of block
    return bytes(out + bits.bytes()), bytes(data)


def inflate_all(stream, step=1 << 20):
    src = io.BytesIO(stream)
    parts = []
    size = deflate64.inflate(lambda n: src.read(min(n, step)), parts.append)
    data = b''.join(parts)
    eq(size, len(data), 'the size it reports')
    return data


@case
def test_deflate64_reaches_64k():
    """deflate64: 64 KiB distances and length code 285 decode, a byte at a time too"""
    stream, data = deflate64_sample()
    eq(inflate_all(stream), data, 'read in big pieces')
    eq(inflate_all(stream, step=1), data, 'read a byte at a time')
    ok(len(data) == 61311, 'every copy made it: %d bytes' % len(data))


@case
def test_deflate64_reads_plain_deflate():
    """deflate64: stored, fixed and dynamic blocks from zlib decode the same"""
    # No run in it repeats for 258 bytes, the one length the two formats code
    # differently, so zlib's output is valid Deflate64 too
    data = b' '.join(str(i).encode() for i in range(60000))
    for level, strategy in ((0, zlib.Z_DEFAULT_STRATEGY), (6, zlib.Z_FIXED),
                            (9, zlib.Z_DEFAULT_STRATEGY)):
        z = zlib.compressobj(level, zlib.DEFLATED, -15, 9, strategy)
        eq(inflate_all(z.compress(data) + z.flush()), data, 'level %d, strategy %d' % (level, strategy))


@case
def test_deflate64_damage_is_an_error():
    """deflate64: a cut or broken stream raises Deflate64Error, never hangs"""
    stream, _ = deflate64_sample()
    for cut in (0, 1, 4, 60004, len(stream) - 1):
        try:
            inflate_all(stream[:cut])
        except deflate64.Deflate64Error:
            pass
        else:
            raise AssertionError('a stream cut at %d decoded' % cut)
    try:
        inflate_all(b'\x07')         # block type 3
    except deflate64.Deflate64Error as exc:
        ok('reserved' in str(exc), str(exc))
    else:
        raise AssertionError('the reserved block type decoded')


def raw_zip(path, entries):
    """A zip behind a .run's prefix, its entries packed by hand, for methods
    zipfile cannot write: [(name, method, packed, crc, size, flags)]."""
    body = bytearray(PREFIX)
    cd = bytearray()
    for name, method, packed, crc, size, flags in entries:
        n = name.encode()
        offset = len(body) - len(PREFIX)
        body += struct.pack('<IHHHHHIIIHH', 0x04034b50, 21, flags, method, 0, 0x21,
                            crc, len(packed), size, len(n), 0) + n + packed
        cd += struct.pack(
            '<IHHHHHHIIIHHHHHII', 0x02014b50, 0x0315, 21, flags, method,
            0, 0x21, crc, len(packed), size, len(n), 0, 0, 0, 0,
            0o100644 << 16, offset) + n
    offset = len(body) - len(PREFIX)
    body += cd + struct.pack(
        '<IHHHHIIH', 0x06054b50, 0, 0, len(entries), len(entries),
        len(cd), offset, 0)
    with open(path, 'wb') as f:
        f.write(body)
    return path


@case
def test_unpack_deflate64():
    """unpack: a Deflate64 entry comes out of the .run, next to a Deflate one"""
    # What Windows 10 packs a game over 2 GB with: zipfile will not open it
    stream, data = deflate64_sample()
    exe = zlib.compressobj(9, zlib.DEFLATED, -15)
    exe = exe.compress(b'MZ' * 100) + exe.flush()
    with tempfile.TemporaryDirectory() as tmp:
        run = raw_zip(os.path.join(tmp, 'game.run'), [
            ('Game/speed.exe', 8, exe, zlib.crc32(b'MZ' * 100), 200, 0),
            ('Game/data.big', 9, stream, zlib.crc32(data), len(data), 0)
        ])
        dest = os.path.join(tmp, 'game')
        with unpack.open_archive(run) as zf:
            items, _ = unpack.plan(zf, dest)
            unpack.check_methods(items)
            eq(unpack.packing(items), [('Deflate', 1), ('Deflate64', 1)], 'what the log says')
            eq(unpack.extract(zf, items), 200 + len(data), 'bytes written')

        eq(read(dest, 'Game', 'data.big'), data, 'the Deflate64 entry')
        eq(read(dest, 'Game', 'speed.exe'), b'MZ' * 100, 'the Deflate one')


@case
def test_unpack_deflate64_damage():
    """unpack: a Deflate64 entry that does not check out is called damaged"""
    stream, data = deflate64_sample()
    with tempfile.TemporaryDirectory() as tmp:
        for what, packed, crc in (
                ('a wrong CRC', stream, zlib.crc32(data) ^ 1),
                ('a cut stream', stream[:-40], zlib.crc32(data))):
            run = raw_zip(os.path.join(tmp, 'game.run'), [
                ('Game/data.big', 9, packed, crc, len(data), 0)
            ])
            try:
                unpack_into(os.path.join(tmp, 'game'), run)
            except unpack.UnpackError as exc:
                ok(str(exc).startswith('Game/data.big is damaged in the archive'), '%s: %s' % (what, exc))
            else:
                raise AssertionError('%s went unnoticed' % what)


def fake_tool(folder, name, script):
    """An executable shell script at `folder`/`name`. -> its path"""
    path = os.path.join(folder, name)
    with open(path, 'w') as f:
        f.write('#!/bin/sh\n' + script + '\n')
    os.chmod(path, 0o755)
    return path


@contextlib.contextmanager
def only_on_path(folder):
    """PATH is `folder` alone meanwhile, and funzip is looked for afresh."""
    saved = os.environ.get('PATH', '')
    os.environ['PATH'] = folder
    unpack.funzip.cache_clear()
    try:
        yield
    finally:
        os.environ['PATH'] = saved
        unpack.funzip.cache_clear()


@case
def test_funzip_is_checked_by_decoding():
    """unpack: funzip is used only once it has decoded the Deflate64 probe"""
    with tempfile.TemporaryDirectory() as tmp:
        with only_on_path(tmp):
            eq(unpack.funzip(), None, 'none on PATH')
        # Anything that runs under the name and answers, but not with Deflate64
        fake = fake_tool(tmp, 'funzip', 'cat')
        with only_on_path(tmp):
            eq(unpack.funzip(), None, 'a funzip that does not decode it')
        real = shutil.which('funzip')
        if real:
            os.remove(fake)
            os.symlink(real, fake)
            with only_on_path(tmp):
                eq(unpack.funzip(), fake, 'Info-ZIP funzip')


@case
def test_unpack_deflate64_through_funzip():
    """unpack: with funzip there, a Deflate64 entry never reaches our decoder"""
    if not shutil.which('funzip'):
        return   # nothing to check it with here; the fallback has a case of its own
    stream, data = deflate64_sample()
    saved = unpack.inflate64

    def refuse(*_args):
        raise AssertionError('the decoder of our own was used')

    unpack.funzip.cache_clear()
    with tempfile.TemporaryDirectory() as tmp:
        run = raw_zip(os.path.join(tmp, 'game.run'), [
            ('Game/data.big', 9, stream, zlib.crc32(data), len(data), 0)
        ])
        unpack.inflate64 = refuse
        try:
            unpack_into(os.path.join(tmp, 'game'), run)
        finally:
            unpack.inflate64 = saved
        eq(read(tmp, 'game', 'Game', 'data.big'), data, 'what funzip wrote')


@case
def test_unpack_deflate64_falls_back():
    """unpack: what funzip gets wrong is written again by our own decoder"""
    stream, data = deflate64_sample()
    saved = unpack.funzip
    with tempfile.TemporaryDirectory() as tmp:
        # Swallows the entry and hands back something else, exit code 0
        broken = fake_tool(tmp, 'funzip', 'cat > /dev/null; printf garbage')
        run = raw_zip(os.path.join(tmp, 'game.run'), [
            ('Game/data.big', 9, stream, zlib.crc32(data), len(data), 0)
        ])
        dest = os.path.join(tmp, 'game')
        unpack.funzip = lambda: broken
        try:
            with unpack.open_archive(run) as zf:
                items, _ = unpack.plan(zf, dest)
                seen = []
                written = unpack.extract(zf, items, progress=lambda done, total: seen.append((done, total)))
        finally:
            unpack.funzip = saved
        eq(read(dest, 'Game', 'data.big'), data, 'the file, garbage gone')
        eq(written, len(data), 'bytes counted once')
        eq(seen[-1], (len(data), len(data)), 'the last progress')


@case
def test_unpack_refuses_what_it_cannot_unpack():
    """install: PPMd or a password stops it before the first byte and before Steam"""
    for flags, method, said in ((0, 98, 'Game/data.big is packed with PPMd'),
                                (1, 8, 'Game/data.big is password-protected')):
        with tempfile.TemporaryDirectory() as tmp:
            run = raw_zip(os.path.join(tmp, 'game.run'), [
                ('Game/speed.exe', 0, b'MZ', zlib.crc32(b'MZ'), 2, 0),
                ('Game/data.big', method, b'packed', 0, 6, flags)
            ])
            rc, out, fake = run_install(tmp, archive=run)

            eq(rc, 1, 'exit code')
            ok('ERROR: %s' % said in out, 'the reason, for the dialog:\n%s' % out)
            eq(fake.calls, [], 'Steam never touched')
            ok(
                not os.path.exists(os.path.join(tmp, 'game', 'Game', 'speed.exe')),
                'nothing unpacked, not even what could be')


# ------------------------------------------------------------------- install

class FakeSteam:
    """steamctl without a client: shutting down and starting always work, and
    the rewrite that the real one does a minute after start counts as done."""

    def __init__(self):
        self.calls = []

    def shutdown(self, timeout=90, log=print):
        self.calls.append('shutdown')
        return True

    def start(self, log=print):
        self.calls.append('start')
        return True

    def wait_rewrite(self, path, mtime_before, timeout=210, log=print):
        return True


def run_install(tmp, proton='proton_9', config=CONFIG_WITH_CTM, broken=None,
                archive=None):
    """install.main() on a fake Steam in `tmp`. -> (exit code, log, FakeSteam).

    The game comes out of `archive`, by default a Zip64 .run holding speed.exe.
    `broken` names a function of steam_install to replace with one that raises.
    """
    root = fake_steam(tmp)
    with open(os.path.join(root, 'config', 'config.vdf'), 'w') as f:
        f.write(config)
    game = os.path.join(tmp, 'game')
    art = os.path.join(tmp, 'art')
    os.makedirs(art)
    if archive is None:
        archive = game_zip(os.path.join(tmp, 'game.run'), {'speed.exe': b'MZ'}, zip64=True)
    for name in ('portrait.png', 'icon.png'):
        with open(os.path.join(art, name), 'wb') as f:
            f.write(b'\x89PNG')
    recipe = os.path.join(tmp, 'recipe.json')
    with open(recipe, 'w') as f:
        json.dump({'name': 'NFS', 'slug': 'nfs', 'exe': 'speed.exe'}, f)

    def explode(*_args, **_kwargs):
        raise RuntimeError('%s blew up' % broken)

    fake = FakeSteam()
    patches = [
        (steamctl, 'shutdown', fake.shutdown), (steamctl, 'start', fake.start),
        (steamctl, 'wait_rewrite', fake.wait_rewrite), (time, 'sleep', quiet)]
    if broken:
        patches.append((si, broken, explode))
    saved = [(mod, name, getattr(mod, name)) for mod, name, _ in patches]
    out = io.StringIO()
    try:
        for mod, name, value in patches:
            setattr(mod, name, value)
        with contextlib.redirect_stdout(out):
            rc = install.main([
                '--recipe', recipe, '--game-dir', game, '--archive', archive,
                '--proton', proton, '--art', art])
    finally:
        for mod, name, value in saved:
            setattr(mod, name, value)
        install.STEAM_STOPPED = False
    return rc, out.getvalue(), fake


def run_uninstall(tmp, game, purge=False, entries=None, config=CONFIG_WITH_CTM):
    """install.main() --uninstall on a fake Steam in `tmp`, for the game NFS
    (slug nfs) in `game`. -> (exit code, log, FakeSteam)"""
    root = fake_steam(tmp)
    with open(os.path.join(root, 'config', 'config.vdf'), 'w') as f:
        f.write(config)
    if entries is not None:
        vdf.write_shortcuts(os.path.join(si.user_config('12345678'), 'shortcuts.vdf'), entries)
    recipe = os.path.join(tmp, 'recipe.json')
    with open(recipe, 'w') as f:
        json.dump({'name': 'NFS', 'slug': 'nfs', 'exe': 'speed.exe'}, f)

    fake = FakeSteam()
    patches = [
        (steamctl, 'shutdown', fake.shutdown), (steamctl, 'start', fake.start),
        (time, 'sleep', quiet)]
    saved = [(mod, name, getattr(mod, name)) for mod, name, _ in patches]
    out = io.StringIO()
    try:
        for mod, name, value in patches:
            setattr(mod, name, value)
        with contextlib.redirect_stdout(out):
            rc = install.main(
                ['--recipe', recipe, '--game-dir', game, '--uninstall']
                + (['--purge'] if purge else []))
    finally:
        for mod, name, value in saved:
            setattr(mod, name, value)
        install.STEAM_STOPPED = False
    return rc, out.getvalue(), fake


def placed_art(uid='12345678'):
    grid = os.path.join(si.user_config(uid), 'grid')
    return sorted(os.listdir(grid)) if os.path.isdir(grid) else []


@case
def test_install_end_to_end():
    """install: shortcut, Proton and artwork in a lower-case config.vdf"""
    with tempfile.TemporaryDirectory() as tmp:
        lower = CONFIG_WITH_CTM.replace('"Valve"', '"valve"')
        rc, out, fake = run_install(tmp, config=lower)

        eq(rc, 0, 'exit code\n%s' % out)
        eq(read(tmp, 'game', 'speed.exe'), b'MZ', 'unpacked from the archive')
        appid = si.make_appid('"%s"' % os.path.join(tmp, 'game', 'speed.exe'), 'NFS')
        cfg = open(os.path.join(si.STEAM_ROOT, 'config', 'config.vdf')).read()
        eq(config_surgery.get_mapping(cfg, appid)['name'], 'proton_9', 'Proton')
        eq(placed_art(), ['%d_icon.png' % appid, '%dp.png' % appid], 'artwork')
        eq(fake.calls, ['shutdown', 'start'], 'Steam stopped once, started once')


@case
def test_unpack_failure_leaves_steam_alone():
    """install: an archive that cannot be unpacked stops it before Steam"""
    with tempfile.TemporaryDirectory() as tmp:
        broken = os.path.join(tmp, 'broken.run')
        with open(broken, 'wb') as f:
            f.write(PREFIX + b'not a zip at all')
        rc, out, fake = run_install(tmp, archive=broken)

        eq(rc, 1, 'exit code')
        ok('ERROR: The game archive cannot be read' in out, 'the reason, for the dialog:\n%s' % out)
        eq(fake.calls, [], 'Steam never touched')


@case
def test_failed_step_does_not_stop_the_rest():
    """install: Proton failing still leaves the artwork and a running Steam"""
    # Stopping at the first error left the game in the library with neither,
    # the client down and no log to say why.
    with tempfile.TemporaryDirectory() as tmp:
        rc, out, fake = run_install(tmp, broken='set_proton')

        eq(rc, install.PARTIAL, 'exit code\n%s' % out)
        eq(len(placed_art()), 2, 'artwork installed after the failure')
        ok('RuntimeError: set_proton blew up' in out, 'the traceback is in the log')
        # The step that raised is not checked: it would fail every attempt and
        # the third would take the game back out of the library
        eq(fake.calls, ['shutdown', 'start'], 'one attempt, no retries')


@case
def test_no_proton_to_pick_is_partial():
    """install: with no Proton chosen the game goes in and the result says so"""
    # Verification used to demand a mapping nobody wrote: three restarts of
    # Steam, then the game was taken back out.
    with tempfile.TemporaryDirectory() as tmp:
        rc, out, fake = run_install(tmp, proton='')

        eq(rc, install.PARTIAL, 'exit code\n%s' % out)
        eq(fake.calls, ['shutdown', 'start'], 'one attempt, no retries')


@case
def test_crash_brings_steam_back():
    """install: an unexpected error is logged and Steam is started again"""
    with tempfile.TemporaryDirectory() as tmp:
        rc, out, fake = run_install(tmp, broken='add_shortcut')

        eq(rc, 1, 'exit code')
        ok(
            'UNEXPECTED ERROR' in out and 'RuntimeError: add_shortcut blew up' in out,
            'the traceback is in the log:\n%s' % out)
        eq(fake.calls, ['shutdown', 'start'], 'the client brought back up')


# ------------------------------------------------------------- shell scripts

# The Steam Play default for every game without a mapping of its own
CONFIG_WITH_DEFAULT = CONFIG_WITH_CTM.replace(
    '\t\t\t\t"CompatToolMapping"\n\t\t\t\t{\n',
    '\t\t\t\t"CompatToolMapping"\n\t\t\t\t{\n\t\t\t\t\t"0"\n\t\t\t\t\t{\n'
    '\t\t\t\t\t\t"name"\t\t"proton_9"\n\t\t\t\t\t\t"config"\t\t""\n'
    '\t\t\t\t\t\t"priority"\t\t"75"\n\t\t\t\t\t}\n')


@case
def test_folder_occupant():
    """install: another game in the folder is named before anything is unpacked"""
    # Need for Speed: Most Wanted is a 2005 game and a 2012 one, with one slug
    recipe = {'name': 'NFS', 'slug': 'nfs', 'exe': 'speed.exe'}
    with tempfile.TemporaryDirectory() as tmp:
        game = os.path.join(tmp, 'nfs', 'game')
        eq(install.folder_occupant(game, recipe), None, 'no folder yet')
        os.makedirs(os.path.join(game, '.plumber'))
        with open(os.path.join(game, 'install.log'), 'w') as f:
            f.write('an earlier try')
        os.rmdir(os.path.join(game, '.plumber'))
        eq(install.folder_occupant(game, recipe), None, 'only the log of an earlier try')

        os.makedirs(os.path.join(game, '.plumber'))
        with open(os.path.join(game, 'speed.exe'), 'wb') as f:
            f.write(b'MZ')
        with open(os.path.join(game, '.plumber', 'recipe.json'), 'w') as f:
            json.dump(recipe, f)
        eq(install.folder_occupant(game, recipe), None, 'this same game, installed before')

        with open(os.path.join(game, '.plumber', 'recipe.json'), 'w') as f:
            json.dump({'name': 'NFS 2012', 'slug': 'nfs', 'exe': 'NFS13.exe'}, f)
        eq(install.folder_occupant(game, recipe), 'NFS 2012', 'another game')

        shutil.rmtree(os.path.join(game, '.plumber'))
        eq(
            install.folder_occupant(game, recipe), 'files the installer did not put there',
            'files from somewhere else')


@case
def test_uninstall_without_an_appid_takes_nothing_else():
    """uninstall: our shortcut without an appid leaves the others and the default"""
    # Its appid read as 0 used to match every entry without one, and
    # CompatToolMapping "0", the Steam Play default for all other games
    with tempfile.TemporaryDirectory() as tmp:
        game = os.path.join(tmp, 'Games', 'nfs', 'game')
        ours = shortcut(0x80000000, 'NFS', os.path.join(game, 'speed.exe'))
        theirs = shortcut(0x80000000, 'Tool', '/usr/bin/tool')
        del ours['appid'], theirs['appid']
        other = shortcut(0x82222222, 'chiaki4deck', '/usr/bin/chiaki')

        rc, out, _ = run_uninstall(
            tmp, game, entries={'0': ours, '1': theirs, '2': other},
            config=CONFIG_WITH_DEFAULT)

        eq(rc, 0, 'exit code\n%s' % out)
        _, data, _, _ = vdf.read_shortcuts(os.path.join(si.user_config('12345678'), 'shortcuts.vdf'))
        eq([e['AppName'] for e in data.values()], ['Tool', 'chiaki4deck'], 'the shortcuts left')
        cfg = read(si.STEAM_ROOT, 'config', 'config.vdf').decode()
        eq(
            config_surgery.get_mapping(cfg, 0), {'name': 'proton_9', 'config': '', 'priority': '75'},
            'the Steam Play default')


@case
def test_purge_deletes_only_the_game_folder():
    """uninstall: everything goes from <folder>/<slug>/game only, never elsewhere"""
    # The uninstaller deletes the folder it sits in: a copy carried elsewhere
    # along with its .plumber would take that folder with it
    with tempfile.TemporaryDirectory() as tmp:
        stray = os.path.join(tmp, 'Documents')
        os.makedirs(stray)
        with open(os.path.join(stray, 'mine.txt'), 'w') as f:
            f.write('mine')
        rc, out, fake = run_uninstall(tmp, stray, purge=True)

        eq(rc, install.NOT_ITS_FOLDER, 'exit code\n%s' % out)
        ok('ERROR: %s is not deleted whole' % stray in out, out)
        eq(read(stray, 'mine.txt'), b'mine', 'its files')
        eq(fake.calls, [], 'Steam never touched')

    with tempfile.TemporaryDirectory() as tmp:
        real = os.path.join(tmp, 'real')
        os.makedirs(real)
        os.makedirs(os.path.join(tmp, 'Games', 'nfs'))
        link = os.path.join(tmp, 'Games', 'nfs', 'game')
        os.symlink(real, link)
        rc, out, _ = run_uninstall(tmp, link, purge=True)
        eq(rc, install.NOT_ITS_FOLDER, 'a link, exit code\n%s' % out)
        ok(os.path.isdir(real), 'what the link points at')

    with tempfile.TemporaryDirectory() as tmp:
        game = os.path.join(tmp, 'Games', 'nfs', 'game')
        os.makedirs(os.path.join(game, '.plumber'))
        with open(os.path.join(game, 'speed.exe'), 'wb') as f:
            f.write(b'MZ')
        rc, out, _ = run_uninstall(tmp, game, purge=True)
        eq(rc, 0, 'exit code\n%s' % out)
        ok(not os.path.exists(game), 'the game folder is gone')
        ok(os.path.isdir(os.path.join(tmp, 'Games', 'nfs')), 'and nothing above it')


def sh(script, *args):
    return subprocess.run(
        ['sh', '-c', script, 'sh'] + list(args),
        capture_output=True, text=True)


@case
def test_shell_syntax():
    """shell: every script parses"""
    for path in (
            os.path.join(HERE, 'setup.sh'), os.path.join(HERE, 'uninstall-template.sh'),
            os.path.join(ROOT, 'make-run.sh')):
        result = subprocess.run(['sh', '-n', path],
                                capture_output=True, text=True)
        eq(result.returncode, 0, '%s: %s' % (os.path.basename(path), result.stderr.strip()))


@case
def test_setup_logs_what_install_py_prints():
    """shell: install.log holds install.py's output, its traceback included"""
    # install.py used to write the log on its way out, so a crash left none,
    # while the dialog pointed at the file. A stub that prints and then raises
    # stands in for it here; everything else is the real setup.sh.
    with tempfile.TemporaryDirectory() as tmp:
        bundle = os.path.join(tmp, 'bundle')
        os.makedirs(bundle)
        shutil.copy(os.path.join(HERE, 'setup.sh'), bundle)
        with open(os.path.join(bundle, 'recipe.json'), 'w') as f:
            json.dump({'name': 'NFS', 'slug': 'nfs', 'exe': 'speed.exe'}, f)
        with open(os.path.join(bundle, 'install.py'), 'w') as f:
            f.write('import sys\n'
                    'if "--list-users" in sys.argv or "--check-folder" in sys.argv:\n'
                    '    sys.exit(0)\n'
                    'print("unpacking", sys.argv[sys.argv.index("--archive") + 1])\n'
                    'raise RuntimeError("config.vdf blew up")\n')
        archive = os.path.join(tmp, 'game.run')
        dest = os.path.join(tmp, 'Games')

        result = subprocess.run(
            ['sh', os.path.join(bundle, 'setup.sh'), '--archive=' + archive],
            env=dict(os.environ, DEST=dest, PROTON='proton_9'),
            capture_output=True, text=True)

        eq(result.returncode, 1, "install.py's exit code:\n%s" % result.stderr)
        log = open(os.path.join(dest, 'nfs', 'game', 'install.log')).read()
        ok('unpacking %s' % archive in log, 'what it printed: %r' % log)
        ok('RuntimeError: config.vdf blew up' in log, 'its traceback: %r' % log)


@case
def test_setup_stops_at_another_game():
    """shell: setup.sh will not unpack over another game, and asks none without windows"""
    with tempfile.TemporaryDirectory() as tmp:
        bundle = os.path.join(tmp, 'bundle')
        os.makedirs(bundle)
        for name in os.listdir(HERE):
            if name.endswith(('.py', '.sh')) and name != 'selftest.py':
                shutil.copy(os.path.join(HERE, name), bundle)
        with open(os.path.join(bundle, 'recipe.json'), 'w') as f:
            json.dump({'name': 'NFS', 'slug': 'nfs', 'exe': 'speed.exe'}, f)
        dest = os.path.join(tmp, 'Games')
        game = os.path.join(dest, 'nfs', 'game')
        os.makedirs(os.path.join(game, '.plumber'))
        with open(os.path.join(game, '.plumber', 'recipe.json'), 'w') as f:
            json.dump({'name': 'NFS 2012', 'slug': 'nfs', 'exe': 'NFS13.exe'}, f)
        with open(os.path.join(game, 'NFS13.exe'), 'wb') as f:
            f.write(b'MZ')

        result = subprocess.run(
            ['sh', os.path.join(bundle, 'setup.sh'), '--archive=' + os.path.join(tmp, 'game.run')],
            env=dict(os.environ, DEST=dest, PROTON='proton_9'),
            capture_output=True, text=True)

        eq(result.returncode, 1, 'exit code:\n%s' % result.stderr)
        ok('%s already holds NFS 2012' % game in result.stderr, result.stderr)
        ok(not os.path.exists(os.path.join(game, 'install.log')), 'not even the log written')
        eq(read(game, 'NFS13.exe'), b'MZ', "the other game's files")


@case
def test_run_header_does_not_exec():
    """shell: the .run header keeps its cleanup trap"""
    # exec replaces the shell, so the EXIT trap never fires and the unpacked
    # meta - artwork and all - is left in /tmp after every launch.
    script = '''
set -eu
TMP=$(mktemp -d)
echo "$TMP"
trap 'rm -rf "$TMP"' EXIT
echo 'exit 0' > "$TMP/setup.sh"
sh "$TMP/setup.sh"
exit 0
'''
    leaked = sh(script).stdout.strip()
    ok(not os.path.isdir(leaked), 'the temp directory was cleaned up: %s' % leaked)

    source = open(os.path.join(ROOT, 'make-run.sh')).read()
    ok('exec sh' not in source, 'make-run.sh generates a header without exec')


# ---------------------------------------------------------------------- main

def main():
    width = max(len(fn.__doc__.splitlines()[0]) for fn in CASES)
    saved_root = si.STEAM_ROOT

    for fn in CASES:
        title = fn.__doc__.splitlines()[0]
        try:
            fn()
        except Exception as exc:
            FAILED.append((title, exc))
            print('  %-*s  FAILED' % (width, title))
            for line in str(exc).splitlines():
                print('      %s' % line)
        else:
            print('  %-*s  ok' % (width, title))
        finally:
            si.STEAM_ROOT = saved_root

    print()
    if FAILED:
        print('%d of %d failed' % (len(FAILED), len(CASES)))
        return 1
    print('%d checks passed' % len(CASES))
    return 0


if __name__ == '__main__':
    sys.exit(main())
