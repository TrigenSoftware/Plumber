import type { Decorator } from '@nanoviews/storybook'
import {
  InjectionContext,
  inject
} from 'nanoviews/store'
import { context$ } from 'nanoviews'
import {
  type MockEntry,
  makeZip
} from '~/services/zip/zip.mock'
import { Game$ } from '~/stores/game'

/**
 * A believable game: the exe at the root of its folder with a wrapper DLL and
 * an ASI mod next to it, and an uninstaller and a redistributable for the
 * ranking to push down.
 */
export const SAMPLE_ENTRIES: MockEntry[] = [
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
    name: 'Need for Speed/scripts/widescreen.asi'
  },
  {
    name: 'Need for Speed/unins000.exe',
    size: 300_000
  },
  {
    name: 'Need for Speed/redist/vcredist_x86.exe',
    size: 5_000_000
  }
]

/** @returns A zip of the entries under the name a human gives it. */
export function sampleArchive(name = 'Need for Speed.zip', entries = SAMPLE_ENTRIES) {
  return new File([makeZip(entries)], name)
}

/**
 * @returns An archive whose read never ends: what a big one is like for the
 * moment it is read.
 */
export function pendingArchive(name = 'Need for Speed.zip') {
  const file = new File([], name)
  const tail = new Blob()

  // The tail of the file, where the reader looks first, never arrives
  tail.arrayBuffer = () => new Promise(() => {})
  file.slice = () => tail

  return file
}

/**
 * Runs the story in an injection context of its own, with the archive handed
 * to the game the way a drop hands it. The story follows the store from there,
 * as the page does: it says the archive is read, then shows what was read.
 *
 * @returns The decorator.
 */
export function withGame(archive: File | null = sampleArchive()): Decorator {
  return (story) => {
    const context = new InjectionContext()

    inject(Game$, context).$file(archive)

    // The story renders inside the context: a story that injects in its
    // render, or in a decorator of its own, finds the game there
    return context$(context)(
      story()
    )
  }
}
