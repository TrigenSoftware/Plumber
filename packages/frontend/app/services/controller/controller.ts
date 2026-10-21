/** A Workshop item's ID: the number Steam publishes every item under. */
const FILE_ID = /^\d{1,20}$/

/**
 * The Workshop ID of a controller layout, out of what the human pasted: the
 * layout's page on SteamInputDB, `steaminputdb.com/config/<ID>`, or the bare
 * ID. Read from the text alone, since neither Steam nor SteamInputDB lets a
 * page on another site ask them (7.8). The Workshop itself shows no layout to
 * a browser, so there is no link of its own to take one from.
 *
 * @returns The ID, or null when there is none to be found.
 */
export function getLayoutId(text: string) {
  const value = text.trim()

  if (FILE_ID.test(value)) {
    return value
  }

  let url: URL

  try {
    url = new URL(value)
  } catch {
    return null
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null
  }

  const id = url.hostname.replace(/^www\./, '') === 'steaminputdb.com'
    && /^\/config\/(\d+)\/?$/.exec(url.pathname)?.[1]

  return id && FILE_ID.test(id) ? id : null
}

/**
 * @returns The layouts SteamInputDB has for the game: those of its Steam
 * version, and those made for a shortcut under its name.
 */
export function getLayoutSearchUrl(name: string) {
  return `https://www.steaminputdb.com/config/search?searchtext=${encodeURIComponent(name)}`
}
