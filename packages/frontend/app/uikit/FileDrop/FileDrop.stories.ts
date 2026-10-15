import type {
  Meta,
  StoryObj
} from '@nanoviews/storybook'
import { fn } from 'storybook/test'
import { FileDrop } from './FileDrop.ts'

const meta: Meta<{
  title: string
  hint?: string
  onFile: (file: File) => void
}> = {
  title: 'UIKit/FileDrop',
  argTypes: {
    title: {
      control: 'text'
    },
    hint: {
      control: 'text'
    }
  },
  args: {
    title: 'Drop the game archive here',
    onFile: fn()
  },
  render({
    title,
    ...props
  }) {
    return (
      FileDrop({
        ...props,
        accept: '.zip,application/zip'
      })(
        title
      )
    )
  }
}

export default meta

type Story = StoryObj<typeof meta>

// The hint is either there from the start or not at all: a signal made for it
// later would have nothing to bind to
export const Default: Story = {
  parameters: {
    controls: {
      exclude: ['hint']
    }
  }
}

export const WithHint: Story = {
  args: {
    hint: 'A .zip of the folder the game is installed in. Only its listing is read, not its contents.'
  }
}
