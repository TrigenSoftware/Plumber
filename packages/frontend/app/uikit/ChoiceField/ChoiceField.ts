import {
  type Attributes,
  type Child,
  component$,
  label,
  span
} from 'nanoviews'
import typography from '../typography.module.css'
import styles from './ChoiceField.module.css'

export interface ChoiceFieldProps extends Attributes<'label'> {
  /** The checkbox or the radio the text is for: its `checked`, `name` and handlers go on it */
  target: Child
  text: Child
  /** What the choice means, under the text */
  description?: Child
}

/**
 * A checkbox or a radio with its text beside it and an optional description
 * under the text. The label wraps them all, so a click on the text toggles
 * the control too.
 */
export const ChoiceField = component$(({
  class: className,
  target,
  text,
  description,
  ...props
}: ChoiceFieldProps) => (
  label({
    class: [
      className,
      styles.root,
      typography.small
    ],
    ...props
  })(
    span({
      class: styles.target
    })(
      target
    ),
    span({
      class: styles.text
    })(
      text
    ),
    description && span({
      class: styles.description
    })(
      description
    )
  )
))
