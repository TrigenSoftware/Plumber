"""VDF parsers for Plumber. Both formats, reading and writing.

Written from scratch because python-vdf is not installed on SteamOS and
pulling a dependency into the bundle is not an option.
"""

import os
import shutil
import struct
import zlib

# ------------------------------------------------------------------- binary
# shortcuts.vdf: type tag, null-terminated key, value according to the type.

BIN_MAP = 0x00  # nested object, closed by BIN_END
BIN_STR = 0x01  # null-terminated string
BIN_INT = 0x02  # int32 LE, signed
BIN_FLT = 0x03  # float32 LE
BIN_PTR = 0x04
BIN_WST = 0x05
BIN_CLR = 0x06
BIN_U64 = 0x07  # uint64 LE
BIN_END = 0x08


def _cstr(buf, pos):
    end = buf.index(b'\x00', pos)
    return buf[pos:end].decode('utf-8', errors='replace'), end + 1


def binary_load_map(buf, pos):
    """Reads the body of an object from pos up to its BIN_END.

    Returns (dict, new pos).
    """
    out = {}
    while True:
        tag = buf[pos]
        pos += 1
        if tag == BIN_END:
            return out, pos
        key, pos = _cstr(buf, pos)
        if tag == BIN_MAP:
            out[key], pos = binary_load_map(buf, pos)
        elif tag == BIN_STR:
            out[key], pos = _cstr(buf, pos)
        elif tag == BIN_INT:
            out[key] = struct.unpack('<i', buf[pos:pos + 4])[0]
            pos += 4
        elif tag == BIN_FLT:
            out[key] = struct.unpack('<f', buf[pos:pos + 4])[0]
            pos += 4
        elif tag == BIN_U64:
            out[key] = struct.unpack('<Q', buf[pos:pos + 8])[0]
            pos += 8
        else:
            raise ValueError('unknown tag 0x%02x at offset %d' % (tag, pos - 1))


def read_shortcuts(path):
    """-> (root key, dict of entries, raw bytes, offset past the root object)."""
    with open(path, 'rb') as f:
        buf = f.read()
    if buf[0] != BIN_MAP:
        raise ValueError('not a binary VDF: first byte is 0x%02x' % buf[0])
    root, pos = _cstr(buf, 1)
    data, pos = binary_load_map(buf, pos)
    return root, data, buf, pos


# --------------------------------------------------------------------- text
# config.vdf, registry.vdf, loginusers.vdf - quoted KeyValues.

def _tokens(text):
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c in ' \t\r\n':
            i += 1
        elif c == '/' and i + 1 < n and text[i + 1] == '/':
            j = text.find('\n', i)
            i = n if j < 0 else j + 1
        elif c == '"':
            j = i + 1
            parts = []
            while text[j] != '"':
                if text[j] == '\\':
                    parts.append(text[j:j + 2])
                    j += 2
                else:
                    parts.append(text[j])
                    j += 1
            yield ('s', ''.join(parts))
            i = j + 1
        elif c == '{':
            yield ('{', None)
            i += 1
        elif c == '}':
            yield ('}', None)
            i += 1
        else:
            j = i
            while j < n and text[j] not in ' \t\r\n{}"':
                j += 1
            yield ('s', text[i:j])
            i = j


def text_loads(text):
    """Parses KeyValues into nested dicts. Values stay raw strings, with every
    backslash exactly as it is in the file."""
    root = {}
    stack = [root]
    pending = None
    for kind, val in _tokens(text):
        if kind == 's':
            if pending is None:
                pending = val
            else:
                stack[-1][pending] = val
                pending = None
        elif kind == '{':
            node = {}
            stack[-1][pending] = node
            stack.append(node)
            pending = None
        elif kind == '}':
            stack.pop()
    return root


def text_load(path):
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        return text_loads(f.read())


def find_path(node, *keys):
    """Case-insensitive descent through nested keys. -> value or None."""
    cur = node
    for k in keys:
        if not isinstance(cur, dict):
            return None
        hit = next((kk for kk in cur if kk.lower() == k.lower()), None)
        if hit is None:
            return None
        cur = cur[hit]
    return cur


# -------------------------------------------------------------------- appid

def shortcut_appid(exe, appname):
    """CRC32 of exe+appname with the high bit set. `exe` must be exactly as it
    is stored in shortcuts.vdf, quotes included."""
    crc = zlib.crc32((exe + appname).encode('utf-8')) & 0xFFFFFFFF
    return crc | 0x80000000


def as_signed32(u):
    return struct.unpack('<i', struct.pack('<I', u & 0xFFFFFFFF))[0]


def as_unsigned32(i):
    return struct.unpack('<I', struct.pack('<i', i))[0]


def legacy_grid_id(appid_unsigned):
    """The 64-bit id artwork files used to be named after in older schemes."""
    return (appid_unsigned << 32) | 0x02000000


# ----------------------------------------------------------- binary: writing
# The other side of binary_load_map. Key order is preserved: dict is ordered in
# Python 3.7+, so a round-trip produces a byte-identical file.

def _enc_cstr(s):
    return s.encode('utf-8') + b'\x00'


def binary_dump_map(d):
    """Serializes the body of an object WITHOUT the trailing BIN_END."""
    out = bytearray()
    for key, val in d.items():
        if isinstance(val, dict):
            out += bytes([BIN_MAP]) + _enc_cstr(key)
            out += binary_dump_map(val)
            out += bytes([BIN_END])
        elif isinstance(val, bool):
            out += bytes([BIN_INT]) + _enc_cstr(key) + struct.pack('<i', int(val))
        elif isinstance(val, int):
            out += bytes([BIN_INT]) + _enc_cstr(key) + struct.pack('<i', val)
        elif isinstance(val, float):
            out += bytes([BIN_FLT]) + _enc_cstr(key) + struct.pack('<f', val)
        elif isinstance(val, str):
            out += bytes([BIN_STR]) + _enc_cstr(key) + _enc_cstr(val)
        else:
            raise TypeError('nothing to serialize %r with (%s)' % (key, type(val)))
    return bytes(out)


def write_shortcuts(path, data, root='shortcuts', tail=b'\x08'):
    """Assembles the whole file. `tail` is whatever follows the root object; in
    Steam's own files that is one more BIN_END, hence the \\x08 default."""
    buf = bytes([BIN_MAP]) + _enc_cstr(root)
    buf += binary_dump_map(data)
    buf += bytes([BIN_END]) + tail
    replace_file(path, buf)
    return len(buf)


# -------------------------------------------------------------------- files

def replace_file(path, data):
    """Puts `data` (bytes) in place of the file whole, or leaves it as it was.

    A plain write that stops halfway - on a disk the game has just filled up -
    leaves a cut-off file, and a cut-off config.vdf costs every client
    setting (2.2). The new content goes next to the file first and is renamed
    over it only once complete; the rename is atomic.
    """
    tmp = '%s.tmp-%d' % (path, os.getpid())
    try:
        with open(tmp, 'wb') as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        if os.path.exists(path):
            shutil.copymode(path, tmp)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
