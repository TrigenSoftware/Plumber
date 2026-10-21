import { formatSize } from '~/shared/utils'
import type {
  Check,
  CheckInput
} from './checks.types.ts'

/**
 * The largest file FAT32 holds, a byte short of 4 GiB. exFAT has no such limit,
 * but USB sticks and memory cards up to 32 GB usually come formatted as FAT32.
 * The check goes by the archive, which the installer outgrows only by its
 * header and meta: an archive that close to the limit is the one case it misses.
 */
const FAT32_FILE_LIMIT = 4294967295

/**
 * Everything here warns and nothing blocks (6.3). Games are strange, and a
 * check that is right nine times out of ten should not be the tenth person's
 * dead end.
 *
 * @returns Everything worth saying before the build.
 */
export function preflight(input: CheckInput): Check[] {
  const checks: Check[] = []

  if (!input.exeCount) {
    checks.push({
      level: 'warning',
      message: 'There is no .exe anywhere in this archive, so there is nothing to point the shortcut at.'
    })
  }

  if (input.mangledNames) {
    checks.push({
      level: 'warning',
      message: 'Names in this archive are not marked as UTF-8 and some are not plain ASCII, '
        + 'so they will arrive mangled. Repack it with 7-Zip and the UTF-8 option on.'
    })
  }

  if (input.archiveSize > FAT32_FILE_LIMIT) {
    checks.push({
      level: 'note',
      message: `The archive is ${formatSize(input.archiveSize)}, so the installer will be a little bigger: `
        + 'too big for a drive formatted as FAT32, as USB sticks and memory cards up to 32 GB usually are. '
        + 'Use one formatted as exFAT, or copy the file over the network.'
    })
  }

  if (input.storageAvailable !== null && input.storageAvailable < input.archiveSize) {
    checks.push({
      level: 'warning',
      message: `The browser reports about ${formatSize(input.storageAvailable)} of free space, less than `
        + 'the archive. The build writes through a temporary file, so it may run out part way.'
    })
  }

  if (input.selectedScore !== null && input.selectedScore < 0) {
    checks.push({
      level: 'note',
      message: 'The chosen exe looks like an installer or a utility rather than the game. '
        + 'That may well be right - just worth a second look.'
    })
  }

  if (input.filledSlots < input.totalSlots) {
    checks.push({
      level: 'note',
      message: `${input.totalSlots - input.filledSlots} of ${input.totalSlots} artwork slots are empty. `
        + 'The game will still install; the library will just show a grey box where the art goes.'
    })
  }

  return checks
}
