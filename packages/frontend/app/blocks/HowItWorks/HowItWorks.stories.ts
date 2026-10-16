import type {
  Meta,
  StoryObj
} from '@nanoviews/storybook'
import { div } from 'nanoviews'
import { HowItWorks } from './HowItWorks.ts'

const meta: Meta<typeof HowItWorks> = {
  title: 'Blocks/HowItWorks',
  component: HowItWorks,
  decorators: [
    // No wider than the column of the page it sits in
    story => (
      div({
        style: {
          maxWidth: 'var(--sizeContent)'
        }
      })(
        story()
      )
    )
  ]
}

export default meta

type Story = StoryObj<typeof meta>

/** The three places side by side, the steps numbered on from one to the next. */
export const Default: Story = {}
