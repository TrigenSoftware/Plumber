import {
  describe,
  it,
  expect
} from 'vitest'
import {
  render,
  screen,
  fireEvent
} from '@nanoviews/testing-library'
import { signal } from 'nanoviews/store'
import { Checkbox } from './Checkbox.ts'

describe('uikit', () => {
  describe('Checkbox', () => {
    it('should follow the checked signal', () => {
      const $checked = signal(false)

      render(Checkbox({
        checked: $checked
      }))

      const box = screen.getByRole<HTMLInputElement>('checkbox')

      expect(box.checked).toBe(false)
      $checked(true)
      expect(box.checked).toBe(true)
    })

    it('should write a click back into the checked signal', () => {
      const $checked = signal(false)

      render(Checkbox({
        checked: $checked
      }))
      fireEvent.click(screen.getByRole('checkbox'))

      expect($checked()).toBe(true)
    })

    it('should keep the class and the attributes passed by the consumer', () => {
      render(Checkbox({
        class: 'outer',
        disabled: true
      }))

      const box = screen.getByRole<HTMLInputElement>('checkbox')

      expect(box.classList.contains('outer')).toBe(true)
      expect(box.disabled).toBe(true)
    })
  })
})
