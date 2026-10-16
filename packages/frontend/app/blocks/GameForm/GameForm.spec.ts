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
import type { MockEntry } from '~/services/zip/zip.mock'
import { Game$ } from '~/stores/game'
import { sampleArchive } from '../shared/game.mock.ts'
import {
  type GameFormProps,
  GameForm
} from './GameForm.ts'
import styles from './GameForm.module.css'

const LAUNCH_OPTIONS = 'WINEDLLOVERRIDES="d3d9=n,b" %command%'
const OVERRIDE_HINT = 'Under Wine the loader does not start on its own, so the mods silently '
  + 'do not load and the game looks broken while nothing crashes.'
const NO_OVERRIDE_HINT = 'The game will launch without the override. Untick this only if it '
  + 'turns out the mods are the problem.'
// Two executables side by side: the title decides which one looks like the game
const RIVALS: MockEntry[] = [
  {
    name: 'Need for Speed/'
  },
  {
    name: 'Need for Speed/speed.exe',
    size: 8_000_000
  },
  {
    name: 'Need for Speed/nfs.exe',
    size: 8_000_000
  }
]
// A 32-bit and a 64-bit build, each with a wrapper of its own next to it
const TWO_BUILDS: MockEntry[] = [
  {
    name: 'Need for Speed/'
  },
  {
    name: 'Need for Speed/bin/speed.exe',
    size: 8_000_000
  },
  {
    name: 'Need for Speed/bin/d3d9.dll'
  },
  {
    name: 'Need for Speed/bin64/speed.exe',
    size: 9_000_000
  },
  {
    name: 'Need for Speed/bin64/dxgi.dll'
  }
]
// Nothing next to the exe that Wine would have to be told about
const VANILLA: MockEntry[] = [
  {
    name: 'Need for Speed/'
  },
  {
    name: 'Need for Speed/speed.exe',
    size: 8_000_000
  }
]
// The data of a game with the exe left out of the archive
const NO_EXECUTABLES: MockEntry[] = [
  {
    name: 'Need for Speed/'
  },
  {
    name: 'Need for Speed/data/cars.viv',
    size: 30_000_000
  }
]

// The form over a game of its own, with the archive read the way a drop reads it
async function setup(archive = sampleArchive(), props?: GameFormProps) {
  const context = new InjectionContext()
  const game = inject(Game$, context)

  render(() => context$(context)(GameForm(props)))
  game.$file(archive)
  await waitTasks(game.$archive)

  return game
}

function titleBox() {
  return screen.getByRole<HTMLInputElement>('textbox', {
    name: 'Title in the library'
  })
}

function exeSelect() {
  return screen.getByRole<HTMLSelectElement>('combobox', {
    name: 'Executable to launch'
  })
}

function exeLabels() {
  return Array.from(exeSelect().options, item => item.textContent)
}

function overrideBox() {
  return screen.getByRole<HTMLInputElement>('checkbox', {
    name: /^The game has mods - override the wrapper DLLs/
  })
}

