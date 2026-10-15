"""Steam client lifecycle, so its config files can be edited safely.

The main lesson this module exists for: writing a file while the client is
down does not mean the write stuck. Steam rewrites `shortcuts.vdf` roughly a
minute and a half after it starts, and it may put its own state there instead
of ours. So every edit has to be verified AFTER the client has done that.
"""

import os
import re
import subprocess
import time

REGISTRY = os.path.expanduser('~/.steam/registry.vdf')
# Processes worth waiting for: the client itself and its web helpers. SteamOS
# service daemons (steamos-manager and friends) have nothing to do with it.
PROC_RE = re.compile(r'^(steam|steamwebhelper|steamerrorreporter|steam-runtime-.*)$')


def steam_procs():
    out = subprocess.run(['ps', '-eo', 'pid,comm', '--no-headers'],
                         capture_output=True, text=True).stdout
    hits = []
    for line in out.splitlines():
        parts = line.split(None, 1)
        if len(parts) == 2 and PROC_RE.match(parts[1].strip()):
            hits.append((int(parts[0]), parts[1].strip()))
    return hits


def registry_steam_pid():
    try:
        txt = open(REGISTRY, encoding='utf-8', errors='replace').read()
    except OSError:
        return None
    m = re.search(r'"SteamPID"\s+"(\d+)"', txt)
    return int(m.group(1)) if m else None


def shutdown(timeout=90, log=print):
    """Shuts the client down and waits until all of its processes are gone."""
    if not steam_procs():
        log('  Steam is not running')
        return True
    subprocess.run(['steam', '-shutdown'], capture_output=True)
    t0 = time.time()
    while time.time() - t0 < timeout:
        procs = steam_procs()
        if not procs and registry_steam_pid() in (0, None):
            log('  stopped in %.0fs' % (time.time() - t0))
            return True
        time.sleep(0.5)
    log('  DID NOT STOP in %ds, still running: %r' % (timeout, steam_procs()))
    return False


def start(log=print):
    subprocess.Popen(['steam'], stdout=subprocess.DEVNULL,
                     stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL,
                     start_new_session=True)
    t0 = time.time()
    while time.time() - t0 < 60:
        if registry_steam_pid():
            log('  started in %.0fs' % (time.time() - t0))
            return True
        time.sleep(0.5)
    log('  did not start within 60s')
    return False


def wait_rewrite(path, mtime_before, timeout=210, log=print):
    """Waits until Steam rewrites the file itself. True if it did.

    This is the moment of truth: until it happens, what is on disk means
    nothing.
    """
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if os.stat(path).st_mtime > mtime_before:
                log('  Steam rewrote the file after %.0fs' % (time.time() - t0))
                return True
        except OSError:
            pass
        time.sleep(1.0)
    log('  Steam did not touch the file in %ds' % timeout)
    return False
