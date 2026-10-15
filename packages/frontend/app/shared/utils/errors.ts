/** @returns The message of whatever was thrown, an Error or not. */
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
