import {
  vi,
  describe,
  it,
  expect,
  afterEach
} from 'vitest'
import {
  STORE_UNMOUNT_DELAY,
  InjectionContext,
  inject,
  start,
  waitTasks
} from '@nano_kit/store'
import {
  type MockEntry,
  makeZip
} from '~/services/zip/zip.mock'
import {
  Game$,
  userDataList
} from './game.ts'

const ENTRIES: MockEntry[] = [
  {
    name: 'Need for Speed/'
  },
  {
    name: 'Need for Speed/speed.exe',
    size: 8_000_000
  },
  {
    name: 'Need for Speed/d3d9.dll'
  },
  {
    name: 'Need for Speed/scripts/widescreen.asi'
  },
  {
    name: 'Need for Speed/unins000.exe',
    size: 300_000
  },
  {
    name: 'Need for Speed/redist/vcredist_x86.exe',
    size: 5_000_000
  }
]
const NOT_A_ZIP = 'This file is not a zip archive: no end-of-central-directory record.'

function archiveOf(name = 'Need for Speed.zip', entries = ENTRIES) {
  return new File([makeZip(entries)], name)
}

function notAZip() {
  return new File(['just some notes'], 'notes.zip')
}

// The fields of the form on screen, the way the page shows them
const stops: (() => void)[] = []

function showForm(game: ReturnType<typeof createGame>) {
  stops.push(start(game.$name), start(game.$exePath))
}

function hideForm() {
  vi.useFakeTimers()
  stops.splice(0).forEach(stop => stop())
  // The store lets go of a signal a moment after its last reader leaves
  vi.advanceTimersByTime(STORE_UNMOUNT_DELAY)
  vi.useRealTimers()
}

function createGame() {
  const game = inject(Game$, new InjectionContext())

  showForm(game)

  return game
}

async function loaded(file = archiveOf()) {
  const game = createGame()

  game.$file(file)
  await waitTasks(game.$archive)

  return game
}

