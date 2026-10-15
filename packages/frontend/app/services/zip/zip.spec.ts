import {
  describe,
  it,
  expect
} from 'vitest'
import { makeZip } from './zip.mock.ts'
import { readZip } from './zip.ts'

describe('services', () => {
  describe('zip', () => {
    describe('readZip', () => {
      it('should list every entry with its uncompressed size', async () => {
        const info = await readZip(makeZip([
          {
            name: 'game/speed.exe',
            size: 6029312
          },
          {
            name: 'game/server.dll',
            size: 1024
          }
        ]))

        expect(info.entries).toEqual([
          {
            path: 'game/speed.exe',
            size: 6029312,
            directory: false
          },
          {
            path: 'game/server.dll',
            size: 1024,
            directory: false
          }
        ])
      })

      it('should mark entries that end with a slash as directories', async () => {
        const info = await readZip(makeZip([{
          name: 'game/SAVES/'
        }]))

        expect(info.entries[0].directory).toBe(true)
      })

      it('should report the directory every entry sits under', async () => {
        const info = await readZip(makeZip([
          {
            name: 'Need for Speed Most Wanted/'
          },
          {
            name: 'Need for Speed Most Wanted/speed.exe',
            size: 10
          },
          {
            name: 'Need for Speed Most Wanted/SCRIPTS/mod.asi',
            size: 10
          }
        ]))

        expect(info.commonPrefix).toBe('Need for Speed Most Wanted/')
      })

      it('should report no common prefix when something sits at the root', async () => {
        const info = await readZip(makeZip([
          {
            name: 'game/speed.exe',
            size: 10
          },
          {
            name: 'readme.txt',
            size: 10
          }
        ]))

        expect(info.commonPrefix).toBe('')
      })

      it('should read sizes from the Zip64 extra field when the plain field overflowed', async () => {
        const info = await readZip(makeZip([
          {
            name: 'game/huge.bin',
            size: 5_000_000_000
          }
        ], {
          zip64: true
        }))

        expect(info.zip64).toBe(true)
        expect(info.entries[0].size).toBe(5_000_000_000)
      })

      it('should still find the Zip64 record behind a maximum-length comment', async () => {
        // The locator sits 20 bytes in front of the EOCD. With a 65535-byte
        // comment a tail sized to the EOCD alone starts right at the EOCD, and
        // the locator falls outside it - the archive then reads back empty (6.1).
        const info = await readZip(makeZip([
          {
            name: 'game/huge.bin',
            size: 5_000_000_000
          }
        ], {
          zip64: true,
          comment: 0xffff
        }))

        expect(info.zip64).toBe(true)
        expect(info.entries[0].size).toBe(5_000_000_000)
      })

      it('should decode names as UTF-8 when the flag is set', async () => {
        const info = await readZip(makeZip([{
          name: 'ゲーム/スピード.exe',
          size: 10
        }]))

        expect(info.entries[0].path).toBe('ゲーム/スピード.exe')
        expect(info.mangledNames).toBe(false)
      })

      it('should flag non-ascii names packed without the UTF-8 flag', async () => {
        const info = await readZip(makeZip([
          {
            name: new Uint8Array([0xa8, 0xa3, 0xe0, 0xa0, 0x2e, 0x65, 0x78, 0x65]),
            utf8: false
          }
        ]))

        expect(info.mangledNames).toBe(true)
      })

      it('should throw when the file is not a zip', async () => {
        await expect(readZip(new File([new Uint8Array(100)], 'x.bin')))
          .rejects.toThrow('not a zip archive')
      })
    })
  })
})
