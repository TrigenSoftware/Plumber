export type ArtSlot = 'portrait' | 'wide' | 'hero' | 'logo' | 'icon'

export interface ArtSlotSpec {
  slot: ArtSlot
  /** Expected size, for the caption and for the soft check. */
  width: number
  height: number
  /**
   * Where this lives on SteamGridDB. The slot names do not match the site's
   * sections, and two slots share one section, which is confusing without
   * saying so (7.5).
   */
  section: string
  /**
   * The size filter of the section, for the slots that share one: Grids holds
   * both orientations, and the link has to open on the one the slot takes.
   */
  dimensions?: string
  hint: string
}

export interface ArtItem {
  slot: ArtSlot
  file: File
  url: string
  width: number
  height: number
  /** Soft mismatches: shown, never blocking. */
  warnings: string[]
  /** The one hard rule: a JPEG in the logo slot has no alpha channel. */
  error: string | null
}
