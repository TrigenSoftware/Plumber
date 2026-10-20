# Plumber

Turns a zipped Windows game into a single `.run` installer for SteamOS: run it once, and the game is in the Steam library with its artwork and Proton set up.

> [!WARNING]
> Plumber is still being tested: use it at your own risk. If you run into a problem and want to help the project, [open an issue on GitHub](https://github.com/TrigenSoftware/Plumber/issues/new?template=bug-report.yml).

## How to use

On a Windows PC:

1. Install the game.
2. Zip the folder it is installed in: right-click it and choose **Compress to → ZIP File**. On Windows 10 it is **Send to → Compressed (zipped) folder**.

In the browser, on [the Plumber site](https://trigensoftware.github.io/Plumber/):

3. Drop the zip onto the page.
4. Check the title and the executable, add artwork if you like, and build the installer: a single `.run` file.

On SteamOS:

5. Switch to Desktop Mode: press the Steam button, then **Power** → **Switch to Desktop**.
6. Copy the `.run` file over: a USB stick, a network share, whatever is at hand.
7. Right-click the file, open **Properties**, go to the **Permissions** tab and tick **Is executable**.
8. Double-click it. The installer asks where to put the game and which Proton version to run it with: if you are not sure, keep what is already selected.
9. Steam restarts by itself, and the game is in the library with its artwork. Double-click **Return to Gaming Mode** on the desktop and play.

Why everything is the way it is: [`SPEC.md`](SPEC.md).

## Layout

- `SPEC.md`: the specification
- `packages/installer` (`@plumber/installer`): the installer that runs on SteamOS, see its [README](packages/installer/README.md)
- `packages/frontend` (`@plumber/frontend`): the web application that builds the `.run` installer

`packages/frontend/app/` follows Flat Layers Design:

```
app/
  index.ts      entry point
  devtools.ts   in-page DevTools of the stores, development only
  styles.css    global CSS entry
  assets/       icons, fonts, images
  shared/       app-wide constants, types, pure utils
  services/     zip (central directory, Zip64), exe scoring, DLL wrappers,
                artwork, recipe, tar + gzip, .run assembly, browser downloads,
                preflight checks
  stores/       game, artwork, build, preflight: the wizard state
  uikit/        presentational components and design tokens
  blocks/       ArchivePicker, GameForm, ArtworkGrid, PreflightList, BuildPanel
  pages/        Home
```

The UI is written with [nanoviews](https://github.com/TrigenSoftware/nanoviews) and [@nano_kit/store](https://nano-kit.js.org/store). Where the browser has `showSaveFilePicker` (Chrome, Edge), the build streams the `.run` to disk through it. Anywhere else (Firefox, Safari, Brave) the browser downloads it as a `Blob` made of the header, meta and the archive `File` itself, so the archive is never read into memory either.

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
