import { concat } from '~/shared/utils'

export interface MockOptions {
  zip64?: boolean
  /** Bytes of EOCD comment. At the maximum the Zip64 locator lands 20 bytes
   *  before the start of a naively sized tail buffer. */
  comment?: number
}

export interface MockEntry {
  name: string | Uint8Array
  /** Size as declared in the headers. No payload bytes are written for it. */
  size?: number
  utf8?: boolean
}

const LOCAL_SIG = 0x04034b50
const CD_SIG = 0x02014b50
const EOCD_SIG = 0x06054b50
const ZIP64_EOCD_SIG = 0x06064b50
const ZIP64_LOCATOR_SIG = 0x07064b50
const ZIP64_EXTRA_ID = 0x0001
const UTF8_FLAG = 0x800
const U16_MAX = 0xffff
const U32_MAX = 0xffffffff
const VERSION = 20
const ZIP64_VERSION = 45
const ZIP64_RECORD_TAIL = 44

function u16(value: number) {
  const out = new Uint8Array(2)

  new DataView(out.buffer).setUint16(0, value, true)

  return out
}

function u32(value: number) {
  const out = new Uint8Array(4)

  new DataView(out.buffer).setUint32(0, value, true)

  return out
}

function u64(value: number) {
  const out = new Uint8Array(8)

  new DataView(out.buffer).setBigUint64(0, BigInt(value), true)

  return out
}

function nameBytes(name: string | Uint8Array) {
  return typeof name === 'string' ? new TextEncoder().encode(name) : name
}

/**
 * Builds a zip skeleton - local headers, central directory, EOCD - so the
 * parser can be tested against bytes rather than against a mock. The entries
 * carry no payload: the app never reads archive contents (6.1), so a declared
 * size is all a fixture needs, and it lets the Zip64 branch be exercised
 * without allocating gigabytes.
 *
 * @returns The archive as a File, ready for readZip.
 */
export function makeZip(entries: MockEntry[], { zip64 = false, comment = 0 }: MockOptions = {}) {
  const locals: Uint8Array[] = []
  const central: Uint8Array[] = []
  const offsets: number[] = []
  let at = 0

  for (const entry of entries) {
    const name = nameBytes(entry.name)
    const size = entry.size ?? 0
    const flags = entry.utf8 === false ? 0 : UTF8_FLAG
    const local = concat([
      u32(LOCAL_SIG),
      u16(VERSION),
      u16(flags),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(0),
      u32(size),
      u16(name.byteLength),
      u16(0),
      name
    ])

    offsets.push(at)
    locals.push(local)
    at += local.byteLength
  }

  entries.forEach((entry, index) => {
    const name = nameBytes(entry.name)
    const size = entry.size ?? 0
    const flags = entry.utf8 === false ? 0 : UTF8_FLAG
    // Past 4 GiB the size moves into the Zip64 extra field and the plain field
    // is filled with 0xFFFFFFFF.
    const big = zip64 && size > 0
    const extra = big
      ? concat([u16(ZIP64_EXTRA_ID), u16(8), u64(size)])
      : new Uint8Array(0)

    central.push(concat([
      u32(CD_SIG),
      u16(VERSION),
      u16(VERSION),
      u16(flags),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(size),
      u32(big ? U32_MAX : size),
      u16(name.byteLength),
      u16(extra.byteLength),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offsets[index]),
      name,
      extra
    ]))
  })

  const cd = concat(central)
  const cdOffset = at
  const tail: Uint8Array[] = []

  if (zip64) {
    tail.push(concat([
      u32(ZIP64_EOCD_SIG),
      u64(ZIP64_RECORD_TAIL),
      u16(ZIP64_VERSION),
      u16(ZIP64_VERSION),
      u32(0),
      u32(0),
      u64(entries.length),
      u64(entries.length),
      u64(cd.byteLength),
      u64(cdOffset)
    ]))
    tail.push(concat([
      u32(ZIP64_LOCATOR_SIG),
      u32(0),
      u64(cdOffset + cd.byteLength),
      u32(1)
    ]))
  }

  tail.push(concat([
    u32(EOCD_SIG),
    u16(0),
    u16(0),
    u16(zip64 ? U16_MAX : entries.length),
    u16(zip64 ? U16_MAX : entries.length),
    u32(zip64 ? U32_MAX : cd.byteLength),
    u32(zip64 ? U32_MAX : cdOffset),
    u16(comment)
  ]))

  if (comment) {
    tail.push(new Uint8Array(comment).fill(0x78))
  }

  return new File([concat([...locals, cd, ...tail])], 'game.zip')
}
