import {
  type Signalish,
  pick
} from 'nanoviews/store'
import {
  type Attributes,
  component$,
  div,
  p
} from 'nanoviews'
import typography from '../typography.module.css'
import styles from './Callout.module.css'

export type CalloutTone = 'warning' | 'note' | 'error'

export interface CalloutProps extends Attributes<'div'> {
  tone: Signalish<CalloutTone>
}

/**
 * A message set apart from the flow. The tone only colours its edge: what the
 * message means is in its words, never in the colour alone.
 */
export const Callout = component$(({
  class: className,
  tone,
  ...props
}: CalloutProps, children) => (
  div({
    class: [
      className,
      styles.root,
      pick(styles, tone)
    ],
    ...props
  })(
    p({
      class: `${styles.body} ${typography.small}`
    })(
      ...children
    )
  )
))
