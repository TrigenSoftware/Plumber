import {
  describe,
  it,
  expect,
  afterEach
} from 'vitest'
import { render } from '@nanoviews/testing-library'
import {
  InjectionContext,
  inject,
  waitTasks
} from 'nanoviews/store'
import { context$ } from 'nanoviews'
import type { ArtItem } from '~/services/artwork'
import { Artwork$ } from '~/stores/artwork'
import { Build$ } from '~/stores/build'
import { Game$ } from '~/stores/game'
import { Preflight$ } from '~/stores/preflight'
import calloutStyles from '~/uikit/Callout/Callout.module.css'
import { sampleArchive } from '../shared/game.mock.ts'
import {
  type PreflightListProps,
  PreflightList
} from './PreflightList.ts'
import styles from './PreflightList.module.css'

const TONES = ['warning', 'note', 'error'] as const
const LOGO_JPEG = 'A logo must have transparency, and a JPEG has none. Use a PNG.'
const NOT_PNG = 'cover.webp is neither a PNG nor a JPEG. The installer lays out '
  + 'only those two, so anything else would never reach the library.'
const UNINSTALLER = 'The chosen exe looks like an installer or a utility rather than the game. '
  + 'That may well be right - just worth a second look.'
const NOT_DECODED = 'hero.png could not be read as an image.'
const NOT_READABLE = 'The requested file could not be read, typically due to permission problems '
  + 'that have occurred after a reference to a file was acquired.'
const LOW_STORAGE = 'The browser reports about 100 B of free space, less than '
  + 'the archive. The build writes through a temporary file, so it may run out part way.'
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
const WEBP_COVER: ArtItem = {
  ...COVER,
  file: new File([new Uint8Array(1)], 'cover.webp', {
    type: 'image/webp'
  }),
  error: NOT_PNG
}
const JPEG_LOGO: ArtItem = {
  slot: 'logo',
  file: new File([new Uint8Array(1)], 'logo.jpg', {
    type: 'image/jpeg'
  }),
  url: 'blob:logo',
  width: 1200,
  height: 369,
  warnings: [],
  error: LOGO_JPEG
}

function emptySlots(empty: number) {
  return `${empty} of 5 artwork slots are empty. `
    + 'The game will still install; the library will just show a grey box where the art goes.'
}

// The list in a context of its own, so the test holds the very stores it shows.
// It comes on screen once the archive is read, as it does on the page.
async function setup(archive: File | null = sampleArchive(), props?: PreflightListProps) {
  const context = new InjectionContext()
  const game = inject(Game$, context)
  const { $notes } = inject(Preflight$, context)

  if (archive) {
    game.$file(archive)
    await waitTasks(game.$archive)
  }

  const { container } = render(() => context$(context)(PreflightList(props)))

  // Whatever the list asked for once it was on screen, the free space say
  await waitTasks($notes)

  return {
    // The mount target holds the list and nothing else
    list: container.firstElementChild!.firstElementChild as HTMLElement,
    game,
    artwork: inject(Artwork$, context),
    build: inject(Build$, context)
  }
}

// Something to say from every source: an image that breaks the hard rule, an
// uninstaller picked by hand, an image that would not decode and a failed build
async function setupTrouble() {
  const stores = await setup()

  stores.game.$exePath('Need for Speed/unins000.exe')
  stores.artwork.$slots({
    logo: JPEG_LOGO
  })
  stores.artwork.$error(NOT_DECODED)
  stores.build.$error(NOT_READABLE)

  return stores
}

// What the list says, top to bottom
function messagesOf(list: HTMLElement) {
  return Array.from(list.children, callout => callout.textContent)
}

// The tone of each callout, which shows only in its colour
function tonesOf(list: HTMLElement) {
  return Array.from(list.children, callout => TONES.find(tone => callout.classList.contains(calloutStyles[tone])))
}

describe('blocks', () => {
  describe('PreflightList', () => {
    afterEach(() => {
      Reflect.deleteProperty(navigator, 'storage')
    })

    it('should stay hidden while there is nothing to say', async () => {
      const { list } = await setup(null)

      expect(list.hidden).toBe(true)
      expect(messagesOf(list)).toEqual([])
    })

    it('should note the empty artwork slots of the archive', async () => {
      const { list } = await setup()

      expect(list.hidden).toBe(false)
      expect(messagesOf(list)).toEqual([emptySlots(5)])
    })

    it('should show the notes of an archive read while it is on screen', async () => {
      const { list, game } = await setup(null)

      game.$file(sampleArchive())
      await waitTasks(game.$archive)

      expect(list.hidden).toBe(false)
      expect(messagesOf(list)).toEqual([emptySlots(5)])
    })

    it('should say what the images break, then the checks, then what went wrong', async () => {
      const { list } = await setupTrouble()

      expect(messagesOf(list)).toEqual([
        LOGO_JPEG,
        UNINSTALLER,
        emptySlots(4),
        NOT_DECODED,
        NOT_READABLE
      ])
    })

    it('should give each note the tone of its level', async () => {
      const { list } = await setupTrouble()

      expect(tonesOf(list)).toEqual([
        'error',
        'note',
        'note',
        'error',
        'error'
      ])
    })

    it('should keep both of two notes that say the same thing', async () => {
      const { list, artwork } = await setup()

      artwork.$slots({
        portrait: WEBP_COVER,
        // The same file dropped into the next slot as well
        wide: {
          ...WEBP_COVER,
          slot: 'wide',
          url: 'blob:wide',
          warnings: ['600×900, expected 920×430']
        }
      })

      expect(messagesOf(list)).toEqual([
        NOT_PNG,
        NOT_PNG,
        emptySlots(3)
      ])
    })

    it('should rewrite a note in place as the slots fill', async () => {
      const { list, artwork } = await setup()
      const callout = list.firstElementChild

      artwork.$slots({
        portrait: COVER
      })

      expect(messagesOf(list)).toEqual([emptySlots(4)])
      expect(list.firstElementChild).toBe(callout)
    })

    it('should hide again once the archive is gone', async () => {
      const { list, game } = await setup()

      game.$file(null)

      expect(list.hidden).toBe(true)
      expect(messagesOf(list)).toEqual([])
    })

    it('should warn when the browser reports less free space than the archive', async () => {
      // happy-dom has no StorageManager, so the estimate is the test's to give
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: {
          estimate: () => Promise.resolve({
            quota: 1_000,
            usage: 900
          })
        }
      })

      const { list } = await setup()

      expect(messagesOf(list)).toEqual([LOW_STORAGE, emptySlots(5)])
    })

    it('should keep the class it is given', async () => {
      const { list } = await setup(null, {
        class: 'notes'
      })

      expect(list.classList.contains('notes')).toBe(true)
      expect(list.classList.contains(styles.root)).toBe(true)
    })

    it('should hand the other attributes to its root', async () => {
      const { list } = await setup(null, {
        title: 'notes'
      })

      expect(list.getAttribute('title')).toBe('notes')
    })
  })
})
