import type {
  Decorator,
  Meta,
  StoryObj
} from '@nanoviews/storybook'
import { inject } from 'nanoviews/store'
import { div } from 'nanoviews'
import { Game$ } from '~/stores/game'
import { withGame } from '../shared/game.mock.ts'
import { ControllerLayout } from './ControllerLayout.ts'

/**
 * Ticks mapping and puts a pasted link into the field. Without an archive in
 * the story: a new archive drops the mapping set up for the last game.
 *
 * @returns The decorator.
 */
function withLink(link: string): Decorator {
  return (story) => {
    const {
      $mapController,
      $layoutLink
    } = inject(Game$)

    $mapController(true)
    $layoutLink(link)

    return story()
  }
}

const meta: Meta<typeof ControllerLayout> = {
  title: 'Blocks/ControllerLayout',
  component: ControllerLayout,
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
    ),
    withGame()
  ]
}

export default meta

type Story = StoryObj<typeof meta>

/** As it first shows: mapping off, for a game that supports a controller. */
export const Default: Story = {}

/** Mapping ticked: the field for a link, and a search on SteamInputDB next to it. */
export const Mapped: Story = {
  decorators: [
    withLink(''),
    withGame(null)
  ]
}

/** A layout's page on SteamInputDB pasted in. */
export const WithLink: Story = {
  decorators: [
    withLink('https://www.steaminputdb.com/config/3036980641'),
    withGame(null)
  ]
}

/** Something else pasted: the field says what a link to a layout looks like. */
export const NotALink: Story = {
  decorators: [
    withLink('Deus Ex Steam Deck Perfection'),
    withGame(null)
  ]
}
