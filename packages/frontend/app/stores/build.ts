import {
  signal,
  computed,
  mountable,
  onMountEffect,
  action,
  batch,
  task,
  inject
} from '@nano_kit/store'
import {
  buildRecipe,
  slugify
} from '~/services/recipe'
import { BLOCK_SIZE } from '~/shared/constants'
import { errorMessage } from '~/shared/utils'
import { Artwork$ } from './artwork.ts'
import { Game$ } from './game.ts'

export type BuildPhase = 'idle' | 'building' | 'done' | 'failed'

/**
 * Whether this browser can save the installer at all: the build streams the
 * `.run` to disk through showSaveFilePicker, which only Chromium-based browsers
 * have (8). A token rather than a check in place, so a story or a test can
 * stand in for either kind of browser.
 *
 * @returns Whether the picker is there.
 */
export function CanSaveFiles$() {
  return typeof showSaveFilePicker === 'function'
}

/**
 * Builds the `.run` and streams it straight to the file the human picked.
 * Chromium only: Firefox has no showSaveFilePicker, and building through a
 * Blob would cap the size at a gigabyte or two (8).
 *
 * @returns The store.
 */
export function Build$() {
  const {
    $archive,
    $name,
    $prefixArch,
    $selected,
    $overrides,
    $userDataList
  } = inject(Game$)
  const {
    $items,
    $problems,
    $error: $artworkError
  } = inject(Artwork$)
  const $phase = mountable(signal<BuildPhase>('idle'))
  // A share of the whole file, from 0 to 1
  const $progress = signal(0)
  // The name of the file the human picked, once it is written
  const $savedAs = signal('')
  // Why the last build failed
  const $error = mountable(signal<string | null>(null))
  const $building = computed(() => $phase() === 'building')
  const $canBuild = computed(() => Boolean(
    $archive()
    && $selected()
    && $name().trim()
    && !$building()
    && !$problems().length
  ))
  // A build of an archive that is no longer there writes nothing back
  let ticket = 0
  const run = async (runTicket: number) => {
    const isCurrent = () => runTicket === ticket

    // The set-up is inside too: a view that throws as the phase turns to
    // building must fail the build, not leave it building for good
    try {
      const archive = $archive()
      const candidate = $selected()
      // The artwork the button was pressed with, whatever the slots receive meanwhile
      const items = $items()

      if (!archive || !candidate) {
        return
      }

      const recipe = buildRecipe({
        name: $name().trim(),
        exe: candidate.path,
        prefixArch: $prefixArch(),
        userData: $userDataList(),
        dllOverrides: $overrides()
      })

      // What went wrong is told about the last attempt: a new build clears an
      // image that could not be read as well, as it always did
      batch(() => {
        $phase('building')
        $progress(0)
        $error(null)
        $artworkError(null)
      })

      // Asked before anything is awaited: the user activation of the click does
      // not survive an await, and without it the picker refuses to open.
      const handle = await showSaveFilePicker({
        suggestedName: `${slugify(recipe.name)}.run`,
        types: [
          {
            description: 'Self-extracting installer',
            accept: {
              'application/x-sh': ['.run']
            }
          }
        ]
      })
      // Loaded only now: the tar writer and the header are needed by the build
      // alone, so they stay out of what the page loads up front, like the
      // installer scripts they pack. Not before the picker, which needs the click.
      const {
        buildHeader,
        buildMeta,
        writeRunFile
      } = await import('~/services/bundle')
      const meta = await buildMeta(recipe, items)
      const header = buildHeader(meta.byteLength / BLOCK_SIZE)

      for await (const { written, total } of writeRunFile(await handle.createWritable(), {
        header,
        meta,
        payload: archive.stream(),
        payloadSize: archive.size
      })) {
        if (isCurrent()) {
          $progress(written / total)
        }
      }

      if (isCurrent()) {
        batch(() => {
          $phase('done')
          $progress(1)
          $savedAs(handle.name)
        })
      }
    } catch (error) {
      if (isCurrent()) {
        // Dismissing the file picker is a decision, not a failure.
        if (error instanceof DOMException && error.name === 'AbortError') {
          $phase('idle')
        } else {
          batch(() => {
            $phase('failed')
            $error(errorMessage(error))
          })
        }
      }
    }
  }
  /**
   * The UI calls this, not `run`: how the build went lands in `$phase` and
   * `$error`, never in a promise the click would leave dangling.
   */
  const build = action(() => {
    if ($canBuild()) {
      void task($phase, run(ticket))
    }
  })
  // The archive the build state belongs to
  let stateOf: File | null = null
  /**
   * An installer is built from one archive: whatever the last build ended in
   * belongs to the old one, so another archive, or none, starts over. The first
   * archive finds nothing to start over: there is no build without one.
   */
  const startOver = () => {
    const archive = $archive()
    const previous = stateOf

    stateOf = archive

    if (!previous || archive === previous) {
      return
    }

    ticket += 1
    batch(() => {
      $phase('idle')
      $progress(0)
      $savedAs('')
      $error(null)
      $artworkError(null)
    })
  }

  // Only while the build is shown: its phase on the buttons and the panel, its
  // error among the notes
  onMountEffect($phase, startOver)
  onMountEffect($error, startOver)

  return {
    $phase,
    $progress,
    $savedAs,
    $error,
    $building,
    $canBuild,
    build
  }
}
