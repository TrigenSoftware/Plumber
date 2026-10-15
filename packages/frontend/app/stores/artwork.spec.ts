import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach
} from 'vitest'
import {
  InjectionContext,
  inject,
  waitTasks
} from '@nano_kit/store'
import type { ArtSlot } from '~/services/artwork'
import { Artwork$ } from './artwork.ts'

// Every image decodes at the portrait size
const WIDTH = 600
const HEIGHT = 900

function png(name: string) {
  return new File([new Uint8Array(1)], name, {
    type: 'image/png'
  })
}

function jpeg(name: string) {
  return new File([new Uint8Array(1)], name, {
    type: 'image/jpeg'
  })
}

// Not a single byte to decode
function broken(name: string) {
  return new File([], name, {
    type: 'image/png'
  })
}

function decode(file: File) {
  return file.size
    ? Promise.resolve({
      width: WIDTH,
      height: HEIGHT,
      close() {}
    })
    : Promise.reject(new DOMException('The source image could not be decoded.', 'InvalidStateError'))
}

// Each file decodes once the test finishes it, so two decodes can end in either order
function deferDecodes() {
  const pending = new Map<File, () => void>()

  vi.stubGlobal('createImageBitmap', (file: File) => new Promise((resolve) => {
    pending.set(file, () => resolve(decode(file)))
  }))

  return (file: File) => pending.get(file)?.()
}

function createArtwork() {
  return inject(Artwork$, new InjectionContext())
}

describe('stores', () => {
  describe('Artwork$', () => {
    beforeEach(() => {
      vi.stubGlobal('createImageBitmap', vi.fn(decode))
      vi.spyOn(URL, 'createObjectURL').mockImplementation(object => `blob:${(object as File).name}`)
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    })

    afterEach(() => {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    })

    it('should place a decoded image into its slot', async () => {
      const artwork = createArtwork()
      const file = png('portrait.png')

      artwork.setArt('portrait', file)
      await waitTasks(artwork.$slots)

      expect(artwork.$slots().portrait).toEqual({
        slot: 'portrait',
        file,
        url: 'blob:portrait.png',
        width: WIDTH,
        height: HEIGHT,
        warnings: [],
        error: null
      })
      expect(artwork.$error()).toBeNull()
    })

    it('should list the images in slot order whatever order they came in', async () => {
      const artwork = createArtwork()

      artwork.setArt('icon', png('icon.png'))
      artwork.setArt('portrait', png('portrait.png'))
      await waitTasks(artwork.$slots)

      expect(artwork.$items().map(item => item.slot)).toEqual(['portrait', 'icon'])
    })

    it('should hold a JPEG logo as a problem and a JPEG hero as none', async () => {
      const artwork = createArtwork()

      artwork.setArt('logo', jpeg('logo.jpg'))
      artwork.setArt('hero', jpeg('hero.jpg'))
      await waitTasks(artwork.$slots)

      expect(artwork.$problems()).toEqual(['A logo must have transparency, and a JPEG has none. Use a PNG.'])
    })

    it('should report a file that cannot be decoded and keep the image the slot had', async () => {
      const artwork = createArtwork()
      const file = png('hero.png')

      artwork.setArt('hero', file)
      await waitTasks(artwork.$slots)
      artwork.setArt('hero', broken('broken.png'))
      await waitTasks(artwork.$slots)

      expect(artwork.$error()).toBe('broken.png could not be read as an image.')
      expect(artwork.$slots().hero?.file).toBe(file)
      expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    })

    it('should forget the error once an image is placed', async () => {
      const artwork = createArtwork()

      artwork.setArt('hero', broken('broken.png'))
      await waitTasks(artwork.$slots)
      artwork.setArt('wide', png('wide.png'))
      await waitTasks(artwork.$slots)

      expect(artwork.$error()).toBeNull()
    })

    it('should revoke the image a slot had only once the new one is in place', async () => {
      const artwork = createArtwork()
      const shown: (string | undefined)[] = []

      artwork.setArt('hero', png('first.png'))
      await waitTasks(artwork.$slots)
      vi.mocked(URL.revokeObjectURL).mockImplementation(() => {
        shown.push(artwork.$slots().hero?.url)
      })
      artwork.setArt('hero', png('second.png'))
      await waitTasks(artwork.$slots)

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first.png')
      expect(shown).toEqual(['blob:second.png'])
    })

    it('should keep the images other slots received while one was decoded', async () => {
      const finish = deferDecodes()
      const artwork = createArtwork()
      const portrait = png('portrait.png')
      const wide = png('wide.png')

      artwork.setArt('portrait', portrait)
      artwork.setArt('wide', wide)
      finish(wide)
      finish(portrait)
      await waitTasks(artwork.$slots)

      expect(artwork.$items().map(item => item.file)).toEqual([portrait, wide])
    })

    it('should throw away an image whose decode a later drop into the slot overtook', async () => {
      const finish = deferDecodes()
      const artwork = createArtwork()
      const first = png('first.png')
      const second = png('second.png')

      artwork.setArt('portrait', first)
      artwork.setArt('portrait', second)
      finish(second)
      finish(first)
      await waitTasks(artwork.$slots)

      expect(artwork.$slots().portrait?.file).toBe(second)
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first.png')
    })

    it('should not report a failed decode a later drop into the slot overtook', async () => {
      const finish = deferDecodes()
      const artwork = createArtwork()
      const bad = broken('broken.png')
      const good = png('good.png')

      artwork.setArt('portrait', bad)
      artwork.setArt('portrait', good)
      finish(good)
      finish(bad)
      await waitTasks(artwork.$slots)

      expect(artwork.$error()).toBeNull()
      expect(artwork.$slots().portrait?.file).toBe(good)
    })

    it('should clear a slot and revoke its image', async () => {
      const artwork = createArtwork()

      artwork.setArt('icon', png('icon.png'))
      await waitTasks(artwork.$slots)
      artwork.clearArt('icon')

      expect(artwork.$slots()).toEqual({})
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:icon.png')
    })

    it('should leave the error alone when a slot is cleared', async () => {
      const artwork = createArtwork()

      artwork.setArt('icon', png('icon.png'))
      await waitTasks(artwork.$slots)
      artwork.setArt('hero', broken('broken.png'))
      await waitTasks(artwork.$slots)
      artwork.clearArt('icon')

      expect(artwork.$error()).toBe('broken.png could not be read as an image.')
    })

    it('should not fill a slot cleared while its image was decoded', async () => {
      const finish = deferDecodes()
      const artwork = createArtwork()
      const file = png('icon.png')

      artwork.setArt('icon', file)
      artwork.clearArt('icon')
      finish(file)
      await waitTasks(artwork.$slots)

      expect(artwork.$slots()).toEqual({})
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:icon.png')
    })

    it('should ignore a slot it does not know', async () => {
      const artwork = createArtwork()

      artwork.setArt('banner' as ArtSlot, png('banner.png'))
      await waitTasks(artwork.$slots)

      expect(artwork.$slots()).toEqual({})
      expect(createImageBitmap).not.toHaveBeenCalled()
    })
  })
})
