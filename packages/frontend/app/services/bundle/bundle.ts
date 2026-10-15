import type { ArtItem } from '~/services/artwork'
import type { Recipe } from '~/services/recipe'
import type { TarEntry } from '~/services/tar'
import { BLOCK_SIZE } from '~/shared/constants'
import { blocksFor } from '~/shared/utils'
import { artFileName } from '~/services/artwork'
import { serializeRecipe } from '~/services/recipe'
import {
  gzip,
  tar
} from '~/services/tar'
import type {
  BuildProgress,
  RunParts
} from './bundle.types.ts'

const encoder = new TextEncoder()
/** The header is padded out with comment characters, then one newline. */
const COMMENT = 0x23
const NEWLINE = 0x0a
const MODE_EXECUTABLE = 0o755
const MODE_REGULAR = 0o644

/**
 * The shell prologue of a `.run`. It is padded to exactly one block, so the
 * offset of meta is fixed and only the block count has to be substituted.
 *
 * The offset of the payload is deliberately written down nowhere: the installer
 * finds the end of the zip from the end of the file and works the prefix out
 * from there, so the zip is read straight out of the `.run` and never extracted
 * (3). It takes zipfile to do that: bsdtar manages only below 4 GiB, where the
 * archive has no Zip64 records.
 *
 * @returns Exactly one block of bytes.
 */
export function buildHeader(metaBlocks: number) {
  const script = [
    '#!/bin/sh',
    '# deck-bundler self-extracting installer.',
    `# [0..${BLOCK_SIZE - 1}] this script | [${BLOCK_SIZE}..] meta.tar.gz (${metaBlocks} blocks) | then the archive`,
    'set -eu',
    'SELF=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/$(basename -- "$0")',
    'TMP=$(mktemp -d)',
    'trap \'rm -rf "$TMP"\' EXIT',
    `dd if="$SELF" bs=${BLOCK_SIZE} skip=1 count=${metaBlocks} 2>/dev/null | tar -xz -C "$TMP"`,
    '# no exec: it replaces the shell, and the cleanup trap never fires - meta',
    '# with the artwork in it would be left behind in /tmp on every run',
    'ARCHIVE="$SELF" sh "$TMP/setup.sh" "$@"',
    'exit 0',
    ''
  ].join('\n')
  const bytes = encoder.encode(script)

  if (bytes.byteLength >= BLOCK_SIZE) {
    throw new Error(`The header does not fit in ${BLOCK_SIZE} bytes: ${bytes.byteLength}`)
  }

  const block = new Uint8Array(BLOCK_SIZE)

  block.set(bytes)
  block.fill(COMMENT, bytes.byteLength, BLOCK_SIZE - 1)
  block[BLOCK_SIZE - 1] = NEWLINE

  return block
}

/**
 * Pads up to a whole block. GNU gzip ignores the trailing zeros, which is what
 * lets `dd count=BLOCKS` read a clean stream - verified on the Deck (3).
 *
 * Note that the decoders in Node and Chromium are stricter than GNU gzip and
 * reject the padding as trailing junk, so anything reading meta back must cut
 * it off first.
 *
 * @returns The input padded out with zeros.
 */
export function padToBlock(data: Uint8Array) {
  const blocks = blocksFor(data.byteLength, BLOCK_SIZE)
  const padded = new Uint8Array(blocks * BLOCK_SIZE)

  padded.set(data)

  return padded
}

/**
 * meta.tar.gz: the installer, the recipe and the artwork. Built in memory, so
 * its size - and with it the block count the header carries - is known before
 * a single byte is written (3).
 *
 * @returns The gzip stream, unpadded.
 */
export async function packMeta(recipe: Recipe, artwork: ArtItem[]) {
  // Taken when a build asks for it: the scripts are text the page has no use
  // for until then, so they stay out of what it loads up front
  const { INSTALLER_FILES } = await import('@plumber/installer')
  const entries: TarEntry[] = [{
    path: '.'
  }]

  for (const file of INSTALLER_FILES) {
    entries.push({
      path: `./${file.name}`,
      data: encoder.encode(file.source),
      mode: file.name.endsWith('.sh') ? MODE_EXECUTABLE : MODE_REGULAR
    })
  }

  entries.push({
    path: './recipe.json',
    data: encoder.encode(serializeRecipe(recipe))
  })

  if (artwork.length) {
    entries.push({
      path: './art'
    })

    for (const item of artwork) {
      entries.push({
        path: `./art/${artFileName(item.slot, item.file)}`,
        data: new Uint8Array(await item.file.arrayBuffer())
      })
    }
  }

  return gzip(tar(entries))
}

/**
 * meta as it goes into the file: packed, then padded to a whole block.
 *
 * @returns A whole number of blocks.
 */
export async function buildMeta(recipe: Recipe, artwork: ArtItem[]) {
  return padToBlock(await packMeta(recipe, artwork))
}

/** @yields The parts of the `.run` in the order they go into the file. */
async function* chunksOf(parts: RunParts) {
  yield parts.header
  yield parts.meta
  yield* parts.payload
}

/**
 * Writes the `.run` straight to disk: header, meta, then the archive byte for
 * byte. Nothing is held in memory, so an 8 GB game costs no more than a small
 * one (6.2). The write goes as far as the caller pulls it.
 *
 * @yields How much of the file is written, after every chunk.
 */
export async function* writeRunFile(
  target: WritableStream<Uint8Array>,
  parts: RunParts
): AsyncGenerator<BuildProgress> {
  const total = parts.header.byteLength + parts.meta.byteLength + parts.payloadSize
  const writer = target.getWriter()
  let written = 0

  // The lock has to come off even when a write rejects, or the caller cannot so
  // much as abort the stream afterwards.
  try {
    for await (const chunk of chunksOf(parts)) {
      await writer.write(chunk)
      written += chunk.byteLength

      yield {
        written,
        total
      }
    }

    await writer.close()
  } finally {
    writer.releaseLock()
  }
}
