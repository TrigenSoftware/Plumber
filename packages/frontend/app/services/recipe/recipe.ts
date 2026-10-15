import type {
  ZipEntry,
  ZipInfo
} from '~/services/zip'
import { GENERATOR } from '~/shared/constants'
import type {
  Recipe,
  RecipeInput
} from './recipe.types.ts'

/** Long enough to stay recognisable, short enough for a folder name. */
const SLUG_MAX = 40

/**
 * @returns A folder name for the Deck, safe on a Linux filesystem.
 */
export function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX) || 'game'
}

/** Folder names that say how the files are laid out rather than which game they are, and versions. */
const NOT_A_TITLE = /^(?:games?|bin|binaries|release|build|app|files|data|content|pc|win(?:32|64)|x(?:86|64)|v?\d+(?:[._]\d+)*)$/i

/**
 * A release name stands in dots or underscores for the spaces it lacks, while
 * a name with spaces keeps its dots: "Mr. Prepper", "S.T.A.L.K.E.R. Clear Sky".
 *
 * @returns The name as a title.
 */
function tidyTitle(name: string) {
  return (/\s/.test(name) ? name : name.replace(/[._]+/g, ' ')).trim()
}

/** @returns The deepest folder of the shared prefix that names a game, or nothing. */
function folderTitle(commonPrefix: string) {
  return commonPrefix.split('/').filter(Boolean).reverse().find(folder => !NOT_A_TITLE.test(folder))
}

/**
 * Unity names the exe and the `<name>_Data` folder beside it after the product.
 *
 * @returns The name of a Unity build in the archive, the shallowest one, or nothing.
 */
function unityTitle(entries: ZipEntry[]) {
  const paths = entries.map(entry => entry.path)
  const depth = (path: string) => path.split('/').length

  return paths
    .filter(path => /\.exe$/i.test(path))
    .sort((a, b) => depth(a) - depth(b))
    .map(exe => exe.replace(/\.exe$/i, ''))
    .filter(stem => paths.some(path => path.startsWith(`${stem}_Data/`)))
    .map(stem => stem.slice(stem.lastIndexOf('/') + 1))
    .find(name => !NOT_A_TITLE.test(name))
}

/**
 * Guessed from the listing alone, since the contents are never read (6.1).
 * The folder the game was zipped in comes first: a store names it after the
 * game, while the archive may be called anything - `nfs.zip`, `game (1).zip`.
 * Then the name of a Unity build, then the name of the archive (7.3).
 *
 * @returns A title for the library.
 */
export function guessTitle(fileName: string, zip: Pick<ZipInfo, 'entries' | 'commonPrefix'>) {
  return tidyTitle(folderTitle(zip.commonPrefix) ?? unityTitle(zip.entries) ?? fileName.replace(/\.zip$/i, ''))
}

/** @returns The recipe exactly as the installer on the Deck reads it. */
export function buildRecipe(input: RecipeInput): Recipe {
  return {
    name: input.name,
    slug: slugify(input.name),
    exe: input.exe,
    prefix_arch: input.prefixArch,
    user_data: input.userData,
    dll_overrides: input.dllOverrides,
    generator: GENERATOR
  }
}

/** @returns The recipe as the JSON text that goes into meta. */
export function serializeRecipe(recipe: Recipe) {
  return `${JSON.stringify(recipe, null, 2)}\n`
}
