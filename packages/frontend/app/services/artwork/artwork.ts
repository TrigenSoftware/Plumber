import type {
  ArtItem,
  ArtSlot,
  ArtSlotSpec
} from './artwork.types.ts'

/**
 * Five slots. Sizes and the SteamGridDB sections are the ones from 7.5; the two
 * Grids slots differ only by orientation, so the hint says which.
 */
export const ART_SLOTS: ArtSlotSpec[] = [
  {
    slot: 'portrait',
    width: 600,
    height: 900,
    section: 'grids',
    dimensions: '600x900',
    hint: 'Grids, vertical'
  },
  {
    slot: 'wide',
    width: 920,
    height: 430,
    section: 'grids',
    dimensions: '920x430',
    hint: 'Grids, horizontal'
  },
  {
    slot: 'hero',
    width: 1920,
    height: 620,
    section: 'heroes',
    hint: 'Heroes'
  },
  {
    slot: 'logo',
    width: 1200,
    height: 369,
    section: 'logos',
    hint: 'Logos'
  },
  {
    slot: 'icon',
    width: 1024,
    height: 1024,
    section: 'icons',
    hint: 'Icons'
  }
]

/**
 * Artwork cannot be fetched from the browser - CORS is closed on preflight (2.7).
 * The size filter goes into the path, the way the site puts it there.
 *
 * @returns A search link into the right section of SteamGridDB, filtered by size when a size is given.
 */
export function steamGridDbUrl(section: string, term: string, dimensions?: string) {
  const filter = dimensions ? `/${dimensions}/all/all` : ''

  return `https://www.steamgriddb.com/search/${section}${filter}?term=${encodeURIComponent(term)}`
}

/**
 * The formats the installer copies into `grid/`. Anything else -
 * a WebP, a GIF - would travel inside meta and then be ignored there, leaving
 * the slot filled here and the library empty.
 */
export const ART_TYPES = ['image/png', 'image/jpeg']

const JPEG = /^image\/jpe?g$/i

/**
 * Steam matches on the name before the extension, so the image is kept as it
 * arrived rather than re-encoded (7.5).
 *
 * @returns The name this image gets inside meta.
 */
export function artFileName(slot: ArtSlot, file: File) {
  return `${slot}${JPEG.test(file.type) ? '.jpg' : '.png'}`
}

/**
 * A slot is a receiver with a check, not an editor: SteamGridDB already has the
 * images at the right sizes, so there is no crop and no resize (7.5).
 *
 * @returns The image plus whatever is worth saying about it.
 */
export async function inspectArt(spec: ArtSlotSpec, file: File): Promise<ArtItem> {
  const bitmap = await createImageBitmap(file)
  // Read the size out before closing: close() releases the bitmap and leaves
  // width and height reading zero.
  const { width, height } = bitmap
  const warnings: string[] = []
  let error: string | null = null

  bitmap.close()

  if (width !== spec.width || height !== spec.height) {
    warnings.push(`${width}×${height}, expected ${spec.width}×${spec.height}`)
  }

  if (!ART_TYPES.includes(file.type.toLowerCase())) {
    error = `${file.name} is neither a PNG nor a JPEG. The installer lays out `
      + 'only those two, so anything else would never reach the library.'
  }

  // The logo is laid over the hero. Without an alpha channel that is a white box.
  if (spec.slot === 'logo' && JPEG.test(file.type)) {
    error = 'A logo must have transparency, and a JPEG has none. Use a PNG.'
  }

  return {
    slot: spec.slot,
    file,
    url: URL.createObjectURL(file),
    width,
    height,
    warnings,
    error
  }
}
