import {
  DependencyNotFound,
  inject,
  provide
} from 'nanoviews/store'
import {
  type Attributes,
  type Child,
  type Children,
  type Component,
  type ComponentInstance,
  component$,
  context$,
  div,
  label,
  p
} from 'nanoviews'
import typography from '../typography.module.css'
import styles from './Field.module.css'

/**
 * What a field hands its control: the id its label points at and, with a
 * hint, the hint the control is described by.
 */
export interface FieldWiring {
  id: string
  'aria-describedby'?: string
}

/**
 * The wiring of the enclosing `Field`, for its `FieldControl`.
 */
export function FieldWiring$(): FieldWiring {
  throw new DependencyNotFound('FieldWiring$')
}

/** The `id` is the control's, so the box around it takes none. */
export interface FieldProps extends Omit<Attributes<'div'>, 'id'> {
  /** The control's id: the label points at it, and the hint's id derives from it */
  id: string
  label: Child
  hint?: Child
}

/**
 * A label over its control - a `FieldControl` - and an optional hint under
 * it. The field wires the control to them through the part, so a control
 * such as `TextInput` stays plain and knows nothing of the field.
 */
export const Field = component$(({
  class: className,
  id,
  label: caption,
  hint,
  ...props
}: FieldProps, children) => {
  const hintId = `${id}-hint`

  return (
    context$(provide(FieldWiring$, {
      id,
      'aria-describedby': hint ? hintId : undefined
    }))(
      div({
        class: [
          className,
          styles.root
        ],
        ...props
      })(
        label({
          class: [
            styles.label,
            typography.small
          ],
          for: id
        })(
          caption
        ),
        ...children,
        hint && p({
          class: [
            styles.hint,
            typography.small
          ],
          id: hintId
        })(
          hint
        )
      )
    )
  )
})

/** A control's props without the wiring its field owns, member by member of a union such as a select's */
type ControlProps<P> = P extends unknown ? Omit<P, keyof FieldWiring> : never

export type FieldControlProps<P extends object, C extends unknown[]> = ControlProps<P> & {
  /** The control to render, as plain as it is outside a field: a `TextInput`, a `Select` */
  as: Component<P, C>
}

/**
 * The control of a `Field`: renders the control it is given `as` with the
 * wiring of its field - the id the label points at and the hint it is
 * described by. Every other prop goes to the control as it is, and its
 * children with them.
 */
// The render is typed for any control, the signature for the control a caller
// passes in `as`, with its props
export const FieldControl = component$(({
  as: Control,
  ...props
}: FieldControlProps<object, Children>, children: Children) => (
  Control({
    ...props,
    ...inject(FieldWiring$)
  })(
    ...children
  )
)) as <P extends object, C extends unknown[]>(props: FieldControlProps<P, C>) => ComponentInstance<C>
