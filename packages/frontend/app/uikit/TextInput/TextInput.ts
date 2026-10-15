import {
  type Attributes,
  component$,
  input
} from 'nanoviews'
import mixins from '../mixins.module.css'
import styles from './TextInput.module.css'

export interface TextInputProps extends Attributes<'input'> {}

/**
 * The text box itself, so the class and the attributes land on the control.
 * The caption and the hint around it are the consumer's: a `Field`, as a rule.
 */
export const TextInput = component$(({
  class: className,
  ...props
}: TextInputProps) => (
  input({
    class: [
      className,
      styles.root,
      mixins.focusOutline
    ],
    type: 'text',
    ...props
  })
))
