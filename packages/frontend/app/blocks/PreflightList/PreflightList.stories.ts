import type {
  Decorator,
  Meta,
  StoryObj
} from '@nanoviews/storybook'
import {
  batch,
  inject
} from 'nanoviews/store'
import { div } from 'nanoviews'
import type { ArtItem } from '~/services/artwork'
import type { MockEntry } from '~/services/zip/zip.mock'
import { Artwork$ } from '~/stores/artwork'
import { Build$ } from '~/stores/build'
import {
  sampleArchive,
  withGame
} from '../shared/game.mock.ts'
import { PreflightList } from './PreflightList.ts'

/** A JPEG dropped into the logo slot, which breaks the one hard rule there is. */
const JPEG_LOGO: ArtItem = {
  slot: 'logo',
  file: new File([], 'logo.jpg', {
    type: 'image/jpeg'
  }),
  // The list says what is wrong with an image and never shows it
  url: '',
  width: 1200,
  height: 369,
  warnings: [],
  error: 'A logo must have transparency, and a JPEG has none. Use a PNG.'
}
/** The game zipped without its exe: what is left to launch is the uninstaller. */
const UNINSTALLER_ONLY: MockEntry[] = [
  {
    name: 'Need for Speed/'
  },
  {
    name: 'Need for Speed/unins000.exe',
    size: 300_000
  },
  {
    name: 'Need for Speed/data/cars.viv',
    size: 30_000_000
  }
]

/**
 * Something wrong from every source the list reads besides the archive: a JPEG
 * in the logo slot, an image that would not decode, and a build that broke off.
 *
 * @returns The decorator.
 */
function withErrors(): Decorator {
  return (story) => {
    const {
      $slots,
      $error: $artworkError
    } = inject(Artwork$)
    const { $error: $buildError } = inject(Build$)

    batch(() => {
      $slots({
        logo: JPEG_LOGO
      })
      $artworkError('hero.png could not be read as an image.')
      $buildError('The requested file could not be read, typically due to permission problems '
        + 'that have occurred after a reference to a file was acquired.')
    })

    return story()
  }
}

const meta: Meta<typeof PreflightList> = {
  title: 'Blocks/PreflightList',
  component: PreflightList,
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

/** The sample game as it lands: nothing is wrong, the artwork is just not there yet. */
export const Default: Story = {}

/** The data folder zipped instead of the game's: there is nothing to point the shortcut at. */
export const NoExecutable: Story = {
  decorators: [
    withGame(sampleArchive('Need for Speed data.zip', [
      {
        name: 'Data/'
      },
      {
        name: 'Data/tracks.big',
        size: 120_000_000
      },
      {
        name: 'Data/cars.big',
        size: 80_000_000
      }
    ]))
  ]
}

/**
 * Something to say from every source at once, in the order the list keeps:
 * what the images break, the checks of the archive, then what went wrong.
 */
export const WithErrors: Story = {
  decorators: [
    withErrors(),
    // The chosen exe is the uninstaller, which the checks of the archive point out
    withGame(sampleArchive('Need for Speed.zip', UNINSTALLER_ONLY))
  ]
}
