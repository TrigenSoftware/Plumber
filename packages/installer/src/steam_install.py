"""The Steam side of the install: user, shortcut, Proton, artwork.

Everything that needs an understanding of Steam's formats. The shell wrapper
(setup.sh) handles the questions and the extraction and calls into here.
"""

import os
import re
import shutil
import sys
import time
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config_surgery
import vdf

STEAM_ROOT = os.path.expanduser('~/.steam/steam')
STEAMID64_BASE = 76561197960265728

# Names Wine has its own implementations for: a file with one of these names
# next to the exe is almost certainly a wrapper (7.3.1).
WRAPPER_DLLS = (
    'd3d8', 'd3d9', 'd3d10', 'd3d11', 'dxgi', 'ddraw',
    'dinput', 'dinput8', 'dsound', 'winmm', 'msacm32',
    'version', 'xinput1_3', 'xinput1_4', 'wininet',
)


# --------------------------------------------------------------------- user

class AmbiguousUser(RuntimeError):
    """More than one account and nothing that picks between them.

    Step 5 of 5.1.1 is "ask" for a reason: guessing here installs the game
    into somebody else's library on a shared Deck, and the person who ran the
    installer sees nothing at all.
    """

    def __init__(self, candidates):
        super().__init__('cannot tell which Steam account to use')
        self.candidates = candidates


def list_users():
    """Accounts on this machine, each as (userdata folder, name to show).

    Ordered the way find_user would prefer them, so the first entry is the
    sensible default for a picker.
    """
    ud = os.path.join(STEAM_ROOT, 'userdata')
    dirs = [d for d in os.listdir(ud) if d.isdigit()] if os.path.isdir(ud) else []
    named = {}
    lu = os.path.join(STEAM_ROOT, 'config', 'loginusers.vdf')

    if os.path.isfile(lu):
        for key, body in (vdf.find_path(vdf.text_load(lu), 'users') or {}).items():
            if not isinstance(body, dict):
                continue
            try:
                uid = str(int(key) - STEAMID64_BASE)
            except ValueError:
                continue
            named[uid] = (body.get('PersonaName') or body.get('AccountName') or uid,
                          int(body.get('Timestamp', 0) or 0),
                          body.get('AutoLogin') == '1')

    def rank(uid):
        name, stamp, auto = named.get(uid, (uid, 0, False))
        return (0 if auto else 1, -stamp, name)

    return [(uid, named.get(uid, (uid,))[0]) for uid in sorted(dirs, key=rank)]


def find_user(log=print, chosen=None):
    """The folder number under userdata/. Degrading order, per 5.1.1.

    Raises AmbiguousUser when nothing decides, so the caller can ask instead of
    installing into the wrong library.
    """
    ud = os.path.join(STEAM_ROOT, 'userdata')
    dirs = [d for d in os.listdir(ud) if d.isdigit()] if os.path.isdir(ud) else []

    if chosen:
        if chosen in dirs:
            log('  user: %s (chosen)' % chosen)
            return chosen
        raise RuntimeError('no userdata folder %r' % chosen)

    if len(dirs) == 1:
        log('  user: %s (only folder)' % dirs[0])
        return dirs[0]

    lu = os.path.join(STEAM_ROOT, 'config', 'loginusers.vdf')
    if os.path.isfile(lu):
        users = vdf.find_path(vdf.text_load(lu), 'users') or {}
        auto = [k for k, v in users.items()
                if isinstance(v, dict) and v.get('AutoLogin') == '1']
        if len(auto) == 1:
            uid = str(int(auto[0]) - STEAMID64_BASE)
            if uid in dirs:
                log('  user: %s (AutoLogin)' % uid)
                return uid
        stamped = [(int(v.get('Timestamp', 0)), k) for k, v in users.items()
                   if isinstance(v, dict)]
        if stamped:
            uid = str(int(max(stamped)[1]) - STEAMID64_BASE)
            if uid in dirs:
                log('  user: %s (most recent Timestamp)' % uid)
                return uid

    if dirs:
        raise AmbiguousUser(list_users())
    raise RuntimeError('no user folders in userdata/')


def user_config(uid):
    return os.path.join(STEAM_ROOT, 'userdata', uid, 'config')


# -------------------------------------------------------------------- appid

def make_appid(exe_quoted, appname):
    """Our own convention (2.3). Steam generates its number randomly, but we
    are the ones writing the field, so all that matters is that a rebuild
    produces the same number."""
    crc = zlib.crc32((exe_quoted + appname).encode('utf-8')) & 0xFFFFFFFF
    return crc | 0x80000000


# ------------------------------------------------------------------- Proton

