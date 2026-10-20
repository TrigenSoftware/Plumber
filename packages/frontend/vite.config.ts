import { join } from 'node:path'
import { Features } from 'lightningcss'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Relative, so the build works wherever it is served: GitHub Pages puts it
  // under /Plumber/ rather than at the root of a domain
  base: './',
  resolve: {
    alias: {
      '~': join(import.meta.dirname, 'app')
    }
  },
  css: {
    // @custom-media in uikit/media.css needs a transformer that understands it
    transformer: 'lightningcss',
    lightningcss: {
      // Vite's default targets, the widely available baseline, would compile
      // light-dark() into variables switched by prefers-color-scheme, which a
      // color-scheme forced on the root cannot reach. The browsers the page is
      // for have light-dark() natively: Chromium since 123, Firefox since 120,
      // Safari since 17.5
      exclude: Features.LightDark,
      drafts: {
        customMedia: true
      }
    }
  },
  build: {
    target: 'esnext',
    cssMinify: 'lightningcss'
  },
  test: {
    environment: 'happy-dom',
    // Unmounts whatever a test rendered once it is over
    setupFiles: ['@nanoviews/testing-library/vitest'],
    coverage: {
      reporter: ['lcovonly', 'text'],
      include: ['app/**/*'],
      // Stories are run by Storybook, and the DevTools start in development alone
      exclude: ['app/**/*.stories.ts', 'app/devtools.ts']
    },
    typecheck: {
      enabled: true,
      include: ['**/*.spec.ts']
    }
  }
})
