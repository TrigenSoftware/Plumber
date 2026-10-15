export interface RunParts {
  header: Uint8Array
  meta: Uint8Array
  payload: ReadableStream<Uint8Array>
  payloadSize: number
}

export interface BuildProgress {
  written: number
  total: number
}
