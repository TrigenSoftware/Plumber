import {
  signal,
  computed,
  mountable,
  onMountEffect,
  batch,
  resolved
} from '@nano_kit/store'
import { getLayoutId } from '~/services/controller'
import { rankExes } from '~/services/exe'
import {
  type PrefixArch,
  guessTitle
} from '~/services/recipe'
import {
  type ModSigns,
  detectModSigns,
  detectWrappers,
  launchOptionsFor
} from '~/services/wrappers'
import { readZip } from '~/services/zip'
import { errorMessage } from '~/shared/utils'

/**
 * Commas only. Splitting on whitespace too would turn "Saved Games" into two
 * folders that do not exist, and the real one would be overwritten from the
 * archive on the next install (5.1).
 *
 * @returns The folder names.
 */
export function userDataList(value: string) {
  return value.split(',').map(part => part.trim()).filter(Boolean)
}

/**
 * The archive and what the human says about the game in it.
 *
 * @returns The store.
 */
export function Game$() {
  /** The file the human dropped or picked: setting one reads it, and none goes back to the drop zone. */
  const $file = signal<File | null>(null)
  /**
   * Reading the central directory of a big archive takes a moment, and in that
   * moment the human can drop another one: a read a newer file overtook is
   * thrown away, and the archive read so far stays until the new one is. The
   * file travels with its listing, so the two never belong to different reads.
   */
  const [$read, $readError, $reading] = resolved(() => {
    const file = $file()

    return file && readZip(file).then(zip => ({
      file,
      zip
    }))
  })
  const $archive = computed(() => $read()?.file ?? null)
  const $zip = computed(() => $read()?.zip ?? null)
  /** Why the last file could not be read. */
  const $error = computed(() => {
    const error = $readError()

    return error === undefined ? null : errorMessage(error)
  })
  /** Filled in from the archive while something shows them, see `fill`. */
  const $name = mountable(signal(''))
  const $exePath = mountable(signal(''))
  const $prefixArch = signal<PrefixArch>('win32')
  const $userData = signal('SAVES')
  /** Ticked by default: the detection is right far more often than not (7.3.1). */
  const $overrideWrappers = signal(true)
  /**
   * Whether the controller is to be mapped to keyboard and mouse with a layout
   * (7.8). Off by default: a game that supports a controller needs nothing.
   */
  const $mapController = signal(false)
  /** The link to a layout, as pasted */
  const $layoutLink = signal('')
  /** The Workshop ID in the link, whether mapping is on or not */
  const $linkedLayout = computed(() => getLayoutId($layoutLink()))
  /** What goes into the recipe: the layout while mapping is on, null otherwise */
  const $layoutId = computed(() => ($mapController() ? $linkedLayout() : null))
  /** Something pasted that is not a link to a layout */
  const $layoutInvalid = computed(() => Boolean($layoutLink().trim()) && !$linkedLayout())
  /** Mapping asked for and no layout to map with yet: the build waits for one */
  const $layoutMissing = computed(() => $mapController() && !$linkedLayout())
  /**
   * Re-ranked as the title changes: the title bonus depends on it (7.2.1).
   * A path the central directory lists twice is one exe on disk, so it is
   * offered once, at its better rank.
   */
  const $candidates = computed(() => {
    const zip = $zip()
    const seen = new Set<string>()

    return zip
      ? rankExes(zip.entries, $name(), zip.commonPrefix).filter((candidate) => {
        const fresh = !seen.has(candidate.path)

        seen.add(candidate.path)

        return fresh
      })
      : []
  })
  const $selected = computed(() => {
    const exePath = $exePath()

    return $candidates().find(candidate => candidate.path === exePath) ?? null
  })
  const $wrappers = computed(() => {
    const zip = $zip()
    const exePath = $exePath()

    return zip && exePath ? detectWrappers(zip.entries, exePath) : []
  })
  const $modSigns = computed<ModSigns>(() => {
    const zip = $zip()
    const exePath = $exePath()

    return zip && exePath
      ? detectModSigns(zip.entries, exePath)
      : {
        asi: 0,
        scripts: false
      }
  })
  /**
   * What actually goes into the recipe: nothing when the human unticked the box,
   * whatever was found otherwise.
   */
  const $overrides = computed(() => ($overrideWrappers() ? $wrappers() : []))
  const $launchOptions = computed(() => launchOptionsFor($overrides()))
  const $userDataList = computed(() => userDataList($userData()))
  /**
   * The archive the title and the exe were last filled in from: fields shown
   * again over the same archive keep what the human made of them.
   */
  let filledFrom: File | null = null
  /**
   * A new archive brings the title and the exe it suggests; without one the
   * exe goes with it, while the rest of the form is kept as it was. The
   * mapping goes once the archive it was set up for does, and not before: the
   * first fill may come as late as the box is ticked, when the box is the
   * first thing to show the title.
   */
  const fill = () => {
    const archive = $archive()
    const zip = $zip()
    const previous = filledFrom

    if (archive === previous) {
      return
    }

    filledFrom = archive

    batch(() => {
      if (previous) {
        $mapController(false)
        $layoutLink('')
      }

      if (archive && zip) {
        const name = guessTitle(archive.name, zip)

        $name(name)
        $exePath(rankExes(zip.entries, name, zip.commonPrefix)[0]?.path ?? '')
      } else {
        $exePath('')
      }
    })
  }

  // Only while the fields are shown, so nothing keeps the read alive once
  // nothing looks at them
  onMountEffect($name, fill)
  onMountEffect($exePath, fill)

  return {
    $file,
    $archive,
    $zip,
    $reading,
    $error,
    $name,
    $exePath,
    $prefixArch,
    $userData,
    $overrideWrappers,
    $mapController,
    $layoutLink,
    $layoutId,
    $layoutInvalid,
    $layoutMissing,
    $candidates,
    $selected,
    $wrappers,
    $modSigns,
    $overrides,
    $launchOptions,
    $userDataList
  }
}
