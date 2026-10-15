import type {
  Meta,
  StoryObj
} from '@nanoviews/storybook'
import {
  div,
  span
} from 'nanoviews'
import typography from './typography.module.css'

/** Every class, alone or the way the app pairs them, with copy it carries there. */
const SAMPLES = [
  {
    classes: ['title'],
    text: 'Plumber'
  },
  {
    classes: ['subtitle'],
    text: 'Before building'
  },
  {
    classes: ['heading'],
    text: 'The game'
  },
  {
    classes: ['text'],
    text: 'Drop the game archive here'
  },
  {
    classes: ['text', 'muted'],
    text: 'Turns a zipped Windows game into a single .run installer for SteamOS.'
  },
  {
    classes: ['small'],
    text: 'Title in the library'
  },
  {
    classes: ['small', 'muted'],
    text: 'Nothing here stops the build.'
  },
  {
    classes: ['small', 'mono'],
    text: 'WINEDLLOVERRIDES="d3d9=n,b" %command%'
  }
]
const meta: Meta = {
  title: 'UIKit/Typography'
}

export default meta

type Story = StoryObj<typeof meta>

export const Classes: Story = {
  render() {
    return (
      div({
        style: {
          display: 'grid',
          gap: 'var(--sizeSpace)'
        }
      })(
        ...SAMPLES.map(({
          classes,
          text
        }) => (
          div()(
            span({
              class: `${typography.small} ${typography.muted} ${typography.mono}`
            })(
              classes.join(' ')
            ),
            div({
              class: classes.map(name => typography[name])
            })(
              text
            )
          )
        ))
      )
    )
  }
}
