import {
  describe,
  it,
  expect
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
import { makeZip } from '~/services/zip/zip.mock'
import { formatSize } from '~/shared/utils'
import { Build$ } from '~/stores/build'
import { Game$ } from '~/stores/game'
import { sampleArchive } from '../shared/game.mock.ts'
import {
  type ArchivePickerProps,
  ArchivePicker
} from './ArchivePicker.ts'
import styles from './ArchivePicker.module.css'

const NOT_A_ZIP = 'This file is not a zip archive: no end-of-central-directory record.'

function notAZip() {
  return new File(['just some notes'], 'notes.zip')
}

// The picker over a game of its own, with nothing read yet
function setup(props: ArchivePickerProps = {}) {
  const context = new InjectionContext()
  const game = inject(Game$, context)
  const build = inject(Build$, context)
  const { container } = render(() => context$(context)(ArchivePicker(props)))

  return {
    game,
    build,
    root: container.firstElementChild!.firstElementChild!
  }
}

function dropZone() {
  return screen.getByLabelText<HTMLInputElement>('Drop the game archive here')
}

function changeButton() {
  return screen.getByRole<HTMLButtonElement>('button', {
    name: 'Change'
  })
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

describe('blocks', () => {
  describe('ArchivePicker', () => {
    it('should ask for the game archive while there is none', () => {
      setup()

      expect(document.getElementById(dropZone().getAttribute('aria-describedby')!)?.textContent)
        .toBe('A .zip of the folder the game is installed in. Only its listing is read, not its contents.')
      expect(screen.queryByRole('button', {
        name: 'Change'
      })).toBeNull()
    })

    it('should take nothing but a zip', () => {
      setup()

      expect(dropZone().accept).toBe('.zip,application/zip')
    })

    it('should say the archive is being read until it is', async () => {
      const { game } = setup()

      drop(sampleArchive())

      expect(screen.getByLabelText('Reading the archive…')).toBeDefined()

      await waitTasks(game.$archive)

      expect(screen.queryByText('Reading the archive…')).toBeNull()
    })

    it('should sum up a dropped zip by its name and facts', async () => {
      const archive = sampleArchive()
      const { game } = setup()

      drop(archive)
      await waitTasks(game.$archive)

      expect(game.$archive()).toBe(archive)
      expect(screen.getByText('Need for Speed.zip')).toBeDefined()
      expect(screen.getByText(`${formatSize(archive.size)} · 6 entries · 3 executables · under Need for Speed/`)).toBeDefined()
      expect(screen.queryByLabelText('Drop the game archive here')).toBeNull()
    })

    it('should say a zip is Zip64 and has its files at the root', async () => {
      const archive = new File([
        makeZip([
          {
            name: 'game.exe',
            size: 1_000
          },
          {
            name: 'data/'
          }
        ], {
          zip64: true
        })
      ], 'Game.zip')
      const { game } = setup()

      drop(archive)
      await waitTasks(game.$archive)

      expect(screen.getByText(`${formatSize(archive.size)} · 2 entries · 1 executables · at the archive root · Zip64`)).toBeDefined()
    })

    it('should say why a file could not be read', async () => {
      const { game } = setup()

      drop(notAZip())
      await waitTasks(game.$archive)

      expect(screen.getByRole('alert').textContent).toBe(NOT_A_ZIP)
      expect(game.$archive()).toBeNull()
      expect(dropZone()).toBeDefined()
    })

    it('should take the alert away as soon as another file is dropped', async () => {
      const { game } = setup()

      drop(notAZip())
      await waitTasks(game.$archive)
      drop(sampleArchive())

      // Not once the new read is over: it can take a while with a big archive
      expect(screen.queryByRole('alert')).toBeNull()

      await waitTasks(game.$archive)
    })

    it('should go back to the drop zone on Change', async () => {
      const { game } = setup()

      drop(sampleArchive())
      await waitTasks(game.$archive)
      fireEvent.click(changeButton())

      expect(game.$archive()).toBeNull()
      expect(dropZone()).toBeDefined()
      expect(screen.queryByText('Need for Speed.zip')).toBeNull()
    })

    it('should not let the archive change while the installer is being built', async () => {
      const {
        game,
        build
      } = setup()

      drop(sampleArchive())
      await waitTasks(game.$archive)
      // After the read: a new archive starts the build over
      build.$phase('building')

      expect(changeButton().disabled).toBe(true)
    })

    it('should let the archive change once the build is over', async () => {
      const {
        game,
        build
      } = setup()

      drop(sampleArchive())
      await waitTasks(game.$archive)
      build.$phase('building')
      build.$phase('done')

      expect(changeButton().disabled).toBe(false)
    })

    it('should keep the class the consumer gives it', () => {
      const { root } = setup({
        class: 'outer'
      })

      expect(root.classList.contains('outer')).toBe(true)
      expect(root.classList.contains(styles.root)).toBe(true)
    })

    it('should hand the other attributes to its root', () => {
      const { root } = setup({
        title: 'outer'
      })

      expect(root.getAttribute('title')).toBe('outer')
    })
  })
})
