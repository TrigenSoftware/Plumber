import {
  type Signalish,
  inject,
  is,
  not,
  text,
  when
} from 'nanoviews/store'
import {
  type Attributes,
  component$,
  div,
  li,
  ol,
  p,
  strong,
  if_
} from 'nanoviews'
import type { ExeCandidate } from '~/services/exe'
import { formatSize } from '~/shared/utils'
import { Build$ } from '~/stores/build'
import { Game$ } from '~/stores/game'
import { Button } from '~/uikit/Button'
import { ProgressBar } from '~/uikit/ProgressBar'
import typography from '~/uikit/typography.module.css'
import styles from './BuildPanel.module.css'

export type BuildPanelProps = Attributes<'div'>

interface InstructionsProps {
  /** The name of the file the human picked, empty when there is none to tell. */
  savedAs: Signalish<string>
}

/**
 * The downloaded file will not run until the human sets the execute bit, and
 * nothing in the system says so: a double click hands it to a text editor, and
 * "Run in Konsole" offers an action that cannot work. This panel is the only
 * place it can be explained (6.3.1, 8).
 */
const STEPS = [
  ['Right-click the downloaded file and open ', 'Properties'],
  ['Go to the ', 'Permissions', ' tab and tick ', 'Is executable'],
  ['Close the dialog and double-click the file', '']
]

/** @returns What the build copies, or what it is waiting for. */
function summaryOf(candidate: ExeCandidate | null, archive: File | null) {
  return candidate && archive
    ? `${candidate.label} · ${formatSize(archive.size)} copied through byte for byte`
    : 'Drop an archive to begin.'
}

/** @returns How much of the archive is on disk. */
function captionOf(progress: number, archive: File | null) {
  return archive
    ? `${Math.round(progress * 100)}% of ${formatSize(archive.size)}`
    : ''
}

// What to do with the file once it is on disk
const Instructions = component$(({ savedAs }: InstructionsProps) => (
  div({
    class: styles.instructions
  })(
    p({
      class: typography.text
    })(
      when(
        savedAs,
        text`${savedAs} is ready. Copy it to SteamOS, then, in Desktop Mode:`,
        'Copy it to SteamOS, then, in Desktop Mode:'
      )
    ),
    ol({
      class: `${styles.steps} ${typography.text}`
    })(
      ...STEPS.map(parts => (
        li()(
          // Every other part names something to look for on screen
          ...parts.map((part, index) => (
            index % 2 && part
              ? strong({
                class: styles.key
              })(
                part
              )
              : part
          ))
        )
      ))
    )
  )
))

/**
 * Builds the installer and follows it to disk: how far the writing got while
 * it lasts, and what to do with the file once it is there.
 */
export const BuildPanel = component$(({
  class: className,
  ...props
}: BuildPanelProps) => {
  const {
    $archive,
    $selected
  } = inject(Game$)
  const {
    $phase,
    $progress,
    $savedAs,
    $building,
    $canBuild,
    build
  } = inject(Build$)
  // Once the file is written, building it again stays at hand - for a form
  // changed since - but is no longer the thing to do
  const $done = is($phase, 'done')

  return (
    div({
      class: [className, styles.root],
      ...props
    })(
      div({
        class: styles.actions
      })(
        Button({
          variant: () => ($done() ? 'quiet' : 'primary'),
          disabled: not($canBuild),
          onClick: build
        })(
          when($building, 'Building…', when($done, 'Build again', 'Build the installer'))
        ),
        p({
          class: `${typography.small} ${typography.muted}`
        })(
          () => summaryOf($selected(), $archive())
        )
      ),
      if_($building)(
        () => ProgressBar({
          label: 'Writing the installer',
          value: $progress
        })(
          () => captionOf($progress(), $archive())
        )
      ),
      if_($done)(
        () => Instructions({
          savedAs: $savedAs
        })
      )
    )
  )
})
