import {
  vi,
  describe,
  it,
  expect
} from 'vitest'
import {
  render,
  screen,
  within,
  fireEvent
} from '@nanoviews/testing-library'
import { signal } from 'nanoviews/store'
import typography from '../typography.module.css'
import {
  type ImageDropPreview,
  type ImageDropProps,
  ImageDrop
} from './ImageDrop.ts'
import styles from './ImageDrop.module.css'

const HERO: ImageDropPreview = {
  url: 'blob:hero',
  note: '1280×720, expected 1920×620',
  problem: null
}

function renderImageDrop(props: Partial<ImageDropProps> = {}) {
  const onFile = vi.fn()
  const onClear = vi.fn()

  render(() => ImageDrop({
    title: 'hero',
    size: '1920×620',
    sourceLabel: 'Heroes',
    sourceUrl: 'https://www.steamgriddb.com/search/heroes?term=game',
    accept: 'image/png,image/jpeg',
    clearLabel: 'Remove',
    onFile,
    onClear,
    ...props
  }))

  const input = screen.getByLabelText<HTMLInputElement>('hero, 1920×620')

  return {
    input,
    frame: input.parentElement!,
    onFile,
    onClear
  }
}

// A drop and a pick end the same way: the browser puts the file into the
// input's own list of files and fires change
function putFile(input: HTMLInputElement, file: File) {
  const transfer = new DataTransfer()

  transfer.items.add(file)
  input.files = transfer.files
}

// What is read out after the name: the text the element is described by
function descriptionOf(element: Element) {
  return document.getElementById(element.getAttribute('aria-describedby')!)?.textContent
}

describe('uikit', () => {
  describe('ImageDrop', () => {
    it('should link to where an image for the frame can be found', () => {
      renderImageDrop()

      const link = screen.getByRole('link', {
        name: 'Heroes'
      })

      expect(link.getAttribute('href')).toBe('https://www.steamgriddb.com/search/heroes?term=game')
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    })

    it('should show the expected size in the frame while empty', () => {
      const { frame } = renderImageDrop()

      expect(within(frame).getByText('1920×620')).toBeTruthy()
      expect(frame.querySelector('img')).toBeNull()
      expect(frame.classList.contains(styles.filled)).toBe(false)
    })

    it('should not offer to clear an empty frame', () => {
      renderImageDrop()

      expect(screen.queryByRole('button', {
        name: 'Remove'
      })).toBeNull()
    })

    it('should show the image in the frame while filled', () => {
      const { frame } = renderImageDrop({
        preview: HERO
      })
      const image = frame.querySelector('img')

      expect(image?.getAttribute('src')).toBe('blob:hero')
      expect(image?.getAttribute('alt')).toBe('')
      expect(within(frame).queryByText('1920×620')).toBeNull()
      expect(frame.classList.contains(styles.filled)).toBe(true)
    })

    it('should offer to clear a filled frame', () => {
      const { onClear } = renderImageDrop({
        preview: HERO
      })

      fireEvent.click(screen.getByRole('button', {
        name: 'Remove'
      }))

      expect(onClear).toHaveBeenCalledOnce()
    })

    it('should hold the file input over the frame', () => {
      const {
        input,
        frame
      } = renderImageDrop()

      expect(input.type).toBe('file')
      expect(input.classList.contains(styles.input)).toBe(true)
      expect(frame.classList.contains(styles.frame)).toBe(true)
    })

    it('should describe the input with the note under the frame', () => {
      const { input } = renderImageDrop({
        preview: HERO
      })

      expect(descriptionOf(input)).toBe(HERO.note)
    })

    it('should describe the input with the problem of the image instead of its note', () => {
      const { input } = renderImageDrop({
        preview: {
          ...HERO,
          problem: 'A logo must have transparency, and a JPEG has none. Use a PNG.'
        }
      })

      expect(descriptionOf(input)).toBe('A logo must have transparency, and a JPEG has none. Use a PNG.')
    })

    it('should tell the clear button of one drop from another by the title', () => {
      renderImageDrop({
        preview: HERO
      })

      expect(screen.getByRole('button', {
        name: 'Remove',
        description: 'hero'
      })).toBeDefined()
    })

    it('should show the note of the image, muted', () => {
      renderImageDrop({
        preview: HERO
      })

      const note = screen.getByText('1280×720, expected 1920×620')

      expect(note.classList.contains(typography.muted)).toBe(true)
      expect(note.classList.contains(styles.problem)).toBe(false)
    })

    it('should show the problem of the image instead of its note', () => {
      renderImageDrop({
        preview: {
          ...HERO,
          problem: 'A logo must have transparency, and a JPEG has none. Use a PNG.'
        }
      })

      const problem = screen.getByText('A logo must have transparency, and a JPEG has none. Use a PNG.')

      expect(problem.classList.contains(styles.problem)).toBe(true)
      expect(problem.classList.contains(typography.muted)).toBe(false)
      expect(screen.queryByText('1280×720, expected 1920×620')).toBeNull()
    })

    it('should call onFile with the file put into the input', () => {
      const file = new File(['png'], 'hero.png', {
        type: 'image/png'
      })
      const {
        input,
        onFile
      } = renderImageDrop()

      putFile(input, file)
      fireEvent.change(input)

      expect(onFile).toHaveBeenCalledExactlyOnceWith(file)
    })

    it('should not call onFile when the picker is dismissed', () => {
      const {
        input,
        onFile
      } = renderImageDrop()

      fireEvent.change(input)

      expect(onFile).not.toHaveBeenCalled()
    })

    it('should empty the input once a file is put into it', () => {
      const { input } = renderImageDrop()

      putFile(input, new File(['png'], 'hero.png', {
        type: 'image/png'
      }))
      fireEvent.change(input)

      expect(input.value).toBe('')
      expect(input.files).toHaveLength(0)
    })

    it('should update the image in place when the preview changes', () => {
      const $url = signal('blob:hero')
      const { frame } = renderImageDrop({
        // A new object on every read, as a consumer deriving it from a store hands it in
        preview: () => ({
          ...HERO,
          url: $url()
        })
      })
      const image = frame.querySelector('img')

      $url('blob:other')

      expect(frame.querySelector('img')).toBe(image)
      expect(image?.getAttribute('src')).toBe('blob:other')
    })

    it('should show the size again once the preview is gone', () => {
      const $preview = signal<ImageDropPreview | null>(HERO)
      const { frame } = renderImageDrop({
        preview: $preview
      })

      $preview(null)

      expect(frame.querySelector('img')).toBeNull()
      expect(within(frame).getByText('1920×620')).toBeTruthy()
      expect(frame.classList.contains(styles.filled)).toBe(false)
      expect(screen.queryByRole('button', {
        name: 'Remove'
      })).toBeNull()
    })

    it('should show the image once a preview arrives', () => {
      const $preview = signal<ImageDropPreview | null>(null)
      const { frame } = renderImageDrop({
        preview: $preview
      })

      $preview(HERO)

      expect(frame.querySelector('img')?.getAttribute('src')).toBe('blob:hero')
      expect(screen.getByText('1280×720, expected 1920×620')).toBeTruthy()
      expect(screen.getByRole('button', {
        name: 'Remove'
      })).toBeTruthy()
    })
  })
})
