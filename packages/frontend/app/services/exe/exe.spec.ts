import {
  describe,
  it,
  expect
} from 'vitest'
import type { ZipEntry } from '~/services/zip'
import { rankExes } from './exe.ts'

const PREFIX = 'Need for Speed Most Wanted/'
const entry = (path: string, size = 0): ZipEntry => ({
  path,
  size,
  directory: false
})
/** The archive the scoring rules were first checked against (7.2.1). */
const NFSMW = [
  entry(`${PREFIX}speed.exe`, 6029312),
  entry(`${PREFIX}UNINSTALL/unins000.exe`, 2897087),
  entry(`${PREFIX}shell_inst.exe`, 40960),
  entry(`${PREFIX}safemode_inst.exe`, 40960),
  entry(`${PREFIX}server.dll`, 1024)
]

describe('services', () => {
  describe('exe', () => {
    describe('rankExes', () => {
      it('should pick the game as the default', () => {
        const ranked = rankExes(NFSMW, 'Need for Speed Most Wanted', PREFIX)

        expect(ranked[0].label).toBe('speed.exe')
        expect(ranked[0].score).toBe(90)
      })

      it('should push the uninstaller to the bottom', () => {
        const ranked = rankExes(NFSMW, 'Need for Speed Most Wanted', PREFIX)

        expect(ranked.at(-1)?.label).toBe('UNINSTALL/unins000.exe')
      })

      it('should penalise utilities whose name only ends with _inst', () => {
        const ranked = rankExes(NFSMW, 'Need for Speed Most Wanted', PREFIX)
        const shell = ranked.find(item => item.label === 'shell_inst.exe')

        expect(shell?.score).toBe(-10)
      })

      it('should list only exe files', () => {
        const ranked = rankExes(NFSMW, 'Need for Speed Most Wanted', PREFIX)

        expect(ranked.map(item => item.label)).not.toContain('server.dll')
      })

      it('should match a title that is not written in latin', () => {
        const ranked = rankExes([
          entry('game/bin/ゲーム.exe', 100),
          entry('game/Launcher.exe', 100)
        ], 'ゲーム', 'game/')

        expect(ranked[0].label).toBe('bin/ゲーム.exe')
        expect(ranked[0].reasons).toContain('+40 looks like the title')
      })

      it('should find an exe nested in a subfolder', () => {
        const ranked = rankExes([entry('game/Binaries/Win64/Shipping.exe', 100)], 'Shipping', 'game/')

        expect(ranked[0].label).toBe('Binaries/Win64/Shipping.exe')
      })

      it('should penalise anything inside a redist directory', () => {
        const ranked = rankExes([
          entry('game/_CommonRedist/vcredist_x64.exe', 100),
          entry('game/play.exe', 100)
        ], 'Play', 'game/')

        expect(ranked[0].label).toBe('play.exe')
      })

      it('should explain every part of the score', () => {
        const ranked = rankExes(NFSMW, 'Need for Speed Most Wanted', PREFIX)

        expect(ranked[0].reasons).toEqual([
          '+40 looks like the title',
          '+30 at the root',
          '+20 size'
        ])
      })
    })
  })
})
