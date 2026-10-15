import {
  signal,
  computed,
  mountable,
  onMountEffect,
  action,
  task,
  inject
} from '@nano_kit/store'
import { ART_SLOTS } from '~/services/artwork'
import {
  type Check,
  type CheckLevel,
  preflight
} from '~/services/checks'
import { Artwork$ } from './artwork.ts'
import { Build$ } from './build.ts'
import { Game$ } from './game.ts'

export type NoteLevel = 'error' | CheckLevel

export interface Note {
  level: NoteLevel
  message: string
}

function errorNote(message: string): Note {
  return {
    level: 'error',
    message
  }
}

/**
 * What is worth saying before the build: the checks of the archive, and
 * whatever went wrong on the way to it.
 *
 * @returns The store.
 */
export function Preflight$() {
  const {
    $archive,
    $zip,
    $candidates,
    $selected
  } = inject(Game$)
  const {
    $items,
    $problems,
    $error: $artworkError
  } = inject(Artwork$)
  const { $error: $buildError } = inject(Build$)
  /** From navigator.storage.estimate(), or null when it could not be asked. */
  const $storageAvailable = mountable(signal<number | null>(null))
  const measure = action(async () => {
    try {
      const { quota = 0, usage = 0 } = await navigator.storage.estimate()

      $storageAvailable(Math.max(0, quota - usage))
    } catch {
      $storageAvailable(null)
    }
  })
  const $checks = computed<Check[]>(() => {
    // Read before the archive, so the link is there from the first run. A
    // mountable that a computed starts reading only on a later run is never
    // mounted while that computed is itself read through another one, as
    // $notes reads this (agera 2.0.0-prerelease), and the free space would
    // never be asked for.
    const storageAvailable = $storageAvailable()
    const archive = $archive()
    const zip = $zip()

    if (!archive || !zip) {
      return []
    }

    return preflight({
      archiveSize: archive.size,
      mangledNames: zip.mangledNames,
      exeCount: $candidates().length,
      selectedScore: $selected()?.score ?? null,
      filledSlots: $items().length,
      totalSlots: ART_SLOTS.length,
      storageAvailable
    })
  })
  const $notes = computed(() => {
    const notes: Note[] = [...$problems().map(errorNote), ...$checks()]
    const artworkError = $artworkError()
    const buildError = $buildError()

    if (artworkError) {
      notes.push(errorNote(artworkError))
    }

    if (buildError) {
      notes.push(errorNote(buildError))
    }

    return notes
  })

  // Measured while the checks are on screen, afresh for every archive
  onMountEffect($storageAvailable, () => {
    $archive()
    void task($storageAvailable, measure())
  })

  return {
    $storageAvailable,
    $checks,
    $notes
  }
}
