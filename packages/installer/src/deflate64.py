"""Deflate64 in plain Python, for the entries zipfile cannot unpack.

Deflate64 is Deflate with three changes: a 64 KiB window, distance codes 30
and 31 that reach into it, and length code 285 carrying 16 extra bits rather
than standing for 258. Windows 10 packs with it once a folder grows past 2 GB
(3). zipfile and libarchive refuse it, and zlib reads it without a word into
the wrong bytes. funzip, which SteamOS ships, does it at the speed of C, and
unpack.py goes to it first; this decoder stands in where funzip is missing or
gets an entry wrong. Stored blocks go at the speed of copying, coded ones at a
few MB/s: 4.8 on a Deck.
"""

CHUNK = 1 << 20
WINDOW = 1 << 16
# Output held beyond the window before it goes to the caller in one piece
FLUSH = 1 << 20

LEN_BASE = (3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43,
            51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 3)
LEN_EXTRA = (0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3,
             4, 4, 4, 4, 5, 5, 5, 5, 16)
DIST_BASE = (1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257,
             385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289,
             16385, 24577, 32769, 49153)
DIST_EXTRA = (0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8,
              9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14)
# The order the lengths of the code length code come in
CL_ORDER = (16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15)


class Deflate64Error(ValueError):
    """The stream is not whole, valid Deflate64: a damaged entry."""


def build(lengths):
    """A table over the next `bits` bits of the stream, LSB first, giving the
    symbol and its code length, so a symbol takes one lookup. -> (table, bits)
    """
    bits = max(lengths)
    if not bits:
        # A block without distances still sends a code length for them
        return [None, None], 1
    count = [0] * 16
    for n in lengths:
        count[n] += 1
    count[0] = 0
    code = 0
    first = [0] * 16
    for n in range(1, 16):
        code = (code + count[n - 1]) << 1
        first[n] = code
    table = [None] * (1 << bits)
    for sym, n in enumerate(lengths):
        if not n:
            continue
        code = first[n]
        first[n] += 1
        # Codes go into the stream MSB first, and the table is read LSB first
        rev = int(format(code, '0%db' % n)[::-1], 2)
        entry = (sym, n)
        for at in range(rev, 1 << bits, 1 << n):
            table[at] = entry
    return table, bits


FIXED = (build([8] * 144 + [9] * 112 + [7] * 24 + [8] * 8), build([5] * 32))


def _fill(read, data, pos, buf, cnt, bits):
    """The bit buffer topped up to `bits`, a byte at a time, outside the hot
    loop. -> (data, pos, buf, cnt)
    """
    while cnt < bits:
        if pos >= len(data):
            data = read(CHUNK)
            pos = 0
            if not data:
                raise Deflate64Error('the stream ends early')
        buf |= data[pos] << cnt
        pos += 1
        cnt += 8
    return data, pos, buf, cnt


def _code_lengths(read, data, pos, buf, cnt):
    """The two tables of a dynamic block. -> (lit, dist, data, pos, buf, cnt)"""
    data, pos, buf, cnt = _fill(read, data, pos, buf, cnt, 14)
    hlit = (buf & 31) + 257
    hdist = ((buf >> 5) & 31) + 1
    hclen = ((buf >> 10) & 15) + 4
    buf >>= 14
    cnt -= 14
    cl_lengths = [0] * 19
    for i in range(hclen):
        data, pos, buf, cnt = _fill(read, data, pos, buf, cnt, 3)
        cl_lengths[CL_ORDER[i]] = buf & 7
        buf >>= 3
        cnt -= 3
    cl, cl_bits = build(cl_lengths)
    cl_mask = (1 << cl_bits) - 1
    lengths = []
    while len(lengths) < hlit + hdist:
        data, pos, buf, cnt = _fill(read, data, pos, buf, cnt, cl_bits + 7)
        entry = cl[buf & cl_mask]
        if entry is None:
            raise Deflate64Error('a code length that has no code')
        sym, n = entry
        buf >>= n
        cnt -= n
        if sym < 16:
            lengths.append(sym)
        elif sym == 16:
            if not lengths:
                raise Deflate64Error('a repeat with nothing to repeat')
            lengths += [lengths[-1]] * (3 + (buf & 3))
            buf >>= 2
            cnt -= 2
        elif sym == 17:
            lengths += [0] * (3 + (buf & 7))
            buf >>= 3
            cnt -= 3
        else:
            lengths += [0] * (11 + (buf & 127))
            buf >>= 7
            cnt -= 7
    if len(lengths) > hlit + hdist:
        raise Deflate64Error('code lengths run past the table')
    return build(lengths[:hlit]), build(lengths[hlit:]), data, pos, buf, cnt


