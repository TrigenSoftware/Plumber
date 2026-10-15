import type {
  Decorator,
  Meta,
  StoryObj
} from '@nanoviews/storybook'
import { inject } from 'nanoviews/store'
import { Build$ } from '~/stores/build'
import {
  pendingArchive,
  withGame
} from '../shared/game.mock.ts'
import { ArchivePicker } from './ArchivePicker.ts'

/**
 * Says a build is streaming the archive to disk.
 *
 * @returns The decorator.
 */
function withBuilding(): Decorator {
  return (story) => {
    inject(Build$).$phase('building')

    return story()
  }
}

const meta: Meta<typeof ArchivePicker> = {
  title: 'Blocks/ArchivePicker',
  component: ArchivePicker,
  decorators: [withGame()]
}

export default meta

type Story = StoryObj<typeof meta>

// The sample archive, read the way a drop reads it
export const Default: Story = {}

export const Empty: Story = {
  decorators: [withGame(null)]
}

export const Reading: Story = {
  decorators: [withGame(pendingArchive())]
}

export const NotAZip: Story = {
  decorators: [withGame(new File(['just some notes'], 'notes.zip'))]
}

export const Building: Story = {
  decorators: [withBuilding()]
}
