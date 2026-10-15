import {
  vi,
  describe,
  it,
  expect,
  afterEach
} from 'vitest'
import {
  InjectionContext,
  effect,
  inject,
  start,
  waitTasks
} from '@nano_kit/store'
import type { ArtItem } from '~/services/artwork'
import { BLOCK_SIZE } from '~/shared/constants'
import { concat } from '~/shared/utils'
import {
  type MockEntry,
  makeZip
} from '~/services/zip/zip.mock'
import { Artwork$ } from './artwork.ts'
import { Build$ } from './build.ts'
import { Game$ } from './game.ts'

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
  }
]
const COVER: ArtItem = {
  slot: 'portrait',
  file: new File([new Uint8Array([1, 2, 3])], 'cover.png', {
    type: 'image/png'
  }),
  url: 'blob:cover',
  width: 600,
  height: 900,
  warnings: [],
  error: null
}
const decoder = new TextDecoder()

function archiveOf(name = 'Need for Speed.zip', entries = ENTRIES) {
  return new File([makeZip(entries)], name)
}

// The file the human picks: whatever is written to it stays in memory
function pickFile(name = 'need-for-speed.run') {
  const chunks: Uint8Array[] = []
  const handle = {
    name,
    createWritable: () => Promise.resolve(new WritableStream<Uint8Array>({
      write(chunk) {
        chunks.push(chunk.slice())
      }
    }))
  }
  const showSaveFilePicker = vi.fn(() => Promise.resolve(handle))

  vi.stubGlobal('showSaveFilePicker', showSaveFilePicker)

  return {
    handle,
    showSaveFilePicker,
    written: () => concat(chunks)
  }
}

// meta.tar.gz unpacked the way GNU gzip on SteamOS reads it: the decoder here
// takes the padding and the archive after the gzip stream for junk and errors,
// but only once it has handed out everything meta holds
async function unpackMeta(run: Uint8Array) {
  // Its writable side is declared as BufferSource, which does not line up with
  // a stream of Uint8Array
  const gunzip: GenericTransformStream = new DecompressionStream('gzip')
  const reader = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(run.subarray(BLOCK_SIZE))
      controller.close()
    }
  }).pipeThrough<Uint8Array>(gunzip).getReader()
  const chunks: Uint8Array[] = []

  try {
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      chunks.push(read.value)
    }
  } catch {}

  return concat(chunks)
}

// The files of a tar by name: a 512-byte header with the name and the octal
// size, then the data padded to whole 512-byte records
function filesOf(tar: Uint8Array) {
  const files = new Map<string, Uint8Array>()
  let at = 0

  // Zero records close the archive
  while (at + 512 <= tar.byteLength && tar[at] !== 0) {
    const name = decoder.decode(tar.subarray(at, at + 100)).replace(/\0.*$/s, '')
    const size = parseInt(decoder.decode(tar.subarray(at + 124, at + 136)), 8)

    files.set(name, tar.subarray(at + 512, at + 512 + size))
    at += 512 + Math.ceil(size / 512) * 512
  }

  return files
}

// The form and the build panel on screen, as they are while a build is set up
const stops: (() => void)[] = []

async function setup(file = archiveOf()) {
  const context = new InjectionContext()
  const game = inject(Game$, context)
  const artwork = inject(Artwork$, context)
  const build = inject(Build$, context)

  stops.push(start(game.$name), start(game.$exePath), start(build.$phase))
  game.$file(file)
  await waitTasks(game.$archive)

  return {
    game,
    artwork,
    build
  }
}

