import {
  vi,
  describe,
  it,
  expect,
  afterEach
} from 'vitest'
import {
  render,
  screen,
  within,
  fireEvent
} from '@nanoviews/testing-library'
import {
  InjectionContext,
  inject,
  waitTasks
} from 'nanoviews/store'
import { context$ } from 'nanoviews'
import { formatSize } from '~/shared/utils'
import { Build$ } from '~/stores/build'
import { Game$ } from '~/stores/game'
import { sampleArchive } from '../shared/game.mock.ts'
import buttonStyles from '~/uikit/Button/Button.module.css'
import { BuildPanel } from './BuildPanel.ts'
import styles from './BuildPanel.module.css'

const STEPS = [
  'Right-click the downloaded file and open Properties',
  'Go to the Permissions tab and tick Is executable',
  'Close the dialog and double-click the file'
]

// The panel over a game of its own, with the archive read the way a drop reads it
async function setup(archive: File | null = sampleArchive()) {
  const context = new InjectionContext()
  const game = inject(Game$, context)
  const build = inject(Build$, context)

  render(() => context$(context)(BuildPanel()))

  if (archive) {
    game.$file(archive)
    await waitTasks(game.$archive)
  }

  return {
    game,
    build
  }
}

// The file the human picks: whatever is written to it goes nowhere
function pickFile(name = 'need-for-speed.run') {
  const showSaveFilePicker = vi.fn(() => Promise.resolve({
    name,
    createWritable: () => Promise.resolve(new WritableStream<Uint8Array>())
  }))

  vi.stubGlobal('showSaveFilePicker', showSaveFilePicker)

  return showSaveFilePicker
}

function buildButton() {
  return screen.getByRole<HTMLButtonElement>('button')
}

describe('blocks', () => {
  describe('BuildPanel', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should ask for an archive before anything else', async () => {
      await setup(null)

      expect(screen.getByText('Drop an archive to begin.')).toBeDefined()
    })

    it('should not offer to build without an archive', async () => {
      await setup(null)

      expect(buildButton().disabled).toBe(true)
    })

    it('should offer to build once the archive is read', async () => {
      await setup()

      expect(buildButton().disabled).toBe(false)
    })

    it('should say what goes into the installer once the archive is read', async () => {
      const archive = sampleArchive()

      await setup(archive)

      expect(screen.getByText(`speed.exe · ${formatSize(archive.size)} copied through byte for byte`)).toBeDefined()
    })

    it('should follow the exe the human picks', async () => {
      const archive = sampleArchive()
      const { game } = await setup(archive)

      game.$exePath('Need for Speed/unins000.exe')

      expect(screen.getByText(`unins000.exe · ${formatSize(archive.size)} copied through byte for byte`)).toBeDefined()
    })

    it('should not offer to build without a title', async () => {
      const { game } = await setup()

      game.$name('   ')

      expect(buildButton().disabled).toBe(true)
    })

    it('should ask for the file on a click', async () => {
      const { build } = await setup()
      const showSaveFilePicker = pickFile()

      fireEvent.click(buildButton())

      expect(showSaveFilePicker).toHaveBeenCalledOnce()

      await waitTasks(build.$phase)
    })

    it('should not ask for a file while there is nothing to build', async () => {
      await setup(null)

      const showSaveFilePicker = pickFile()

      fireEvent.click(buildButton())

      expect(showSaveFilePicker).not.toHaveBeenCalled()
    })

    it('should say so on the button while building', async () => {
      const { build } = await setup()

      build.$phase('building')

      expect(buildButton().textContent).toBe('Building…')
    })

    it('should leave building again at hand, but no longer first, once the installer is written', async () => {
      const { build } = await setup()

      build.$phase('done')

      const button = screen.getByRole<HTMLButtonElement>('button', {
        name: 'Build again'
      })

      expect(button.disabled).toBe(false)
      expect(button.classList.contains(buttonStyles.quiet)).toBe(true)
      expect(button.classList.contains(buttonStyles.primary)).toBe(false)
    })

    it('should not offer a second build while building', async () => {
      const { build } = await setup()

      build.$phase('building')

      expect(buildButton().disabled).toBe(true)
    })

    it('should show no progress unless building', async () => {
      await setup()

      expect(screen.queryByRole('progressbar')).toBeNull()
    })

    it('should show how much of the archive is written while building', async () => {
      const archive = sampleArchive()
      const { build } = await setup(archive)

      build.$progress(0.423)
      build.$phase('building')

      const bar = screen.getByRole('progressbar', {
        name: 'Writing the installer'
      })

      expect(bar.getAttribute('aria-valuenow')).toBe('42')
      expect(bar.textContent).toBe(`42% of ${formatSize(archive.size)}`)
    })

    it('should follow the bytes as they go to disk', async () => {
      const archive = sampleArchive()
      const { build } = await setup(archive)

      build.$phase('building')
      build.$progress(0.75)

      expect(screen.getByRole('progressbar').textContent).toBe(`75% of ${formatSize(archive.size)}`)
    })

    it('should explain how to run the installer once it is written', async () => {
      const { build } = await setup()

      pickFile('nfs.run')
      fireEvent.click(buildButton())
      await waitTasks(build.$phase)

      expect(screen.getByText('nfs.run is ready. Copy it to the Steam Deck, then, in Desktop Mode:')).toBeDefined()
      expect(within(screen.getByRole('list')).getAllByRole('listitem').map(step => step.textContent)).toEqual(STEPS)
    })

    it('should set apart what to look for on screen', async () => {
      const { build } = await setup()

      build.$phase('done')

      expect([...screen.getByRole('list').querySelectorAll(`.${styles.key}`)].map(key => key.textContent)).toEqual([
        'Properties',
        'Permissions',
        'Is executable'
      ])
    })

    it('should not name the file when it has no name', async () => {
      const { build } = await setup()

      build.$phase('done')

      expect(screen.getByText('Copy it to the Steam Deck, then, in Desktop Mode:')).toBeDefined()
    })

    it('should not explain anything before the installer is written', async () => {
      await setup()

      expect(screen.queryByRole('list')).toBeNull()
    })

    it('should drop the instructions when the archive goes', async () => {
      const {
        game,
        build
      } = await setup()

      pickFile()
      fireEvent.click(buildButton())
      await waitTasks(build.$phase)
      // Written, and explained
      screen.getByRole('list')
      game.$file(null)

      expect(screen.queryByRole('list')).toBeNull()
    })

    it('should keep the class passed by the consumer', () => {
      render(() => context$(new InjectionContext())(BuildPanel({
        class: 'outer'
      })))

      expect(screen.getByRole('button').closest(`.${styles.root}`)?.classList.contains('outer')).toBe(true)
    })

    it('should hand the other attributes to its root', () => {
      render(() => context$(new InjectionContext())(BuildPanel({
        title: 'outer'
      })))

      expect(screen.getByRole('button').closest(`.${styles.root}`)?.getAttribute('title')).toBe('outer')
    })
  })
})
