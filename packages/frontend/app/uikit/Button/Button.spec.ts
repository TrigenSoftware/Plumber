import {
  vi,
  describe,
  it,
  expect
} from 'vitest'
import {
  render,
  screen,
  fireEvent
} from '@nanoviews/testing-library'
import { form } from 'nanoviews'
import { Button } from './Button.ts'

function onSubmit(event: Event) {
  event.preventDefault()
}

describe('uikit', () => {
  describe('Button', () => {
    it('should not submit the form it is in', () => {
      const submit = vi.fn(onSubmit)

      render(() => form({
        onSubmit: submit
      })(
        Button()('Change')
      ))
      fireEvent.click(screen.getByRole('button'))

      expect(submit).not.toHaveBeenCalled()
    })

    it('should submit the form when its type says so', () => {
      const submit = vi.fn(onSubmit)

      render(() => form({
        onSubmit: submit
      })(
        Button({
          type: 'submit'
        })(
          'Build the installer'
        )
      ))
      fireEvent.click(screen.getByRole('button'))

      expect(submit).toHaveBeenCalledOnce()
    })
  })
})
