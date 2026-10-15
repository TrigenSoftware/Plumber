import type {
  ZipEntry,
  ZipInfo
} from './zip.types.ts'
import {
  decodeCp437,
  hasNonAscii
} from './cp437.ts'

const EOCD_SIG = 0x06054b50
const ZIP64_EOCD_SIG = 0x06064b50
const ZIP64_LOCATOR_SIG = 0x07064b50
const CD_SIG = 0x02014b50
const ZIP64_EXTRA_ID = 0x0001
/** General purpose flag bit 11: names in this entry are UTF-8. */
const UTF8_FLAG = 0x800
const U32_MAX = 0xffffffff
const U16_MAX = 0xffff
/** Field offsets inside the end-of-central-directory record. */
const EOCD = {
  size: 22,
  entries: 10,
  cdSize: 12,
  cdOffset: 16
}
/** Field offsets inside the Zip64 locator that precedes the plain EOCD. */
const LOCATOR = {
  size: 20,
  recordOffset: 8
}
/** Field offsets inside the Zip64 end-of-central-directory record. */
const ZIP64_EOCD = {
  size: 56,
  entries: 32,
  cdSize: 40,
  cdOffset: 48
}
/** Field offsets inside a central directory file header. */
const CD = {
  size: 46,
  flags: 8,
  uncompressed: 24,
  nameLength: 28,
  extraLength: 30,
  commentLength: 32
}
/** Header id and length, then the payload of a Zip64 extra field. */
const EXTRA_HEADER = 4
const U64_SIZE = 8
/**
 * Longest an EOCD record can be, its comment included, plus the Zip64 locator
 * that precedes it. Without the locator's 20 bytes a maximum-length comment
 * pushes it outside the buffer, `readZip64` finds nothing, and the parser goes
 * on to read the 0xFFFFFFFF placeholders as real values - a valid archive comes
 * back empty (6.1).
 */
const MAX_EOCD = EOCD.size + U16_MAX + LOCATOR.size
const utf8 = new TextDecoder('utf-8')

async function readSlice(file: File, start: number, end: number) {
  return new Uint8Array(await file.slice(start, end).arrayBuffer())
}

function findEocd(tail: Uint8Array) {
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength)

  for (let at = tail.byteLength - EOCD.size; at >= 0; at--) {
    if (view.getUint32(at, true) === EOCD_SIG) {
      return at
    }
  }

  return -1
}

/**
 * Past 4 GiB the offset and size fields in the plain EOCD are filled with
 * 0xFFFFFFFF and the real values live in the Zip64 record the locator points
 * at. A parser that skips this reads garbage on a big archive and shows an
 * empty list (6.1).
 *
 * @returns The real counts and offsets, or null when there is no Zip64 record.
 */
async function readZip64(file: File, tail: Uint8Array, eocdAt: number) {
  if (eocdAt < LOCATOR.size) {
    return null
  }

  const locator = new DataView(
    tail.buffer, tail.byteOffset + eocdAt - LOCATOR.size, LOCATOR.size
  )

  if (locator.getUint32(0, true) !== ZIP64_LOCATOR_SIG) {
    return null
  }

  const at = Number(locator.getBigUint64(LOCATOR.recordOffset, true))
  const record = await readSlice(file, at, at + ZIP64_EOCD.size)
  const view = new DataView(record.buffer, record.byteOffset, record.byteLength)

  if (view.getUint32(0, true) !== ZIP64_EOCD_SIG) {
    return null
  }

  return {
    entries: Number(view.getBigUint64(ZIP64_EOCD.entries, true)),
    size: Number(view.getBigUint64(ZIP64_EOCD.cdSize, true)),
    offset: Number(view.getBigUint64(ZIP64_EOCD.cdOffset, true))
  }
}

/**
 * The Zip64 extra field lists only the fields that overflowed, in a fixed
 * order, and the original size comes first.
 *
 * @returns The real uncompressed size, or null when it is not in there.
 */
