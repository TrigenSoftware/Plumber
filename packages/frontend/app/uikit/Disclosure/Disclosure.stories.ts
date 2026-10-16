import type {
  Meta,
  StoryObj
} from '@nanoviews/storybook'
import { p } from 'nanoviews'
import typography from '../typography.module.css'
import { Disclosure } from './Disclosure.ts'

const meta: Meta<{
  summary: string
  open: boolean
}> = {
  title: 'UIKit/Disclosure',
  argTypes: {
    summary: {
      control: 'text'
    },
    open: {
      control: 'boolean'
    }
  },
  args: {
    summary: 'Advanced settings',
    open: false
  },
  render({
    summary,
    open
  }) {
    return (
      Disclosure({
        summary,
        open
      })(
        p({
          class: typography.text
        })(
          'Folders holding saves and settings: SAVES'
        ),
        p({
          class: typography.text
        })(
          'Found next to the exe: d3d9, plus 1 .asi module and a SCRIPTS folder.'
        )
      )
    )
  }
}

export default meta

type Story = StoryObj<typeof meta>

/** Folded: only the line, with the chevron pointing at it */
export const Default: Story = {}

/** Unfolded: the content under the line, the chevron pointing down */
export const Open: Story = {
  args: {
    open: true
  }
}
