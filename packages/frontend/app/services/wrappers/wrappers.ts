import type { ZipEntry } from '~/services/zip'

/**
 * Names Wine ships its own implementations of. A file with one of these names
 * next to the exe is almost certainly a wrapper - an ASI loader, ReShade, ENB,
 * dgVoodoo - and without an override the game starts looking broken while
 * nothing crashes and nothing is logged (7.3.1).
 */
export const WRAPPER_DLLS = [
  'd3d8',
  'd3d9',
  'd3d10',
  'd3d11',
  'dxgi',
  'ddraw',
  'dinput',
  'dinput8',
  'dsound',
  'winmm',
  'msacm32',
  'version',
  'xinput1_3',
  'xinput1_4',
  'wininet'
]

const DLL = /\.dll$/i
const ASI = /\.asi$/i
const SCRIPTS_DIR = /\/scripts\//i

function directoryOf(path: string) {
  return path.slice(0, path.lastIndexOf('/') + 1)
}

/**
 * Wrapper DLLs sitting in the same directory as the chosen exe.
 *
 * @returns Names without the extension, lowercased, ready for the override.
 */
export function detectWrappers(entries: ZipEntry[], exePath: string) {
  const dir = directoryOf(exePath)

  return entries
    .filter(entry => !entry.directory && entry.path.startsWith(dir))
    .map(entry => entry.path.slice(dir.length))
    .filter(name => !name.includes('/') && WRAPPER_DLLS.includes(name.replace(DLL, '').toLowerCase()))
    .map(name => name.replace(DLL, '').toLowerCase())
}

/** Other signs of mods around the exe, besides the wrapper DLLs. */
export interface ModSigns {
  /** How many `.asi` mods sit under the exe's folder. */
  asi: number
  /** Whether there is a `scripts` folder there, the one the ASI loader reads. */
  scripts: boolean
}

/**
 * Other signs of mods around the exe.
 *
 * @returns Counts worth naming in the install log, the only way to tell from
 * someone else's SteamOS that the mods did not load (7.3.1).
 */
export function detectModSigns(entries: ZipEntry[], exePath: string): ModSigns {
  const dir = directoryOf(exePath)
  const inside = entries.filter(entry => entry.path.startsWith(dir))

  return {
    asi: inside.filter(entry => ASI.test(entry.path)).length,
    scripts: inside.some(entry => SCRIPTS_DIR.test(entry.path))
  }
}

/**
 * @returns The launch option that fixed the live game, or an empty string when
 * there is nothing to override.
 */
export function launchOptionsFor(wrappers: string[]) {
  return wrappers.length ? `WINEDLLOVERRIDES="${wrappers.join(',')}=n,b" %command%` : ''
}
