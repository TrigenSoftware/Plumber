import {
  inject,
  length,
  when
} from 'nanoviews/store'
import {
  type Attributes,
  component$,
  div,
  fragment,
  option,
  p,
  pre,
  trackBy,
  for_,
  if_
} from 'nanoviews'
import type { ExeCandidate } from '~/services/exe'
import type { ModSigns } from '~/services/wrappers'
import { formatSize } from '~/shared/utils'
import { Game$ } from '~/stores/game'
import { Checkbox } from '~/uikit/Checkbox'
import { ChoiceField } from '~/uikit/ChoiceField'
import { Disclosure } from '~/uikit/Disclosure'
import {
  Field,
  FieldControl
} from '~/uikit/Field'
import { Select } from '~/uikit/Select'
import { TextInput } from '~/uikit/TextInput'
import typography from '~/uikit/typography.module.css'
import styles from './GameForm.module.css'

const OVERRIDE_HINT = 'Under Wine the loader does not start on its own, so the mods silently '
  + 'do not load and the game looks broken while nothing crashes.'
const NO_OVERRIDE_HINT = 'The game will launch without the override. Untick this only if it '
  + 'turns out the mods are the problem.'

export type GameFormProps = Attributes<'div'>

/** @returns What was found around the exe, spelled out for someone who has never heard of WINEDLLOVERRIDES. */
function wrapperSentence(found: string[], signs: ModSigns) {
  const modules = signs.asi === 1 ? 'module' : 'modules'
  const asi = signs.asi ? `, plus ${signs.asi} .asi ${modules}` : ''
  const scripts = signs.scripts ? ' and a SCRIPTS folder' : ''

  return `Found next to the exe: ${found.join(', ')}${asi}${scripts}.`
}

/** @returns The exe as the list shows it, with the score it was ranked by. */
function candidateLabel(item: ExeCandidate) {
  return `${item.label} · ${formatSize(item.size)} · score ${item.score}`
}

/**
 * The whole point of reading the archive is one line: the path to the exe. It
 * is never typed by hand - a path with one character wrong would only surface
 * on SteamOS, where there is nothing to debug it with (7.1).
 */
export const GameForm = component$(({
  class: className,
  ...props
}: GameFormProps) => {
  const {
    $name,
    $exePath,
    $prefixArch,
    $userData,
    $overrideWrappers,
    $candidates,
    $wrappers,
    $modSigns,
    $launchOptions
  } = inject(Game$)

  return (
    div({
      class: [
        className,
        styles.root
      ],
      ...props
    })(
      Field({
        id: 'game-name',
        label: 'Title in the library',
        hint: 'Guessed from the folders in the archive, or from its name. Changing it re-sorts the executables below.'
      })(
        FieldControl({
          as: TextInput,
          value: $name
        })
      ),
      Field({
        id: 'game-exe',
        label: 'Executable to launch',
        hint: when(
          length($candidates),
          'Ranked by how much each one looks like the game. Nothing is hidden, only pushed down.',
          'No .exe was found in this archive.'
        )
      })(
        FieldControl({
          as: Select,
          value: $exePath
        })(
          // The list is re-ranked while the title is typed. Tracked by path, an
          // option moves with its exe, so its value never goes stale
          for_($candidates, trackBy('path'))(
            $candidate => option({
              value: $candidate().path
            })(
              () => candidateLabel($candidate())
            )
          )
        )
      ),
      // What a default or the archive already settles, folded away: at first
      // sight the form is the title and the exe alone
      Disclosure({
        summary: 'Advanced settings'
      })(
        div({
          class: styles.row
        })(
          Field({
            id: 'game-arch',
            label: 'Prefix architecture'
          })(
            FieldControl({
              as: Select,
              value: $prefixArch
            })(
              option({
                value: 'win32'
              })(
                '32-bit (win32)'
              ),
              option({
                value: 'win64'
              })(
                '64-bit (win64)'
              )
            )
          ),
          Field({
            id: 'game-user-data',
            label: 'Folders holding saves and settings',
            hint: 'Left alone when installing over an existing copy, and created empty on a clean one.'
          })(
            FieldControl({
              as: TextInput,
              value: $userData
            })
          )
        ),
        // In the grid of the folded part, each a step of it like a field
        if_(length($wrappers))(
          () => fragment(
            p({
              class: `${typography.small} ${typography.muted}`
            })(
              () => wrapperSentence($wrappers(), $modSigns())
            ),
            ChoiceField({
              target: Checkbox({
                checked: $overrideWrappers
              }),
              text: 'The game has mods - override the wrapper DLLs',
              description: when($overrideWrappers, OVERRIDE_HINT, NO_OVERRIDE_HINT)
            }),
            if_($overrideWrappers)(
              () => pre({
                class: `${styles.code} ${typography.small} ${typography.mono}`
              })(
                $launchOptions
              )
            )
          )
        )
      )
    )
  )
})
