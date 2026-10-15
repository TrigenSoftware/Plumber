import {
  inject,
  pick,
  when
} from 'nanoviews/store'
import {
  type Attributes,
  component$,
  div,
  fragment,
  span,
  if_
} from 'nanoviews'
import type { ZipInfo } from '~/services/zip'
import { formatSize } from '~/shared/utils'
import { Build$ } from '~/stores/build'
import { Game$ } from '~/stores/game'
import { Button } from '~/uikit/Button'
import { Callout } from '~/uikit/Callout'
import { FileDrop } from '~/uikit/FileDrop'
import typography from '~/uikit/typography.module.css'
import styles from './ArchivePicker.module.css'

export type ArchivePickerProps = Attributes<'div'>

/** @returns The size, the counts and the layout of the archive, in one line. */
function archiveFacts(archive: File, zip: ZipInfo, executables: number) {
  return [
    formatSize(archive.size),
    `${zip.entries.length} entries`,
    `${executables} executables`,
    zip.commonPrefix ? `under ${zip.commonPrefix}` : 'at the archive root',
    zip.zip64 ? 'Zip64' : ''
  ].filter(Boolean).join(' · ')
}

/**
 * Only a zip is accepted. A folder would mean a tar writer in the browser and
 * recompressing gigabytes; a zip is copied through byte for byte and its
 * central directory answers every question we have (2.4).
 */
export const ArchivePicker = component$(({
  class: className,
  ...props
}: ArchivePickerProps) => {
  const {
    $archive,
    $zip,
    $reading,
    $error,
    $candidates,
    $file
  } = inject(Game$)
  const { $building } = inject(Build$)

  return (
    div({
      class: [className, styles.root],
      ...props
    })(
      if_($archive)(
        $archive => div({
          class: styles.summary
        })(
          span({
            class: `${styles.name} ${typography.text}`
          })(
            pick($archive, 'name')
          ),
          if_($zip)(
            $zip => span({
              class: `${typography.small} ${typography.muted}`
            })(
              () => archiveFacts($archive(), $zip(), $candidates().length)
            )
          ),
          // Not while a build is streaming this very archive to disk
          Button({
            variant: 'quiet',
            disabled: $building,
            onClick: () => $file(null)
          })(
            'Change'
          )
        ),
        () => fragment(
          FileDrop({
            hint: 'A .zip of the folder the game is installed in. Only its listing is read, not its contents.',
            accept: '.zip,application/zip',
            onFile: $file
          })(
            when($reading, 'Reading the archive…', 'Drop the game archive here')
          ),
          // Said here, not among the notes before the build: those wait for an archive
          if_($error)(
            $error => Callout({
              tone: 'error',
              role: 'alert'
            })(
              $error
            )
          )
        )
      )
    )
  )
})
