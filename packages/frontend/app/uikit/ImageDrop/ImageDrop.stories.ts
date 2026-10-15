import type {
  Meta,
  StoryObj
} from '@nanoviews/storybook'
import { fn } from 'storybook/test'
import { div } from 'nanoviews'
import {
  type ImageDropPreview,
  ImageDrop
} from './ImageDrop.ts'

// Any image does for a preview, and one drawn in SVG needs no file next to the story
function drawing(width: number, height: number, shapes: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${shapes}</svg>`

  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const HERO = drawing(1920, 620, '<rect width="1920" height="620" fill="#235f99"/><circle cx="1440" cy="310" r="210" fill="#4c9be8"/>')
// A logo saved as a JPEG: the white box it would leave over the hero
const LOGO = drawing(1200, 369, '<rect width="1200" height="369" fill="#fff"/><rect x="150" y="120" width="900" height="130" rx="24" fill="#1b1f26"/>')
const meta: Meta<{
  title: string
  size: string
  sourceLabel: string
  sourceUrl: string
  preview: ImageDropPreview | null
  clearLabel: string
  onFile: (file: File) => void
  onClear: () => void
}> = {
  title: 'UIKit/ImageDrop',
  parameters: {
    layout: 'centered'
  },
  argTypes: {
    title: {
      control: 'text'
    },
    size: {
      control: 'text'
    },
    sourceLabel: {
      control: 'text'
    },
    sourceUrl: {
      control: 'text'
    },
    preview: {
      control: 'object'
    },
    clearLabel: {
      control: 'text'
    }
  },
  args: {
    title: 'hero',
    size: '1920×620',
    sourceLabel: 'Heroes',
    sourceUrl: 'https://www.steamgriddb.com/search/heroes?term=Need%20for%20Speed',
    preview: null,
    clearLabel: 'Remove',
    onFile: fn(),
    onClear: fn()
  },
  render(props) {
    // As wide as a cell of the artwork grid
    return (
      div({
        style: {
          width: '12rem'
        }
      })(
        ImageDrop({
          ...props,
          accept: 'image/png,image/jpeg'
        })
      )
    )
  }
}

export default meta

type Story = StoryObj<typeof meta>

export const Empty: Story = {}

export const Filled: Story = {
  args: {
    preview: {
      url: HERO,
      note: '1920×620',
      problem: null
    }
  }
}

export const WithProblem: Story = {
  args: {
    title: 'logo',
    size: '1200×369',
    sourceLabel: 'Logos',
    sourceUrl: 'https://www.steamgriddb.com/search/logos?term=Need%20for%20Speed',
    preview: {
      url: LOGO,
      note: '1200×369',
      problem: 'A logo must have transparency, and a JPEG has none. Use a PNG.'
    }
  }
}
