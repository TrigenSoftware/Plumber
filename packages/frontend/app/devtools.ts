import { devtools } from '@nano_kit/devtools'

// The in-page panel of the stores, with their signals and a log of what changed
// them. Development only: the guarded call folds away in the production build,
// the package with it. The entry point imports this module before anything
// else, since whatever is created before the call goes unseen.
if (import.meta.env.DEV) {
  devtools()
}