function zip64Size(extra: Uint8Array, overflowed: boolean) {
  if (!overflowed) {
    return null
  }

  const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength)
  let at = 0

  while (at + EXTRA_HEADER <= extra.byteLength) {
    const id = view.getUint16(at, true)
    const size = view.getUint16(at + 2, true)

    if (id === ZIP64_EXTRA_ID && size >= U64_SIZE) {
      return Number(view.getBigUint64(at + EXTRA_HEADER, true))
    }

    at += EXTRA_HEADER + size
  }

  return null
}

/** @returns The single directory every entry sits under, or an empty string. */
function commonPrefixOf(entries: ZipEntry[]) {
  if (!entries.length) {
    return ''
  }

  const segmentsOf = (entry: ZipEntry) => entry.path.split('/').slice(0, -1)
  let shared = segmentsOf(entries[0])

  for (const entry of entries.slice(1)) {
    const segments = segmentsOf(entry)
    let same = 0

    while (same < shared.length && same < segments.length && shared[same] === segments[same]) {
      same++
    }

    shared = shared.slice(0, same)

    if (!shared.length) {
      return ''
    }
  }

  return shared.length ? `${shared.join('/')}/` : ''
}

/**
 * Reads the central directory and nothing else: whatever the archive weighs,
 * this touches about 200 KB at the end of it (6.1).
 *
 * @returns Every entry, plus the facts the warnings and the scoring need.
 */
export async function readZip(file: File): Promise<ZipInfo> {
  const tail = await readSlice(file, Math.max(0, file.size - MAX_EOCD), file.size)
  const eocdAt = findEocd(tail)

  if (eocdAt < 0) {
    throw new Error('This file is not a zip archive: no end-of-central-directory record.')
  }

  const eocd = new DataView(tail.buffer, tail.byteOffset + eocdAt, EOCD.size)
  let count = eocd.getUint16(EOCD.entries, true)
  let cdSize = eocd.getUint32(EOCD.cdSize, true)
  let cdOffset = eocd.getUint32(EOCD.cdOffset, true)
  const overflowed = count === U16_MAX || cdSize === U32_MAX || cdOffset === U32_MAX
  const zip64 = overflowed ? await readZip64(file, tail, eocdAt) : null

  if (zip64) {
    count = zip64.entries
    cdSize = zip64.size
    cdOffset = zip64.offset
  }

  const cd = await readSlice(file, cdOffset, Math.min(cdOffset + cdSize, file.size))
  const view = new DataView(cd.buffer, cd.byteOffset, cd.byteLength)
  const entries: ZipEntry[] = []
  let mangledNames = false
  let at = 0

  while (entries.length < count && at + CD.size <= cd.byteLength) {
    if (view.getUint32(at, true) !== CD_SIG) {
      break
    }

    const flags = view.getUint16(at + CD.flags, true)
    const stored = view.getUint32(at + CD.uncompressed, true)
    const nameLength = view.getUint16(at + CD.nameLength, true)
    const extraLength = view.getUint16(at + CD.extraLength, true)
    const commentLength = view.getUint16(at + CD.commentLength, true)
    const nameAt = at + CD.size
    const nameBytes = cd.subarray(nameAt, nameAt + nameLength)
    const extra = cd.subarray(nameAt + nameLength, nameAt + nameLength + extraLength)
    const isUtf8 = Boolean(flags & UTF8_FLAG)
    const path = isUtf8 ? utf8.decode(nameBytes) : decodeCp437(nameBytes)

    if (!isUtf8 && hasNonAscii(nameBytes)) {
      mangledNames = true
    }

    entries.push({
      path,
      size: zip64Size(extra, stored === U32_MAX) ?? stored,
      directory: path.endsWith('/')
    })

    at = nameAt + nameLength + extraLength + commentLength
  }

  return {
    entries,
    zip64: Boolean(zip64),
    mangledNames,
    commonPrefix: commonPrefixOf(entries)
  }
}
