import type {
  Meta,
  StoryObj
} from '@nanoviews/storybook'
import {
  div,
  option
} from 'nanoviews'
import { Select } from '../Select/index.ts'
import { TextInput } from '../TextInput/index.ts'
import {
  Field,
  FieldControl
} from './Field.ts'

/** Executables of a sample archive as the ranking lists them, best first. */
const EXECUTABLES = [
  {
    value: 'Need for Speed/speed.exe',
    label: 'speed.exe · 8.0 MB · score 90'
  },
  {
    value: 'Need for Speed/unins000.exe',
    label: 'unins000.exe · 300 KB · score -69'
  },
  {
    value: 'Need for Speed/redist/vcredist_x86.exe',
    label: 'redist/vcredist_x86.exe · 5.0 MB · score -147'
  }
]
const meta: Meta<{
  label: string
  hint: string
}> = {
  title: 'UIKit/Field',
  parameters: {
    layout: 'centered'
  },
  // The field stretches to its container, as it does in a form row
  decorators: [
    story => (
      div({
        style: {
          width: '24rem'
        }
      })(
        story()
      )
    )
  ],
  argTypes: {
    label: {
      control: 'text'
    },
    hint: {
      control: 'text'
    }
  }
}

export default meta

type Story = StoryObj<typeof meta>

export const WithTextInput: Story = {
  args: {
    label: 'Title in the library',
    hint: 'Guessed from the folders in the archive, or from its name. Changing it re-sorts the executables below.'
  },
  render({
    label,
    hint
  }) {
    return (
      Field({
        id: 'game-name',
        label,
        hint
      })(
        FieldControl({
          as: TextInput,
          value: 'Need for Speed'
        })
      )
    )
  }
}

export const WithSelect: Story = {
  args: {
    label: 'Executable to launch',
    hint: 'Ranked by how much each one looks like the game. Nothing is hidden, only pushed down.'
  },
  render({
    label,
    hint
  }) {
    return (
      Field({
        id: 'game-exe',
        label,
        hint
      })(
        FieldControl({
          as: Select
        })(
          ...EXECUTABLES.map(item => (
            option({
              value: item.value
            })(
              item.label
            )
          ))
        )
      )
    )
  }
}