def list_proton():
    """[(name as Steam shows it, value for CompatToolMapping)] in Steam's order.

    Names come from appmanifest_*.acf rather than from directory names: Steam
    shows "Proton 9.0" while the directory is called "Proton 9.0 (Beta)", and
    "Proton Experimental" lives in "Proton - Experimental". A list that does
    not match what the client shows is confusing.
    """
    rows = []
    tools = set()
    for steamapps in library_dirs():
        common = os.path.join(steamapps, 'common')
        if not os.path.isdir(common):
            continue
        named = proton_names(steamapps)
        for d in os.listdir(common):
            if not d.startswith('Proton'):
                continue
            tool = official_tool_name(os.path.join(common, d))
            # the same version in two libraries is one choice, not two
            if not tool or tool in tools:
                continue
            tools.add(tool)
            display = named.get(d, d)
            # The order is NOT the client's. Steam puts Experimental first, but
            # that is a list of versions, not a recommendation. Our first item
            # is also the default suggestion, and Experimental is the beta
            # branch you reach for when the stable one failed. So: newest
            # stable on top, then older ones, then Experimental, then custom
            # builds.
            if 'xperimental' in display:
                key = (1, 0)
            else:
                m = re.search(r'(\d+)(?:\.(\d+))?', display)
                key = (0, -(int(m.group(1)) * 100 + int(m.group(2) or 0))) if m else (0, 0)
            rows.append((key, display, tool))

    ctd = os.path.join(STEAM_ROOT, 'compatibilitytools.d')
    if os.path.isdir(ctd):
        for d in sorted(os.listdir(ctd)):
            if os.path.isdir(os.path.join(ctd, d)):
                rows.append(((2, 0), d, d))   # custom builds: the directory name is the name

    rows.sort(key=lambda r: (r[0], r[1]))
    return [(display, tool) for _, display, tool in rows]


def library_dirs():
    """Every steamapps folder the client knows, the internal one first.

    Proton is installed the way any app is, into a library of the client's
    choosing, and that can be the SD card. Looking at the internal one alone
    offers no Proton on such a Deck, and the game goes in without one.
    """
    roots = [STEAM_ROOT]
    for path in (os.path.join(STEAM_ROOT, 'steamapps', 'libraryfolders.vdf'),
                 os.path.join(STEAM_ROOT, 'config', 'libraryfolders.vdf')):
        if not os.path.isfile(path):
            continue
        try:
            folders = vdf.find_path(vdf.text_load(path), 'libraryfolders') or {}
        except Exception:
            continue
        for key, body in folders.items():
            # {"path": ...} in current clients, a bare path in older ones
            if isinstance(body, dict):
                roots.append(body.get('path', ''))
            elif key.isdigit():
                roots.append(body)

    found, seen = [], set()
    for root in roots:
        steamapps = os.path.join(root, 'steamapps')
        real = os.path.realpath(steamapps)
        if root and real not in seen and os.path.isdir(steamapps):
            seen.add(real)
            found.append(steamapps)
    return found


def proton_names(steamapps):
    """Install directory -> name from its appmanifest, for Proton only."""
    named = {}
    for f in os.listdir(steamapps):
        if not (f.startswith('appmanifest_') and f.endswith('.acf')):
            continue
        try:
            txt = open(os.path.join(steamapps, f), encoding='utf-8',
                       errors='replace').read()
        except OSError:
            continue
        nm = re.search(r'"name"\s+"([^"]*)"', txt)
        idir = re.search(r'"installdir"\s+"([^"]*)"', txt)
        if nm and idir and 'Proton' in nm.group(1):
            named[idir.group(1)] = nm.group(1)
    return named


def official_tool_name(path):
    """proton_9 and the like is derived from the `version` file, not from the
    directory name. Only proton_9 has actually been observed (5.2)."""
    try:
        ver = open(os.path.join(path, 'version')).read().strip()
    except OSError:
        return None
    tail = ver.split()[-1] if ver.split() else ''
    if tail.startswith('experimental'):
        return 'proton_experimental'
    m = re.match(r'proton-(\d+)\.', tail)
    return 'proton_%s' % m.group(1) if m else None


# ------------------------------------------------------------- DLL wrappers

def detect_wrappers(exe_abspath):
    """Wrapper DLLs sitting next to the exe (7.3.1)."""
    d = os.path.dirname(exe_abspath)
    found = []
    try:
        names = {f.lower(): f for f in os.listdir(d)}
    except OSError:
        return found
    for w in WRAPPER_DLLS:
        if '%s.dll' % w in names:
            found.append(w)
    return found


