import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach
} from 'vitest'
import {
  render,
  screen,
  fireEvent
} from '@nanoviews/testing-library'
import {
  InjectionContext,
  inject,
  waitTasks
} from 'nanoviews/store'
import { context$ } from 'nanoviews'
import { Artwork$ } from '~/stores/artwork'
import { Game$ } from '~/stores/game'
import { sampleArchive } from '../shared/game.mock.ts'
import {
  type ArtworkGridProps,
  ArtworkGrid
} from './ArtworkGrid.ts'
import styles from './ArtworkGrid.module.css'

// happy-dom decodes nothing: every image decodes at the portrait size
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

// The file input of a slot, named by its title and size
function slotInput(name: string) {
  return screen.getByLabelText<HTMLInputElement>(name)
}

// The frame the input of a slot is stretched over
function frame(name: string) {
  return slotInput(name).parentElement!
}

// A drop and a pick end the same way: the browser puts the file into the
// input's own list of files and fires change
function drop(name: string, file: File) {
  const input = slotInput(name)
  const transfer = new DataTransfer()

  transfer.items.add(file)
  input.files = transfer.files
  fireEvent.change(input)
}

// The grid of the sample game, and the stores it works on
async function renderArtworkGrid(props: ArtworkGridProps = {}) {
  const context = new InjectionContext()
  const game = inject(Game$, context)
  const artwork = inject(Artwork$, context)
  const { container } = render(() => context$(context)(ArtworkGrid(props)))

  game.$file(sampleArchive())
  await waitTasks(game.$archive)

  return {
    root: container.firstElementChild!.firstElementChild!,
    game,
    artwork
  }
}

describe('blocks', () => {
  describe('ArtworkGrid', () => {
    beforeEach(() => {
      vi.stubGlobal('createImageBitmap', () => Promise.resolve({
        width: WIDTH,
        height: HEIGHT,
        close() {}
      }))
      // A blob URL names the file it stands for
      vi.spyOn(URL, 'createObjectURL').mockImplementation(object => `blob:${(object as File).name}`)
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    })

    afterEach(() => {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    })

    it('should offer a slot for every image of the library, at its size', async () => {
      await renderArtworkGrid()

      expect(Array.from(document.querySelectorAll('input[type=file]'), input => input.getAttribute('aria-label'))).toEqual([
        'portrait, 600×900',
        'wide, 920×430',
        'hero, 1920×620',
        'logo, 1200×369',
        'icon, 1024×1024'
      ])
    })

    it('should let the picker offer only the formats the installer lays out', async () => {
      await renderArtworkGrid()

      expect(slotInput('hero, 1920×620').accept).toBe('image/png,image/jpeg')
    })

    it('should link every slot to its section of SteamGridDB, searched for the title', async () => {
      await renderArtworkGrid()

      expect(screen.getAllByRole('link').map(link => [link.textContent, link.getAttribute('href')])).toEqual([
        ['Grids, vertical', 'https://www.steamgriddb.com/search/grids/600x900/all/all?term=Need%20for%20Speed'],
        ['Grids, horizontal', 'https://www.steamgriddb.com/search/grids/920x430/all/all?term=Need%20for%20Speed'],
        ['Heroes', 'https://www.steamgriddb.com/search/heroes?term=Need%20for%20Speed'],
        ['Logos', 'https://www.steamgriddb.com/search/logos?term=Need%20for%20Speed'],
        ['Icons', 'https://www.steamgriddb.com/search/icons?term=Need%20for%20Speed']
      ])
    })

    it('should search for the title as it is changed', async () => {
      const { game } = await renderArtworkGrid()

      game.$name('Carmageddon')

      expect(screen.getByRole('link', {
        name: 'Heroes'
      }).getAttribute('href')).toBe('https://www.steamgriddb.com/search/heroes?term=Carmageddon')
    })

    it('should search for any game while the title is empty', async () => {
      const { game } = await renderArtworkGrid()

      game.$name('')

      expect(screen.getByRole('link', {
        name: 'Heroes'
      }).getAttribute('href')).toBe('https://www.steamgriddb.com/search/heroes?term=game')
    })

    it('should put a dropped image into the slot it was dropped on', async () => {
      const {
        root,
        artwork
      } = await renderArtworkGrid()
      const file = png('portrait.png')

      drop('portrait, 600×900', file)
      await waitTasks(artwork.$slots)

      expect(artwork.$slots()).toEqual({
        portrait: expect.objectContaining({
          file
        })
      })
      expect(Array.from(root.querySelectorAll('img'), image => image.getAttribute('src'))).toEqual(['blob:portrait.png'])
      expect(frame('portrait, 600×900').querySelector('img')).not.toBeNull()
    })

    it('should show the size of an image that fits its slot', async () => {
      const { artwork } = await renderArtworkGrid()

      drop('portrait, 600×900', png('portrait.png'))
      await waitTasks(artwork.$slots)

      expect(screen.getByText('600×900')).toBeTruthy()
    })

    it('should note the size of an image that does not fit its slot', async () => {
      const { artwork } = await renderArtworkGrid()

      drop('hero, 1920×620', png('hero.png'))
      await waitTasks(artwork.$slots)

      expect(screen.getByText('600×900, expected 1920×620')).toBeTruthy()
    })

    it('should show what is wrong with a JPEG logo instead of its note', async () => {
      const { artwork } = await renderArtworkGrid()

      drop('logo, 1200×369', jpeg('logo.jpg'))
      await waitTasks(artwork.$slots)

      expect(screen.getByText('A logo must have transparency, and a JPEG has none. Use a PNG.')).toBeTruthy()
      expect(screen.queryByText('600×900, expected 1200×369')).toBeNull()
    })

    it('should empty a slot with its remove button', async () => {
      const { artwork } = await renderArtworkGrid()

      drop('icon, 1024×1024', png('icon.png'))
      await waitTasks(artwork.$slots)
      fireEvent.click(screen.getByRole('button', {
        name: 'Remove'
      }))

      expect(artwork.$slots()).toEqual({})
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:icon.png')
      expect(frame('icon, 1024×1024').querySelector('img')).toBeNull()
      expect(screen.queryByRole('button', {
        name: 'Remove'
      })).toBeNull()
    })

    it('should keep the class it is given', async () => {
      const { root } = await renderArtworkGrid({
        class: 'artwork'
      })

      expect(root.classList.contains('artwork')).toBe(true)
      expect(root.classList.contains(styles.root)).toBe(true)
    })

    it('should hand the other attributes to its root', async () => {
      const { root } = await renderArtworkGrid({
        title: 'artwork'
      })

      expect(root.getAttribute('title')).toBe('artwork')
    })
  })
})
