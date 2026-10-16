import { inject } from 'nanoviews/store'
import {
  type Attributes,
  component$,
  a,
  div,
  h1,
  h2,
  main,
  p,
  section,
  if_
} from 'nanoviews'
import { ArchivePicker } from '~/blocks/ArchivePicker'
import { ArtworkGrid } from '~/blocks/ArtworkGrid'
import { BuildPanel } from '~/blocks/BuildPanel'
import { GameForm } from '~/blocks/GameForm'
import { HowItWorks } from '~/blocks/HowItWorks'
import { PreflightList } from '~/blocks/PreflightList'
import {
  NEW_ISSUE_URL,
  REPOSITORY_URL
} from '~/shared/constants'
import { CanSaveFiles$ } from '~/stores/build'
import { Game$ } from '~/stores/game'
import { Callout } from '~/uikit/Callout'
import mixins from '~/uikit/mixins.module.css'
import typography from '~/uikit/typography.module.css'
import styles from './Home.module.css'

export type HomeProps = Attributes<'main'>

interface SectionProps {
  title: string
  /** A line about the part, under its heading. */
  note: string
}

// A part of the form under a heading of its own
const Section = component$(({
  title,
  note
}: SectionProps, children) => (
  section({
    class: styles.section
  })(
    div({
      class: styles.sectionHead
    })(
      h2({
        class: typography.heading
      })(
        title
      ),
      p({
        class: `${typography.small} ${typography.muted}`
      })(
        note
      )
    ),
    ...children
  )
))

/**
 * The one page there is: the archive first, and once it is read, everything
 * the installer is made of.
 */
export const Home = component$(({
  class: className,
  ...props
}: HomeProps) => {
  const { $archive } = inject(Game$)
  const canSave = inject(CanSaveFiles$)

  return (
    main({
      class: [className, styles.root],
      ...props
    })(
      div({
        class: styles.intro
      })(
        h1({
          class: typography.title
        })(
          'Plumber'
        ),
        p({
          class: `${typography.text} ${typography.muted}`
        })(
          'Turns a zipped Windows game into a single .run installer for SteamOS: run it once, '
          + 'and the game is in the Steam library with its artwork and Proton set up. '
          + 'Nothing is uploaded anywhere: the file is assembled in this browser and written '
          + 'straight to disk.'
        ),
        p({
          class: `${typography.text} ${typography.muted}`
        })(
          'Plumber is open source: everything the installer does on SteamOS is in ',
          // A tab of its own: leaving the page would drop the archive and the
          // artwork already in the form
          a({
            class: mixins.focusOutline,
            href: REPOSITORY_URL,
            target: '_blank',
            rel: 'noopener noreferrer'
          })(
            'the code on GitHub'
          ),
          '.'
        ),
        Callout({
          tone: 'warning'
        })(
          'Plumber is still being tested: use it at your own risk. If you run into a problem '
          + 'and want to help the project, ',
          // In a tab of its own too, for the same reason
          a({
            class: mixins.focusOutline,
            href: NEW_ISSUE_URL,
            target: '_blank',
            rel: 'noopener noreferrer'
          })(
            'open an issue on GitHub'
          ),
          '.'
        ),
        // Anywhere else the archive can be read but the installer never saved,
        // so the page says so before anything starts
        !canSave && Callout({
          tone: 'error'
        })(
          'This browser is not supported. Plumber needs a Chromium-based browser, such as '
          + 'Chrome or Edge, to save the installer.'
        )
      ),
      // Ahead of the drop zone: the first steps are done before the page is
      // even opened, and the third is the drop zone right below
      Section({
        title: 'How it works',
        note: 'From a game installed on Windows to the game in the Steam library.'
      })(
        HowItWorks()
      ),
      ArchivePicker(),
      // The rest is all about the game in the archive, so it waits for one,
      // and goes when the archive does
      if_($archive)(
        () => div({
          class: styles.section
        })(
          Section({
            title: 'The game',
            note: 'The title is what the Steam library will show. The executable is picked from the '
              + 'archive listing, never typed by hand.'
          })(
            GameForm()
          ),
          Section({
            title: 'Artwork',
            note: 'Ready-made images at these sizes are on SteamGridDB - each slot links to the right '
              + 'section. Every slot is optional.'
          })(
            ArtworkGrid()
          ),
          Section({
            title: 'Before building',
            note: 'Nothing here stops the build.'
          })(
            PreflightList()
          ),
          BuildPanel()
        )
      )
    )
  )
})