describe('stores', () => {
  describe('game', () => {
    describe('userDataList', () => {
      it('should keep a folder name that contains a space', () => {
        // Splitting on whitespace turned "Saved Games" into two folders that do
        // not exist, and the real one was overwritten on the next install (5.1).
        expect(userDataList('Saved Games, SAVES')).toEqual(['Saved Games', 'SAVES'])
      })

      it('should drop empty entries and stray spacing', () => {
        expect(userDataList(' SAVES ,, ')).toEqual(['SAVES'])
      })

      it('should return nothing for an empty field', () => {
        expect(userDataList('')).toEqual([])
      })
    })

    describe('Game$', () => {
      afterEach(hideForm)

      it('should start without an archive and with the form defaults', () => {
        const game = createGame()

        expect(game.$archive()).toBeNull()
        expect(game.$name()).toBe('')
        expect(game.$prefixArch()).toBe('win32')
        expect(game.$userDataList()).toEqual(['SAVES'])
        expect(game.$overrideWrappers()).toBe(true)
        expect(game.$candidates()).toEqual([])
        expect(game.$modSigns()).toEqual({
          asi: 0,
          scripts: false
        })
        expect(game.$launchOptions()).toBe('')
      })

      it('should say it is reading until the archive is read', async () => {
        const game = createGame()

        game.$file(archiveOf())

        expect(game.$reading()).toBe(true)

        await waitTasks(game.$archive)

        expect(game.$reading()).toBe(false)
      })

      it('should prefill the title and pick the best exe once the archive is read', async () => {
        const file = archiveOf()
        const game = await loaded(file)

        expect(game.$archive()).toBe(file)
        expect(game.$zip()?.entries).toHaveLength(ENTRIES.length)
        expect(game.$name()).toBe('Need for Speed')
        expect(game.$candidates().map(candidate => candidate.label)).toEqual([
          'speed.exe',
          'unins000.exe',
          'redist/vcredist_x86.exe'
        ])
        expect(game.$exePath()).toBe('Need for Speed/speed.exe')
        expect(game.$selected()?.path).toBe('Need for Speed/speed.exe')
        expect(game.$error()).toBeNull()
      })

      it('should re-rank the executables as the title changes and keep the one chosen', async () => {
        const game = await loaded(archiveOf('Game.zip', [
          {
            name: 'game/speed.exe',
            size: 1_000
          },
          {
            name: 'game/hp2.exe',
            size: 1_000
          }
        ]))

        game.$name('Need for Speed')

        expect(game.$candidates()[0]?.path).toBe('game/speed.exe')

        game.$exePath('game/speed.exe')
        game.$name('HP2')

        expect(game.$candidates()[0]?.path).toBe('game/hp2.exe')
        expect(game.$selected()?.path).toBe('game/speed.exe')
      })

      it('should offer an exe the archive lists twice once, at its better rank', async () => {
        const game = await loaded(archiveOf('Game.zip', [
          {
            name: 'Game/game.exe',
            size: 5_000
          },
          {
            name: 'Game/game.exe',
            size: 1_000
          },
          {
            name: 'Game/tool.exe',
            size: 2_000
          }
        ]))

        expect(game.$candidates().map(candidate => [candidate.path, candidate.size])).toEqual([
          ['Game/game.exe', 5_000],
          ['Game/tool.exe', 2_000]
        ])
        expect(game.$selected()?.size).toBe(5_000)
      })

      it('should find the wrapper DLLs and other signs of mods next to the chosen exe', async () => {
        const game = await loaded()

        expect(game.$wrappers()).toEqual(['d3d9'])
        expect(game.$modSigns()).toEqual({
          asi: 1,
          scripts: true
        })
        expect(game.$launchOptions()).toBe('WINEDLLOVERRIDES="d3d9=n,b" %command%')
      })

      it('should find no wrappers for an exe in another folder', async () => {
        const game = await loaded()

        game.$exePath('Need for Speed/redist/vcredist_x86.exe')

        expect(game.$wrappers()).toEqual([])
        expect(game.$launchOptions()).toBe('')
      })

      it('should override nothing once the box is unticked', async () => {
        const game = await loaded()

        game.$overrideWrappers(false)

        expect(game.$wrappers()).toEqual(['d3d9'])
        expect(game.$overrides()).toEqual([])
        expect(game.$launchOptions()).toBe('')
      })

      it('should list the folders typed into the user data field', () => {
        const game = createGame()

        game.$userData('Saved Games, SAVES')

        expect(game.$userDataList()).toEqual(['Saved Games', 'SAVES'])
      })

      it('should report a file that is not a zip', async () => {
        const game = createGame()

        game.$file(notAZip())
        await waitTasks(game.$archive)

        expect(game.$error()).toBe(NOT_A_ZIP)
        expect(game.$reading()).toBe(false)
        expect(game.$archive()).toBeNull()
      })

      it('should keep the archive it has when the next file cannot be read', async () => {
        const file = archiveOf()
        const game = await loaded(file)

        game.$file(notAZip())
        await waitTasks(game.$archive)

        expect(game.$archive()).toBe(file)
        expect(game.$error()).toBe(NOT_A_ZIP)
      })

      it('should throw away an archive whose read a newer drop overtook', async () => {
        const game = createGame()

        game.$file(archiveOf())
        game.$file(notAZip())
        await waitTasks(game.$archive)

        expect(game.$archive()).toBeNull()
        expect(game.$error()).toBe(NOT_A_ZIP)
      })

      it('should not report the failure of a read a newer drop overtook', async () => {
        const file = archiveOf()
        const game = createGame()

        game.$file(notAZip())
        game.$file(file)
        await waitTasks(game.$archive)

        expect(game.$archive()).toBe(file)
        expect(game.$error()).toBeNull()
      })

      it('should not bring an archive back when changed while it is read', async () => {
        const game = createGame()

        game.$file(archiveOf())
        game.$file(null)
        await waitTasks(game.$archive)

        expect(game.$archive()).toBeNull()
        expect(game.$reading()).toBe(false)
      })

      it('should drop the archive and its exe but keep the rest of the form when changed', async () => {
        const game = await loaded()

        game.$prefixArch('win64')
        game.$userData('Saved Games')
        game.$overrideWrappers(false)
        game.$file(null)

        expect(game.$archive()).toBeNull()
        expect(game.$zip()).toBeNull()
        expect(game.$exePath()).toBe('')
        expect(game.$candidates()).toEqual([])
        expect(game.$selected()).toBeNull()
        expect(game.$wrappers()).toEqual([])
        expect(game.$name()).toBe('Need for Speed')
        expect(game.$prefixArch()).toBe('win64')
        expect(game.$userData()).toBe('Saved Games')
        expect(game.$overrideWrappers()).toBe(false)
      })

      it('should leave mapping off at first', () => {
        const game = createGame()

        expect(game.$mapController()).toBe(false)
        expect(game.$layoutMissing()).toBe(false)
      })

      it('should find the layout in the link pasted while mapping is on', () => {
        const game = createGame()

        game.$mapController(true)
        game.$layoutLink('https://www.steaminputdb.com/config/3036980641')

        expect(game.$layoutId()).toBe('3036980641')
        expect(game.$layoutInvalid()).toBe(false)
        expect(game.$layoutMissing()).toBe(false)
      })

      it('should give no layout while mapping is off, whatever the field holds', () => {
        const game = createGame()

        game.$layoutLink('https://www.steaminputdb.com/config/3036980641')

        expect(game.$layoutId()).toBeNull()
        expect(game.$layoutMissing()).toBe(false)
      })

      it('should wait for a layout once mapping is on', () => {
        const game = createGame()

        game.$mapController(true)

        expect(game.$layoutMissing()).toBe(true)
      })

      it('should tell text that is not a link to a layout from an empty field', () => {
        const game = createGame()

        expect(game.$layoutInvalid()).toBe(false)

        game.$mapController(true)
        game.$layoutLink('Deus Ex Steam Deck Perfection')

        expect(game.$layoutId()).toBeNull()
        expect(game.$layoutInvalid()).toBe(true)
        expect(game.$layoutMissing()).toBe(true)
      })

      it('should drop the mapping set up for the last game when another archive comes', async () => {
        const game = await loaded()

        game.$mapController(true)
        game.$layoutLink('https://www.steaminputdb.com/config/3036980641')
        game.$file(archiveOf('Hot Pursuit 2.zip'))
        await waitTasks(game.$archive)

        expect(game.$mapController()).toBe(false)
        expect(game.$layoutLink()).toBe('')
      })

      it('should leave the form alone while nothing shows it', async () => {
        const game = createGame()

        hideForm()
        game.$file(archiveOf())
        // Read for the summary of the archive, which is on screen still
        stops.push(start(game.$archive))
        await waitTasks(game.$archive)

        expect(game.$name()).toBe('')
        expect(game.$exePath()).toBe('')
      })

      it('should fill the form in from the archive once it is shown', async () => {
        const game = createGame()

        hideForm()
        game.$file(archiveOf())
        stops.push(start(game.$archive))
        await waitTasks(game.$archive)
        showForm(game)

        expect(game.$name()).toBe('Need for Speed')
        expect(game.$exePath()).toBe('Need for Speed/speed.exe')
      })

      it('should keep what the human typed when the form is shown again', async () => {
        const game = await loaded()

        game.$name('NFS')
        game.$exePath('Need for Speed/unins000.exe')
        hideForm()
        showForm(game)

        expect(game.$name()).toBe('NFS')
        expect(game.$exePath()).toBe('Need for Speed/unins000.exe')
      })
    })
  })
})
