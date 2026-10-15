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
import { ProgressBar } from './ProgressBar.ts'
import styles from './ProgressBar.module.css'

function renderProgressBar(value: number | (() => number), caption = '') {
  render(() => ProgressBar({
    label: 'Writing the installer',
    value
  })(
    caption
  ))

  const bar = screen.getByRole('progressbar', {
    name: 'Writing the installer'
  })

  return {
    bar,
    fill: bar.querySelector<HTMLElement>(`.${styles.fill}`)!
  }
}

describe('uikit', () => {
  describe('ProgressBar', () => {
    it('should report the value as a whole percentage between 0 and 100', () => {
      const { bar } = renderProgressBar(0.423)

      expect(bar.getAttribute('aria-valuenow')).toBe('42')
      expect(bar.getAttribute('aria-valuemin')).toBe('0')
      expect(bar.getAttribute('aria-valuemax')).toBe('100')
    })

    it('should clamp a value below zero to 0', () => {
      const { bar } = renderProgressBar(-0.5)

      expect(bar.getAttribute('aria-valuenow')).toBe('0')
    })

    it('should clamp a value past one to 100', () => {
      const { bar } = renderProgressBar(1.7)

      expect(bar.getAttribute('aria-valuenow')).toBe('100')
    })

    it('should follow the value', () => {
      const $value = signal(0.1)
      const { bar } = renderProgressBar($value)

      $value(0.75)

      expect(bar.getAttribute('aria-valuenow')).toBe('75')
    })

    it('should fill the track as far as the value goes', () => {
      const $value = signal(0.25)
      const { fill } = renderProgressBar($value)

      expect(fill.style.inlineSize).toBe('25%')

      $value(0.5)

      expect(fill.style.inlineSize).toBe('50%')
    })

    it('should not overfill the track', () => {
      const { fill } = renderProgressBar(3)

      expect(fill.style.inlineSize).toBe('100%')
    })

    it('should show the children as the caption', () => {
      const { bar } = renderProgressBar(0.42, '42% of 3.1 GB')

      expect(bar.textContent).toBe('42% of 3.1 GB')
    })

    it('should follow a reactive caption', () => {
      const $value = signal(0.1)

      render(() => ProgressBar({
        label: 'Writing the installer',
        value: $value
      })(
        () => `${Math.round($value() * 100)}% written`
      ))

      $value(0.6)

      expect(screen.getByRole('progressbar').textContent).toBe('60% written')
    })
  })
})
