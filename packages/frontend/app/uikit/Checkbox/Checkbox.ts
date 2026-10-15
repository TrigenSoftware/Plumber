import {
  type Attributes,
  component$,
  input
} from 'nanoviews'
import mixins from '../mixins.module.css'
import styles from './Checkbox.module.css'

/** Everything an input takes but `type`: that is what makes it a checkbox. */
export type CheckboxProps = Omit<Attributes<'input'>, 'type'>

/**
 * The box alone, so a caption of any shape can go with it: `ChoiceField` is
 * the usual one. A writable signal in `checked` follows the clicks as well.
 */
export const Checkbox = component$(({
  class: className,
  ...props
}: CheckboxProps) => (
  input({
    class: [
      className,
      styles.root,
      mixins.focusOutline
    ],
    type: 'checkbox',
    ...props
  })
))
