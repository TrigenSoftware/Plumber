import { inject } from 'nanoviews/store'
import {
  type Attributes,
  component$,
  div
} from 'nanoviews'
import {
  type ArtItem,
  ART_SLOTS,
  ART_TYPES,
  steamGridDbUrl
} from '~/services/artwork'
import { Artwork$ } from '~/stores/artwork'
import { Game$ } from '~/stores/game'
import { ImageDrop } from '~/uikit/ImageDrop'
import styles from './ArtworkGrid.module.css'

export type ArtworkGridProps = Attributes<'div'>

/** @returns What the slot shows of its image, nothing while it is empty. */
function previewOf(item?: ArtItem) {
  return item && {
    url: item.url,
    note: item.warnings.join('; ') || `${item.width}×${item.height}`,
    problem: item.error
  }
}

/**
 * Artwork is brought by hand. SteamGridDB cannot be reached from a browser -
 * its CORS preflight is closed, and it answers 403 to anything that is not a
 * person with a browser - so a link per slot is about ninety percent of what an
 * integration would have given (2.7).
 *
 * The slot names do not match the site's sections, and two slots live in the
 * same section, so each link says which one it is (7.5).
 */
export const ArtworkGrid = component$(({
  class: className,
  ...props
}: ArtworkGridProps) => {
  const {
    $slots,
    setArt,
    clearArt
  } = inject(Artwork$)
  const { $name } = inject(Game$)

  return (
    div({
      class: [className, styles.root],
      ...props
    })(
      ...ART_SLOTS.map(spec => ImageDrop({
        title: spec.slot,
        size: `${spec.width}×${spec.height}`,
        sourceLabel: spec.hint,
        sourceUrl: () => steamGridDbUrl(spec.section, $name() || 'game', spec.dimensions),
        accept: ART_TYPES.join(','),
        preview: () => previewOf($slots()[spec.slot]),
        clearLabel: 'Remove',
        onFile: file => setArt(spec.slot, file),
        onClear: () => clearArt(spec.slot)
      }))
    )
  )
})
