import { inject } from 'nanoviews/store'
import {
  type Attributes,
  a,
  component$,
  div,
  fragment,
  span,
  if_
} from 'nanoviews'
import { getLayoutSearchUrl } from '~/services/controller'
import { Game$ } from '~/stores/game'
import { Checkbox } from '~/uikit/Checkbox'
import { ChoiceField } from '~/uikit/ChoiceField'
import {
  Field,
  FieldControl
} from '~/uikit/Field'
import { TextInput } from '~/uikit/TextInput'
import mixins from '~/uikit/mixins.module.css'
import styles from './ControllerLayout.module.css'

export type ControllerLayoutProps = Attributes<'div'>

/** What a layout's page on SteamInputDB looks like, for whoever pasted something else. */
const EXAMPLE = 'https://www.steaminputdb.com/config/3036980641'

/**
 * A community layout from the Steam Workshop, for a game made for keyboard and
 * mouse. Asked for with a box, off by default since a game that supports a
 * controller needs nothing; then the human finds a layout on SteamInputDB and
 * pastes its link, and the installer points the game at it (7.8). Neither
 * Steam nor SteamInputDB can be asked from a page on another site, so the link
 * is all there is to go by.
 */
export const ControllerLayout = component$(({
  class: className,
  ...props
}: ControllerLayoutProps) => {
  const {
    $name,
    $mapController,
    $layoutLink,
    $layoutInvalid
  } = inject(Game$)

  return (
    div({
      class: [className, styles.root],
      ...props
    })(
      ChoiceField({
        target: Checkbox({
          checked: $mapController
        }),
        text: 'Map the controller to keyboard and mouse',
        description: 'Leave it off for a game that supports a controller by itself.'
      }),
      if_($mapController)(
        () => (
          Field({
            id: 'game-layout',
            label: 'Link to a layout',
            hint: if_($layoutInvalid)(
              () => span({
                class: styles.error
              })(
                `This is not a link to a layout. A layout's page on SteamInputDB looks like ${EXAMPLE}.`
              ),
              () => fragment(
                'Find a layout made for the controller you play with ',
                // A tab of its own: leaving the page would drop the archive and
                // the artwork already in the form
                a({
                  class: mixins.focusOutline,
                  href: () => getLayoutSearchUrl($name() || 'game'),
                  target: '_blank',
                  rel: 'noopener noreferrer'
                })(
                  'on SteamInputDB'
                ),
                ' and paste its link here. SteamOS needs a connection while the installer sets it.'
              )
            )
          })(
            FieldControl({
              as: TextInput,
              value: $layoutLink,
              placeholder: EXAMPLE,
              inputMode: 'url',
              spellCheck: false,
              'aria-invalid': $layoutInvalid
            })
          )
        )
      )
    )
  )
})