def wrappers_from(recipe, exe_abspath, log=print):
    """Which wrappers to override.

    The recipe decides, because whether a wrapper is there depends on the
    archive, and by 2.8 that is settled at packing time. `dll_overrides` absent
    means the recipe predates the field, so fall back to looking at the folder -
    that is what every bundle built before this did.

    An explicit empty list is a decision, not a missing value: the human unticked
    the box, and nothing gets overridden.
    """
    listed = recipe.get('dll_overrides')

    if listed is None:
        found = detect_wrappers(exe_abspath)
        if found:
            log('wrapper DLLs next to exe: %s (no recipe field, detected)'
                % ', '.join(found))
        else:
            log('no wrapper DLLs found, LaunchOptions left empty')
        return found

    if listed:
        log('wrapper DLLs from the recipe: %s' % ', '.join(listed))
    else:
        log('DLL overrides switched off in the recipe')
    return list(listed)


def launch_options_for(wrappers):
    if not wrappers:
        return ''
    return 'WINEDLLOVERRIDES="%s=n,b" %%command%%' % ','.join(wrappers)


# ----------------------------------------------------------------- shortcut

FIELD_ORDER = [
    ('appid', 0), ('AppName', ''), ('Exe', ''), ('StartDir', ''),
    ('icon', ''), ('ShortcutPath', ''), ('LaunchOptions', ''),
    ('IsHidden', 0), ('AllowDesktopConfig', 1), ('AllowOverlay', 1),
    ('OpenVR', 0), ('Devkit', 0), ('DevkitGameID', ''),
    ('DevkitOverrideAppID', 0), ('LastPlayTime', 0), ('FlatpakAppID', ''),
]


def build_entry(appid, name, exe_abspath, icon='', launch_options=''):
    e = {}
    for k, default in FIELD_ORDER:
        e[k] = default
    e['appid'] = vdf.as_signed32(appid)
    e['AppName'] = name
    e['Exe'] = '"%s"' % exe_abspath
    e['StartDir'] = os.path.dirname(exe_abspath) + '/'
    e['icon'] = icon
    e['LaunchOptions'] = launch_options
    e['tags'] = {}
    return e


def add_shortcut(uid, entry, log=print):
    """Adds or replaces a shortcut. Steam must be shut down."""
    path = os.path.join(user_config(uid), 'shortcuts.vdf')
    if os.path.isfile(path):
        root, data, raw, endpos = vdf.read_shortcuts(path)
        tail = raw[endpos:]
    else:
        root, data, tail = 'shortcuts', {}, b'\x08'

    # deduplicate by Exe (5.1)
    dup = [i for i, e in data.items() if e.get('Exe') == entry['Exe']]
    for i in dup:
        log('  replacing existing shortcut "%s" (%s)' % (i, data[i].get('AppName')))
        # Do not overwrite something that worked with nothing. An install
        # without art/ once blanked the icon path, and the icon disappeared
        # from the library while the file was still on disk.
        for keep in ('icon', 'LaunchOptions', 'tags'):
            if not entry.get(keep) and data[i].get(keep):
                entry[keep] = data[i][keep]
                log('    keeping previous %s' % keep)
        del data[i]

    data = {str(n): e for n, e in enumerate(list(data.values()) + [entry])}
    vdf.write_shortcuts(path, data, root=root, tail=tail)
    log('  shortcut written, %d entries total' % len(data))
    return len(data)


def restore(backup, path, log=print):
    """Puts a backup back. Steam must be down.

    Used before every retry: the client may have replaced the file with its own
    state while it was up, and appending to that would leave the shortcuts it
    dropped dropped for good (5.1.0).
    """
    if not backup or not os.path.isfile(backup):
        log('  no backup to restore from')
        return False
    shutil.copy2(backup, path)
    log('  restored %s from %s' % (os.path.basename(path), os.path.basename(backup)))
    return True


def find_shortcut(uid, appid=None, exe_quoted=None):
    """Looks an entry up by appid or by Exe. The latter is more reliable when
    uninstalling: the shortcut may have been created by Steam, and then its
    appid is random (2.3)."""
    path = os.path.join(user_config(uid), 'shortcuts.vdf')
    if not os.path.isfile(path):
        return None, {}
    _, data, _, _ = vdf.read_shortcuts(path)
    for i, e in data.items():
        if appid is not None and vdf.as_unsigned32(e.get('appid', 0)) == appid:
            return i, e
        if exe_quoted is not None and e.get('Exe') == exe_quoted:
            return i, e
    return None, {}


def remove_shortcut(uid, appid=None, exe_quoted=None, log=print):
    path = os.path.join(user_config(uid), 'shortcuts.vdf')
    if not os.path.isfile(path):
        return False
    root, data, raw, endpos = vdf.read_shortcuts(path)
    hit = [i for i, e in data.items()
           if (appid is not None and vdf.as_unsigned32(e.get('appid', 0)) == appid)
           or (exe_quoted is not None and e.get('Exe') == exe_quoted)]
    if not hit:
        return False
    for i in hit:
        log('  removing shortcut "%s" (%s)' % (i, data[i].get('AppName')))
        del data[i]
    data = {str(n): e for n, e in enumerate(data.values())}
    vdf.write_shortcuts(path, data, root=root, tail=raw[endpos:])
    return True


