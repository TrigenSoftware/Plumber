import type {
  Decorator,
  Meta,
  StoryObj
} from '@nanoviews/storybook'
import {
  batch,
  inject,
  provide
} from 'nanoviews/store'
import { context$ } from 'nanoviews'
import {
  type BuildPhase,
  Build$,
  HasSavePicker$
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

/**
 * Puts the story in a browser without showSaveFilePicker, as Firefox and
 * Safari are, which downloads the file on its own. Listed after withBuild, so
 * the build it sets up is the one of this browser.
 *
 * @returns The decorator.
 */
function withoutSavePicker(): Decorator {
  return story => (
    context$(provide(HasSavePicker$, false))(
      story()
    )
  )
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

/** Handed to the browser as a download: it shows the progress, the page only what comes next. */
export const Downloading: Story = {
  decorators: [
    withBuild({
      phase: 'done',
      progress: 1,
      savedAs: 'need-for-speed.run'
    }),
    withoutSavePicker()
  ]
}
