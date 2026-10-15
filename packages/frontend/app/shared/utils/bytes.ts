/** @returns The chunks joined into one buffer. */
export function concat(chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const out = new Uint8Array(total)
  let at = 0

  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.byteLength
  }

  return out
}

/** @returns How many whole blocks the size occupies. */
export function blocksFor(size: number, blockSize: number) {
  return Math.ceil(size / blockSize)
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']
/** Decimal units, the ones a file manager shows. */
const STEP = 1000
/** Below this, one decimal place still carries information. */
const PRECISE_BELOW = 10

/** @returns A human-readable size in decimal units. */
export function formatSize(bytes: number) {
  let value = bytes
  let unit = 0

  while (value >= STEP && unit < UNITS.length - 1) {
    value /= STEP
    unit++
  }

  return `${unit === 0 ? value : value.toFixed(value < PRECISE_BELOW ? 1 : 0)} ${UNITS[unit]}`
}
