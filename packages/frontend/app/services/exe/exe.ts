import type { ZipEntry } from '~/services/zip'
import type { ExeCandidate } from './exe.types.ts'

/** Guaranteed not to be the game. */
const NOT_A_GAME = [
  /^unins/,
  /^vc_?redist/,
  /^dx(?:web)?setup$/,
  /^directx/,
  /^dotnetfx/,
  /^ndp4/,
  /^oalinst$/,
  /^openal/,
  /^physx/,
  /^xnafx/,
  /^wmfdist/,
  /^gfwlivesetup$/,
  /^msiexec$/,
  /^unitycrashhandler(?:32|64)$/,
  /^crashreport(?:client|er)$/,
  /^crashsender/,
  /^crashpad_handler$/,
  /^bssndrpt$/,
  /^bugsplat/,
  /^sendreport$/,
  /^unrealcefsubprocess$/,
  /^qtwebengineprocess$/,
  /^epicwebhelper$/,
  /^eosbootstrapper$/,
  /^galaxyclient/,
  /^notification_helper$/
]
/** A redistributables directory anywhere in the path. */
const REDIST_DIRS = [
  /^_commonredist$/,
  /^_?redist$/,
  /^redistributables$/,
  /^directx$/,
  /^vcredist$/,
  /^support$/,
  /^prereq/,
  /^__installer$/
]
/**
 * Looks like an installer or a utility. The suffix patterns are here because
 * the first real archive shipped `shell_inst.exe` and `safemode_inst.exe`,
 * which the prefix patterns miss entirely (7.2.1).
 */
const INSTALLER_LIKE = [
  /^setup/,
  /setup$/,
  /install/,
  /_inst$/,
  /^patch/,
  /^update/,
  /^config/,
  /^settings/,
  /^launcher/,
  /launcher$/,
  /^editor/,
  /^benchmark/,
  /^dedicated/,
  /^server/
]
/** The weights from 7.2.1. Penalties push down, they never hide. */
const NOT_A_GAME_PENALTY = 100
const REDIST_PENALTY = 60
const INSTALLER_PENALTY = 40
const TITLE_BONUS = 40
const ROOT_BONUS = 30
/** Spread across the sizes, the largest exe getting all of it. */
const SIZE_BONUS = 20

/**
 * Letters and digits of any script, not just the latin ones: a game called
 * "ゲーム" would otherwise normalise to an empty string and never earn the
 * matching-title bonus.
 *
 * @returns The value reduced to letters and digits, lowercased.
 */
function normalize(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

/** @returns Whether the lowercased name matches any of the patterns. */
function matchesAny(name: string, patterns: RegExp[]) {
  return patterns.some(pattern => pattern.test(name))
}

function baseName(path: string) {
  const file = path.slice(path.lastIndexOf('/') + 1)

  return file.replace(/\.exe$/i, '')
}

/**
 * Scoring, not filtering: nothing is ever hidden, only pushed down. Games are
 * strange, and an exe called `setup.exe` can turn out to be the real one.
 *
 * @returns The score and the reasons behind it.
 */
export function scoreExe(
  path: string,
  size: number,
  maxSize: number,
  gameName: string,
  commonPrefix: string
) {
  const relative = path.startsWith(commonPrefix) ? path.slice(commonPrefix.length) : path
  const base = baseName(relative).toLowerCase()
  const dirs = relative.split('/').slice(0, -1).map(dir => dir.toLowerCase())
  const reasons: string[] = []
  let score = 0

  if (matchesAny(base, NOT_A_GAME)) {
    score -= NOT_A_GAME_PENALTY
    reasons.push(`-${NOT_A_GAME_PENALTY} not a game`)
  }

  if (dirs.some(dir => matchesAny(dir, REDIST_DIRS))) {
    score -= REDIST_PENALTY
    reasons.push(`-${REDIST_PENALTY} redist directory`)
  }

  if (matchesAny(base, INSTALLER_LIKE)) {
    score -= INSTALLER_PENALTY
    reasons.push(`-${INSTALLER_PENALTY} installer or utility`)
  }

  if (gameName && normalize(base) && normalize(gameName).includes(normalize(base))) {
    score += TITLE_BONUS
    reasons.push(`+${TITLE_BONUS} looks like the title`)
  }

  if (!dirs.length) {
    score += ROOT_BONUS
    reasons.push(`+${ROOT_BONUS} at the root`)
  }

  if (maxSize) {
    const bonus = Math.round(SIZE_BONUS * size / maxSize)

    score += bonus
    reasons.push(`+${bonus} size`)
  }

  return {
    score,
    reasons
  }
}

/**
 * Every `.exe` in the whole tree as a flat list, best first. Not just the root:
 * plenty of games keep the exe in a subfolder, and for those a root-only list
 * would be empty (7.2).
 *
 * @returns Every candidate, best first.
 */
export function rankExes(entries: ZipEntry[], gameName: string, commonPrefix: string): ExeCandidate[] {
  const exes = entries.filter(entry => !entry.directory && /\.exe$/i.test(entry.path))
  const maxSize = exes.reduce((max, entry) => Math.max(max, entry.size), 0)

  return exes
    .map(entry => ({
      path: entry.path,
      label: entry.path.startsWith(commonPrefix) ? entry.path.slice(commonPrefix.length) : entry.path,
      size: entry.size,
      ...scoreExe(entry.path, entry.size, maxSize, gameName, commonPrefix)
    }))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
}
