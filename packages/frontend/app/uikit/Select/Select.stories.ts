import type {
  Meta,
  StoryObj
} from '@nanoviews/storybook'
import {
  div,
  option
} from 'nanoviews'
import { Select } from './Select.ts'

const meta: Meta<{
  value: string
  disabled: boolean
  'aria-label': string
}> = {
  title: 'UIKit/Select',
  parameters: {
    layout: 'centered'
  },
  // The control stretches to its container, as it does in a form row
  decorators: [
    story => (
      div({
        style: {
          width: '20rem'
        }
      })(
        story()
      )
    )
  ],
  argTypes: {
    value: {
      control: 'select',
      options: ['win32', 'win64']
    },
    disabled: {
      control: 'boolean'
    },
    'aria-label': {
      control: 'text'
    }
  },
  args: {
    value: 'win32',
    disabled: false,
    'aria-label': 'Prefix architecture'
  },
  render(props) {
    return (
      Select(props)(
        option({
          value: 'win32'
        })(
          '32-bit (win32)'
        ),
        option({
          value: 'win64'
        })(
          '64-bit (win64)'
        )
      )
    )
  }
}

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Disabled: Story = {
  args: {
    disabled: true
  }
}
