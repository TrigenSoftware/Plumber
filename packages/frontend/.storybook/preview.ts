import type {
  Decorator,
  Preview
} from '@nanoviews/storybook'
import '../app/styles.css'

// The page follows the colour scheme of the system: the toolbar forces one on the root instead,
// so the whole preview frame follows the toggle
const withTheme: Decorator = (story, context) => {
  document.documentElement.style.colorScheme = String(context.globals.theme)

  return story()
}
const preview: Preview = {
  parameters: {
    actions: {
      argTypesRegex: '^on[A-Z].*'
    }
  },
  globalTypes: {
    theme: {
      description: 'Theme',
      toolbar: {
        icon: 'mirror',
        items: [
          {
            value: 'light',
            title: 'Light'
          },
          {
            value: 'dark',
            title: 'Dark'
          }
        ],
        dynamicTitle: true
      }
    }
  },
  initialGlobals: {
    theme: 'light'
  },
  decorators: [withTheme]
}

export default preview
