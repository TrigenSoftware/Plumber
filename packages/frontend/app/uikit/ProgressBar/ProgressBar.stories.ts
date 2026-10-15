import type {
  Meta,
  StoryObj
} from '@nanoviews/storybook'
import { ProgressBar } from './ProgressBar.ts'

const meta: Meta<{
  label: string
  value: number
}> = {
  title: 'UIKit/ProgressBar',
  argTypes: {
    label: {
      control: 'text'
    },
    value: {
      control: {
        type: 'range',
        min: 0,
        max: 1,
        step: 0.01
      }
    }
  },
  args: {
    label: 'Writing the installer',
    value: 0
  },
  render({
    value,
    ...props
  }) {
    return (
      ProgressBar({
        ...props,
        value
      })(
        // The caption follows the value, as the one under the build button does
        () => `${Math.round(value() * 100)}% of 3.1 GB`
      )
    )
  }
}

export default meta

type Story = StoryObj<typeof meta>

export const Empty: Story = {}

export const InProgress: Story = {
  args: {
    value: 0.42
  }
}

export const Full: Story = {
  args: {
    value: 1
  }
}
