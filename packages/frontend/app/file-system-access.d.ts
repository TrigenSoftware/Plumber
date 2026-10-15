/**
 * The File System Access API is not in the TypeScript DOM library yet, and the
 * build depends on it: streaming to a picked file is what keeps an 8 GB archive
 * out of memory (6.2). Chromium only - see the limitations in section 8.
 *
 * A module that declares into the global scope rather than a script: the
 * picker is a browser global, and saying so outright leaves no-implicit-globals
 * nothing to object to.
 */
export {}

declare global {
  interface SaveFilePickerAcceptType {
    description?: string
    accept: Record<string, string[]>
  }

  interface SaveFilePickerOptions {
    suggestedName?: string
    types?: SaveFilePickerAcceptType[]
  }

  interface SaveFileHandle {
    readonly name: string
    createWritable(): Promise<WritableStream<Uint8Array>>
  }

  function showSaveFilePicker(options?: SaveFilePickerOptions): Promise<SaveFileHandle>
}
