import type {
  Decorator,
  Meta,
  StoryObj
} from '@nanoviews/storybook'
import { inject } from 'nanoviews/store'
import { div } from 'nanoviews'
import {
  type ArtSlot,
  ART_SLOTS
} from '~/services/artwork'
import { Artwork$ } from '~/stores/artwork'
import { withGame } from '../shared/game.mock.ts'
import { ArtworkGrid } from './ArtworkGrid.ts'

// The brand's blues, so the drawings look at home in the grid
const BACKDROP = '#235f99'
const DISC = '#4c9be8'
const WHITE = '#ffffff'

/**
 * An image file the way a human brings one: drawn on a canvas, then encoded as
 * a PNG, or as a JPEG when the name says so. Without a backdrop the disc sits
 * on nothing at all, which only a PNG keeps.
 *
 * @returns The file.
 */
function image(name: string, width: number, height: number, backdrop: string | null = BACKDROP) {
  const type = name.endsWith('.jpg') ? 'image/jpeg' : 'image/png'
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')!

  canvas.width = width
  canvas.height = height

  if (backdrop) {
    context.fillStyle = backdrop
    context.fillRect(0, 0, width, height)
  }

  context.fillStyle = DISC
  context.beginPath()
  context.arc(width / 2, height / 2, Math.min(width, height) / 3, 0, 2 * Math.PI)
  context.fill()

  // A data URL is the one way out of a canvas that does not wait
  const [, base64] = canvas.toDataURL(type).split(',')

  return new File([Uint8Array.from(atob(base64), char => char.charCodeAt(0))], name, {
    type
  })
}

/**
 * Drops the images into their slots the way a human does, so each one is
 * decoded and checked by the store before it shows. A story's own decorator
 * runs inside the game the meta opens, once its archive is read; the images
 * are drawn only then.
 *
 * @returns The decorator.
 */
function withArtwork(images: () => Partial<Record<ArtSlot, File>>): Decorator {
  return (story) => {
    const { setArt } = inject(Artwork$)
    const files = images()

    ART_SLOTS.forEach(({ slot }) => {
      const file = files[slot]

      if (file) {
        setArt(slot, file)
      }
    })

    return story()
  }
}

const meta: Meta<typeof ArtworkGrid> = {
  title: 'Blocks/ArtworkGrid',
  component: ArtworkGrid,
  decorators: [
    // As wide as the page lays the grid out
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

/** The sample game as it lands: every slot empty, saying the size it expects. */
export const Empty: Story = {}

/** Every slot holding an image at the size it expects. */
export const Filled: Story = {
  decorators: [
    withArtwork(() => ({
      portrait: image('portrait.png', 600, 900),
      wide: image('wide.png', 920, 430),
      hero: image('hero.png', 1920, 620),
      // The logo is laid over the hero, so nothing is behind it
      logo: image('logo.png', 1200, 369, null),
      icon: image('icon.png', 1024, 1024)
    }))
  ]
}

/** Images that do not fit their slots, as the check reports them. */
export const Mismatched: Story = {
  decorators: [
    withArtwork(() => ({
      portrait: image('portrait.png', 600, 900),
      // The wrong size is only worth a note
      hero: image('hero.png', 1000, 620),
      // A JPEG has no alpha: the white box it would leave over the hero
      logo: image('logo.jpg', 1200, 369, WHITE)
    }))
  ]
}
