import {
  vi,
  describe,
  it,
  expect
} from 'vitest'
import {
  render,
  screen,
  fireEvent
} from '@nanoviews/testing-library'
import {
  type FileDropProps,
  FileDrop
} from './FileDrop.ts'
import styles from './FileDrop.module.css'

const TITLE = 'Drop the game archive here'
const HINT = 'A .zip of the folder the game is installed in.'

function renderFileDrop(props: Partial<FileDropProps> = {}) {
  const onFile = vi.fn()

  render(() => FileDrop({
    accept: '.zip',
    onFile,
    ...props
  })(
    TITLE
  ))

  return {
    input: screen.getByLabelText<HTMLInputElement>(TITLE),
    onFile
  }
}

// A drop and a pick end the same way: the browser puts the file into the
// input's own list of files and fires change
function putFile(input: HTMLInputElement, file: File) {
  const transfer = new DataTransfer()

  transfer.items.add(file)
  input.files = transfer.files
}

describe('uikit', () => {
  describe('FileDrop', () => {
    it('should name the file input after the title', () => {
      const { input } = renderFileDrop()

      expect(input.type).toBe('file')
    })

    it('should describe the input with the hint', () => {
      const { input } = renderFileDrop({
        hint: HINT
      })

      expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toBe(HINT)
    })

    it('should leave the input undescribed when there is no hint', () => {
      const { input } = renderFileDrop()

      expect(input.hasAttribute('aria-describedby')).toBe(false)
    })

    it('should hold the input over the zone, with the class on the zone', () => {
      const { input } = renderFileDrop({
        class: 'outer'
      })
      const zone = input.parentElement!

      expect(input.classList.contains(styles.input)).toBe(true)
      expect(zone.classList.contains(styles.root)).toBe(true)
      expect(zone.classList.contains('outer')).toBe(true)
      expect(input.classList.contains('outer')).toBe(false)
    })

    it('should hand the input the attributes it is given', () => {
      const { input } = renderFileDrop({
        accept: '.zip,application/zip',
        disabled: true
      })

      expect(input.accept).toBe('.zip,application/zip')
      expect(input.disabled).toBe(true)
    })

    it('should call onFile with the file put into the input', () => {
      const file = new File(['zip'], 'game.zip')
      const {
        input,
        onFile
      } = renderFileDrop()

      putFile(input, file)
      fireEvent.change(input)

      expect(onFile).toHaveBeenCalledExactlyOnceWith(file)
    })

    it('should not call onFile when the picker is dismissed', () => {
      const {
        input,
        onFile
      } = renderFileDrop()

      fireEvent.change(input)

      expect(onFile).not.toHaveBeenCalled()
    })

    it('should empty the input once a file is put into it', () => {
      const { input } = renderFileDrop()

      putFile(input, new File(['zip'], 'game.zip'))

      expect(input.value).not.toBe('')

      fireEvent.change(input)

      expect(input.value).toBe('')
      expect(input.files).toHaveLength(0)
    })
  })
})
