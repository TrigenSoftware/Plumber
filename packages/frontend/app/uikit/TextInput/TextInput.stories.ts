import type {
  Meta,
  StoryObj
} from '@nanoviews/storybook'
import { div } from 'nanoviews'
import { TextInput } from './TextInput.ts'

const meta: Meta<{
  value: string
  disabled: boolean
  'aria-label': string
}> = {
  title: 'UIKit/TextInput',
  component: TextInput,
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
      control: 'text'
    },
    disabled: {
      control: 'boolean'
    },
    'aria-label': {
      control: 'text'
    }
  },
  args: {
    value: 'Need for Speed',
    disabled: false,
    'aria-label': 'Title in the library'
  }
}

export default meta

type Story = StoryObj<typeof meta>

export const Filled: Story = {}

export const Empty: Story = {
  args: {
    value: ''
  }
}

export const Disabled: Story = {
  args: {
    disabled: true
  }
}
