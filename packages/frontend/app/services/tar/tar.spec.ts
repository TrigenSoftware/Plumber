import {
  describe,
  it,
  expect
} from 'vitest'
import {
  gunzip,
  gzip,
  tar
} from './tar.ts'

const ascii = new TextDecoder()

/**
 * Reads back what the writer produced, so the test checks bytes, not intent.
 *
 * @returns Entry name to contents.
 */
function untar(archive: Uint8Array) {
  const out: Record<string, string> = {}
  let at = 0

  while (at + 512 <= archive.byteLength) {
    const head = archive.subarray(at, at + 512)

    if (head.every(byte => byte === 0)) {
      break
    }

    const name = ascii.decode(head.subarray(0, 100)).replace(/\0.*$/, '')
    const size = parseInt(ascii.decode(head.subarray(124, 136)).replace(/\0.*$/, '').trim(), 8)
    const stored = ascii.decode(head.subarray(148, 154))
    const expected = head.reduce((total, byte, index) => {
      const inChecksumField = index >= 148 && index < 156

      return total + (inChecksumField ? 0x20 : byte)
    }, 0)

    expect(parseInt(stored, 8)).toBe(expected)

    out[name] = ascii.decode(archive.subarray(at + 512, at + 512 + size))
    at += 512 + Math.ceil(size / 512) * 512
  }

  return out
}

describe('services', () => {
  describe('tar', () => {
    it('should write files that read back with their contents', () => {
      const archive = tar([
        {
          path: './setup.sh',
          data: new TextEncoder().encode('#!/bin/sh\n')
        },
        {
          path: './art/portrait.png',
          data: new Uint8Array([1, 2, 3])
        }
      ])

      expect(untar(archive)['./setup.sh']).toBe('#!/bin/sh\n')
      expect(untar(archive)['./art/portrait.png']).toHaveLength(3)
    })

    it('should mark entries without data as directories', () => {
      const archive = tar([{
        path: './art'
      }])

      expect(ascii.decode(archive.subarray(0, 6))).toBe('./art/')
      expect(archive[156]).toBe(0x35)
    })

    it('should end with two zero blocks', () => {
      const archive = tar([{
        path: './a',
        data: new Uint8Array(1)
      }])

      expect(archive.subarray(archive.byteLength - 1024).every(byte => byte === 0)).toBe(true)
    })

    it('should produce the same bytes for the same input', () => {
      const once = tar([{
        path: './a',
        data: new Uint8Array([7])
      }])
      const twice = tar([{
        path: './a',
        data: new Uint8Array([7])
      }])

      expect(once).toEqual(twice)
    })

    it('should reject a path that does not fit a ustar header', () => {
      expect(() => tar([{
        path: `./${'x'.repeat(120)}`,
        data: new Uint8Array(0)
      }]))
        .toThrow('too long')
    })

    describe('gzip', () => {
      it('should produce a stream that decompresses back to the input', async () => {
        const source = tar([{
          path: './recipe.json',
          data: new TextEncoder().encode('{}')
        }])
        const packed = await gzip(source)

        expect(await gunzip(packed)).toEqual(source)
      })
    })
  })
})
