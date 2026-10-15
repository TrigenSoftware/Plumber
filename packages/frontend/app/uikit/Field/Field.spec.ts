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
import {
  DependencyNotFound,
  InjectionContext,
  signal
} from 'nanoviews/store'
import {
  context$,
  option
} from 'nanoviews'
import { Select } from '../Select/index.ts'
import { TextInput } from '../TextInput/index.ts'
import {
  Field,
  FieldControl
} from './Field.ts'

describe('uikit', () => {
  describe('Field', () => {
    it('should name the control after the label', () => {
      const { container } = render(Field({
        id: 'game-name',
        label: 'Title in the library'
      })(
        FieldControl({
          as: TextInput
        })
      ))

      expect(screen.getByRole('textbox', {
        name: 'Title in the library'
      })).toBe(container.querySelector('input'))
    })

    it('should describe the control with the hint', () => {
      const { container } = render(Field({
        id: 'game-name',
        label: 'Title in the library',
        hint: 'Prefilled from the archive name.'
      })(
        FieldControl({
          as: TextInput
        })
      ))

      expect(screen.getByRole('textbox', {
        description: 'Prefilled from the archive name.'
      })).toBe(container.querySelector('input'))
    })

    it('should follow a reactive hint', () => {
      const $hint = signal('Ranked by how much each one looks like the game.')

      render(Field({
        id: 'game-exe',
        label: 'Executable to launch',
        hint: $hint
      })(
        FieldControl({
          as: Select
        })
      ))
      $hint('No .exe was found in this archive.')

      expect(screen.getByRole('combobox', {
        description: 'No .exe was found in this archive.'
      })).toBeDefined()
    })

    it('should leave the hint out when there is none, and the control undescribed', () => {
      const { container } = render(Field({
        id: 'game-arch',
        label: 'Prefix architecture'
      })(
        FieldControl({
          as: TextInput
        })
      ))

      expect(container.querySelector('p')).toBeNull()
      expect(container.querySelector('input')?.hasAttribute('aria-describedby')).toBe(false)
    })

    it('should hand the control its props and children as they are', () => {
      const $exePath = signal('Need for Speed/speed.exe')

      render(Field({
        id: 'game-exe',
        label: 'Executable to launch'
      })(
        FieldControl({
          as: Select,
          value: $exePath
        })(
          option({
            value: 'Need for Speed/speed.exe'
          })(
            'speed.exe'
          ),
          option({
            value: 'Need for Speed/unins000.exe'
          })(
            'unins000.exe'
          )
        )
      ))

      const select = screen.getByRole<HTMLSelectElement>('combobox', {
        name: 'Executable to launch'
      })

      expect(Array.from(select.options, item => item.textContent)).toEqual(['speed.exe', 'unins000.exe'])

      fireEvent.change(select, {
        target: {
          value: 'Need for Speed/unins000.exe'
        }
      })

      expect($exePath()).toBe('Need for Speed/unins000.exe')
    })

    it('should refuse a control outside a field', () => {
      expect(() => render(() => context$(new InjectionContext())(FieldControl({
        as: TextInput
      })))).toThrow(DependencyNotFound)
    })
  })
})
