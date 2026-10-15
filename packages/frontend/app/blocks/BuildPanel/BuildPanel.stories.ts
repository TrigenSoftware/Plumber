import type {
  Decorator,
  Meta,
  StoryObj
} from '@nanoviews/storybook'
import {
  batch,
  inject
} from 'nanoviews/store'
import {
  type BuildPhase,
  Build$
} from '~/stores/build'
import { withGame } from '../shared/game.mock.ts'
import { BuildPanel } from './BuildPanel.ts'

interface BuildState {
  phase: BuildPhase
  progress: number
  savedAs?: string
}

/**
 * Puts the build where the story shows it.
 *
 * @returns The decorator.
 */
function withBuild({
  phase,
  progress,
  savedAs = ''
}: BuildState): Decorator {
  return (story) => {
    const {
      $phase,
      $progress,
      $savedAs
    } = inject(Build$)

    batch(() => {
      $phase(phase)
      $progress(progress)
      $savedAs(savedAs)
    })

    return story()
  }
}

const meta: Meta<typeof BuildPanel> = {
  title: 'Blocks/BuildPanel',
  component: BuildPanel,
  decorators: [withGame()]
}

export default meta

type Story = StoryObj<typeof meta>

// The sample archive is read and its exe picked: nothing stands in the way
export const Default: Story = {}

export const WithoutArchive: Story = {
  decorators: [withGame(null)]
}

export const Building: Story = {
  decorators: [
    withBuild({
      phase: 'building',
      progress: 0.42
    })
  ]
}

export const Done: Story = {
  decorators: [
    withBuild({
      phase: 'done',
      progress: 1,
      savedAs: 'need-for-speed.run'
    })
  ]
}
