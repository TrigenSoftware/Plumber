import {
  type Signalish,
  or,
  record,
  text,
  when
} from 'nanoviews/store'
import {
  type Attributes,
  a,
  button,
  component$,
  div,
  img,
  input,
  span,
  if_
} from 'nanoviews'
import mixins from '../mixins.module.css'
import typography from '../typography.module.css'
import styles from './ImageDrop.module.css'

export interface ImageDropPreview {
  url: string
  /** Shown under the image while there is no problem with it. */
  note: string
  /** Shown instead of the note, in the danger colour. */
  problem: string | null
}

export interface ImageDropProps extends Attributes<'div'> {
  title: Signalish<string>
  /** Expected size, shown whether the frame is full or empty. */
  size: Signalish<string>
  /** Where to find one, rendered as a link next to the caption. */
  sourceLabel: Signalish<string>
  sourceUrl: Signalish<string>
  accept: string
  preview?: Signalish<ImageDropPreview | null | undefined>
  /** The text of the button that empties the frame. */
  clearLabel: Signalish<string>
  onFile: (file: File) => void
  onClear: () => void
}

let dropCount = 0

/**
 * A receiver with a check, not an editor: the images already exist at the right
 * sizes, so there is no crop and no resize here (7.5).
 */
export const ImageDrop = component$(({
  class: className,
  title,
  size,
  sourceLabel,
  sourceUrl,
  accept,
  preview,
  clearLabel,
  onFile,
  onClear,
  ...props
}: ImageDropProps) => {
  // Field by field: each part of the drop follows the one field it shows, and
  // an empty frame reads every field as undefined. Cached, since six parts read
  // it and a consumer may hand in an accessor that builds a new object each time
  const $preview = record(preview)
  const id = `image-drop-${++dropCount}`
  // A row of drops has a remove button each, all with the same text: the title
  // tells them apart for whoever hears them rather than sees them
  const titleId = `${id}-title`
  // What the frame holds is said under it: the size of the image, or what is wrong with it
  const noteId = `${id}-note`

  return (
    div({
      class: [className, styles.root],
      ...props
    })(
      div({
        class: styles.head
      })(
        span({
          class: typography.small,
          id: titleId
        })(
          title
        ),
        a({
          class: `${typography.small} ${mixins.focusOutline}`,
          href: sourceUrl,
          target: '_blank',
          rel: 'noopener noreferrer'
        })(
          sourceLabel
        )
      ),
      div({
        class: [
          styles.frame,
          when($preview, styles.filled),
          mixins.focusOutline
        ]
      })(
        if_($preview)(
          () => img({
            class: styles.preview,
            src: $preview.$url,
            alt: ''
          }),
          () => span({
            class: typography.small
          })(
            size
          )
        ),
        // Over the whole frame: a click or a drop anywhere on it lands on the input
        input({
          class: styles.input,
          type: 'file',
          accept,
          'aria-label': text`${title}, ${size}`,
          'aria-describedby': noteId,
          onChange(event) {
            const [file] = event.target.files ?? []

            if (file) {
              onFile(file)
            }

            // Emptied, so that picking the same file again is a change too
            event.target.value = ''
          }
        })
      ),
      div({
        class: styles.foot
      })(
        span({
          class: [
            styles.note,
            typography.small,
            when($preview.$problem, styles.problem, typography.muted)
          ],
          id: noteId
        })(
          or($preview.$problem, $preview.$note)
        ),
        if_($preview)(
          () => button({
            class: `${styles.clear} ${typography.small} ${mixins.focusOutline}`,
            type: 'button',
            'aria-describedby': titleId,
            onClick: onClear
          })(
            clearLabel
          )
        )
      )
    )
  )
})