# ----------------------------------------------------------- Proton mapping

def set_proton(appid, tool_name, log=print):
    path = os.path.join(STEAM_ROOT, 'config', 'config.vdf')
    txt = open(path, encoding='utf-8', errors='surrogateescape').read()
    new = config_surgery.set_mapping(txt, appid, tool_name)
    if new == txt:
        log('  CompatToolMapping already set, file untouched')
        return
    vdf.replace_file(path, new.encode('utf-8', errors='surrogateescape'))
    log('  CompatToolMapping: %d -> %s' % (appid, tool_name))


def unset_proton(appid, log=print):
    path = os.path.join(STEAM_ROOT, 'config', 'config.vdf')
    txt = open(path, encoding='utf-8', errors='surrogateescape').read()
    new = config_surgery.remove_mapping(txt, appid)
    if new != txt:
        vdf.replace_file(path, new.encode('utf-8', errors='surrogateescape'))
        log('  CompatToolMapping: entry %d removed' % appid)


# ------------------------------------------------------------------ artwork

ART_SUFFIX = {'portrait': 'p', 'wide': '', 'hero': '_hero',
              'logo': '_logo', 'icon': '_icon'}


def install_art(uid, appid, art_dir, log=print):
    """Lays the artwork out. Name comes from the unsigned appid, extension is
    kept as it arrived (7.5).

    The content is copied and nothing else: the file gets the time of the
    copy. meta is packed with zero mtimes, so that the same build gives the
    same bytes, and Steam takes a grid image dated 1970 for no image at all -
    the library showed only the icon, which it loads by the path in the
    shortcut instead.
    """
    grid = os.path.join(user_config(uid), 'grid')
    os.makedirs(grid, exist_ok=True)
    placed = {}
    for kind, suffix in ART_SUFFIX.items():
        for ext in ('.png', '.jpg', '.jpeg'):
            src = os.path.join(art_dir, kind + ext)
            if os.path.isfile(src):
                dst = os.path.join(grid, '%d%s%s' % (appid, suffix, ext))
                shutil.copyfile(src, dst)
                placed[kind] = dst
                log('  artwork %-8s -> %s' % (kind, os.path.basename(dst)))
                break
    return placed


def remove_art(uid, appid, log=print):
    grid = os.path.join(user_config(uid), 'grid')
    n = 0
    if os.path.isdir(grid):
        for f in os.listdir(grid):
            if f.startswith(str(appid)):
                os.unlink(os.path.join(grid, f))
                n += 1
    if n:
        log('  artwork files removed: %d' % n)
    return n


# ---------------------------------------------------------------- verifying

def verify(uid, appid, expect_tool, expect_count=None, log=print):
    """The check that runs AFTER Steam has rewritten the files (5.1.0).

    `expect_count` is how many entries we left in the file. Checking only our
    own appid would call it a success in the very case 5.1.0 describes, where
    the client replaces the list with an older one that happens to survive our
    second write - our game is there, and somebody else's five shortcuts are not.
    """
    okay = True
    path = os.path.join(user_config(uid), 'shortcuts.vdf')
    try:
        _, data, _, _ = vdf.read_shortcuts(path)
    except Exception as exc:
        log('  shortcut: file unreadable - %s' % exc)
        return False
    hit = [e for e in data.values()
           if vdf.as_unsigned32(e.get('appid', 0)) == appid]
    if hit:
        log('  shortcut present: %s' % hit[0]['AppName'])
    else:
        log('  SHORTCUT GONE (%d entries in file)' % len(data))
        okay = False

    if expect_count is not None and len(data) != expect_count:
        log('  ENTRY COUNT CHANGED: %d in file, %d written - the client '
            'replaced the list' % (len(data), expect_count))
        okay = False

    # No tool, nothing to check: demanding a mapping nobody wrote fails every
    # attempt, and after the third one the game is taken back out
    if not expect_tool:
        log('  Proton: not checked, none was set')
        return okay

    try:
        cfg = open(os.path.join(STEAM_ROOT, 'config', 'config.vdf'),
                   encoding='utf-8', errors='surrogateescape').read()
        got = config_surgery.get_mapping(cfg, appid)
    except Exception as exc:
        log('  config.vdf: unreadable - %s' % exc)
        return False
    if got and got.get('name') == expect_tool:
        log('  Proton set: %s' % got['name'])
    else:
        log('  PROTON NOT SET: %r' % got)
        okay = False
    return okay


def backup(path, log=print):
    if not os.path.isfile(path):
        return None
    b = '%s.bak-%s' % (path, time.strftime('%Y%m%d-%H%M%S'))
    shutil.copy2(path, b)
    log('  backup: %s' % os.path.basename(b))
    return b
