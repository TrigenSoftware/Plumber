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
  waitTasks
} from 'nanoviews/store'
import { context$ } from 'nanoviews'
import {
  SAMPLE_ENTRIES,
  sampleArchive
} from '~/blocks/shared/game.mock'
import { REPOSITORY_URL } from '~/shared/constants'
import { Game$ } from '~/stores/game'
import {
  type HomeProps,
  Home
} from './Home.ts'
import styles from './Home.module.css'

const LOW_STORAGE = 'The browser reports about 100 B of free space, less than '
  + 'the archive. The build writes through a temporary file, so it may run out part way.'

function dropZone() {
  return screen.getByLabelText<HTMLInputElement>('Drop the game archive here')
}

// A drop and a pick end the same way: the browser puts the file into the
// input's own list of files and fires change
function drop(file: File) {
  const input = dropZone()
  const transfer = new DataTransfer()

  transfer.items.add(file)
  input.files = transfer.files
  fireEvent.change(input)
}

// The page over a game of its own, with the archive, if there is one, dropped
// onto it and read
async function setup(archive: File | null, props?: HomeProps) {
  const context = new InjectionContext()
  const game = inject(Game$, context)

  render(() => context$(context)(Home(props)))

  if (archive) {
    drop(archive)
    await waitTasks(game.$archive)
  }

  return game
}

function sourceLink() {
  return screen.getByRole<HTMLAnchorElement>('link', {
    name: 'the code on GitHub'
  })
}

function sectionHeadings() {
  return screen.queryAllByRole('heading', {
    level: 2
  }).map(heading => heading.textContent)
}

function buildButton() {
  return screen.queryByRole<HTMLButtonElement>('button', {
    name: 'Build the installer'
  })
}

// The heading of the part of the form the element is in
function headingOver(element: Element) {
  return element.closest('section')?.querySelector('h2')?.textContent
}

describe('pages', () => {
  describe('Home', () => {
    afterEach(() => {
      Reflect.deleteProperty(navigator, 'storage')
    })

    it('should ask for an archive before anything else', async () => {
      await setup(null)

      // The one control on the page, next to the link to the code
      expect(Array.from(document.querySelectorAll('a, button, input, select, textarea'))).toEqual([sourceLink(), dropZone()])
    })

    it('should link to its code in a tab of its own', async () => {
      await setup(null)

      const link = sourceLink()

      expect(link.href).toBe(REPOSITORY_URL)
      // Leaving the page would drop the archive and the artwork in the form
      expect(link.target).toBe('_blank')
      expect(link.rel).toBe('noopener noreferrer')
    })

    it('should leave the rest of the form out until there is an archive', async () => {
      await setup(null)

      expect(sectionHeadings()).toEqual([])
      expect(buildButton()).toBeNull()
    })

    it('should bring in the rest of the form once an archive is read', async () => {
      await setup(sampleArchive())

      expect(sectionHeadings()).toEqual([
        'The game',
        'Artwork',
        'Before building'
      ])
      expect(buildButton()).not.toBeNull()
    })

    it('should put each part of the form under its own heading', async () => {
      await setup(sampleArchive())

      expect(headingOver(screen.getByRole('textbox', {
        name: 'Title in the library'
      }))).toBe('The game')
      expect(headingOver(screen.getByLabelText('portrait, 600×900'))).toBe('Artwork')
      expect(headingOver(screen.getByText(/^5 of 5 artwork slots are empty\./))).toBe('Before building')
    })

    it('should take the rest of the form away with the archive', async () => {
      await setup(sampleArchive())

      fireEvent.click(screen.getByRole('button', {
        name: 'Change'
      }))

      expect(sectionHeadings()).toEqual([])
      expect(dropZone()).toBeDefined()
    })

    it('should keep the class passed by the consumer', async () => {
      await setup(null, {
        class: 'outer'
      })

      const page = screen.getByRole('main')

      expect(page.classList.contains('outer')).toBe(true)
      expect(page.classList.contains(styles.root)).toBe(true)
    })

    it('should hand the other attributes to its root', async () => {
      await setup(null, {
        title: 'outer'
      })

      expect(screen.getByRole('main').getAttribute('title')).toBe('outer')
    })

    it('should not offer to build while no exe is chosen', async () => {
      // The game zipped without its executables: there is none to choose
      await setup(sampleArchive('Need for Speed.zip', SAMPLE_ENTRIES.filter(entry => !String(entry.name).endsWith('.exe'))))

      expect(buildButton()?.disabled).toBe(true)
    })

    it('should offer to build once archive, title and exe are all set', async () => {
      const game = await setup(sampleArchive())

      // The read sets all three: the title comes from the archive name, the exe
      // from the ranking
      expect(game.$name()).toBe('Need for Speed')
      expect(game.$exePath()).toBe('Need for Speed/speed.exe')
      expect(buildButton()?.disabled).toBe(false)
    })

    it('should warn before the build when the browser is short of space for the archive', async () => {
      // happy-dom has no StorageManager, so the estimate is the test's to give
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: {
          estimate: () => Promise.resolve({
            quota: 1_000,
            usage: 900
          })
        }
      })

      await setup(sampleArchive())

      // The free space is asked for once the notes come on screen, with the archive
      expect(await screen.findByText(LOW_STORAGE)).toBeDefined()
    })
  })
})
