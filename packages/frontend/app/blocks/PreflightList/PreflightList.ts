import {
  inject,
  length,
  not,
  pick
} from 'nanoviews/store'
import {
  type Attributes,
  component$,
  div,
  for_
} from 'nanoviews'
import { Preflight$ } from '~/stores/preflight'
import { Callout } from '~/uikit/Callout'
import styles from './PreflightList.module.css'

export type PreflightListProps = Attributes<'div'>

/**
 * Every one of these warns and none of them blocks the button (6.3).
 */
export const PreflightList = component$(({
  class: className,
  ...props
}: PreflightListProps) => {
  const { $notes } = inject(Preflight$)

  return (
    div({
      class: [className, styles.root],
      hidden: not(length($notes)),
      ...props
    })(
      // Rows by position, not by a key: two notes can say the same thing, and
      // a repeated key would drop one of them
      for_($notes)(
        $note => Callout({
          tone: pick($note, 'level')
        })(
          pick($note, 'message')
        )
      )
    )
  )
})
