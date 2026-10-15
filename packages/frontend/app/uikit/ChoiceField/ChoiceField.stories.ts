import type {
  Meta,
  StoryObj
} from '@nanoviews/storybook'
import { div } from 'nanoviews'
import { Checkbox } from '../Checkbox/index.ts'
import { ChoiceField } from './ChoiceField.ts'

const meta: Meta<{
  text: string
  description: string
  checked: boolean
  disabled: boolean
}> = {
  title: 'UIKit/ChoiceField',
  parameters: {
    layout: 'centered'
  },
  // A column of the form the way the game form lays it out, fluid enough for a phone
  decorators: [
    story => (
      div({
        style: {
          inlineSize: 'min(28rem, calc(100vw - 32px))'
        }
      })(
        story()
      )
    )
  ],
  argTypes: {
    text: {
      control: 'text'
    },
    description: {
      control: 'text'
    },
    checked: {
      control: 'boolean'
    },
    disabled: {
      control: 'boolean'
    }
  },
  args: {
    text: 'The game has mods - override the wrapper DLLs',
    description: 'Under Wine the loader does not start on its own, so the mods silently do not load and the game looks broken while nothing crashes.',
    checked: true,
    disabled: false
  },
  render({
    text,
    description,
    checked,
    disabled
  }) {
    return (
      ChoiceField({
        target: Checkbox({
          checked,
          disabled
        }),
        text,
        description
      })
    )
  }
}

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithoutDescription: Story = {
  parameters: {
    controls: {
      exclude: ['description']
    }
  },
  render({
    text,
    checked,
    disabled
  }) {
    return (
      ChoiceField({
        target: Checkbox({
          checked,
          disabled
        }),
        text
      })
    )
  }
}

/** The text wraps: the box stays on its first line */
export const Multiline: Story = {
  args: {
    text: 'The game has mods - override the wrapper DLLs, so the loader next to the exe starts instead of the one Wine ships'
  }
}

export const Disabled: Story = {
  args: {
    disabled: true
  }
}
