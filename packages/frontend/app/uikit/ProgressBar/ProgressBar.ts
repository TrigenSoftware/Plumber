import {
  type Signalish,
  $get,
  computed
} from 'nanoviews/store'
import {
  type Attributes,
  component$,
  div,
  span
} from 'nanoviews'
import typography from '../typography.module.css'
import styles from './ProgressBar.module.css'

export interface ProgressBarProps extends Attributes<'div'> {
  /** The accessible name of the bar. */
  label: Signalish<string>
  /** How much is done, as a ratio from 0 to 1. */
  value: Signalish<number>
}

/**
 * The bar for work long enough to be watched. The value is a ratio, clamped to
 * 0..1, and the caption under the track is the children.
 */
export const ProgressBar = component$(({
  class: className,
  label,
  value,
  ...props
}: ProgressBarProps, children) => {
  const $percent = computed(() => Math.round(Math.min(1, Math.max(0, $get(value))) * 100))

  return (
    div({
      class: [className, styles.root],
      role: 'progressbar',
      'aria-label': label,
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-valuenow': $percent,
      ...props
    })(
      div({
        class: styles.track
      })(
        div({
          class: styles.fill,
          style: () => ({
            inlineSize: `${$percent()}%`
          })
        })
      ),
      span({
        class: `${styles.caption} ${typography.small}`
      })(
        ...children
      )
    )
  )
})
