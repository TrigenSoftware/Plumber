import { defineConfig } from '@trigen/oxlint'
import baseConfig from '@trigen/oxlint-config'
import moduleConfig from '@trigen/oxlint-config/module'
import bundlerConfig from '@trigen/oxlint-config/bundler'
import tsTypeCheckedConfig from '@trigen/oxlint-config/typescript-type-checked'
import testConfig from '@trigen/oxlint-config/test'

export default defineConfig({
  ignorePatterns: ['**/dist/', '**/coverage/', '**/storybook-static/'],
  options: {
    typeAware: true,
    typeCheck: true
  },
  // Both packages go through Vite. The bundler config comes before the
  // TypeScript one, whose overrides for declaration files have to win
  extends: [
    baseConfig,
    moduleConfig,
    bundlerConfig,
    tsTypeCheckedConfig,
    testConfig
  ]
})
