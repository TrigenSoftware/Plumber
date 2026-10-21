import {
  describe,
  it,
  expect,
  afterEach
} from 'vitest'
import {
  render,
  screen,
  fireEvent
} from '@nanoviews/testing-library'
import {
  InjectionContext,
  inject,
  start,
  waitTasks
} from 'nanoviews/store'
import { context$ } from 'nanoviews'
import { Game$ } from '~/stores/game'
import { sampleArchive } from '../shared/game.mock.ts'
import {
  type ControllerLayoutProps,
  ControllerLayout
} from './ControllerLayout.ts'
import styles from './ControllerLayout.module.css'

const LINK = 'https://www.steaminputdb.com/config/3036980641'
const NOT_A_LINK = "This is not a link to a layout. A layout's page on SteamInputDB looks like "
  + 'https://www.steaminputdb.com/config/3036980641.'
// What the page shows next to the block: the title, the form it is in fills it
const stops: (() => void)[] = []

// The block over a game of its own, with the archive read the way a drop reads it
async function setup(props?: ControllerLayoutProps) {
  const context = new InjectionContext()
  const game = inject(Game$, context)

  stops.push(start(game.$name))
  render(() => context$(context)(ControllerLayout(props)))
  game.$file(sampleArchive())
  await waitTasks(game.$archive)

  return game
}

function mappingBox() {
  return screen.getByRole<HTMLInputElement>('checkbox', {
    name: /^Map the controller to keyboard and mouse/
  })
}

function linkBox() {
  return screen.getByRole<HTMLInputElement>('textbox', {
    name: 'Link to a layout'
  })
}

function paste(text: string) {
  fireEvent.input(linkBox(), {
    target: {
      value: text
    }
  })
}

describe('blocks', () => {
  describe('ControllerLayout', () => {
    afterEach(() => {
      stops.splice(0).forEach(stop => stop())
    })

    it('should leave mapping off and the link field out at first', async () => {
      await setup()

      expect(mappingBox().checked).toBe(false)
      expect(screen.queryByRole('textbox')).toBeNull()
    })

    it('should bring the link field in once mapping is ticked, and take it away when unticked', async () => {
      const game = await setup()

      fireEvent.click(mappingBox())

      expect(game.$mapController()).toBe(true)
      expect(linkBox()).toBeDefined()

      fireEvent.click(mappingBox())

      expect(screen.queryByRole('textbox')).toBeNull()
    })

    it('should search SteamInputDB for the game, in a tab of its own', async () => {
      await setup()

      fireEvent.click(mappingBox())

      const search = screen.getByRole<HTMLAnchorElement>('link', {
        name: 'on SteamInputDB'
      })

      expect(search.href).toBe('https://www.steaminputdb.com/config/search?searchtext=Need%20for%20Speed')
      expect(search.target).toBe('_blank')
      expect(search.rel).toBe('noopener noreferrer')
    })

    it('should take the layout out of the link pasted', async () => {
      const game = await setup()

      fireEvent.click(mappingBox())
      paste(LINK)

      expect(game.$layoutLink()).toBe(LINK)
      expect(game.$layoutId()).toBe('3036980641')
      expect(linkBox().getAttribute('aria-invalid')).toBe('false')
    })

    it('should say what a link to a layout looks like when something else is pasted', async () => {
      await setup()

      fireEvent.click(mappingBox())
      paste('Deus Ex Steam Deck Perfection')

      expect(screen.getByText(NOT_A_LINK)).toBeDefined()
      expect(linkBox().getAttribute('aria-invalid')).toBe('true')
      expect(screen.queryByRole('link')).toBeNull()
    })

    it('should go back to the search once the field is emptied', async () => {
      await setup()

      fireEvent.click(mappingBox())
      paste('Deus Ex Steam Deck Perfection')
      paste('')

      expect(screen.queryByText(NOT_A_LINK)).toBeNull()
      expect(screen.getByRole('link')).toBeDefined()
    })

    it('should keep the class passed by the consumer', async () => {
      await setup({
        class: 'outer'
      })

      expect(mappingBox().closest('.outer')?.classList.contains(styles.root)).toBe(true)
    })

    it('should hand the other attributes to its root', async () => {
      await setup({
        title: 'outer'
      })

      expect(mappingBox().closest(`.${styles.root}`)?.getAttribute('title')).toBe('outer')
    })
  })
})
