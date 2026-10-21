import {
  describe,
  it,
  expect
} from 'vitest'
import { preflight } from './checks.ts'

const CLEAN = {
  archiveSize: 1000,
  mangledNames: false,
  exeCount: 3,
  selectedScore: 90,
  filledSlots: 5,
  totalSlots: 5,
  storageAvailable: 1_000_000
}

describe('services', () => {
  describe('checks', () => {
    describe('preflight', () => {
      it('should stay quiet when everything is in order', () => {
        expect(preflight(CLEAN)).toEqual([])
      })

      it('should warn when the archive holds no exe', () => {
        const [check] = preflight({
          ...CLEAN,
          exeCount: 0
        })

        expect(check.message).toContain('no .exe')
      })

      it('should suggest repacking when names are not marked as UTF-8', () => {
        const messages = preflight({
          ...CLEAN,
          mangledNames: true
        }).map(check => check.message)

        expect(messages.join(' ')).toContain('7-Zip')
      })

      it('should warn about FAT32 once the archive reaches 4 GiB, and point to exFAT', () => {
        const messages = preflight({
          ...CLEAN,
          archiveSize: 4 * 1024 ** 3
        }).map(check => check.message)

        expect(messages.join(' ')).toContain('too big for a drive formatted as FAT32')
        expect(messages.join(' ')).toContain('Use one formatted as exFAT')
      })

      it('should leave an archive of 4 GB in decimal units alone: FAT32 holds it', () => {
        const messages = preflight({
          ...CLEAN,
          archiveSize: 4_000_000_000
        }).map(check => check.message)

        expect(messages.join(' ')).not.toContain('FAT32')
      })

      it('should warn when the browser has less free space than the archive', () => {
        const messages = preflight({
          ...CLEAN,
          archiveSize: 2_000_000,
          storageAvailable: 1_000
        }).map(check => check.message)

        expect(messages.join(' ')).toContain('free space')
      })

      it('should say nothing about space when the quota is unknown', () => {
        expect(preflight({
          ...CLEAN,
          storageAvailable: null
        })).toEqual([])
      })

      it('should note an exe that scored below zero without blocking it', () => {
        const checks = preflight({
          ...CLEAN,
          selectedScore: -10
        })

        expect(checks).toHaveLength(1)
        expect(checks[0].level).toBe('note')
      })

      it('should count the empty artwork slots', () => {
        const [check] = preflight({
          ...CLEAN,
          filledSlots: 2
        })

        expect(check.message).toContain('3 of 5')
      })
    })
  })
})
