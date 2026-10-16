import type {
  Meta,
  StoryObj
} from '@nanoviews/storybook'
import { provide } from 'nanoviews/store'
import { context$ } from 'nanoviews'
import { withGame } from '~/blocks/shared/game.mock'
import { CanSaveFiles$ } from '~/stores/build'
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

/** Opened in a browser without showSaveFilePicker, as Firefox and Safari are: the page says so first. */
export const UnsupportedBrowser: Story = {
  decorators: [
    story => (
      context$(provide(CanSaveFiles$, false))(
        story()
      )
    ),
    withGame(null)
  ]
}
