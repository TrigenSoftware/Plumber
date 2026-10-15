# installer

The installer that runs on SteamOS: unpacks the game, adds it to Steam with its artwork and Proton set up, and can remove it again.

The reasoning behind the decisions is in **[`SPEC.md`](../../SPEC.md)** at the root of the repository. The spec comes first: the code follows it, and it keeps everything found out by trial on a live machine. A fact the spec marks as verified was taken from a real Deck; `[?]` marks an unverified guess.

`src/` is the installer as it travels inside the `.run`: `index.ts` hands these files over as text (`?raw`), and the generator in [`../frontend/`](../frontend/) depends on this package as a workspace dependency and loads it only when it builds, so the two cannot drift apart. What goes into the bundle is listed in `index.ts`, and the composition of meta is pinned by `packages/frontend/app/services/bundle/bundle.spec.ts`. Inside meta everything lies on one level, and `setup.sh` calls `install.py` as its neighbour.

## Files

| file | purpose |
|---|---|
| `src/setup.sh` | entry point: questions through `kdialog`, the log, the closing window |
| `src/uninstall-template.sh` | goes into the game folder as `uninstall.run` |
| `src/install.py` | orchestration: unpacks, stops the client, writes, verifies |
| `src/steam_install.py` | user, shortcut, Proton, DLL wrappers, artwork |
| `src/steamctl.py` | the Steam client's lifecycle |
| `src/unpack.py` | unpacks the zip straight out of the `.run`, Zip64 included |
| `src/vdf.py` | reader and writer for both VDF formats |
| `src/config_surgery.py` | precise edits to `config.vdf` without parsing it into a tree |
| `src/check-install.py` | an independent acceptance check of what was installed |
| `src/selftest.py` | tests of the logic and the scripts; not in the bundle |
| `make-run.sh` | builds a `.run` from a meta folder, without the browser |
| `index.ts` | the scripts as text for the generator; not in the bundle |

## Tests

```sh
python3 packages/installer/src/selftest.py   # or pnpm --filter @plumber/installer test:unit
```

No dependencies and no pytest: the scripts go into the bundle as they are, and they may not pull requirements in with them. The tests never talk to a live Steam: each one builds its own `~/.steam/steam` in a temporary folder.

Deliberately not covered: `steamctl` itself, that is, talking to a running client. That was verified by hand on a Deck, see section 9 of the spec. The orchestration in `install.py` runs against a stand-in for it, and `setup.sh` runs whole, with a stub in place of `install.py`.

## Usage

The usual way is to build the `.run` with the generator in the browser. Without it, from a folder:

```sh
./make-run.sh <meta-dir> <archive.zip> <out.run>
```

The meta folder holds, on one level, everything from `src/` except `selftest.py`, plus `recipe.json` and `art/` with the artwork (`portrait|wide|hero|logo|icon` + `.png`/`.jpg`).

Install:

```sh
./nfsmw.run                                  # with dialogs
DEST=~/Games PROTON=proton_10 ./nfsmw.run    # without dialogs
./nfsmw.run --dry-run                        # show what would happen, change nothing
```

The log is `<game-dir>/install.log`, or `/tmp/<slug>-install.log` when the game folder cannot be written to. `setup.sh` writes it as the install goes, with the tracebacks, so it is there after a crash as well. The exit codes are described at the top of `install.py`; 4 means "the game is in the library, but not all of its setup went through".

Uninstall with what the installer put next to the game:

```sh
<game-dir>/uninstall.run
python3 <game-dir>/.plumber/install.py --recipe <game-dir>/.plumber/recipe.json \
    --game-dir <game-dir> --uninstall [--purge]
```

Check what was installed:

```sh
python3 src/check-install.py <game-dir>/.plumber/recipe.json <game-dir> <proton_tool> [art-dir]
```

## Three things that are easy to trip over

1. **A write to `shortcuts.vdf` can be undone by the client.** Steam rewrites the file an unpredictable time after it starts, and it may put its own state there. Only what survives that moment counts as success. Details in 5.1.0 of the spec.
2. **`config.vdf` must not be parsed and serialized back**: it holds every client setting. Only precise byte edits (`config_surgery.py`).
3. **A `.run` will not start once downloaded**: the browser drops the execute bit, and neither a double click nor "Run in Konsole" says so clearly. Section 8 of the spec.
