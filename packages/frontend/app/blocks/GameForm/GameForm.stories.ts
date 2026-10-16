import type {
  Meta,
  StoryContext,
  StoryObj
} from '@nanoviews/storybook'
import { inject } from 'nanoviews/store'
import { div } from 'nanoviews'
import { Game$ } from '~/stores/game'
import {
  SAMPLE_ENTRIES,
  sampleArchive,
  withGame
} from '../shared/game.mock.ts'
import { GameForm } from './GameForm.ts'

/** Unfolds the advanced settings, where the prefix, the save folders and the override are. */
async function openAdvanced({
  canvas,
  userEvent
}: StoryContext) {
  await userEvent.click(canvas.getByText('Advanced settings'))
}

/** @returns The sample game with the entries the pattern matches left out of the archive. */
function sampleWithout(pattern: RegExp) {
  return sampleArchive('Need for Speed.zip', SAMPLE_ENTRIES.filter(entry => !pattern.test(String(entry.name))))
}

const meta: Meta<typeof GameForm> = {
  title: 'Blocks/GameForm',
  component: GameForm,
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

/** The sample game as it first shows: the title and the exe, the rest folded away. */
export const Default: Story = {}

/** Unfolded: a wrapper DLL and an ASI mod next to the exe, so the override is offered, ticked. */
export const Advanced: Story = {
  play: openAdvanced
}

/** The box unticked: the game launches as it is, and the launch options go away. */
export const OverrideUnticked: Story = {
  decorators: [
    (story) => {
      // The human has decided the mods are the problem
      inject(Game$).$overrideWrappers(false)

      return story()
    }
  ],
  play: openAdvanced
}

/** Nothing next to the exe for Wine to be told about: there is no override to offer. */
export const WithoutWrappers: Story = {
  decorators: [withGame(sampleWithout(/\.dll$/))],
  play: openAdvanced
}

/** The game zipped without its executables: the list is empty and says why. */
export const WithoutExecutables: Story = {
  decorators: [withGame(sampleWithout(/\.exe$/))]
}
