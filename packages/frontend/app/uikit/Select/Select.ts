import {
  type Attributes,
  component$,
  select
} from 'nanoviews'
import mixins from '../mixins.module.css'
import styles from './Select.module.css'

/** A union over `multiple`, so it is aliased rather than extended. */
export type SelectProps = Attributes<'select'>

/**
 * The options are the children, plain `option` elements: a static list of
 * them and one built by `for_` go in the same way.
 */
export const Select = component$(({
  class: className,
  ...props
}: SelectProps, children) => (
  select({
    class: [
      className,
      styles.root,
      mixins.focusOutline
    ],
    ...props
  })(
    ...children
  )
))
