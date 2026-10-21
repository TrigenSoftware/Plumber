/** Prefix architecture the installer creates the Wine prefix with. */
export type PrefixArch = 'win32' | 'win64'

/**
 * What the installer reads. Also enough to rebuild the bundle
 * later (7.7), which is why the generator stamps itself into it.
 */
export interface Recipe {
  name: string
  slug: string
  exe: string
  prefix_arch: PrefixArch
  user_data: string[]
  /**
   * Wrapper DLLs to override. Whether one is there depends on the archive, so
   * by 2.8 this is settled here rather than on SteamOS. An empty list is a
   * decision - the human unticked the box - and the installer honours it.
   */
  dll_overrides: string[]
  /**
   * The Workshop ID of a controller layout for a game made for keyboard and
   * mouse, or null. The installer points the game at it, and Steam fetches
   * the layout itself (7.8).
   */
  controller_layout: string | null
  generator: string
}

export interface RecipeInput {
  name: string
  exe: string
  prefixArch: PrefixArch
  userData: string[]
  dllOverrides: string[]
  controllerLayout: string | null
}