describe('blocks', () => {
  describe('GameForm', () => {
    it('should prefill the title from the archive name', async () => {
      await setup()

      expect(titleBox().value).toBe('Need for Speed')
    })

    it('should write the typed title to the game', async () => {
      const { $name } = await setup()

      fireEvent.input(titleBox(), {
        target: {
          value: 'NFS'
        }
      })

      expect($name()).toBe('NFS')
    })

    it('should describe the title and the save folders with their hints', async () => {
      await setup()

      expect(screen.getByRole('textbox', {
        description: 'Guessed from the folders in the archive, or from its name. Changing it re-sorts the executables below.'
      })).toBe(titleBox())
      expect(screen.getByRole('textbox', {
        description: 'Left alone when installing over an existing copy, and created empty on a clean one.'
      })).toBe(screen.getByRole('textbox', {
        name: 'Folders holding saves and settings'
      }))
    })

    it('should list every executable, best first', async () => {
      await setup()

      expect(exeLabels()).toEqual([
        'speed.exe · 8.0 MB · score 90',
        'unins000.exe · 300 KB · score -69',
        'redist/vcredist_x86.exe · 5.0 MB · score -147'
      ])
    })

    it('should show the executable the game has chosen', async () => {
      const { $exePath } = await setup()

      $exePath('Need for Speed/unins000.exe')

      expect(exeSelect().value).toBe('Need for Speed/unins000.exe')
    })

    it('should write the chosen executable to the game', async () => {
      const { $exePath } = await setup()

      fireEvent.change(exeSelect(), {
        target: {
          value: 'Need for Speed/unins000.exe'
        }
      })

      expect($exePath()).toBe('Need for Speed/unins000.exe')
    })

    it('should explain the ranking under the executables', async () => {
      await setup()

      expect(screen.getByRole('combobox', {
        description: 'Ranked by how much each one looks like the game. Nothing is hidden, only pushed down.'
      })).toBe(exeSelect())
    })

    it('should say so when the archive has no executable', async () => {
      await setup(sampleArchive('Need for Speed.zip', NO_EXECUTABLES))

      expect(exeLabels()).toEqual([])
      expect(screen.getByRole('combobox', {
        description: 'No .exe was found in this archive.'
      })).toBe(exeSelect())
    })

    it('should re-sort the executables as the title changes', async () => {
      await setup(sampleArchive('Need for Speed.zip', RIVALS))

      fireEvent.input(titleBox(), {
        target: {
          value: 'NFS'
        }
      })

      expect(exeLabels()).toEqual([
        'nfs.exe · 8.0 MB · score 90',
        'speed.exe · 8.0 MB · score 50'
      ])
    })

    it('should keep the chosen executable while the list re-sorts', async () => {
      await setup(sampleArchive('Need for Speed.zip', RIVALS))

      fireEvent.input(titleBox(), {
        target: {
          value: 'NFS'
        }
      })
      // The select settles on its value once the moved options have landed
      await Promise.resolve()

      expect(exeSelect().value).toBe('Need for Speed/speed.exe')
      // What the human sees chosen is that very exe, not whichever took its place
      expect(exeSelect().selectedOptions[0]?.textContent).toBe('speed.exe · 8.0 MB · score 50')
    })

    it('should fold the prefix, the save folders and the mods away, leaving the title and the exe in sight', async () => {
      await setup()

      const advanced = screen.getByText('Advanced settings').closest('details')!

      expect(advanced.open).toBe(false)
      expect(advanced.contains(screen.getByRole('combobox', {
        name: 'Prefix architecture'
      }))).toBe(true)
      expect(advanced.contains(screen.getByRole('textbox', {
        name: 'Folders holding saves and settings'
      }))).toBe(true)
      expect(advanced.contains(screen.getByText(/^Found next to the exe/))).toBe(true)
      expect(advanced.contains(overrideBox())).toBe(true)
      expect(advanced.contains(titleBox())).toBe(false)
      expect(advanced.contains(exeSelect())).toBe(false)
    })

    it('should write the chosen prefix architecture to the game', async () => {
      const { $prefixArch } = await setup()
      const arch = screen.getByRole<HTMLSelectElement>('combobox', {
        name: 'Prefix architecture'
      })

      expect(arch.value).toBe('win32')

      fireEvent.change(arch, {
        target: {
          value: 'win64'
        }
      })

      expect($prefixArch()).toBe('win64')
    })

    it('should write the folders holding saves to the game', async () => {
      const { $userData } = await setup()
      const folders = screen.getByRole<HTMLInputElement>('textbox', {
        name: 'Folders holding saves and settings'
      })

      expect(folders.value).toBe('SAVES')

      fireEvent.input(folders, {
        target: {
          value: 'SAVES, Saved Games'
        }
      })

      expect($userData()).toBe('SAVES, Saved Games')
    })

    it('should spell out what was found next to the exe', async () => {
      await setup()

      expect(screen.getByText('Found next to the exe: d3d9, plus 1 .asi module and a SCRIPTS folder.')).toBeDefined()
    })

    it('should show the launch options while the override is ticked', async () => {
      await setup()

      expect(overrideBox().checked).toBe(true)
      expect(screen.getByText(LAUNCH_OPTIONS)).toBeDefined()
    })

    it('should drop the launch options once the override is unticked', async () => {
      const { $overrideWrappers } = await setup()
      const launchOptions = screen.getByText(LAUNCH_OPTIONS)

      fireEvent.click(overrideBox())

      expect($overrideWrappers()).toBe(false)
      // Gone, not just emptied: an empty box of code would still be on screen
      expect(launchOptions.isConnected).toBe(false)
    })

    it('should explain the override whether it is ticked or not', async () => {
      await setup()

      expect(screen.getByText(OVERRIDE_HINT)).toBeDefined()

      fireEvent.click(overrideBox())

      expect(screen.getByText(NO_OVERRIDE_HINT)).toBeDefined()
      expect(screen.queryByText(OVERRIDE_HINT)).toBeNull()
    })

    it('should keep the hint with the override box, whether it is ticked or not', async () => {
      await setup()

      expect(screen.getByText(OVERRIDE_HINT).closest('label')?.control).toBe(overrideBox())

      fireEvent.click(overrideBox())

      expect(screen.getByText(NO_OVERRIDE_HINT).closest('label')?.control).toBe(overrideBox())
    })

    it('should leave the override out when nothing sits next to the exe', async () => {
      await setup(sampleArchive('Need for Speed.zip', VANILLA))

      expect(screen.queryByRole('checkbox')).toBeNull()
      expect(screen.queryByText(/^Found next to the exe/)).toBeNull()
    })

    it('should name the wrappers next to the chosen executable', async () => {
      await setup(sampleArchive('Need for Speed.zip', TWO_BUILDS))

      expect(screen.getByText('Found next to the exe: dxgi.')).toBeDefined()

      fireEvent.change(exeSelect(), {
        target: {
          value: 'Need for Speed/bin/speed.exe'
        }
      })

      expect(screen.getByText('Found next to the exe: d3d9.')).toBeDefined()
      expect(screen.getByText(LAUNCH_OPTIONS)).toBeDefined()
    })

    it('should leave the override out once the chosen executable has no wrappers', async () => {
      await setup()

      fireEvent.change(exeSelect(), {
        target: {
          value: 'Need for Speed/redist/vcredist_x86.exe'
        }
      })

      expect(screen.queryByRole('checkbox')).toBeNull()
    })

    it('should keep the class passed by the consumer', async () => {
      await setup(sampleArchive(), {
        class: 'outer'
      })

      expect(titleBox().closest('.outer')?.classList.contains(styles.root)).toBe(true)
    })

    it('should hand the other attributes to its root', async () => {
      await setup(sampleArchive(), {
        title: 'outer'
      })

      expect(titleBox().closest(`.${styles.root}`)?.getAttribute('title')).toBe('outer')
    })
  })
})