describe('stores', () => {
  describe('Build$', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
      stops.splice(0).forEach(stop => stop())
    })

    it('should not offer to build without an archive', () => {
      const build = inject(Build$, new InjectionContext())

      expect(build.$canBuild()).toBe(false)
    })

    it('should offer to build once the archive is read', async () => {
      const { build } = await setup()

      expect(build.$canBuild()).toBe(true)
    })

    it('should not offer to build without a title', async () => {
      const { game, build } = await setup()

      game.$name('   ')

      expect(build.$canBuild()).toBe(false)
    })

    it('should not offer to build without an exe', async () => {
      const { game, build } = await setup()

      game.$exePath('')

      expect(build.$canBuild()).toBe(false)
    })

    it('should not offer to build while an image breaks a hard rule', async () => {
      const { artwork, build } = await setup()

      artwork.$slots({
        logo: {
          ...COVER,
          slot: 'logo',
          error: 'A logo must have transparency, and a JPEG has none. Use a PNG.'
        }
      })

      expect(build.$canBuild()).toBe(false)
    })

    it('should ask for the file before anything is awaited', async () => {
      const { build } = await setup()
      const { showSaveFilePicker } = pickFile()

      build.build()

      // The user activation of the click is gone after the first await
      expect(showSaveFilePicker).toHaveBeenCalledWith({
        suggestedName: 'need-for-speed.run',
        types: [
          {
            description: 'Self-extracting installer',
            accept: {
              'application/x-sh': ['.run']
            }
          }
        ]
      })

      await waitTasks(build.$phase)
    })

    it('should be building and offer no second build while the picker is open', async () => {
      const { build } = await setup()

      pickFile()
      build.build()

      expect(build.$phase()).toBe('building')
      expect(build.$building()).toBe(true)
      expect(build.$canBuild()).toBe(false)

      await waitTasks(build.$phase)
    })

    it('should not start a second build while one runs', async () => {
      const { build } = await setup()
      const { showSaveFilePicker } = pickFile()

      build.build()
      build.build()

      expect(showSaveFilePicker).toHaveBeenCalledOnce()

      await waitTasks(build.$phase)
    })

    it('should not ask for a file while the title is blank', async () => {
      const { game, build } = await setup()
      const { showSaveFilePicker } = pickFile()

      game.$name('  ')
      build.build()

      expect(showSaveFilePicker).not.toHaveBeenCalled()
      expect(build.$phase()).toBe('idle')
    })

    it('should forget the last failure once another build starts', async () => {
      const { build } = await setup()

      build.build()
      await waitTasks(build.$phase)

      expect(build.$phase()).toBe('failed')

      pickFile()
      build.build()

      expect(build.$error()).toBeNull()

      await waitTasks(build.$phase)
    })

    it('should fail rather than stay building when something breaks as the build starts', async () => {
      const { build } = await setup()
      const stop = effect(() => {
        if (build.$phase() === 'building') {
          throw new Error('A view broke.')
        }
      })

      pickFile()
      build.build()
      await waitTasks(build.$phase)
      stop()

      expect(build.$phase()).toBe('failed')
      expect(build.$error()).toBe('A view broke.')
      expect(build.$canBuild()).toBe(true)
    })

    it('should write header, meta and the archive to the picked file and say where it went', async () => {
      const file = archiveOf()
      const { build } = await setup(file)
      const { written } = pickFile('nfs.run')

      build.build()
      await waitTasks(build.$phase)

      const run = written()
      const archive = new Uint8Array(await file.arrayBuffer())

      expect(build.$phase()).toBe('done')
      expect(build.$progress()).toBe(1)
      expect(build.$savedAs()).toBe('nfs.run')
      expect(build.$error()).toBeNull()
      expect(decoder.decode(run.subarray(0, 10))).toBe('#!/bin/sh\n')
      expect((run.byteLength - archive.byteLength) % BLOCK_SIZE).toBe(0)
      expect(run.subarray(run.byteLength - archive.byteLength)).toEqual(archive)
    })

    it('should pack the recipe the human settled on', async () => {
      const { game, build } = await setup()
      const { written } = pickFile()

      game.$name('  Need for Speed  ')
      game.$prefixArch('win64')
      game.$userData('Saved Games, SAVES')
      build.build()
      await waitTasks(build.$phase)

      const recipe = filesOf(await unpackMeta(written())).get('./recipe.json')

      expect(JSON.parse(decoder.decode(recipe))).toMatchObject({
        name: 'Need for Speed',
        exe: 'Need for Speed/speed.exe',
        prefix_arch: 'win64',
        user_data: ['Saved Games', 'SAVES'],
        dll_overrides: ['d3d9']
      })
    })

    it('should pack the artwork the build was started with', async () => {
      const { artwork, build } = await setup()
      const { written } = pickFile()

      artwork.$slots({
        portrait: COVER
      })
      build.build()
      artwork.$slots({})
      await waitTasks(build.$phase)

      expect(filesOf(await unpackMeta(written())).get('./art/portrait.png')).toEqual(new Uint8Array([1, 2, 3]))
    })

    it('should report the progress as the bytes go to disk', async () => {
      const { build } = await setup()
      const seen: number[] = []

      pickFile()

      const stop = effect(() => {
        seen.push(build.$progress())
      })

      build.build()
      await waitTasks(build.$phase)
      stop()

      expect(seen[0]).toBe(0)
      expect(seen.at(-1)).toBe(1)
      expect(seen.some(progress => progress > 0 && progress < 1)).toBe(true)
      expect(seen).toEqual(seen.toSorted((a, b) => a - b))
    })

    it('should go back to idle when the picker is dismissed', async () => {
      const { build } = await setup()
      const dismissed = new DOMException('The user aborted a request.', 'AbortError')

      vi.stubGlobal('showSaveFilePicker', () => Promise.reject(dismissed))
      build.build()
      await waitTasks(build.$phase)

      expect(build.$phase()).toBe('idle')
      expect(build.$error()).toBeNull()
    })

    it('should fail with the reason when the file cannot be written', async () => {
      const { build } = await setup()

      vi.stubGlobal('showSaveFilePicker', () => Promise.resolve({
        name: 'need-for-speed.run',
        createWritable: () => Promise.resolve(new WritableStream({
          write() {
            throw new Error('There is not enough space on the disk.')
          }
        }))
      }))
      build.build()
      await waitTasks(build.$phase)

      expect(build.$phase()).toBe('failed')
      expect(build.$error()).toBe('There is not enough space on the disk.')
    })

    it('should fail with the reason in a browser without the file picker', async () => {
      const { build } = await setup()

      build.build()
      await waitTasks(build.$phase)

      expect(build.$phase()).toBe('failed')
      expect(build.$error()).toContain('showSaveFilePicker')
    })

    it('should start over when the archive changes', async () => {
      const { game, build } = await setup()

      pickFile()
      build.build()
      await waitTasks(build.$phase)
      game.$file(null)

      expect(build.$phase()).toBe('idle')
      expect(build.$progress()).toBe(0)
      expect(build.$savedAs()).toBe('')
    })

    it('should forget why the last build failed when another archive comes', async () => {
      const { game, build } = await setup()

      build.build()
      await waitTasks(build.$phase)
      game.$file(archiveOf('Hot Pursuit 2.zip'))
      await waitTasks(game.$archive)

      expect(build.$phase()).toBe('idle')
      expect(build.$error()).toBeNull()
    })

    it('should forget an image that could not be read once a build starts', async () => {
      const { artwork, build } = await setup()

      pickFile()
      artwork.$error('notes.png could not be read as an image.')
      build.build()

      expect(artwork.$error()).toBeNull()

      await waitTasks(build.$phase)
    })

    it('should forget an image that could not be read when another archive comes', async () => {
      const { game, artwork } = await setup()

      artwork.$error('notes.png could not be read as an image.')
      game.$file(archiveOf('Hot Pursuit 2.zip'))
      await waitTasks(game.$archive)

      expect(artwork.$error()).toBeNull()
    })

    it('should write nothing back for a build of an archive no longer there', async () => {
      const { game, build } = await setup()
      const { handle } = pickFile()
      const picked = Promise.withResolvers<typeof handle>()

      vi.stubGlobal('showSaveFilePicker', () => picked.promise)
      build.build()
      game.$file(null)
      picked.resolve(handle)
      await waitTasks(build.$phase)

      expect(build.$phase()).toBe('idle')
      expect(build.$progress()).toBe(0)
      expect(build.$savedAs()).toBe('')
    })
  })
})
