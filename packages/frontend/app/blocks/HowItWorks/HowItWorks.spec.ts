import {
  describe,
  it,
  expect
} from 'vitest'
import {
  render,
  screen
} from '@nanoviews/testing-library'
import typography from '~/uikit/typography.module.css'
import { HowItWorks } from './HowItWorks.ts'
import styles from './HowItWorks.module.css'

describe('blocks', () => {
  describe('HowItWorks', () => {
    it('should say where each part of the way is done', () => {
      render(HowItWorks())

      expect(screen.getAllByRole('heading', {
        level: 3
      }).map(heading => heading.textContent)).toEqual([
        'On a Windows PC',
        'Here, in the browser',
        'On SteamOS'
      ])
    })

    it('should number the steps on from one part to the next', () => {
      render(HowItWorks())

      expect(screen.getAllByRole<HTMLOListElement>('list').map(list => [list.start, list.children.length])).toEqual([
        [1, 2],
        [3, 2],
        [5, 5]
      ])
    })

    it('should set apart what to look for on screen', () => {
      const { container } = render(HowItWorks())

      expect([...container.querySelectorAll(`.${typography.key}`)].map(key => key.textContent)).toEqual([
        'Compress to → ZIP File',
        'Send to → Compressed (zipped) folder',
        'Power',
        'Switch to Desktop',
        'Properties',
        'Permissions',
        'Is executable',
        'Return to Gaming Mode'
      ])
    })

    it('should tell to keep the Proton version already selected when unsure', () => {
      render(HowItWorks())

      expect(screen.getByText(/if you are not sure, keep what is already selected\.$/).tagName).toBe('LI')
    })

    it('should keep the class passed by the consumer', () => {
      render(HowItWorks({
        class: 'outer'
      }))

      expect(screen.getByText('On a Windows PC').closest('.outer')?.classList.contains(styles.root)).toBe(true)
    })

    it('should hand the other attributes to its root', () => {
      render(HowItWorks({
        title: 'outer'
      }))

      expect(screen.getByText('On a Windows PC').closest(`.${styles.root}`)?.getAttribute('title')).toBe('outer')
    })
  })
})
