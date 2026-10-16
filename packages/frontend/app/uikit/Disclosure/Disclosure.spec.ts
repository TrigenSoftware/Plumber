import {
  describe,
  it,
  expect
} from 'vitest'
import {
  render,
  screen
} from '@nanoviews/testing-library'
import { signal } from 'nanoviews/store'
import { p } from 'nanoviews'
import { Disclosure } from './Disclosure.ts'
import styles from './Disclosure.module.css'

const SUMMARY = 'Advanced settings'
const CONTENT = 'Folders holding saves and settings'

describe('uikit', () => {
  describe('Disclosure', () => {
    it('should fold its content away under the summary', () => {
      const { container } = render(Disclosure({
        summary: SUMMARY
      })(
        p()(CONTENT)
      ))
      const details = container.querySelector('details')!

      expect(details.open).toBe(false)
      // The browser takes only the first child for the line that unfolds the rest
      expect(details.firstElementChild).toBe(screen.getByText(SUMMARY))
      expect(screen.getByText(SUMMARY).tagName).toBe('SUMMARY')
      expect(screen.getByText(CONTENT).closest('details')).toBe(details)
    })

    it('should start unfolded when asked to', () => {
      const { container } = render(Disclosure({
        summary: SUMMARY,
        open: true
      })(
        p()(CONTENT)
      ))

      expect(container.querySelector('details')!.open).toBe(true)
    })

    it('should follow a reactive summary', () => {
      const $summary = signal(SUMMARY)

      render(Disclosure({
        summary: $summary
      })(
        p()(CONTENT)
      ))
      $summary('More')

      expect(screen.getByText('More').tagName).toBe('SUMMARY')
    })

    it('should keep the class passed by the consumer', () => {
      const { container } = render(Disclosure({
        class: 'outer',
        summary: SUMMARY
      })(
        p()(CONTENT)
      ))
      const details = container.querySelector('details')!

      expect(details.classList.contains('outer')).toBe(true)
      expect(details.classList.contains(styles.root)).toBe(true)
    })

    it('should hand the other attributes to its root', () => {
      const { container } = render(Disclosure({
        summary: SUMMARY,
        id: 'advanced'
      })(
        p()(CONTENT)
      ))

      expect(container.querySelector('details')!.id).toBe('advanced')
    })
  })
})
