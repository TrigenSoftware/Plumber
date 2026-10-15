import {
  describe,
  it,
  expect
} from 'vitest'
import { BLOCK_SIZE } from '~/shared/constants'
import { gunzip } from '~/services/tar'
import {
  buildHeader,
  buildMeta,
  packMeta,
  writeRunFile
} from './bundle.ts'

const decoder = new TextDecoder()
const RECIPE = {
  name: 'Need for Speed: Most Wanted',
  slug: 'nfsmw',
  exe: 'Need for Speed Most Wanted/speed.exe',
  prefix_arch: 'win32' as const,
  user_data: ['SAVES'],
  dll_overrides: ['dinput8'],
  generator: 'plumber 1.0.0'
}

/** @returns The names of the entries in a ustar archive. */
function listTar(archive: Uint8Array) {
  const names: string[] = []
  let at = 0

  while (at + 512 <= archive.byteLength) {
    const head = archive.subarray(at, at + 512)

    if (head.every(byte => byte === 0)) {
      break
    }

    const size = parseInt(decoder.decode(head.subarray(124, 136)).replace(/\0.*$/, '').trim(), 8)

    names.push(decoder.decode(head.subarray(0, 100)).replace(/\0.*$/, ''))
    at += 512 + Math.ceil(size / 512) * 512
  }

  return names
}

function collect() {
  const chunks: Uint8Array[] = []

  return {
    chunks,
    stream: new WritableStream<Uint8Array>({
      write(chunk) {
        chunks.push(chunk.slice())
      }
    })
  }
}

function streamOf(data: Uint8Array) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data)
      controller.close()
    }
  })
}

describe('services', () => {
  describe('bundle', () => {
    describe('buildHeader', () => {
      it('should be exactly one block long', () => {
        expect(buildHeader(671)).toHaveLength(BLOCK_SIZE)
      })

      it('should carry the block count the extraction reads', () => {
        expect(decoder.decode(buildHeader(671))).toContain(`bs=${BLOCK_SIZE} skip=1 count=671`)
      })

      it('should pad with comment characters and end with a newline', () => {
        const header = buildHeader(1)

        expect(header[BLOCK_SIZE - 2]).toBe(0x23)
        expect(header[BLOCK_SIZE - 1]).toBe(0x0a)
      })

      it('should hand setup.sh the run file itself as the archive', () => {
        expect(decoder.decode(buildHeader(1)))
          .toContain('ARCHIVE="$SELF" sh "$TMP/setup.sh" "$@"')
      })

      it('should not exec, so the cleanup trap still fires', () => {
        // exec replaces the shell and the EXIT trap never runs, leaving the
        // unpacked meta - artwork included - in /tmp after every launch.
        expect(decoder.decode(buildHeader(1))).not.toContain('exec sh')
      })
    })

    describe('buildMeta', () => {
      it('should be a whole number of blocks', async () => {
        const meta = await buildMeta(RECIPE, [])

        expect(meta.byteLength % BLOCK_SIZE).toBe(0)
      })

      it('should pad with zeros only', async () => {
        const packed = await packMeta(RECIPE, [])
        const meta = await buildMeta(RECIPE, [])

        expect(meta.subarray(packed.byteLength).every(byte => byte === 0)).toBe(true)
        expect(meta.subarray(0, packed.byteLength)).toEqual(packed)
      })

      it('should carry exactly the installer and the recipe', async () => {
        const names = listTar(await gunzip(await packMeta(RECIPE, [])))

        // Spelled out rather than checked one by one, so this fails both ways:
        // a module added to the installer and forgotten here, and a development
        // tool that has no business inside a bundle (4).
        expect(names).toEqual([
          './',
          './setup.sh',
          './uninstall-template.sh',
          './install.py',
          './steam_install.py',
          './steamctl.py',
          './unpack.py',
          './vdf.py',
          './config_surgery.py',
          './check-install.py',
          './recipe.json'
        ])
      })

      it('should carry the six modules the uninstaller needs', async () => {
        const names = listTar(await gunzip(await packMeta(RECIPE, [])))

        // install.py copies these into <game-dir>/.deck-bundler/ so the game
        // can be removed without keeping the original .run around (5.4).
        for (const module of [
          './install.py',
          './steam_install.py',
          './steamctl.py',
          './unpack.py',
          './vdf.py',
          './config_surgery.py'
        ]) {
          expect(names).toContain(module)
        }
      })

      it('should put artwork under art/ named after the slot', async () => {
        const meta = await packMeta(RECIPE, [
          {
            slot: 'hero',
            file: new File([new Uint8Array(4)], 'anything.bin', {
              type: 'image/jpeg'
            }),
            url: '',
            width: 1920,
            height: 620,
            warnings: [],
            error: null
          }
        ])

        expect(listTar(await gunzip(meta))).toContain('./art/hero.jpg')
      })
    })

    describe('writeRunFile', () => {
      it('should lay out header, meta and payload in that order', async () => {
        const sink = collect()
        const payload = new Uint8Array([9, 9, 9])
        const meta = await buildMeta(RECIPE, [])
        const header = buildHeader(meta.byteLength / BLOCK_SIZE)

        await Array.fromAsync(writeRunFile(sink.stream, {
          header,
          meta,
          payload: streamOf(payload),
          payloadSize: payload.byteLength
        }))

        const written = sink.chunks.flatMap(chunk => [...chunk])

        expect(written.slice(0, BLOCK_SIZE)).toEqual([...header])
        expect(written.slice(BLOCK_SIZE, BLOCK_SIZE + meta.byteLength)).toEqual([...meta])
        expect(written.slice(BLOCK_SIZE + meta.byteLength)).toEqual([...payload])
      })

      it('should yield the progress after every part, up to the full size', async () => {
        const sink = collect()
        const payload = new Uint8Array(1000)
        const meta = await buildMeta(RECIPE, [])
        const total = BLOCK_SIZE + meta.byteLength + payload.byteLength
        const progress = await Array.fromAsync(writeRunFile(sink.stream, {
          header: buildHeader(1),
          meta,
          payload: streamOf(payload),
          payloadSize: payload.byteLength
        }))

        expect(progress).toEqual([
          {
            written: BLOCK_SIZE,
            total
          },
          {
            written: BLOCK_SIZE + meta.byteLength,
            total
          },
          {
            written: total,
            total
          }
        ])
      })

      it('should write no further than the caller pulls', async () => {
        const sink = collect()
        const meta = await buildMeta(RECIPE, [])
        const run = writeRunFile(sink.stream, {
          header: buildHeader(1),
          meta,
          payload: streamOf(new Uint8Array(1000)),
          payloadSize: 1000
        })

        await run.next()
        await run.return(undefined)

        expect(sink.chunks.flatMap(chunk => [...chunk])).toHaveLength(BLOCK_SIZE)
      })
    })
  })
})
