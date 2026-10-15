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
import { Checkbox } from '../Checkbox/index.ts'
import { ChoiceField } from './ChoiceField.ts'
import styles from './ChoiceField.module.css'

const TEXT = 'The game has mods - override the wrapper DLLs'
const DESCRIPTION = 'Under Wine the loader does not start on its own.'

describe('uikit', () => {
  describe('ChoiceField', () => {
    it('should toggle the control from a click on the text', () => {
      const $checked = signal(false)

      render(ChoiceField({
        target: Checkbox({
          checked: $checked
        }),
        text: TEXT
      }))
      fireEvent.click(screen.getByText(TEXT))

      expect($checked()).toBe(true)
    })

    it('should name the control after its text', () => {
      const { container } = render(ChoiceField({
        target: Checkbox(),
        text: TEXT
      }))

      expect(screen.getByRole('checkbox', {
        name: TEXT
      })).toBe(container.querySelector('input'))
    })

    it('should put the description under the text, inside the label', () => {
      render(ChoiceField({
        target: Checkbox(),
        text: TEXT,
        description: DESCRIPTION
      }))

      const label = screen.getByRole('checkbox').closest('label')!

      expect(Array.from(label.children, part => part.className)).toEqual([styles.target, styles.text, styles.description])
      expect(screen.getByText(DESCRIPTION).closest('label')).toBe(label)
    })

    it('should leave the description out when there is none', () => {
      const { container } = render(ChoiceField({
        target: Checkbox(),
        text: TEXT
      }))

      expect(container.querySelector(`.${styles.description}`)).toBeNull()
    })

    it('should follow a reactive description', () => {
      const $description = signal('On')

      render(ChoiceField({
        target: Checkbox(),
        text: TEXT,
        description: $description
      }))
      $description('Off')

      expect(screen.getByText('Off').classList.contains(styles.description)).toBe(true)
    })
  })
})
