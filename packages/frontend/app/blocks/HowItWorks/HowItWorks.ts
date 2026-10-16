import {
  type Attributes,
  component$,
  div,
  h3,
  li,
  ol,
  strong
} from 'nanoviews'
import typography from '~/uikit/typography.module.css'
import styles from './HowItWorks.module.css'

export type HowItWorksProps = Attributes<'div'>

/** A step as its words: every other part names something to look for on screen. */
type Step = string[]

interface Stage {
  /** Where the steps are done */
  where: string
  steps: Step[]
}

/**
 * The whole way, for someone who has never done it: the game is installed on
 * a Windows PC, turned into a `.run` here and run on SteamOS. Said the same
 * way, word for word, as in the README.
 */
const STAGES: Stage[] = [
  {
    where: 'On a Windows PC',
    steps: [
      ['Install the game.'],
      [
        'Zip the folder it is installed in: right-click it and choose ',
        'Compress to → ZIP File',
        '. On Windows 10 it is ',
        'Send to → Compressed (zipped) folder',
        '.'
      ]
    ]
  },
  {
    where: 'Here, in the browser',
    steps: [
      ['Drop the zip below.'],
      ['Check the title and the executable, add artwork if you like, and build the installer: a single .run file.']
    ]
  },
  {
    where: 'On SteamOS',
    steps: [
      [
        'Switch to Desktop Mode: press the Steam button, then ',
        'Power',
        ' → ',
        'Switch to Desktop',
        '.'
      ],
      ['Copy the .run file over: a USB stick, a network share, whatever is at hand.'],
      [
        'Right-click the file, open ',
        'Properties',
        ', go to the ',
        'Permissions',
        ' tab and tick ',
        'Is executable',
        '.'
      ],
      ['Double-click it. The installer asks where to put the game and which Proton version to run it with: if you are not sure, keep what is already selected.'],
      [
        'Steam restarts by itself, and the game is in the library with its artwork. Double-click ',
        'Return to Gaming Mode',
        ' on the desktop and play.'
      ]
    ]
  }
]

/** @returns The number each stage's list starts from: they count on from one another. */
function firstNumbers(stages: Stage[]) {
  let next = 1

  return stages.map(({ steps }) => {
    const first = next

    next += steps.length

    return first
  })
}

const FIRST_NUMBERS = firstNumbers(STAGES)

/**
 * Every step from a game installed on Windows to the game in the Steam
 * library, grouped by where it is done.
 */
export const HowItWorks = component$(({
  class: className,
  ...props
}: HowItWorksProps) => (
  div({
    class: [
      className,
      styles.root
    ],
    ...props
  })(
    ...STAGES.map(({
      where,
      steps
    }, index) => (
      div({
        class: styles.stage
      })(
        h3({
          class: `${styles.where} ${typography.text}`
        })(
          where
        ),
        ol({
          class: `${styles.steps} ${typography.text}`,
          start: FIRST_NUMBERS[index]
        })(
          ...steps.map(parts => (
            li()(
              ...parts.map((part, at) => (
                at % 2
                  ? strong({
                    class: typography.key
                  })(
                    part
                  )
                  : part
              ))
            )
          ))
        )
      )
    ))
  )
))
