import {
  signal,
  computed,
  action,
  batch,
  task,
  setKey,
  deleteKey
} from '@nano_kit/store'
import {
  type ArtItem,
  type ArtSlot,
  type ArtSlotSpec,
  ART_SLOTS,
  inspectArt
} from '~/services/artwork'

/**
 * The images for the five slots.
 *
 * @returns The store.
 */
export function Artwork$() {
  const $slots = signal<Partial<Record<ArtSlot, ArtItem>>>({})
  // The last file that could not be decoded at all
  const $error = signal<string | null>(null)
  /**
   * Artwork in the canonical slot order rather than the order the slots happened
   * to be filled in, so the same inputs always produce the same bytes.
   */
  const $items = computed(() => {
    const slots = $slots()

    return ART_SLOTS
      .map(spec => slots[spec.slot])
      .filter(item => item !== undefined)
  })
  // The hard rules the images break, a JPEG logo say: unlike the warnings,
  // these hold the build back
  const $problems = computed(() => $items()
    .map(item => item.error)
    .filter(error => error !== null))
  /**
   * Decoding takes a moment, and in that moment the human can drop another
   * image into the same slot. Each decode carries the slot's ticket; a decode
   * whose ticket is stale throws its image away instead of replacing the newer
   * one.
   */
  const tickets = new Map<ArtSlot, number>()
  const nextTicket = (slot: ArtSlot) => {
    const ticket = (tickets.get(slot) ?? 0) + 1

    tickets.set(slot, ticket)

    return ticket
  }
  const place = async (spec: ArtSlotSpec, file: File, ticket: number) => {
    const isCurrent = () => tickets.get(spec.slot) === ticket

    try {
      const item = await inspectArt(spec, file)

      if (!isCurrent()) {
        URL.revokeObjectURL(item.url)

        return
      }

      const previous = $slots()[spec.slot]

      // Decoding is asynchronous, so another slot may have been filled while this
      // one was busy. Merging into the snapshot taken before the await would drop
      // whatever landed in between, object URL and all.
      batch(() => {
        setKey($slots, spec.slot, item)
        $error(null)
      })

      // Only once the new image is in place: revoking first left a broken
      // preview whenever the new file then failed to decode.
      if (previous) {
        URL.revokeObjectURL(previous.url)
      }
    } catch {
      if (isCurrent()) {
        $error(`${file.name} could not be read as an image.`)
      }
    }
  }
  /**
   * The UI calls this, not `place`: how the decode went lands in the slot or
   * in `$error`, never in a promise left dangling. A file that cannot be
   * decoded leaves the image the slot had.
   */
  const setArt = action((slot: ArtSlot, file: File) => {
    const spec = ART_SLOTS.find(candidate => candidate.slot === slot)

    if (spec) {
      void task([$slots, $error], place(spec, file, nextTicket(slot)))
    }
  })
  const clearArt = action((slot: ArtSlot) => {
    const item = $slots()[slot]

    // A decode still running for the slot must not fill it again
    nextTicket(slot)

    if (item) {
      deleteKey($slots, slot)
      URL.revokeObjectURL(item.url)
    }
  })

  return {
    $slots,
    $error,
    $items,
    $problems,
    setArt,
    clearArt
  }
}
