/**
 * Hands a Blob to the browser to save under the name given, as a link with
 * `download` does.
 *
 * @returns Lets the address of the Blob go, once: calling it again does
 * nothing. When a browser takes it up after the click is its own affair, so
 * the caller lets it go no sooner than the download is surely under way; one
 * already under way goes on without it.
 */
export function startDownload(blob: Blob, name: string) {
  let url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = name
  link.click()

  return () => {
    if (url) {
      URL.revokeObjectURL(url)
      url = ''
    }
  }
}
