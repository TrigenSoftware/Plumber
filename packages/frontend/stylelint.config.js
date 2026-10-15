export default {
  extends: [
    '@trigen/stylelint-config',
    '@trigen/stylelint-config/logical'
  ],
  rules: {
    // Reduced motion is handled via the --screenReducedMotion custom media (app/uikit/media.css)
    'a11y/media-prefers-reduced-motion': [
      true,
      {
        customMedia: '--screenReducedMotion'
      }
    ]
  }
}
