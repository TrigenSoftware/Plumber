export type CheckLevel = 'warning' | 'note'

export interface Check {
  level: CheckLevel
  message: string
}

export interface CheckInput {
  archiveSize: number
  mangledNames: boolean
  exeCount: number
  /** Score of the exe the human settled on, or null when nothing is chosen. */
  selectedScore: number | null
  filledSlots: number
  totalSlots: number
  /** From navigator.storage.estimate(), or null when it could not be asked. */
  storageAvailable: number | null
}
