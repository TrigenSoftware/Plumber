import {
  describe,
  it,
  expect
} from 'vitest'
import type { ZipEntry } from '~/services/zip'
import {
  buildRecipe,
  guessTitle,
  slugify
} from './recipe.ts'

// A listing with these paths, under the prefix they all share
function listing(commonPrefix: string, ...paths: string[]) {
  return {
    commonPrefix,
    entries: paths.map((path): ZipEntry => ({
      path: commonPrefix + path,
      size: 1,
      directory: path.endsWith('/')
    }))
  }
}

const INPUT = {
  name: 'Need for Speed: Most Wanted',
  exe: 'Need for Speed Most Wanted/speed.exe',
  prefixArch: 'win32' as const,
  userData: ['SAVES'],
  dllOverrides: ['dinput8'],
  controllerLayout: '3036980641'
}

describe('services', () => {
  describe('recipe', () => {
    describe('slugify', () => {
      it('should make a folder name that survives a Linux filesystem', () => {
        expect(slugify('Need for Speed: Most Wanted')).toBe('need-for-speed-most-wanted')
      })

      it('should fall back to a name when nothing usable is left', () => {
        expect(slugify('«»')).toBe('game')
      })
    })

    describe('guessTitle', () => {
      it('should take the folder the game was zipped in over the name of the archive', () => {
        expect(guessTitle('nfs_backup.zip', listing('Need for Speed Most Wanted/', 'speed.exe'))).toBe('Need for Speed Most Wanted')
      })

      it('should take the deepest folder of the prefix', () => {
        expect(guessTitle('game.zip', listing('steamapps/common/Hollow Knight/', 'hollow_knight.exe'))).toBe('Hollow Knight')
      })

      it('should pass over folders that name no game', () => {
        expect(guessTitle('game.zip', listing('Need for Speed/bin/', 'speed.exe'))).toBe('Need for Speed')
      })

      it('should pass over a folder named after a version', () => {
        expect(guessTitle('Need_for_Speed.zip', listing('v1.2.3/', 'speed.exe'))).toBe('Need for Speed')
      })

      it('should take the name of a Unity build without a folder to go by', () => {
        expect(guessTitle('game.zip', listing(
          '',
          'UnityCrashHandler64.exe',
          'Hollow Knight.exe',
          'Hollow Knight_Data/resources.assets'
        ))).toBe('Hollow Knight')
      })

      it('should take the name of a Unity build over a folder that names no game', () => {
        expect(guessTitle('game.zip', listing(
          'Game/',
          'hollow_knight.exe',
          'hollow_knight_Data/'
        ))).toBe('hollow knight')
      })

      it('should take the shallowest Unity build', () => {
        expect(guessTitle('game.zip', listing(
          '',
          'Tools/Mod Manager.exe',
          'Tools/Mod Manager_Data/app.info',
          'Hollow Knight.exe',
          'Hollow Knight_Data/app.info'
        ))).toBe('Hollow Knight')
      })

      it('should not take an exe for a Unity build without its data folder', () => {
        expect(guessTitle('Need_for_Speed.zip', listing('', 'speed.exe', 'data/cars.viv'))).toBe('Need for Speed')
      })

      it('should not take a Unity build that names no game', () => {
        expect(guessTitle('Need_for_Speed.zip', listing('', 'Game.exe', 'Game_Data/app.info'))).toBe('Need for Speed')
      })

      it('should fall back to the name of the archive, its separators tidied', () => {
        expect(guessTitle('Need_for_Speed.zip', listing('', 'speed.exe'))).toBe('Need for Speed')
      })

      it('should keep the dots of a name with spaces', () => {
        expect(guessTitle('Mr. Prepper.zip', listing('', 'prepper.exe'))).toBe('Mr. Prepper')
        expect(guessTitle('game.zip', listing('S.T.A.L.K.E.R. Clear Sky/', 'xrEngine.exe'))).toBe('S.T.A.L.K.E.R. Clear Sky')
      })
    })

    describe('buildRecipe', () => {
      it('should carry the overrides the human settled on', () => {
        expect(buildRecipe(INPUT).dll_overrides).toEqual(['dinput8'])
      })

      it('should keep an empty list when the box was unticked', () => {
        const recipe = buildRecipe({
          ...INPUT,
          dllOverrides: []
        })

        // Empty is a decision, not a missing value: the installer reads it as
        // "override nothing" rather than falling back to its own detection.
        expect(recipe.dll_overrides).toEqual([])
      })

      it('should carry the Workshop ID of the controller layout, or null for none', () => {
        expect(buildRecipe(INPUT).controller_layout).toBe('3036980641')
        expect(buildRecipe({
          ...INPUT,
          controllerLayout: null
        }).controller_layout).toBeNull()
      })

      it('should use the key names the installer reads', () => {
        expect(Object.keys(buildRecipe(INPUT))).toEqual([
          'name',
          'slug',
          'exe',
          'prefix_arch',
          'user_data',
          'dll_overrides',
          'controller_layout',
          'generator'
        ])
      })
    })
  })
})
