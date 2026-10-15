import {
  type Attributes,
  type Child,
  component$,
  div,
  input,
  label,
  span
} from 'nanoviews'
import mixins from '../mixins.module.css'
import typography from '../typography.module.css'
import styles from './FileDrop.module.css'

/** The class goes to the zone, every other attribute to the file input. */
export interface FileDropProps extends Omit<Attributes<'input'>, 'type' | 'id' | 'onChange'> {
  /** The input's id: the title names the input through it, and the hint's id derives from it. Generated when omitted */
  id?: string
  /** A line under the title, which comes as the children. */
  hint?: Child
  accept: string
  onFile: (file: File) => void
}

let dropCount = 0

/**
 * A zone over a native file input stretched across all of it: a click or a
 * drop anywhere on the zone lands on the input, so the browser opens the
 * picker or takes the dropped file, and fires one `change` for either. The
 * keyboard reaches the input as it reaches any other.
 */
export const FileDrop = component$(({
  class: className,
  id = `file-drop-${++dropCount}`,
  hint,
  onFile,
  ...props
}: FileDropProps, children) => {
  const hintId = `${id}-hint`

  return (
    div({
      class: [
        className,
        styles.root,
        mixins.focusOutline
      ]
    })(
      input({
        class: styles.input,
        id,
        type: 'file',
        'aria-describedby': hint ? hintId : undefined,
        ...props,
        onChange(event) {
          const [file] = event.target.files ?? []

          if (file) {
            onFile(file)
          }

          // Emptied, so that picking the same file again is a change too
          event.target.value = ''
        }
      }),
      label({
        class: [
          styles.title,
          typography.text
        ],
        for: id
      })(
        ...children
      ),
      hint && span({
        class: typography.small,
        id: hintId
      })(
        hint
      )
    )
  )
})
