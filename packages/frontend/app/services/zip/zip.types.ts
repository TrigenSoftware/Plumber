export interface ZipEntry {
  /** Path inside the archive, with the nesting it has there. */
  path: string
  /** Uncompressed size. */
  size: number
  /** Directory entries are stored explicitly and end with a slash. */
  directory: boolean
}

export interface ZipInfo {
  entries: ZipEntry[]
  /** True when the archive needed the Zip64 records to be read. */
  zip64: boolean
  /**
   * Set when at least one name is not ASCII while the UTF-8 flag is not set:
   * those names decoded as CP437 and are almost certainly mangled (6.3).
   */
  mangledNames: boolean
  /**
   * The single directory every entry sits under, slash included, or an empty
   * string. The exe scoring needs it to tell "at the root" from "in a subfolder"
   * (7.2.1).
   */
  commonPrefix: string
}
