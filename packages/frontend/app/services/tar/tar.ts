import { concat } from '~/shared/utils'

export interface TarEntry {
  path: string
  /** Absent means a directory entry. */
  data?: Uint8Array
  mode?: number
}

const BLOCK = 512
/** Field offsets and widths of a ustar header, in the order they appear. */
const NAME = {
  at: 0,
  size: 100
}
const MODE = {
  at: 100,
  size: 8
}
const UID = {
  at: 108,
  size: 8
}
const GID = {
  at: 116,
  size: 8
}
const SIZE = {
  at: 124,
  size: 12
}
const MTIME = {
  at: 136,
  size: 12
}
const CHECKSUM = {
  at: 148,
  size: 8
}
const TYPEFLAG = {
  at: 156
}
const MAGIC = {
  at: 257,
  size: 6
}
const VERSION = {
  at: 263,
  size: 2
}
const TYPE_FILE = 0x30
const TYPE_DIRECTORY = 0x35
const SPACE = 0x20
const MODE_EXECUTABLE = 0o755
const MODE_REGULAR = 0o644
const OCTAL = 8
/** Six octal digits, a null, then a space - the layout of the checksum field. */
const CHECKSUM_DIGITS = 6
/**
 * A fixed timestamp instead of the current time, so the same inputs always
 * produce the same bytes. CompressionStream writes a zero mtime into the gzip
 * header too, which makes the whole `.run` reproducible.
 */
const EPOCH = 0
const ascii = new TextEncoder()

function writeText(block: Uint8Array, at: number, limit: number, value: string) {
  const bytes = ascii.encode(value)

  if (bytes.byteLength > limit) {
    throw new Error(`Path is too long for a tar header: ${value}`)
  }

  block.set(bytes, at)
}

interface Field {
  at: number
  size: number
}

/** Octal, right-aligned, zero-padded, null-terminated - the ustar convention. */
function writeOctal(block: Uint8Array, field: Field, value: number) {
  writeText(block, field.at, field.size, value.toString(OCTAL).padStart(field.size - 1, '0'))
}

function header(entry: TarEntry) {
  const block = new Uint8Array(BLOCK)
  const directory = entry.data === undefined
  const path = directory && !entry.path.endsWith('/') ? `${entry.path}/` : entry.path

  writeText(block, NAME.at, NAME.size, path)
  writeOctal(block, MODE, entry.mode ?? (directory ? MODE_EXECUTABLE : MODE_REGULAR))
  writeOctal(block, UID, 0)
  writeOctal(block, GID, 0)
  writeOctal(block, SIZE, entry.data?.byteLength ?? 0)
  writeOctal(block, MTIME, EPOCH)
  // The checksum is computed over the header with its own field full of spaces.
  block.fill(SPACE, CHECKSUM.at, CHECKSUM.at + CHECKSUM.size)
  block[TYPEFLAG.at] = directory ? TYPE_DIRECTORY : TYPE_FILE
  writeText(block, MAGIC.at, MAGIC.size, 'ustar')
  writeText(block, VERSION.at, VERSION.size, '00')

  const sum = block.reduce((total, byte) => total + byte, 0)

  writeText(block, CHECKSUM.at, CHECKSUM.size, `${sum.toString(OCTAL).padStart(CHECKSUM_DIGITS, '0')}\0`)
  block[CHECKSUM.at + CHECKSUM.size - 1] = SPACE

  return block
}

function padTo(size: number, blockSize: number) {
  const over = size % blockSize

  return over ? new Uint8Array(blockSize - over) : new Uint8Array(0)
}

/**
 * A ustar writer, because meta still has to be a tar.gz - the one the spec says
 * the browser does not need is a writer for the game archive, which is copied
 * through byte for byte instead (2.4).
 *
 * @returns The archive as one buffer; meta is small enough to hold in memory.
 */
export function tar(entries: TarEntry[]) {
  const chunks: Uint8Array[] = []

  for (const entry of entries) {
    chunks.push(header(entry))

    if (entry.data) {
      chunks.push(entry.data, padTo(entry.data.byteLength, BLOCK))
    }
  }

  // Two zero blocks close the archive.
  chunks.push(new Uint8Array(BLOCK * 2))

  return concat(chunks)
}

/**
 * `CompressionStream` and `DecompressionStream` declare a `BufferSource`
 * writable side, which does not line up with a `ReadableStream<Uint8Array>`.
 * The cast that bridges it is confined to this one place.
 *
 * @returns The transformed bytes.
 */
async function transformBytes(data: Uint8Array, transform: GenericTransformStream) {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data)
      controller.close()
    }
  })
  const piped = source.pipeThrough<Uint8Array>(transform)

  return drain(piped)
}

/** @returns The input as a gzip stream. */
export async function gzip(data: Uint8Array) {
  return transformBytes(data, new CompressionStream('gzip'))
}

/** @returns The gzip stream unpacked. Rejects on trailing junk, unlike GNU gzip. */
export async function gunzip(data: Uint8Array) {
  return transformBytes(data, new DecompressionStream('gzip'))
}

/** @returns Everything the stream produced, as one buffer. */
export async function drain(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []

  for (;;) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    chunks.push(value)
  }

  return concat(chunks)
}
