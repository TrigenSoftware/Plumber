import type {
  Meta,
  StoryObj
} from '@nanoviews/storybook'
import { Checkbox } from './Checkbox.ts'

const meta: Meta<{
  checked: boolean
  disabled: boolean
  'aria-label': string
}> = {
  title: 'UIKit/Checkbox',
  component: Checkbox,
  parameters: {
    layout: 'centered'
  },
  argTypes: {
    checked: {
      control: 'boolean'
    },
    disabled: {
      control: 'boolean'
    },
    'aria-label': {
      control: 'text'
    }
  },
  args: {
    checked: false,
    disabled: false,
    // On its own the box has no caption to be named by
    'aria-label': 'Override the wrapper DLLs'
  }
}

export default meta

type Story = StoryObj<typeof meta>

export const Unchecked: Story = {}

export const Checked: Story = {
  args: {
    checked: true
  }
}

export const Disabled: Story = {
  args: {
    checked: true,
    disabled: true
  }
}
