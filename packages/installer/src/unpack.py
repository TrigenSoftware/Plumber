"""Unpacks the game archive out of the .run.

The archive is read in place, behind the script and the meta (3), and by
zipfile rather than bsdtar. libarchive cannot open a Zip64 archive - one over
4 GiB, or with more than 65535 entries - with anything in front of it: it
looks for the Zip64 end record at the offset written inside the archive,
which the prefix has shifted, and gives up with "Damaged Zip archive". Still
so in libarchive's master (read_zip64_eocd). zipfile finds the end records
from the end of the file and works the shift out itself, Zip64 included.

Neither of them reads Deflate64, which Windows 10 packs big folders with, so
deflate64.py does it here; anything else zipfile has no codec for is refused
before the first byte.
"""

import os
import shutil
import struct
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


def inflate64(zf, info, write):
    """Unpacks a Deflate64 entry, its packed bytes read straight from the
    archive: zipfile will not even open one. Checked the way zipfile checks
    what it unpacks, by size and CRC."""
    import deflate64   # only here: the uninstaller's copy never unpacks

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
        crc = 0

        def read(n):
            nonlocal left
            piece = f.read(min(n, left))
            left -= len(piece)
            return piece

        def out(piece):
            nonlocal crc
            crc = zlib.crc32(piece, crc)
            write(piece)

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
