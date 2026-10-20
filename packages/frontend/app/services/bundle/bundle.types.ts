export interface RunParts {
  header: Uint8Array
  meta: Uint8Array
  payload: ReadableStream<Uint8Array>
  payloadSize: number
}

export interface RunBlobParts {
  header: Uint8Array<ArrayBuffer>
  meta: Uint8Array<ArrayBuffer>
  /** The archive as the File itself, not its bytes. */
  payload: Blob
}

export interface BuildProgress {
  written: number
  total: number
}
