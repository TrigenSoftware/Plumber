import type {
  Meta,
  StoryObj
} from '@nanoviews/storybook'
import {
  type CalloutTone,
  Callout
} from './Callout.ts'

const TONES: CalloutTone[] = [
  'warning',
  'note',
  'error'
]
const meta: Meta<{
  tone: CalloutTone
  message: string
}> = {
  title: 'UIKit/Callout',
  argTypes: {
    tone: {
      control: 'select',
      options: TONES
    },
    message: {
      control: 'text'
    }
  },
  args: {
    tone: 'warning',
    message: 'There is no .exe anywhere in this archive, so there is nothing to point the shortcut at.'
  },
  render({
    message,
    ...props
  }) {
    return (
      Callout(props)(
        message
      )
    )
  }
}

export default meta

type Story = StoryObj<typeof meta>

export const Warning: Story = {}

export const Note: Story = {
  args: {
    tone: 'note',
    message: '2 of 5 artwork slots are empty. The game will still install; the library will just show a grey box where the art goes.'
  }
}

export const Error: Story = {
  args: {
    tone: 'error',
    message: 'This file is not a zip archive: no end-of-central-directory record.'
  }
}
