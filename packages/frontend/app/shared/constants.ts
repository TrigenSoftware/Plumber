/** Block size the `.run` format is laid out in: header, then meta, then payload. */
export const BLOCK_SIZE = 8192

/** Written into recipe.json so a bundle can be traced back to what built it. */
export const GENERATOR = 'plumber 1.0.0'

/** Where the code lives: anyone can read what the installer does on SteamOS. */
export const REPOSITORY_URL = 'https://github.com/TrigenSoftware/Plumber'
