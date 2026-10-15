import type {
  Meta,
  StoryObj
} from '@nanoviews/storybook'
import { Button } from './Button.ts'

const meta: Meta<{
  variant: 'primary' | 'default' | 'quiet'
  disabled: boolean
}> = {
  title: 'UIKit/Button',
  parameters: {
    layout: 'centered'
  },
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'primary',
        'default',
        'quiet'
      ]
    },
    disabled: {
      control: 'boolean'
    }
  },
  args: {
    variant: 'default',
    disabled: false
  }
}

export default meta

type Story = StoryObj<typeof meta>

export const Primary: Story = {
  args: {
    variant: 'primary'
  },
  render(props) {
    return Button(props)('Build the installer')
  }
}

export const Default: Story = {
  render(props) {
    return Button(props)('Remove')
  }
}

export const Quiet: Story = {
  args: {
    variant: 'quiet'
  },
  render(props) {
    return Button(props)('Change')
  }
}

export const Disabled: Story = {
  args: {
    variant: 'primary',
    disabled: true
  },
  render(props) {
    return Button(props)('Build the installer')
  }
}
