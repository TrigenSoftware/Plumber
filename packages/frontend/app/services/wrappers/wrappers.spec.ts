import {
  describe,
  it,
  expect
} from 'vitest'
import type { ZipEntry } from '~/services/zip'
import {
  detectModSigns,
  detectWrappers,
  launchOptionsFor
} from './wrappers.ts'

const entry = (path: string): ZipEntry => ({
  path,
  size: 0,
  directory: false
})

describe('services', () => {
  describe('wrappers', () => {
    describe('detectWrappers', () => {
      it('should find a wrapper next to the exe and leave the game library alone', () => {
        const found = detectWrappers([
          entry('game/speed.exe'),
          entry('game/dinput8.dll'),
          entry('game/server.dll')
        ], 'game/speed.exe')

        expect(found).toEqual(['dinput8'])
      })

      it('should ignore wrappers that sit in another folder', () => {
        const found = detectWrappers([
          entry('game/speed.exe'),
          entry('game/plugins/d3d9.dll')
        ], 'game/speed.exe')

        expect(found).toEqual([])
      })
    })

    describe('detectModSigns', () => {
      it('should count asi modules and spot the scripts folder', () => {
        const signs = detectModSigns([
          entry('game/speed.exe'),
          entry('game/SCRIPTS/widescreen.asi'),
          entry('game/SCRIPTS/hud.asi')
        ], 'game/speed.exe')

        expect(signs).toEqual({
          asi: 2,
          scripts: true
        })
      })
    })

    describe('launchOptionsFor', () => {
      it('should build the override line that fixed the live game', () => {
        expect(launchOptionsFor(['dinput8']))
          .toBe('WINEDLLOVERRIDES="dinput8=n,b" %command%')
      })

      it('should stay empty when nothing was found', () => {
        expect(launchOptionsFor([])).toBe('')
      })
    })
  })
})
