# Plumber

Turns a zipped Windows game into a single `.run` installer for SteamOS: run it once, and the game is in the Steam library with its artwork and Proton set up.

> [!WARNING]
> Plumber is still being tested: use it at your own risk. If you run into a problem and want to help the project, [open an issue on GitHub](https://github.com/TrigenSoftware/Plumber/issues/new?template=bug-report.yml).

Why everything is the way it is: [`SPEC.md`](SPEC.md).

## Layout

- `SPEC.md`: the specification
- `packages/installer` (`@plumber/installer`): the installer that runs on SteamOS, see its [README](packages/installer/README.md)
- `packages/frontend` (`@plumber/frontend`): the web application that builds the `.run` installer

`packages/frontend/app/` follows Flat Layers Design:

```
app/
  index.ts     entry point
  devtools.ts  in-page DevTools of the stores, development only
  styles.css   global CSS entry
  assets/      icons, fonts, images
  shared/      app-wide constants, types, pure utils
  services/    zip (central directory, Zip64), exe scoring, DLL wrappers,
               artwork, recipe, tar + gzip, .run assembly, preflight checks
  stores/      game, artwork, build, preflight: the wizard state
  uikit/       presentational components and design tokens
  blocks/      ArchivePicker, GameForm, ArtworkGrid, PreflightList, BuildPanel
  pages/       Home
```

The UI is written with [nanoviews](https://github.com/TrigenSoftware/nanoviews) and [@nano_kit/store](https://nano-kit.js.org/store). The build runs in Chromium only: it streams the `.run` to disk through `showSaveFilePicker`.

## Development

```sh
pnpm install
pnpm updateGitHooks
pnpm dev          # dev server of the frontend; Alt+Shift+D opens the nano_kit DevTools
pnpm storybook    # Storybook on port 6006
pnpm test         # lint, types and unit tests of both packages
pnpm build        # production build into packages/frontend/dist/
pnpm preview      # serves that build locally
pnpm commit       # Conventional Commits, scoped by package
```

## License

[MIT](LICENSE)
