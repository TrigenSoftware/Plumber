export interface ExeCandidate {
  /** Full path inside the archive, nesting included. */
  path: string
  /** Path with the archive's common prefix stripped, for display. */
  label: string
  size: number
  score: number
  /** Why the score came out this way, for the UI and for the log. */
  reasons: string[]
}
