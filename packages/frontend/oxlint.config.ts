import { defineConfig } from '@trigen/oxlint'
import storybookConfig from '@trigen/oxlint-config/storybook'
import rootConfig from '../../oxlint.config.ts'

export default defineConfig({
  env: {
    browser: true
  },
  extends: [
    rootConfig,
    storybookConfig
  ],
  overrides: [
    {
      // A page re-exports itself as default so the entry point can lazy-load it
      files: ['app/pages/*/*'],
      rules: {
        'import/no-default-export': 'off'
      }
    },
    {
      // The keys of recipe.json are the format the installer on the Deck reads.
      // They are its names, not ours, so they stay snake_case.
      files: ['app/services/recipe/*'],
      rules: {
        'trigen/naming-convention': 'off'
      }
    }
  ]
})
