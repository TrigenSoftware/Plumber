"""Unpacks the game archive out of the .run.

The archive is read in place, behind the script and the meta (3), and by
zipfile rather than bsdtar. libarchive cannot open a Zip64 archive - one over
4 GiB, or with more than 65535 entries - with anything in front of it: it
looks for the Zip64 end record at the offset written inside the archive,
which the prefix has shifted, and gives up with "Damaged Zip archive". Still
so in libarchive's master (read_zip64_eocd). zipfile finds the end records
from the end of the file and works the shift out itself, Zip64 included.

Neither of them reads Deflate64, which Windows 10 packs big folders with.
funzip does, and SteamOS ships it with unzip; deflate64.py stands in where it
is missing or fails. Anything else zipfile has no codec for is refused before
the first byte.
"""

import contextlib
import functools
import os
import shutil
import struct
import subprocess
import threading
import time
import zipfile
import zlib

CHUNK = 1 << 20
# Files take whole blocks on disk, so every one of them costs up to a block
# more than its size; 4 KiB is the block of ext4 and of most SD cards.
BLOCK = 4096

DEFLATE64 = 9
# What the entries can be packed with: zipfile's codecs, Zstandard where the
# Python has it (3.14), and Deflate64 by way of deflate64.py
UNPACKS = {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED, zipfile.ZIP_BZIP2,
           zipfile.ZIP_LZMA, DEFLATE64}
if hasattr(zipfile, 'ZIP_ZSTANDARD'):
    UNPACKS.add(zipfile.ZIP_ZSTANDARD)
METHODS = {0: 'Store', 8: 'Deflate', 9: 'Deflate64', 12: 'BZip2', 14: 'LZMA',
           93: 'Zstandard', 95: 'XZ', 97: 'WavPack', 98: 'PPMd', 99: 'AES'}
# Six bytes of Deflate64: an 'a', then a copy of 300 by length code 285 and its
# extra bits. Plain Deflate reads 285 as 258 and loses its place, so only a
# Deflate64 decoder makes 301 'a's of it
PROBE = bytes.fromhex('4b1c4d090000')
PROBE_OUT = b'a' * 301


class UnpackError(Exception):
    """A failure to tell the player about, in words they can act on."""


def human(size):
    return '%.1f GB' % (size / 1e9)


def open_archive(path):
    try:
        return zipfile.ZipFile(path)
    except (OSError, zipfile.BadZipFile) as exc:
        raise UnpackError('The game archive cannot be read (%s). The installer '
                          'may not have downloaded completely.' % exc) from exc


def relative_path(info):
    """Where an entry goes, relative to the game folder; '' for none.

    A name the archive does not mark as UTF-8 is kept as the bytes it is, the
    way bsdtar keeps it; zipfile alone would read it as cp437 and make up
    other characters. Backslashes are separators: Windows tools write them,
    and taken literally they end up inside file names.
    """
    name = info.filename
    if not info.flag_bits & 0x800:
        name = name.encode('cp437').decode('utf-8', 'surrogateescape')
    parts = [p for p in name.replace('\\', '/').split('/') if p not in ('', '.')]
    if '..' in parts:
        raise UnpackError('The archive has a path that leads out of the game '
                          'folder: %s' % info.filename)
    return os.path.join(*parts) if parts else ''


def plan(zf, dest, keep=()):
    """What to unpack into `dest`: ([(info, target, is_dir)], folders kept).

    `keep` is the recipe's `user_data` (5.1, step 3). An entry inside such a
    folder is left out when the folder is already there with something in it:
    portable games rewrite their settings and saves in place, and unpacking
    over them would put the factory ones back.
    """
    keep = set(keep)
    kept = {}
    items = []
    for info in zf.infolist():
        rel = relative_path(info)
        if not rel:
            continue
        parts = rel.split(os.sep)
        held = False
        for i, part in enumerate(parts[:-1]):
            if part in keep:
                folder = os.path.join(dest, *parts[:i + 1])
                if folder not in kept:
                    kept[folder] = os.path.isdir(folder) and bool(os.listdir(folder))
                held = held or kept[folder]
        if not held:
            is_dir = info.filename.endswith(('/', '\\'))
            items.append((info, os.path.join(dest, rel), is_dir))
    return items, sorted(folder for folder, there in kept.items() if there)


