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
import { startDownload } from '~/services/download'
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
 * Whether this browser has showSaveFilePicker, which only Chromium-based ones
 * have, and Brave switches off: with it the build streams the `.run` into the
 * file the human picks and follows the bytes as they go, without it the
 * browser downloads the file on its own (6.2). A token rather than a check in
 * place, so a story or a test can stand in for either kind of browser.
 *
 * @returns Whether the picker is there.
 */
export function HasSavePicker$() {
  return typeof showSaveFilePicker === 'function'
}

/**
 * Builds the `.run` and saves it: straight into the file the human picked
 * where the browser has the picker, as a download of the browser's own
 * elsewhere. Either way the archive is never held in memory (6.2).
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
    $userDataList,
    $layoutId,
    $layoutMissing
  } = inject(Game$)
  const {
    $items,
    $problems,
    $error: $artworkError
  } = inject(Artwork$)
  const hasSavePicker = inject(HasSavePicker$)
  const $phase = mountable(signal<BuildPhase>('idle'))
  // A share of the whole file, from 0 to 1
  const $progress = signal(0)
  // The name the file is saved under, once it is: the one the human picked,
  // or the one the download was given
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
    && !$layoutMissing()
  ))
  // A build of an archive that is no longer there writes nothing back
  let ticket = 0
  // Lets the last download go: no sooner than the next build or archive, by
  // when it is surely under way
  let releaseDownload: (() => void) | null = null
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
        dllOverrides: $overrides(),
        controllerLayout: $layoutId()
      })
      const fileName = `${slugify(recipe.name)}.run`

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
      const handle = hasSavePicker
        ? await showSaveFilePicker({
          suggestedName: fileName,
          types: [
            {
              description: 'Self-extracting installer',
              accept: {
                'application/x-sh': ['.run']
              }
            }
          ]
        })
        : null
      // Loaded only now: the tar writer and the header are needed by the build
      // alone, so they stay out of what the page loads up front, like the
      // installer scripts they pack. Not before the picker, which needs the click.
      const {
        buildHeader,
        buildMeta,
        runBlob,
        writeRunFile
      } = await import('~/services/bundle')
      const meta = await buildMeta(recipe, items)
      const header = buildHeader(meta.byteLength / BLOCK_SIZE)

      if (handle) {
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
      } else if (isCurrent()) {
        // Nothing is on disk before the download, so a build of an archive no
        // longer there leaves nothing behind
        releaseDownload?.()
        releaseDownload = startDownload(runBlob({
          header,
          meta,
          payload: archive
        }), fileName)
      }

      if (isCurrent()) {
        batch(() => {
          $phase('done')
          $progress(1)
          $savedAs(handle?.name ?? fileName)
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
    releaseDownload?.()
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
