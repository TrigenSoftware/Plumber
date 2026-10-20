import {
  vi,
  describe,
  it,
  expect,
  afterEach
} from 'vitest'
import { startDownload } from './download.ts'

// The browser side of a download: the address it gives the Blob, the click
// that would save it, and letting the address go
function catchDownload() {
  return {
    createObjectURL: vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:run'),
    revokeObjectURL: vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {}),
    click: vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  }
}

describe('services', () => {
  describe('download', () => {
    describe('startDownload', () => {
      afterEach(() => {
        vi.restoreAllMocks()
      })

      it('should click a link to the Blob, named for the file to save', () => {
        const {
          createObjectURL,
          click
        } = catchDownload()
        const blob = new Blob(['#!/bin/sh\n'])

        startDownload(blob, 'need-for-speed.run')

        // The link is what the click was called on
        const [link] = click.mock.contexts as HTMLAnchorElement[]

        expect(createObjectURL).toHaveBeenCalledExactlyOnceWith(blob)
        expect(click).toHaveBeenCalledOnce()
        expect(link.href).toBe('blob:run')
        expect(link.download).toBe('need-for-speed.run')
      })

      it('should keep the address of the Blob until it is let go', () => {
        const { revokeObjectURL } = catchDownload()
        const letGo = startDownload(new Blob(), 'need-for-speed.run')

        expect(revokeObjectURL).not.toHaveBeenCalled()

        letGo()

        expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:run')
      })

      it('should let the address go only once', () => {
        const { revokeObjectURL } = catchDownload()
        const letGo = startDownload(new Blob(), 'need-for-speed.run')

        letGo()
        letGo()

        expect(revokeObjectURL).toHaveBeenCalledOnce()
      })
    })
  })
})
