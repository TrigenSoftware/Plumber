/**
 * The File System Access API is not in the TypeScript DOM library yet. Where a
 * browser has it, which only Chromium-based ones do, Brave aside, the build
 * streams into the file the human picks; anywhere else the browser downloads
 * the file (6.2).
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