def method_name(method):
    return METHODS.get(method, 'method %d' % method)


def packing(items):
    """How the files about to be written are packed: [(method name, count)],
    the most used first, for the log."""
    count = {}
    for info, _, is_dir in items:
        if not is_dir:
            count[info.compress_type] = count.get(info.compress_type, 0) + 1
    ranked = sorted(count.items(), key=lambda item: -item[1])
    return [(method_name(method), n) for method, n in ranked]


def check_methods(items):
    """Refuses before the first byte an archive with files nothing here can
    unpack: found halfway, it would leave half a game behind. 7-Zip offers
    PPMd and encryption for a zip, and Windows packs neither."""
    for info, _, is_dir in items:
        if is_dir:
            continue
        if info.flag_bits & 0x1:
            raise UnpackError('%s is password-protected, and the installer cannot '
                              'unpack it. Zip the game folder again without a '
                              'password.' % info.filename)
        if info.compress_type not in UNPACKS:
            raise UnpackError('%s is packed with %s, which the installer cannot '
                              'unpack. Zip the game folder again: right-click it '
                              'and choose Compress to → ZIP File.'
                              % (info.filename, method_name(info.compress_type)))


def blocks(size):
    return -(-size // BLOCK) * BLOCK


def check_space(items, dest):
    """Refuses before the first byte when the drive cannot take the game.

    A full drive found halfway costs minutes of waiting and leaves half a game
    behind. Files about to be overwritten give their room back.
    -> (bytes needed, bytes free)
    """
    need = 0
    for info, target, is_dir in items:
        if is_dir:
            continue
        try:
            have = os.stat(target).st_size
        except OSError:
            have = 0
        need += max(0, blocks(info.file_size) - blocks(have))

    probe = dest
    while not os.path.isdir(probe):
        probe = os.path.dirname(probe)
    free = shutil.disk_usage(probe).free
    if need > free:
        raise UnpackError('Not enough free space: the game needs %s, the drive '
                          'has %s.' % (human(need), human(free)))
    return need, free


def damaged(info, why):
    return UnpackError('%s is damaged in the archive (%s). The installer may not '
                       'have downloaded completely.' % (info.filename, why))


@contextlib.contextmanager
def packed(zf, info):
    """The packed bytes of an entry read straight from the archive, for what
    zipfile will not even open: yields read(n)."""
    with open(zf.filename, 'rb') as f:
        f.seek(info.header_offset)
        head = f.read(30)
        if len(head) < 30 or head[:4] != b'PK\x03\x04':
            raise damaged(info, 'no local header where the directory points')
        # The local header has extra fields of its own, sized apart from the
        # directory's
        name_len, extra_len = struct.unpack('<HH', head[26:30])
        f.seek(name_len + extra_len, 1)
        left = info.compress_size

        def read(n):
            nonlocal left
            piece = f.read(min(n, left))
            left -= len(piece)
            return piece

        yield read


def local_header(crc, packed_size, size):
    """A local header of our own to put in front of the packed bytes: no name,
    no extra field and no data descriptor, all of which the archive's may
    have. Sizes past 4 GiB do not fit, and funzip unpacks them right anyway."""
    return struct.pack('<IHHHHHIIIHH', 0x04034b50, 21, 0, DEFLATE64, 0, 0, crc,
                       packed_size & 0xFFFFFFFF, size & 0xFFFFFFFF, 0, 0)


@functools.lru_cache(maxsize=None)
def funzip():
    """Info-ZIP's funzip, if it decodes Deflate64: one zip entry from stdin to
    stdout, at the speed of C. SteamOS ships it with unzip 6.00, built with
    USE_DEFLATE64; what is checked is that it decodes PROBE. -> path or None
    """
    path = shutil.which('funzip')
    if not path:
        return None
    try:
        run = subprocess.run([path], input=local_header(
            zlib.crc32(PROBE_OUT), len(PROBE), len(PROBE_OUT)) + PROBE,
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=30)
    except (OSError, subprocess.SubprocessError):
        return None
    return path if run.stdout == PROBE_OUT else None


def funzip64(path, zf, info, write):
    """A Deflate64 entry through funzip. -> whether it came out whole

    The size and the CRC decide, not the exit code: funzip says "length
    error" about a file past 4 GiB that it unpacks right.
    """
    crc = 0
    size = 0
    with packed(zf, info) as read:
        proc = subprocess.Popen([path], stdin=subprocess.PIPE,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)

        def feed():
            try:
                proc.stdin.write(local_header(info.CRC, info.compress_size, info.file_size))
                while True:
                    piece = read(CHUNK)
                    if not piece:
                        break
                    proc.stdin.write(piece)
            except OSError:
                pass   # funzip stopped reading: what came out tells why
            finally:
                with contextlib.suppress(OSError):
                    proc.stdin.close()

        # Fed from a thread of its own: funzip writes as it reads, and a pipe
        # it cannot empty would stall both ends
        feeder = threading.Thread(target=feed, daemon=True)
        feeder.start()
        try:
            while True:
                piece = proc.stdout.read(CHUNK)
                if not piece:
                    break
                crc = zlib.crc32(piece, crc)
                size += len(piece)
                write(piece)
        finally:
            proc.stdout.close()
            proc.wait()
            feeder.join()
    return size == info.file_size and crc == info.CRC


def inflate64(zf, info, write):
    """A Deflate64 entry through the decoder of our own, checked the way
    zipfile checks what it unpacks, by size and CRC."""
    import deflate64   # only here: the uninstaller's copy never unpacks

    crc = 0

    def out(piece):
        nonlocal crc
        crc = zlib.crc32(piece, crc)
        write(piece)

    with packed(zf, info) as read:
        try:
            size = deflate64.inflate(read, out)
        except deflate64.Deflate64Error as exc:
            raise damaged(info, exc) from exc
    if size != info.file_size or crc != info.CRC:
        raise damaged(info, 'Bad CRC-32')


def extract(zf, items, progress=None):
    """Writes the entries out; `progress(done, total)` gets bytes. -> bytes."""
    total = sum(info.file_size for info, _, is_dir in items if not is_dir)
    done = 0
    for info, target, is_dir in items:
        try:
            if is_dir:
                os.makedirs(target, exist_ok=True)
                continue
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, 'wb') as dst:
                def write(piece):
                    nonlocal done
                    dst.write(piece)
                    done += len(piece)
                    if progress:
                        progress(done, total)

                if info.compress_type == DEFLATE64:
                    before = done
                    tool = funzip()
                    if not (tool and funzip64(tool, zf, info, write)):
                        # Written again from the start by our own decoder,
                        # which also tells a damaged entry from a funzip that
                        # let it down
                        dst.seek(0)
                        dst.truncate()
                        done = before
                        inflate64(zf, info, write)
                else:
                    with zf.open(info) as src:
                        while True:
                            piece = src.read(CHUNK)
                            if not piece:
                                break
                            write(piece)
        except OSError as exc:
            raise UnpackError('Cannot unpack %s: %s.'
                              % (info.filename, exc.strerror or exc)) from exc
        except (zipfile.BadZipFile, zlib.error, EOFError) as exc:
            raise damaged(info, exc) from exc
        except NotImplementedError as exc:
            raise UnpackError('%s is packed in a way this installer cannot '
                              'unpack (%s).' % (info.filename, exc)) from exc
        try:
            stamp = time.mktime(info.date_time + (0, 0, -1))
            os.utime(target, (stamp, stamp))
        except (OverflowError, ValueError, OSError):
            pass
    return done