def inflate(read, write):
    """Decodes the stream `read(n)` hands out, giving the output to `write` in
    pieces. Raises Deflate64Error on anything but a whole, valid stream.
    -> the number of bytes written
    """
    data = b''
    pos = 0
    buf = 0
    cnt = 0
    out = bytearray()
    written = 0
    final = 0

    while not final:
        data, pos, buf, cnt = _fill(read, data, pos, buf, cnt, 3)
        final = buf & 1
        kind = (buf >> 1) & 3
        buf >>= 3
        cnt -= 3

        if kind == 0:
            # Stored: the rest of the byte goes, then LEN and its complement
            buf >>= cnt & 7
            cnt -= cnt & 7
            data, pos, buf, cnt = _fill(read, data, pos, buf, cnt, 32)
            length = buf & 0xFFFF
            if (buf >> 16) & 0xFFFF ^ 0xFFFF != length:
                raise Deflate64Error('a stored block with a broken length')
            buf >>= 32
            cnt -= 32
            # Whole bytes still in the bit buffer come first
            while cnt and length:
                out.append(buf & 0xFF)
                buf >>= 8
                cnt -= 8
                length -= 1
            while length:
                if pos >= len(data):
                    data = read(CHUNK)
                    pos = 0
                    if not data:
                        raise Deflate64Error('the stream ends early')
                piece = data[pos:pos + length]
                out += piece
                pos += len(piece)
                length -= len(piece)
        elif kind == 3:
            raise Deflate64Error('a block of the reserved type')
        else:
            if kind == 1:
                (lit, lit_bits), (dist, dist_bits) = FIXED
            else:
                (lit, lit_bits), (dist, dist_bits), data, pos, buf, cnt = \
                    _code_lengths(read, data, pos, buf, cnt)
            lit_mask = (1 << lit_bits) - 1
            dist_mask = (1 << dist_bits) - 1
            size = len(data)
            append = out.append

            while True:
                # The longest code is 15 bits with 16 extra, a distance as much
                # again: 48 bits cover a whole length with its distance. Topped
                # up 24 bytes at a time: fewer refills beat a smaller int
                if cnt < 48:
                    while size - pos < 24:
                        more = read(CHUNK)
                        if not more:
                            break
                        data = data[pos:] + more
                        pos = 0
                        size = len(data)
                    piece = data[pos:pos + 24]
                    buf |= int.from_bytes(piece, 'little') << cnt
                    pos += len(piece)
                    cnt += len(piece) << 3
                entry = lit[buf & lit_mask]
                if entry is None:
                    raise Deflate64Error('a symbol that has no code')
                sym, n = entry
                buf >>= n
                cnt -= n
                if cnt < 0:
                    raise Deflate64Error('the stream ends early')
                if sym < 256:
                    append(sym)
                    continue
                if sym == 256:
                    break
                sym -= 257
                if sym > 28:
                    raise Deflate64Error('a length symbol out of range')
                extra = LEN_EXTRA[sym]
                length = LEN_BASE[sym] + (buf & ((1 << extra) - 1))
                buf >>= extra
                cnt -= extra
                entry = dist[buf & dist_mask]
                if entry is None:
                    raise Deflate64Error('a distance that has no code')
                sym, n = entry
                buf >>= n
                extra = DIST_EXTRA[sym]
                distance = DIST_BASE[sym] + (buf & ((1 << extra) - 1))
                buf >>= extra
                cnt -= n + extra
                if cnt < 0:
                    raise Deflate64Error('the stream ends early')
                start = len(out) - distance
                if start < 0:
                    raise Deflate64Error('a distance past the start of the output')
                if distance >= length:
                    out += out[start:start + length]
                else:
                    # Overlapping: the copy repeats its own beginning
                    run = out[start:]
                    out += (run * (length // distance + 1))[:length]
                if len(out) > WINDOW + FLUSH:
                    cut = len(out) - WINDOW
                    write(bytes(out[:cut]))
                    written += cut
                    del out[:cut]

        if len(out) > WINDOW + FLUSH:
            cut = len(out) - WINDOW
            write(bytes(out[:cut]))
            written += cut
            del out[:cut]

    write(bytes(out))
    return written + len(out)
