import {
  vi,
  describe,
  it,
  expect,
  afterEach
} from 'vitest'
import {
  STORE_UNMOUNT_DELAY,
  InjectionContext,
  inject,
  start,
  waitTasks
} from '@nano_kit/store'
import type { ArtItem } from '~/services/artwork'
import {
  type MockEntry,
  makeZip
} from '~/services/zip/zip.mock'
import { Artwork$ } from './artwork.ts'
import { Build$ } from './build.ts'
import { Game$ } from './game.ts'
import { Preflight$ } from './preflight.ts'

const ENTRIES: MockEntry[] = [
  {
    name: 'Need for Speed/'
  },
  {
    name: 'Need for Speed/speed.exe',
    size: 8_000_000
  },
  {
    name: 'Need for Speed/d3d9.dll'
  },
  {
    name: 'Need for Speed/unins000.exe',
    size: 300_000
  }
]
const COVER: ArtItem = {
  slot: 'portrait',
  file: new File([new Uint8Array(1)], 'cover.png', {
    type: 'image/png'
  }),
  url: 'blob:cover',
  width: 600,
  height: 900,
  warnings: [],
  error: null
}
const LOGO_JPEG = 'A logo must have transparency, and a JPEG has none. Use a PNG.'

function emptySlots(empty: number) {
  return {
    level: 'note',
    message: `${empty} of 5 artwork slots are empty. `
      + 'The game will still install; the library will just show a grey box where the art goes.'
  }
}

function archiveOf(name = 'Need for Speed.zip', entries = ENTRIES) {
  return new File([makeZip(entries)], name)
}

// What is on screen: the summary of the archive always, the checks when a test shows them
const stops: (() => void)[] = []

function setup() {
  const context = new InjectionContext()
  const game = inject(Game$, context)

  stops.push(start(game.$archive))

  return {
    game,
    artwork: inject(Artwork$, context),
    build: inject(Build$, context),
    preflight: inject(Preflight$, context)
  }
}

// happy-dom has no StorageManager, so the estimate is the test's to give
function reportStorage(quota: number, usage: number) {
  const estimate = vi.fn(() => Promise.resolve({
    quota,
    usage
  }))

  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: {
      estimate
    }
  })

  return estimate
}

describe('stores', () => {
  describe('Preflight$', () => {
    afterEach(() => {
      vi.useFakeTimers()
      stops.splice(0).forEach(stop => stop())
      vi.advanceTimersByTime(STORE_UNMOUNT_DELAY)
      vi.useRealTimers()
      Reflect.deleteProperty(navigator, 'storage')
    })

    it('should say nothing before an archive is read', () => {
      const { preflight } = setup()

      expect(preflight.$checks()).toEqual([])
      expect(preflight.$notes()).toEqual([])
    })

    it('should check the archive once it is read', async () => {
      const { game, preflight } = setup()

      game.$file(archiveOf())
      await waitTasks(game.$archive)

      expect(preflight.$checks()).toEqual([emptySlots(5)])
      expect(preflight.$notes()).toEqual([emptySlots(5)])
    })

    it('should count the slots that are filled', async () => {
      const { game, artwork, preflight } = setup()

      game.$file(archiveOf())
      await waitTasks(game.$archive)
      artwork.$slots({
        portrait: COVER
      })

      expect(preflight.$checks()).toEqual([emptySlots(4)])
    })

    it('should warn when the archive has no exe at all', async () => {
      const { game, preflight } = setup()

      game.$file(archiveOf('Manual.zip', [
        {
          name: 'manual/readme.txt',
          size: 1_000
        }
      ]))
      await waitTasks(game.$archive)

      expect(preflight.$checks()).toContainEqual({
        level: 'warning',
        message: 'There is no .exe anywhere in this archive, so there is nothing to point the shortcut at.'
      })
    })

    it('should note a chosen exe that looks like an uninstaller', async () => {
      const { game, preflight } = setup()

      game.$file(archiveOf())
      await waitTasks(game.$archive)
      game.$exePath('Need for Speed/unins000.exe')

      expect(preflight.$checks()).toContainEqual({
        level: 'note',
        message: 'The chosen exe looks like an installer or a utility rather than the game. '
          + 'That may well be right - just worth a second look.'
      })
    })

    it('should warn when the browser reports less free space than the archive', async () => {
      const { game, preflight } = setup()

      reportStorage(1_000, 900)
      stops.push(start(preflight.$checks))
      game.$file(archiveOf())
      await waitTasks(preflight.$checks)

      expect(preflight.$storageAvailable()).toBe(100)
      expect(preflight.$checks()).toContainEqual({
        level: 'warning',
        message: 'The browser reports about 100 B of free space, less than '
          + 'the archive. The build writes through a temporary file, so it may run out part way.'
      })
    })

    it('should ask for the free space when the notes were on screen before the archive came', async () => {
      const { game, preflight } = setup()

      reportStorage(1_000, 900)
      stops.push(start(preflight.$notes))
      game.$file(archiveOf())
      await waitTasks(preflight.$notes)

      expect(preflight.$storageAvailable()).toBe(100)
      expect(preflight.$notes()).toContainEqual({
        level: 'warning',
        message: 'The browser reports about 100 B of free space, less than '
          + 'the archive. The build writes through a temporary file, so it may run out part way.'
      })
    })

    it('should not ask for the free space while the checks are off screen', async () => {
      const { game, preflight } = setup()
      const estimate = reportStorage(1_000, 900)

      game.$file(archiveOf())
      await waitTasks(game.$archive)

      expect(preflight.$checks()).toEqual([emptySlots(5)])
      expect(estimate).not.toHaveBeenCalled()
    })

    it('should ask for the free space again when another archive comes', async () => {
      const { game, preflight } = setup()
      const estimate = reportStorage(1_000_000_000, 0)

      stops.push(start(preflight.$checks))
      game.$file(archiveOf())
      await waitTasks(preflight.$checks)

      expect(preflight.$storageAvailable()).toBe(1_000_000_000)

      estimate.mockResolvedValue({
        quota: 1_000,
        usage: 900
      })
      game.$file(null)
      game.$file(archiveOf('Hot Pursuit 2.zip'))
      await waitTasks(preflight.$checks)

      expect(preflight.$storageAvailable()).toBe(100)
    })

    it('should say what the images break, then the checks, then what went wrong', async () => {
      const { game, artwork, build, preflight } = setup()

      game.$file(archiveOf())
      await waitTasks(game.$archive)
      artwork.$slots({
        logo: {
          ...COVER,
          slot: 'logo',
          error: LOGO_JPEG
        }
      })
      artwork.$error('broken.png could not be read as an image.')
      build.$error('There is not enough space on the disk.')

      expect(preflight.$notes()).toEqual([
        {
          level: 'error',
          message: LOGO_JPEG
        },
        emptySlots(4),
        {
          level: 'error',
          message: 'broken.png could not be read as an image.'
        },
        {
          level: 'error',
          message: 'There is not enough space on the disk.'
        }
      ])
    })
  })
})
