import {
  describe,
  it,
  expect
} from 'vitest'
import {
  getLayoutId,
  getLayoutSearchUrl
} from './controller.ts'

describe('services', () => {
  describe('controller', () => {
    describe('getLayoutId', () => {
      it('should read the ID out of a layout page on SteamInputDB', () => {
        expect(getLayoutId('https://www.steaminputdb.com/config/3036980641')).toBe('3036980641')
        expect(getLayoutId('https://steaminputdb.com/config/3036980641/')).toBe('3036980641')
        expect(getLayoutId('  https://www.steaminputdb.com/config/3036980641?tab=details  ')).toBe('3036980641')
      })

      it('should take a bare ID as it is', () => {
        expect(getLayoutId(' 3036980641 ')).toBe('3036980641')
      })

      it('should find no ID in an empty field', () => {
        expect(getLayoutId('   ')).toBeNull()
      })

      it('should find no ID in a link to anything else', () => {
        expect(getLayoutId('https://www.steaminputdb.com/config/search?searchtext=Deus%20Ex')).toBeNull()
        expect(getLayoutId('https://www.steaminputdb.com/app/6910')).toBeNull()
        expect(getLayoutId('https://example.com/config/3036980641')).toBeNull()
        expect(getLayoutId('https://steamcommunity.com/profiles/76561198026632814')).toBeNull()
        expect(getLayoutId('ftp://www.steaminputdb.com/config/3036980641')).toBeNull()
        expect(getLayoutId('Deus Ex Steam Deck Perfection')).toBeNull()
      })
    })

    describe('getLayoutSearchUrl', () => {
      it('should search SteamInputDB for the title', () => {
        expect(getLayoutSearchUrl('Deus Ex: GOTY'))
          .toBe('https://www.steaminputdb.com/config/search?searchtext=Deus%20Ex%3A%20GOTY')
      })
    })
  })
})
