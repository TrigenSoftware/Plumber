import {
  describe,
  it,
  expect
} from 'vitest'
import {
  ART_SLOTS,
  ART_TYPES,
  artFileName,
  getSteamGridDbUrl
} from './artwork.ts'

const file = (type: string, name = 'art') => new File([new Uint8Array(1)], name, {
  type
})

describe('services', () => {
  describe('artwork', () => {
    describe('artFileName', () => {
      it('should name a jpeg .jpg whatever the file was called', () => {
        expect(artFileName('hero', file('image/jpeg', 'anything.bin'))).toBe('hero.jpg')
      })

      it('should name a png .png', () => {
        expect(artFileName('portrait', file('image/png'))).toBe('portrait.png')
      })
    })

    describe('ART_TYPES', () => {
      it('should offer only what the installer copies into grid/', () => {
        // steam_install.install_art looks for .png, .jpg and .jpeg and nothing
        // else, so anything wider here would never reach the library (7.5).
        expect(ART_TYPES).toEqual(['image/png', 'image/jpeg'])
      })
    })

    describe('getSteamGridDbUrl', () => {
      it('should open the section filtered by size when it is given', () => {
        expect(getSteamGridDbUrl('grids', 'Need for Speed', '920x430'))
          .toBe('https://www.steamgriddb.com/search/grids/920x430/all/all?term=Need%20for%20Speed')
      })

      it('should point at the section with the title as the search term', () => {
        expect(getSteamGridDbUrl('heroes', 'Need for Speed'))
          .toBe('https://www.steamgriddb.com/search/heroes?term=Need%20for%20Speed')
      })
    })

    describe('ART_SLOTS', () => {
      it('should carry the five slots at the sizes Steam expects', () => {
        expect(ART_SLOTS.map(spec => `${spec.slot} ${spec.width}x${spec.height}`)).toEqual([
          'portrait 600x900',
          'wide 920x430',
          'hero 1920x620',
          'logo 1200x369',
          'icon 1024x1024'
        ])
      })
    })
  })
})
