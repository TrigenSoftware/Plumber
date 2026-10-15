import {
  type Signalish,
  pick
} from 'nanoviews/store'
import {
  type Attributes,
  button,
  component$
} from 'nanoviews'
import mixins from '../mixins.module.css'
import styles from './Button.module.css'

export interface ButtonProps extends Attributes<'button'> {
  variant?: Signalish<'primary' | 'default' | 'quiet'>
}

/**
 * The label is the children. A plain button unless told otherwise: inside a
 * form a bare `<button>` would submit it.
 */
export const Button = component$(({
  class: className,
  variant = 'default',
  ...props
}: ButtonProps, children) => (
  button({
    class: [
      className,
      styles.root,
      pick(styles, variant),
      mixins.focusOutline
    ],
    type: 'button',
    ...props
  })(
    ...children
  )
))
