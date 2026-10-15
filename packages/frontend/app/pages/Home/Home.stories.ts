import type {
  Meta,
  StoryObj
} from '@nanoviews/storybook'
import { withGame } from '~/blocks/shared/game.mock'
import { Home } from './Home.ts'

const meta: Meta<typeof Home> = {
  title: 'Pages/Home',
  component: Home,
  decorators: [withGame()],
  parameters: {
    // The page sets its own width and margins, as it does in the app
    layout: 'fullscreen'
  }
}

export default meta

type Story = StoryObj<typeof meta>

/** The sample game read the way a drop reads it: the whole form, ready to build. */
export const Default: Story = {}

/** The page as it opens: nothing to do but bring the archive. */
export const Empty: Story = {
  decorators: [withGame(null)]
}
