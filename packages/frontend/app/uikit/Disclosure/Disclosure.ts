import {
  type Attributes,
  type Child,
  component$,
  details,
  div,
  summary
} from 'nanoviews'
import mixins from '../mixins.module.css'
import typography from '../typography.module.css'
import styles from './Disclosure.module.css'

export interface DisclosureProps extends Attributes<'details'> {
  /** The line always in view: says what is folded away, and a click on it unfolds it */
  summary: Child
}

/**
 * A part folded away under a line that says what is in it, for what most
 * people never need to touch. A native `<details>`: it opens from the keyboard
 * and is announced as such, and what is inside stays mounted and live while
 * folded.
 */
export const Disclosure = component$(({
  class: className,
  summary: caption,
  ...props
}: DisclosureProps, children) => (
  details({
    class: [
      className,
      styles.root
    ],
    ...props
  })(
    summary({
      class: [
        styles.summary,
        mixins.focusOutline,
        typography.small
      ]
    })(
      caption
    ),
    div({
      class: styles.content
    })(
      ...children
    )
  )
))
