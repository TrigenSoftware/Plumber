# Plumber: specification

A draft for discussion. Items are marked: `[MVP]` goes into the first version, `[v2]` comes later, `[?]` is open and needs discussing.

**Status: stages 1, 2 and 3 of section 9 are done.** The installer, the packing into a `.run` and the web application that builds it all work. The full cycle (remove the game cleanly, install it with one file, check the result) has passed on real games three times: from a folder and from a `.run` built by `make-run.sh`, both with an independent acceptance run, and from a `.run` built in the browser.

The findings of the field checks are written in where they belong and marked "**verified**": these are facts taken from a specific machine, not hypotheses. `[?]` marks what is not verified.

---

## 1. The task

A web application that turns a zipped Windows game into a single `.run` installer for SteamOS: run it once, and the game is in the Steam library with its artwork and Proton set up.

**The target platform is SteamOS only.** Not "Linux in general". The assumption is used actively: the Steam paths are known, Proton is known to be installed, and the client is known to be native rather than a Flatpak.

### 1.1 Scenario

1. A person on Windows (or a Mac) installs the game and zips its folder
2. Opens the web application, drops the zip and the artwork into it, fills in the form
3. Downloads the `.run` and moves it to SteamOS by any means
4. On SteamOS: right click → Properties → Permissions → **Is executable**, then a double click, and that is it

The fourth step used to read "`chmod +x`, run", which put a terminal into the user's very first action. For someone who is not a programmer that is a failed scenario, not a detail: **everything is done with the mouse, and the application has to show exactly how**, with a picture rather than a command line.

There is no debugging loop: the build and the run happen on different machines. That shapes the requirements for diagnostics (see 6.4).

### 1.2 What the application does not do

- It does not host or distribute game files. Everything is local in the browser, and there is no backend
- It does not install the game. Its input is a folder where the game is already installed
- It does not deal with copy protection (CD checks and the like). That is orthogonal
- It does not install from Gaming Mode. Desktop Mode only, see 1.3

### 1.3 Installing from Desktop Mode only

v1 aims at Desktop Mode. The scenario "downloaded with Chrome in Gaming Mode, tapped the file, the install started" will not work, and that is structural, not a matter of luck:

- **Chrome cannot execute files.** On Linux it has no "run" action, only "open with the registered handler", and a `.run` has no handler
- **There is nothing to set the execute bit with.** Gaming Mode has neither a file manager nor a terminal
- **Chrome on SteamOS is a Flatpak.** Downloads land in its sandbox, from where `setup.sh` reaches neither `~/Games` nor the Steam configs

Launchers like Battle.net work in Gaming Mode not in spite of this but because of the mechanism: Steam starts them as shortcuts. Everything Steam starts lives fine under gamescope; anything that is not a shortcut has nothing to start it.

**Postponed, not discarded.** Possible ways, once there is time:

- **A receiver shortcut.** Once, from Desktop Mode, we add a script to Steam that finds fresh `.run` files in Downloads and installs them. The bootstrap stays one-off rather than per game. NonSteamLaunchers works this way
- **A Decky plugin.** A proper UI right in Gaming Mode, but a different stack and a separate project

What would have to be found out then: whether `kdialog` windows appear under gamescope (Plasma is not running there, and Qt needs a platform plugin), how Steam's on-screen keyboard behaves with arbitrary Qt windows, and what to do about gamepad navigation. The last one is already clear: the `--getexistingdirectory` file dialog is painful with the sticks, and for Gaming Mode the question would have to become a list of three items (internal / SD / other).

---

## 2. Key decisions and their reasons

This section exists so that a month from now nobody replays what has already been thought through.

### 2.1 Delivery form: a makeself-like `.run`

A shell script with an archive glued on. The alternatives were dropped:

- **A Flatpak bundle**: the sandbox does not reach the Steam configs, and the build is long
- **An AppImage**: squashfs is read-only, so the game has to be unpacked outside anyway

On SteamOS the work needs only `sh` and `tar`. Both are there, the read-only rootfs does not get in the way, and everything is written into `~`.

### 2.2 Steam is shut down, and we write the VDFs ourselves

The install runs from Desktop Mode only (1.3), and there is no reason to spare a running client there. So: `steam -shutdown`, edit the files, start it again.

This reverses the decision that used to be the main one. The original plan was the `steam://addnonsteamgame/` URL handler, because writing to `shortcuts.vdf` while the client runs is useless: it keeps the list in memory and writes it to disk on exit. But the handler adds only the shortcut. The Proton binding (`CompatToolMapping` in `config.vdf`) cannot be set through it, as there is no API for that.

With Steam shut down we get both files and **the standard mechanism instead of a workaround**:

- the shortcut points at the `.exe` directly, and the name is set by the `AppName` field
- Proton is chosen in the dropdown in Properties → Compatibility, as for an ordinary game
- the appid is computed from what we put into `Exe` ourselves, with no guessing

What goes away with this decision: `launch.sh` reproducing the call into the sniper runtime, a `.desktop` file as the carrier of the name, `steamos-add-to-steam`, and making up for the missing dropdown through `PROTON_PATH`. We stop copying what Steam does inside, and so we stop depending on whether Valve changes those internals.

**What it costs:**

- **Two parsers.** `shortcuts.vdf` is binary, `config.vdf` is text. SteamOS has `python3`, but `python-vdf` is not installed, so the implementation goes into the bundle. Around 200-300 lines
- **The risk of breaking `config.vdf`.** It is not a list of shortcuts: it holds every client setting, and a sloppy parser breaks Steam completely. A backup before writing is mandatory, and so is **a surgical edit**: find or create the `CompatToolMapping` block, write one entry, touch nothing else. No "parse it and serialize it back"
- **Orchestration.** `steam -shutdown`, polling for the process with a timeout, starting it again. Plus a warning: a download in progress will be interrupted
- **The write can be undone by the client.** Found on a live Deck, and it cost five shortcuts: see 5.1.0. This is not the risk of a broken file, which a careful parser prevents, but the risk of losing the edit, and it needs a separate verification step

The trade is deliberate: twenty lines of templates plus three unverified hypotheses became three hundred lines of straightforward code with no hypotheses. Code is written once and checked on the spot; hypotheses fall apart on someone else's SteamOS, where there is nothing to debug with.

### 2.3 The shortcut points at the `.exe`

A consequence of 2.2. The shortcut used to point at `launch.sh`, only to get around `CompatToolMapping` being out of reach while the client runs. That reason is gone.

What it gives beyond the Proton dropdown:

- **protontricks sees the game.** It looks for prefixes by `compatdata/<appid>` and relies on `CompatToolMapping`. Both are now in place
- **Steam creates the prefix**, in its canonical place, with its own version of Proton. We have neither a path to choose nor a format to guess
- **The appid is set by us, not derived by Steam.** **Verified:** `appid` is an explicit field of the entry; the client reads it and does not recompute it. Of the six shortcuts on the test Deck, two (a Flatpak Chrome and chiaki4deck) do not follow the formula at all (none of the six variants tried matched), and Steam has lived with them for years. **The decisive check:** a shortcut added by the client itself through "Add a Non-Steam Game" got an appid that matches none of the nine variants of the input string tried. Steam generates the number at random and only keeps the high bit set.

  So the CRC32 formula over `Exe + AppName` is **a convention of third-party tools**, not a reproduction of Steam's logic; that is why it matched on the four shortcuts made by NonSteamLaunchers. We keep it, but for our own reason: determinism across rebuilds. The same archive with the same name gives the same appid, so the artwork does not come loose. A side effect, also useful: since the number is stored rather than derived from the fields, renaming the shortcut in Steam does not break the artwork

Nothing from the earlier list is lost: Launch Options with `%command%`, the QAM settings (TDP, frame limit, FSR), the controller layout, Steam Input, the overlay, the play time counter. All of it is tied to the appid and does not care what type the target is.

### 2.4 Zip only as input

A folder through `webkitdirectory` was considered as a fallback and dropped.

A zip gives three things a folder does not:

1. **Pass-through.** The archive is copied into the `.run` byte for byte. No tar writer in the browser, no recompressing 8 GB
2. **The central directory**: the full listing of the contents is read from the last ~200 KB of the file. All the auto-detection comes from there
3. A native archiver compresses better than `CompressionStream`

What a folder would have meant: the browser has to read and compress every file, which for 8 GB is minutes of busy CPU. Plus `webkitdirectory` lists files, not the structure, so empty folders get lost. Plus the exe auto-detection and the checks would have to be written a second time on top of a different data model.

The price of the decision: the person has to zip the folder themselves, and needs twice the disk space while zipping.

**What drops out of the code:** the tar writer, `CompressionStream`, per-file progress (only per-byte progress remains), the "normalize the structure of a folder" branch, the warning about the build time.

### 2.5 The prefix is not part of the bundle

An earlier idea was to "freeze a ready Wine prefix and put it into the archive". Dropped:

- the browser does not keep the symlinks inside the prefix
- the bundle grows by the size of `drive_c/windows`
- it ties the bundle to a specific version of Proton

Instead: the game folder plus a recipe, and the prefix is created on the target machine.

### 2.6 No registry

Games write their `Install Dir`, language and graphics settings into the registry. Whether a game needs them to start is an empirical question, different for each game. Portable builds exist, so often they are not needed.

**Decision: we do not do it at all.** Not "optionally", not "in a collapsed section": we do not do it. We come back to the question only if real tests turn up a problem that the registry provably fixes.

What we do not write until that happens: parsing `.reg`, recoding UTF-16 to UTF-8, rewriting paths with their doubled backslashes, branching on `WOW6432Node` by the architecture of the prefix, a UI with a checkbox per key.

Diagnosing it, if the problem does show up: on the source Windows machine, delete the game's registry branch (keeping an export) and start the exe from another folder. If it starts, the registry has nothing to do with it, and the cause is elsewhere.

### 2.7 Artwork by hand only

**Fetching from SteamGridDB automatically is impossible from the browser. Verified.**

A request to `api/v2/search/autocomplete/` from a foreign origin fails at the preflight: OPTIONS does not get `Access-Control-Allow-Origin`, and the actual request never happens. That is the server's decision and cannot be worked around from the client. The service is built for native clients (STL, BoilR), where CORS does not exist.

**Wider than CORS.** Verified separately: SteamGridDB answers **403 to ordinary game pages too**, not only to the API, when the request does not come from a browser. So not only automatic fetching is out of reach but any programmatic look at the catalogue as well: "go and see what is there" does not work either. The only working access is a live browser with a person at it.

Workarounds that were dropped:

- **our own proxy** (a Cloudflare Worker): it solves both CORS and the key, but it breaks "there is no backend" from 1.2, and the owner of the key answers for any abuse
- **downloading in `setup.sh`** with curl: CORS has nothing to do with it, but SteamOS needs internet during the install, and there is no preview before the build

Alternative services were dropped too. We need four specific Steam formats, including the hero and a transparent logo. IGDB, RAWG and TheGamesDB are databases about games where the cover is a by-product: one picture in arbitrary proportions, and none of them has a hero or a logo. Three sources with three kinds of authorization for a worse result is a bad trade.

**Decision: the user brings ready images.** The interface has a link to SteamGridDB under each slot: there the artwork is already sorted by type and size, and downloading by hand is faster than setting up a key. That is ~90% of the value of an integration for the price of one link.

`[?]` Come back to this if a backend becomes necessary for other reasons. It is not worth setting one up just for the artwork.

### 2.8 What is settled at packing time and what at install time

The criterion: **what depends on the archive is settled at packing time; what depends on the machine is settled at install time.**

| Decision | When |
|---|---|
| Name, path to the exe, artwork | packing (depends on the archive) |
| Install location, including the SD card | install |
| Proton version | install |
| Steam user | install (5.1.1) |

The Proton version did not land here right away. It cannot be pinned in the generator: if the chosen version is missing on the target SteamOS, the bundle installs and silently breaks. On the spot, on the other hand, we can list what is installed (`steamapps/common/Proton*` plus `compatibilitytools.d/*`) and show what is really available.

**The dialogs were tested by a live person, and that turned up three misses.** Until then every run passed the path and the Proton version through environment variables, and `kdialog` was never reached: the automated tests went around exactly the code a person sees first. The lesson is general: **a loophole that is convenient for an automated test leads the check past the most fragile place**; the interactive branch has to be run by hand.

The first error was found while reading the code, before any run. The `tag`/`item` pairs for `--menu` were substituted through `$(...)`, and version names contain spaces: `Proton 9.0 (Beta)` expanded into three arguments, and instead of six pairs there were nineteen words with every item shifted. POSIX `sh` has no arrays, so the only correct way is to collect the arguments in the positional parameters: `set -- "$@" "$tag" "$label"`.

The other three came from the feedback after a real run:

**1. The window does not explain itself.** The directory picker that opened did not say that it was a directory picker or what for. The person started one file with a double click and should not have to guess. So: a title like "Where to install <game>", a welcome `--yesno` describing what is about to happen (the size, the Steam restart), and a `--msgbox` at the end.

**2. The Proton list did not match the one in the client.** We showed directory names, and Steam shows its own: `Proton Experimental` against the directory `Proton - Experimental`, `Proton 9.0` against `Proton 9.0 (Beta)`. The person compares with what they saw in the client and cannot find it.

The source of the right names is **`steamapps/appmanifest_*.acf`**, the `"name"` field, and `"installdir"` links it to the directory. The order can be reproduced too: Experimental on top, then the versions in descending order, third-party ones from `compatibilitytools.d` at the end.

**3. After the Proton choice NOTHING happened.** A minute and a half of unpacking without a single sign of life, and the person decides it has hung. That is exactly the case this section foresaw ("a silent script looks hung"), but the first implementation had no progress bar.

**4. The order of Proton versions is not the client's.** At first the list was sorted the way Steam sorts it: Experimental on top. But Steam shows a list of versions, while our first item is also **the default suggestion**, with the caption "if unsure, keep the first one" on top of it. Experimental is the beta branch you reach for when the stable one could not cope; recommending it first for a game from 2005 does real harm.

The right order for the picker: **the newest stable version on top**, then the older ones in descending order, then Experimental, then the builds from `compatibilitytools.d`. The names still come from the manifests: the names have to match the client, not the order.

**5. Windows showed up where nobody expected them.** An installer started with the path and the Proton version passed from outside still showed the final `msgbox`, because the condition checked only `--dry-run`. Caught on a live person: they got a notification about an install they had not started, from someone else's background run.

The rule: **a GUI is shown only when the questions were asked through a GUI.** If the path and the version came from the environment, another script is calling this one, and it has to speak through its exit code, not through windows. One flag set at the start covers all four places: the welcome, the progress bar, the error and the final message.

**6. The interface language is English.** Until there is localization, all the text a person sees has to be in one language, and that is English: the audience is wider than one language, and `install.log` may reach whoever ends up looking into a problem.

Done: `kdialog --progressbar` returns a DBus reference, and `qdbus6` moves the bar through it. Python counts the unpacking percentage by bytes rather than by files: otherwise a 4 GB file would hold the bar still for a minute. The percentage then goes to the Python side through `--progress-ref`, and it labels its own stages: closing Steam, saving the backups, adding to the library, the artwork, starting it again, verifying. Without a GUI all of this is silently skipped: the install does not depend on the progress bar.

**What asks the questions: `kdialog`.** Desktop Mode on SteamOS is KDE Plasma, and kdialog comes from KDE and draws native Qt windows. `--getexistingdirectory` settles the SD card question neatly: there is no need to detect `/run/media/deck/<label>` and know the partition label, the person just picks it in the file dialog. The same tool gives `--progressbar` through DBus: unpacking 8 GB takes minutes, and a silent script looks hung.

The fallback chain: `kdialog` → `zenity` (unlikely to be there, the system is KDE) → an interactive `read` in a terminal → defaults with no questions, everything into the log.

**A GUI application of our own was dropped.** Not because of the size (space in the archive is no concern) but because of fragility: the rootfs is read-only, a SteamOS update may replace the system libraries, and any toolkit pulls in dependencies. Shell plus kdialog survives the updates; a statically linked Qt survives them if it is lucky.

**Verified:** SteamOS has `kdialog`: `/usr/bin/kdialog`. `zenity` is there too, so the first step of the fallback chain is not hypothetical.

---

## 3. The `.run` format

This section was rewritten after the first build: **three of the original decisions turned out wrong**, and all three in the direction of simpler.

```
[0 .. 8191]         header: an sh script, padded with comments to exactly 8 KB.
                    It carries the number of meta blocks
[8192 .. ...]       meta.tar.gz, padded with zeros to a multiple of 8 KB
[then .. EOF]       the user's archive, verbatim
```

Extraction:

```sh
dd if="$SELF" bs=8192 skip=1 count=$BLOCKS 2>/dev/null | tar -xz -C "$TMP"
```

And **that is all**: there is no second line.

### What changed since the first edition

**1. The archive is not extracted at all.** The earlier plan copied the payload into a temporary file with a second `dd`. It turned out that `bsdtar` reads the zip **straight out of the `.run`**, prefix and all: it looks for the central directory from the end of the file. Verified: `bsdtar -x -f nfsmw.run` extracts a file byte-identical to the one extracted from the plain zip, in 97 ms.

The consequences: no temporary copy the size of the game, no "archive plus unpacked" free space requirement, and **the offset of the archive is written down nowhere**, as there is no need to know it. `unzip` copes as well but returns `rc=1` (a warning about the prefix), so the order was `bsdtar`, then `unzip` with exit code 1 ignored.

**But only below 4 GiB.** A larger archive is a Zip64 one, and with a prefix `bsdtar` gives up: it looks for the Zip64 end of central directory record at the address from the locator, and the prefix has shifted that address. The result is `Damaged Zip archive` and not a single file, and with a small Zip64 (more than 65535 entries) it is worse still: exit code 0 and not a single file either. libarchive's master behaves the same way (`read_zip64_eocd`). Caught on a live Deck with the very first game over 4 GiB: `unpacking failed (exit 1): bsdtar: Error exit delayed from previous errors.` **Verified** with `bsdtar` 3.7.7: a 4.3 GB `.run` cannot be read, while the same zip without the prefix can. `unzip` gets such an archive out, but with `error: End-of-centdir-64 signature not where expected`.

So Python's `zipfile` does the unpacking (`unpack.py`): it finds the end records from the end of the file and works out the shift itself, Zip64 included. The offset of the archive is still written down nowhere. The price is speed: on 512 MB of synthetic data `zipfile` is one and a half times slower (3.1 s against 2.1), but on the test Deck 8.2 GB still unpacked in 57 s (9). It also brought a free space check before the first byte, one that keeps 2 GB free after the game for SteamOS and Steam (on a drive filled to the last byte the client cannot save its own files), and clear messages instead of the last line of `bsdtar`.

**Deflate64 is unpacked too: by funzip, or by a decoder of our own.** Windows 10's "Send to → Compressed (zipped) folder" is reported to switch to Deflate64 (method 9) once the files add up to more than 2 GB `[?]`: there was no Windows 10 to check it on. Windows 11 25H2 does not: **verified**, its old "Compressed (zipped) folder" packed 2 × 1.1 GB and a folder with a 2.5 GB file (4.5 GB in all) with plain Deflate, and the new "Compress to → ZIP File" goes through libarchive and writes Deflate as well (the Most Wanted archive, 3.78 GB, is one). **Verified** that neither unpacker reads Deflate64: `zipfile` raises `NotImplementedError`, `bsdtar` 3.7.7 says `Unsupported ZIP compression method (9: deflation-64-bit)`, and zlib, fed the stream as Deflate, reads it without an error into the wrong bytes. Info-ZIP reads it, and **verified**: SteamOS 3.8.28 ships `unzip` and `funzip` 6.00 built with `USE_DEFLATE64`. `funzip` takes one entry on stdin, so the installer needs no names and no offsets from it: it puts a local header of its own (no name, no extra field, no data descriptor) in front of the packed bytes read straight from the `.run`, and checks the size and the CRC itself. Not the exit code: past 4 GiB the header cannot hold the sizes, and `funzip` reports a length error about a file it unpacked right. Before it is trusted, it decodes a probe: six bytes that only a Deflate64 decoder turns into 301 `a`s. Where it is missing or gets an entry wrong, `deflate64.py` writes that entry again in plain Python. **Verified** on a Deck: 48 MiB of mixed data took `funzip` 0.59 s and `deflate64.py` 9.9 s (4.8 MiB/s), the same CRC from both. What nothing here can unpack, PPMd or a password from 7-Zip, is refused before the first byte, while Steam is still untouched.

**2. The size of meta is not fixed.** 64 KB was planned for "scripts, artwork, recipe.json", and a set of artwork weighs **5.3 MB**: portrait 1.2, hero 2.1, icon 1.0, wide 0.8, logo 0.3. Off by two orders of magnitude.

Fixing a bigger size is bad too: every `.run` would carry empty space. Instead the header is generated at build time with the block count already filled in. It can still be written in one pass: meta is assembled in memory before writing, so its size is known in advance.

**3. `dd bs=8192` is fit for meta only.** For the payload it would be bad, and the numbers on 3.78 GB show why:

| method | time |
|---|---|
| `dd bs=8192 skip=9` | 6852 ms |
| `tail -c +73729` | 1331 ms |
| `dd bs=1M skip=73728 iflag=skip_bytes` | 549 ms |

Half a million small blocks cost 12 times more. For meta of a few blocks that does not matter; for gigabytes it does. Since the archive is no longer extracted, the question is gone, but the number is worth remembering: if a large piece ever has to be read, `bs` has to be in megabytes.

**Verified on the spot:** `dd` extraction from the file itself works (question 1 is closed), and `tar -xz` on meta with a zero tail returns `rc=0`: gzip really does ignore the padding.

**Why not real makeself:** its header holds its own length in lines, which forces a two-pass generation. We control both sides, so the header size is fixed and the meta size is written in as a number.

`[?]` **Space at build time.** The first attempt to build a `.run` failed with `No space left on device`: the build ran in `/tmp`, which is a 7.3 GB tmpfs. The browser generator has no direct analogue, but the reminder is useful: a `.run` weighs as much as the archive, and the build machine needs room for both copies.

## 4. Bundle contents

```
meta.tar.gz
├── setup.sh                questions and the log
├── install.py              orchestration: unpacking and the Steam side
├── steam_install.py        user, shortcut, Proton, wrappers, artwork
├── steamctl.py             the client's lifecycle
├── unpack.py               unpacks the archive straight out of the .run
├── vdf.py                  parsers for shortcuts.vdf and config.vdf
├── config_surgery.py       precise edits to config.vdf
├── check-install.py        acceptance check
├── uninstall-template.sh   goes into the game folder as uninstall.run
├── recipe.json
└── art/
    ├── portrait.png    600×900
    ├── wide.png        920×430
    ├── hero.jpg        1920×620
    ├── logo.png        transparent
    └── icon.png        1024×1024
```

The first six modules are needed not only for the install: `install.py` copies them into `<game-dir>/.plumber/`, so that removing the game works without the original `.run` (5.4). `check-install.py` is not required for the install, but on someone else's SteamOS it is the only way to check the result: there is no debugging loop there.

`make-run.sh` stays out of the bundle: it builds a `.run` rather than installing one. The scoring does not travel either: the logic of 7.2.1 lives in the generator, where the list of exes has already been read from the central directory.

The field-check scripts of stage 1 (`recon.py`, `set-field.py`) and a separate copy of the scoring (`score.py`) were removed. The first two had done their job: everything they found out is written into 2.3, 5.1.0, 5.1.1 and 5.2, and they had a user number from a specific Deck hard-coded inside. The third was a second copy of the same rules and had already drifted from the first: the suffix patterns from 7.2.1 were missing from it, and `shell_inst.exe` got `+30` instead of `−10`. Two sources of one truth are what you pay for later.

There are no templates any more: `launch.sh` and `.desktop` are not generated (2.2). There is no registry (2.6).

`vdf.py` is our own, not a library: SteamOS has `python3` but not `python-vdf`. Its requirements are in 5.2.

`recipe.json` is always included:

```json
{
  "name": "Need for Speed: Most Wanted",
  "slug": "nfsmw",
  "exe": "Need for Speed Most Wanted/speed.exe",
  "prefix_arch": "win32",
  "user_data": ["SAVES"],
  "dll_overrides": ["dinput8"],
  "generator": "plumber 1.0.0"
}
```

There is no Proton version here: it is asked for at install time (2.8). `user_data` serves two purposes: skipping those folders when installing over an existing copy, and `mkdir -p` on a clean install (5.1 step 3). `dll_overrides` is the decision from 7.3.1. The recipe is needed for rebuilding (7.7) and for debugging.

---

## 5. Scripts on the target machine

### 5.1 `setup.sh`

The order:

0.  Questions through `kdialog` (see 2.8): where to install (`--getexistingdirectory`, default `~/Games`) and which Proton (`--menu` from the versions actually installed). Without dialogs: defaults, and a note in the log. If `<dest>/<slug>/game/` already holds another game or files the installer did not put there, it asks before a byte is written: choose another folder, install there anyway, or cancel. Two games can share a slug (Need for Speed: Most Wanted is a 2005 game and a 2012 one), and the second one unpacked over the first breaks it. Without dialogs the answer is no
1.  Find the Steam root and `userdata/<id>/` (see 5.1.1). This step no longer depends on a running client: every clue is read from disk
2.  Unpack the archive into `<dest>/<slug>/game/` as it is, with Python's `zipfile` (`unpack.py`); `bsdtar` cannot open archives over 4 GiB out of a `.run` (3). No `--strip-components`: the path to the exe comes from the central directory together with its nesting, so it agrees by construction. **Verified:** `bsdtar -x -f <zip> -C <dest>` unpacked the test archive without a single loss: 1438 files and 126 folders, and a file-by-file comparison with the central directory matched. The archive carries **explicit folder entries**, and `bsdtar` reproduces them
3.  `mkdir -p` for the folders from the recipe (empty folders for saves). **Saves on reinstall.** Portable games keep them **next to the exe** rather than in the prefix: for the test game that is `SAVES/<profile>/` and `SAVES/Settings.ini` with the graphics settings.

    Verified by installing over an existing copy, and the hole turned out narrower than it looked:

    | what | fate | why |
    |---|---|---|
    | `SAVES/<profile>/` | **survived** | the archive has no such path, so unpacking does not touch it |
    | `SAVES/Settings.ini` | **overwritten** | the archive holds the factory one, 120 B against the working 549 B |

    So unpacking overwrites exactly what the archive contains. The player's profile survives a reinstall on its own; what gets lost are only the files the game inherited from the archive and then rewrote for itself: graphics settings, language, resolution. Annoying, and nobody notices.

    **Done: skipping by the list in the recipe.** The recipe got a `user_data` field (`["SAVES"]` for the test game), and unpacking skips those folders **if there is already something inside**. Verified by installing over an existing copy: the graphics settings stayed the working ones (549 B) instead of rolling back to the factory ones (120 B). The same list serves the second purpose from 7.6: `mkdir -p` for empty save folders on a clean install.

    While `bsdtar` did the unpacking, its flags did this, and both were verified; now the same rule lives in `unpack.plan`:

    ```sh
    bsdtar -x -f "$RUN" -C "$DEST" --exclude '*/SAVES/*'   # skip
    bsdtar -x -k -f "$RUN" -C "$DEST"                      # do not overwrite
    ```

    `--exclude` is the more precise one: `-k` would protect everything that exists, while on a game update the outdated files are exactly what has to be overwritten. The folders to skip come from the same list in the recipe that 7.6 already planned for `mkdir -p` of empty save folders: one list for two jobs. Skipping only makes sense when installing into a folder that is not empty.

    `--purge` stays what it is: it removes the folder entirely and honestly warns how many files in `SAVES/` it will destroy. `[?]` The step may be redundant: a zip stores folders as separate entries, so an empty folder arrives on its own. The test archive could not show it: all 126 of its folders contain files
4.  **`steam -shutdown`**, wait for the process to exit, with a timeout. If it does not exit, say so and leave without touching anything
5.  Back up `shortcuts.vdf` and `config.vdf` next to them, with a timestamp
6.  Add an entry to `shortcuts.vdf`: `Exe` = the full path to the exe in quotes, `AppName` = the name, `StartDir` = the game folder
7.  Compute the appid: CRC32 of `Exe + AppName`, high bit set
8.  Write the `CompatToolMapping` for this appid into `config.vdf`, surgically, see 5.2
9.  Lay out the artwork in `userdata/<id>/config/grid/` under names derived from the appid
10. Start Steam again
11. **Wait until Steam rewrites `shortcuts.vdf`, and check that the entry is in place** (5.1.0). Until that moment the contents of the file mean nothing
12. `install.log` is not a step at the end: `setup.sh` writes it as the install goes (see "An install that fails halfway" below)

Step 5 comes before any write, no exceptions. The old reasoning "step 1 before step 4, because it needs a running client" went away together with `ActiveUser` (5.1.1), so the order of those two steps is now free.

**Unpacking before Steam is shut down** is deliberate too: unpacking 8 GB takes minutes, and there is no reason to keep the client down all that time. It is shut down right before the files are edited.

**Deduplication.** Running the bundle again would add a second shortcut. Since we read `shortcuts.vdf` anyway, we check by `Exe` and replace the entry instead of adding one.

**On replacing, never overwrite something with nothing.** Caught on a live install: a run without an `art/` folder overwrote the shortcut with an empty `icon` field, and the icon disappeared from the library while the file sat intact on disk. `LaunchOptions` would have been lost the same way, and with it the working graphics in the menus (7.3.1). So on replacing an entry, `icon`, `LaunchOptions` and `tags` are carried over from the old one if the new one does not set them.

**A download in progress will be interrupted.** Warn about it at step 0, before the person starts waiting.

**An install that fails halfway.** A case from someone else's Deck: at the end of the install, an "Install failed" window pointing to `install.log`, and no file at that path. The game was in the library, but without artwork and without Proton: the version and the compatibility checkbox had to be set by hand.

There was no log because `install.py` wrote it in one piece on the way out, and only on three of its normal paths: any exception took the log with it. An exception at step 8 explains the whole picture: the shortcut (step 6) is already written, the artwork (step 9) is never reached, and Steam stays down. `[?]` The best candidate is letter case: the path `InstallConfigStore → Software → Valve → Steam` was looked up case-sensitively, and the client writes it differently from one version to the next. `"valve"` in lower case turns up in other people's scripts, and protontricks lowercases every key for exactly this reason. Only the log from that Deck can confirm it.

What changed:

- **`setup.sh` writes the log, line by line**: all the output of the Python side, tracebacks included (`python3 -u … 2>&1 | tee`). The path is settled before the run: next to the game, or in `/tmp` if that cannot be written to. The window shows exactly that path
- **`config.vdf` keys are matched regardless of case** (5.2), and only a key followed by `{` counts as a block
- **The steps after the shortcut are independent**: Proton, artwork, uninstaller. One that fails writes its traceback into the log, and the rest still run. It is not checked after the restart: it would fail in all three attempts, and after the third the game would be taken out of the library
- **Steam is brought back up on any exit**, including an exception
- **VDF writes are atomic**: into a temporary file next to the target, then a rename. A write cut off on a disk the game has just filled would otherwise leave a truncated `config.vdf`
- **Exit code 4 means "not fully installed"**: the game is in the library, but a step after the shortcut did not go through, or there was no Proton to choose. The window says where to turn compatibility on by hand
- **Proton is looked for in every library** listed in `libraryfolders.vdf`: it is installed like any other app, the SD card included. Before, only the internal one was searched

#### 5.1.0 Written does not mean kept

**The most expensive finding of the field checks.** An edit to `shortcuts.vdf` made while the client is down can be silently undone: Steam rewrites the file **about a minute and a half after it starts**, and at that moment decides whose version wins.

What it looked like. The script shut Steam down, made a backup, wrote one string field into an entry, started the client again and reported success. By every sign available to it, the job was done:

- the parser's round-trip matched byte for byte (3952 B → 3952 B);
- a byte-by-byte comparison with the original showed a difference **in exactly one place**, inside the edited field, 74 bytes;
- reading the file back right after the write gave the expected contents.

About 90 seconds after the client started, the file held a state from two years earlier: two entries instead of seven, in a different format (`appname` in lower case, `appid` as a string: the handwriting of NonSteamLaunchers). Five of the user's shortcuts disappeared from the library. They were restored from the backup made before the write, so the safety net of step 5 in 5.1 worked exactly as intended and turned out to be anything but a formality.

**What this means for the installer:**

1. **Success is decided not by the write but by the state of the file after Steam rewrites it.** That is where to check, not after `write()`
2. **Wait for every process of the client to exit**, not only `steam`: next to it live `steamwebhelper` (about a dozen of them), `steam-runtime-launcher` and others. Polling one process name misses them
3. **`SteamPID` in `registry.vdf` is reset to zero on exit**: a reliable sign that does not race with `pgrep`
4. **The backup is mandatory before the first write**, and it is also what everything rolls back to. A backup taken after a failed attempt is useless
5. **A retry has to be planned for**: if the edit did not survive the restart, it makes sense to try again, but with a limited number of attempts and a guarantee that the list of shortcuts stays whole in the end

`[?]` **The cause of the rollback is not established.** The best candidate is Steam Cloud: the client syncs shortcuts between devices and may have decided the cloud copy wins. But that does not explain why the rollback went two years back, or why the same procedure a minute later went through without trouble. For now we treat it as nondeterministic behavior that verification and retries protect against, not as a condition that can be predicted.

#### 5.1.1 Finding the current Steam user

This section was rewritten after the field checks: **both mechanisms it used to rely on are missing on a live Deck.**

- **`ActiveUser` does not exist.** `registry.vdf` has neither this field nor the whole `ActiveProcess` block. The concern from the previous edition came true, worse than expected: the neighbouring `RunningAppID` is not merely broken (it is zero), and `ActiveUser` is gone entirely
- **`MostRecent` does not exist.** In `loginusers.vdf` an account has the fields `AccountName`, `PersonaName`, `RememberPassword`, `WantsOfflineMode`, `SkipOfflineModeWarning`, `AutoLogin`, `Timestamp`. `MostRecent` is not among them

Two working clues turned up instead. The order, from the surest down:

1. **The only folder** in `userdata/`. This is by far the common case: one person, one account. The check is trivial and does not depend on the format of any field
2. **`AutoLogin` = `"1"`** in `loginusers.vdf`. The key of the entry is the SteamID64, and the folder number is that minus `76561197960265728`. **Verified:** on the test Deck the difference matched the name of the folder in `userdata/` exactly (with made-up numbers: `76561197972611406 − 76561197960265728 = 12345678`)
3. **The largest `Timestamp`** in `loginusers.vdf`: when there are several accounts and auto-login is off, the most recent login is the one we want
4. **`AutoLoginUser`** from `registry.vdf` (`HKCU\Software\Valve\Steam`) is matched against `AccountName` in `loginusers.vdf`. Kept as a cross-check rather than the main path: it is an account name, and it leads to the folder number only through the same `loginusers.vdf`
5. **Ask**, if after all that the choice is still ambiguous

The order matters: step 1 covers reality, steps 2 and 3 cover several users on one SteamOS, step 4 exists to catch a mismatch, and step 5 exists so that we do not guess.

**A running Steam is no longer needed to find the user.** All the sources are files on disk and can be read at any moment. The "while Steam is still running" requirement disappears from step 1 of 5.1: the user can be found both before and after the client is shut down.

### 5.2 Requirements for `vdf.py`

Two formats, two different jobs.

**`shortcuts.vdf` is binary.** The structure was **verified** on a live file with six entries. It starts with `\x00shortcuts\x00`, then the entries, and ends with `\x08\x08`. The entries are numbered with string keys `"0"`, `"1"` and so on. Inside an entry: a type tag, a null-terminated key, a value: `\x00` a nested object (closed by `\x08`), `\x01` a null-terminated string, `\x02` a signed int32 LE.

The real set of fields is wider than expected. Steam writes `appid`, `AppName`, `Exe`, `StartDir`, `icon`, `ShortcutPath`, `LaunchOptions`, `IsHidden`, `AllowDesktopConfig`, `AllowOverlay`, `OpenVR`, `Devkit`, `DevkitGameID`, `DevkitOverrideAppID`, `LastPlayTime`, `FlatpakAppID`, `tags`. The last one is a nested object (`\x00`), not a string; empty, it looks like `\x00tags\x00\x08`.

An entry the client created today also has a `sortas` field, which none of the six older ones have. The set of fields **evolves**, so the parser has to skip unknown keys by their type tag rather than check them against a list. Ours works that way.

`appid` is written as **an explicit field**, which changes 2.3: we set the number.

Steam stores `Exe` **in quotes**: they are part of the value, not escaping. That matters for the appid formula: the CRC32 is computed over the string as it is stored, quotes included. **`StartDir`, on the other hand, does not need the quotes:** on the test Deck half the entries have them and half do not, and the client accepts both.

**`config.vdf` is text KeyValues.** No "parse it and serialize it back" here: the file holds every client setting, and any loss in a round-trip breaks Steam.

The edit is surgical:

1. Find the `"CompatToolMapping"` block inside `InstallConfigStore` → `Software` → `Valve` → `Steam`. The keys are matched regardless of case, the way the client itself reads them (5.1, "An install that fails halfway")
2. If there is no block, create it
3. Write a block for the appid: `"name"` = the name of the Proton folder, `"config"` = "", `"priority"` = "250"
4. Leave everything else in the file byte for byte

**Verified, the format matched word for word.** The test Deck had three entries, all of this shape:

```
"3786021133"
{
    "name"      "GE-Proton9-11"
    "config"    ""
    "priority"  "250"
}
```

The key is **the unsigned 32-bit appid as a decimal string**, neither signed nor hexadecimal. The set of three fields and `priority` = `"250"` had been guessed right.

**But `name` is not the folder name.** That turned out true only for `compatibilitytools.d`. When an official Proton was chosen in the UI, the client wrote:

```
"name" "proton_9"
```

and not `"Proton 9.0 (Beta)"`. The internal identifier is **in no file on disk**: official versions have no `compatibilitytool.vdf`, and `toolmanifest.vdf` holds only `compatmanager_layer_name` = `proton`, the same for all five. The name comes from the binary `appinfo.vdf`.

The rule that follows from the data:

| folder | `version` inside | what goes into `name` |
|---|---|---|
| `compatibilitytools.d/<X>` | (none) | `<X>`, the folder name |
| `Proton 9.0 (Beta)` | `proton-9.0-4f` | `proton_9` |
| `Proton 8.0` | `proton-8.0-5d` | `proton_8` |
| `Proton 7.0` | `proton-7.0-6f` | `proton_7` |
| `Proton 10.0` | `proton-10.0-4b` | `proton_10` |
| `Proton - Experimental` | `experimental-11.0-…` | `proton_experimental` |

So for the official ones: take `version`, cut out the major version, build `proton_<major>`; experimental is a special case.

`[?]` **Only the string `proton_9` was actually observed.** The others are derived by analogy. A mistake here is not loud: Proton simply does not get set, and the game starts without compatibility. It is checked the same way: switch the version in the UI and read `config.vdf` again.

### 5.3 Steam creates the prefix

No separate action is needed. On the first launch Steam creates `steamapps/compatdata/<appid>/pfx` itself with the chosen version of Proton.

The consequences: `protontricks` finds the game the normal way (it has both the `CompatToolMapping` and a prefix in the canonical place), the format of the prefix always matches the Proton version, and Steam handles Proton updates as for an ordinary game.

`[?]` If winetricks verbs are ever needed, they can be installed only **after** the first launch of the game: before it, the prefix does not exist. That argues for keeping winetricks out of the bundle entirely (see the note on 7.6).

### 5.4 Modes

- `--dry-run` prints every path and command and does nothing `[MVP]`. **Done and verified**
- `--uninstall` is **done**; it turned out to be needed earlier than `[v2]`: without it there was nothing to prepare a machine for testing the installer with
- `--purge` removes the game folder and the `compatdata/` prefix together with the shortcut, and only from `<folder>/<slug>/game` that is neither a link nor the home folder. The uninstaller deletes the folder it sits in, and a copy carried elsewhere along with its `.plumber` would take that folder with it; anything else stops the uninstall before Steam is touched (exit code 5)

**Uninstall looks the entry up by `Exe`, not by appid.** That came out on the very first run: a shortcut added through the Steam UI has a random appid (2.3), and the one computed by our formula does not match it. By `Exe` the entry is found no matter who created it; the real appid is then taken from it, and the `CompatToolMapping`, the artwork and the prefix are removed by that. An entry with no appid at all, rewritten by some other tool, keeps the computed one: its 0 would match every entry without an appid, and `CompatToolMapping "0"` is the Steam Play default for all other games.

**There has to be a way to uninstall without the installer.** Found on a live machine: `--uninstall` exists only in the `.run`, and that weighs as much as the game. Nobody will keep four gigabytes around just to be able to uninstall, and without it there is nothing to uninstall with.

So the installer puts everything needed into the game folder itself:

```
<game-dir>/
├── uninstall.run        executable, with dialogs
└── .plumber/            the modules and the recipe, 48 KB
```

A dot folder, so that it stays out of the way in the file manager. The execute bit on `uninstall.run` is set right away: the file is created locally, and the problem of a downloaded file (8) does not touch it.

The dialog asks **what exactly to remove**, with radio buttons, because the difference matters: "from Steam only" leaves the files and the saves in place, "everything" takes the folder and the prefix. In the second case there is a separate warning about `SAVES/`.

**Uninstall became symmetric.** It used to be a problem: there is no `steam://` handler for removal, so the shortcut would have had to be removed by hand. Now we shut Steam down and write `shortcuts.vdf` anyway, and removing an entry is no different from adding one. We remove the folder, the `compatdata/<appid>` prefix, the artwork, the entry in `shortcuts.vdf` and the block in `CompatToolMapping`.

---

## 6. The web application

A static site with no backend. Where the browser has `showSaveFilePicker` (Chrome, Edge), the `.run` is streamed into a file the person picks; anywhere else (Firefox, Safari, and Brave, which switches the picker off) the browser downloads it (6.2).

### 6.1 Reading the zip

The contents of the archive **are not read**. A `File` is a lazy reference to the disk, and `slice()` reads no bytes.

```js
const tail = await file.slice(file.size - 65557).arrayBuffer();
```

65557 is the maximum length of an EOCD with a comment; the `PK\x05\x06` signature is searched backwards from the end. **Verified** on a real archive: the EOCD was found, and the number of entries, the size and the offset of the central directory are read from it.

**Zip64 is mandatory in v1.** Past 4 GB the offset and size fields of the regular EOCD are filled with `0xFFFFFFFF`, and the real values are in `PK\x06\x06`, pointed to by the `PK\x06\x07` locator before the regular EOCD. A naive parser would read garbage on 8 GB and show an empty list.

`getBigUint64` returns a BigInt, which has to be converted to a Number (safe for 8 GB, the limit is ~9 PB).

**The Zip64 branch is verified** on NFS Carbon: 6 547 118 210 B, 7751 entries. The generator read the listing through Zip64 and marked the archive `Zip64`, the payload in the built `.run` matched the original zip byte for byte, and the install on the Deck went through (the unpacking is no longer `bsdtar`, see 3). The first test archive, at 4 059 825 267 B, never reached this path: that is 3.78 GiB, while the EOCD fields overflow at 4 GiB (4 294 967 296 B), and it had no `PK\x06\x07` locator. A trap for the future: "4 GB" in decimal and "4 GiB" in binary differ by 7%, and an archive from that gap looks big enough but does not touch the Zip64 path.

In total, ~200 KB is read regardless of the size of the archive.

### 6.2 Building

```js
await out.write(header);        // 8 KB, fixed
await out.write(meta);          // 64 KB
await file.stream().pipeTo(out, {preventClose: true});
```

Nothing is held in memory. The progress is by bytes written.

Without the picker the same three parts go into one `Blob`, and the browser downloads it through a link with `download`:

```js
const run = new Blob([header, meta, file], {type: 'application/octet-stream'});
```

The archive goes in as the `File` itself, which a `Blob` keeps as a reference to the disk, so nothing is held in memory here either: the download reads the archive from disk as it goes. The cap of ~1-2 GB applies to a `Blob` built from bytes in memory, not to this one. **Verified** on the built site with a 5 GiB Zip64 archive: in Firefox 157 the download started 0.3 s after the click and took 27 s, the browser grew by 54 MiB with three such downloads running at once, GNU `dd` and `tar` read meta out of the `.run`, and the archive in it matched the original byte for byte. Chromium 156 with the picker removed, as in Brave, did the same in 15 s. Safari is not verified.

The price is control: the person picks no folder unless the browser asks, and the progress is shown by the browser, not by the page. The address of the `Blob` is kept until the next build or another archive; a download already under way goes on without it, verified in both browsers.

### 6.3 Checks before building

All of them warn, and none of them blocks the button:

- there is not a single `.exe` in the archive (the select is empty, there is nothing to build)
- the UTF-8 bit 11 is not set **and** there are non-ASCII names → Cyrillic names will arrive garbled, suggest 7-Zip
- the size is > 4 GB → a reminder about exFAT
- `navigator.storage.estimate()` < the size of the archive → there will not be enough space (Chrome writes into a temporary swap file and swaps it in at the end). Only where the picker is: Firefox 157 reports the quota of the site instead, 7.4 GiB on a disk with 51 GB free
- the chosen exe got a negative weight under 7.2.1 (the person picked by hand what we ranked down): warn, but do not stand in the way
- the artwork is not filled in

### 6.3.1 What to show after the build `[MVP]`

The downloaded file will not run until the person sets the bit, and **the system gives no hint at all**: a double click leads into an editor, and "Run in Konsole" shows a menu item that does not work (8). So the only place where it can be explained is the screen after the build.

It has to show, step by step and with a screenshot:

1. right click on the downloaded file → **Properties**;
2. the **Permissions** tab → tick **Is executable**;
3. a double click.

Postponed options, in case this turns out not to be enough:

- **A KDE service menu** with `Exec=konsole --hold -e /bin/sh %f`: `sh` does not need the bit, so such an item always works. Ten lines in `~/.local/share/kio/servicemenus/`; the bundle can put it there itself on the first successful install, and then the bootstrap is one-off
- **Ship the `.run` inside a zip**: permissions survive unpacking, verified with `unzip`, `bsdtar` and `tar`. The price is an extra copy the size of the game

### 6.4 Diagnostics instead of debugging

There is no debugging loop, so:

- `--dry-run` in the bundle
- `install.log`
- checking the result of every step in `setup.sh`
- `[?]` show the generated `setup.sh` before the build: useful for us, noise for everyone else

---

## 7. Features

### 7.1 Input `[MVP]`

Everything read from the archive exists for the sake of **one string: the path to the exe**. There is no debugging loop: a one-character mistake in the path would only show up on SteamOS, with nothing to fix it with. So the path is not typed by hand but taken from the central directory, where it is guaranteed to exist in the archive.

- zip only, a folder is not accepted (the reasons are in 2.4)
- parsing the central directory: the list of paths and sizes
- a warning for non-ASCII names **and** an unset UTF-8 bit 11 (both conditions, or every other archive would trigger it falsely)

**What was removed as decoration:** a file tree (not a single decision is based on it), the number of files (it was needed for per-file progress when loading a folder; there is no folder, and the progress is per byte), detecting an extra level of nesting and `--strip-components` (not needed, see 5.1 step 2).

### 7.2 Choosing the exe `[MVP]`

A select with a default picked automatically. The user can open it and pick another one, but never types a path by hand.

- **every `*.exe` in the whole tree, as a flat list.** Not just the root: some games keep the exe in a subfolder (`bin/`, `Binaries/Win64/` with Unreal), and for them a list from the root would be empty
- an item of the select shows the whole relative path, so that files with the same name in different folders can be told apart
- ranked by the rules from 7.2.1, the first one chosen by default
- **nothing is hidden completely**, only pushed down. Games are strange, and an exe called `setup.exe` may turn out to be the real one

Ranking carries more weight here than with a list from the root: the whole tree may hold many exes, and whether the default is guessed right depends on the order.

#### 7.2.1 Ranking rules

Scoring, not filtering: each candidate gets a weight, and the list is sorted by it, descending. All comparisons ignore case, and the patterns match the basename without the extension unless said otherwise.

**Penalty −100. Definitely not the game:**

```
uninstallers      unins*, uninst*, uninstall*, Uninstaller*
runtimes          vcredist*, vc_redist*, dxsetup, dxwebsetup, directx*,
                  dotnetfx*, ndp4*, ndp45*, oalinst, openal*, PhysX*,
                  xnafx*, wmfdist*, gfwlivesetup, msiexec
crash reporters   UnityCrashHandler32, UnityCrashHandler64, CrashReportClient,
                  CrashReporter, CrashSender*, crashpad_handler, BsSndRpt,
                  BugSplat*, sendreport
helpers           UnrealCEFSubProcess, QtWebEngineProcess, EpicWebHelper,
                  EOSBootstrapper, GalaxyClient*, notification_helper
```

**Penalty −60. A redistributables folder in the path** (a match on any segment):

```
_CommonRedist, Redist, redist, Redistributables, _Redist,
DirectX, vcredist, support, Support, prereq*, __Installer
```

`_CommonRedist` is the standard name with Steam and GOG, and the one seen most often.

**Penalty −40. Looks like an installer or a utility:**

```
setup*, *setup, install*, *install*, *_inst, patch*, update*, updater*,
config*, settings*, launcher*, *launcher, editor*, benchmark*,
dedicated*, server*
```

`launcher` is pushed down only moderately: for some games the launcher is the entry point.

**The suffix variants were added from experience.** The very first real archive brought `shell_inst.exe` and `safemode_inst.exe`, obvious utilities that the prefix patterns `setup*` and `install*` do not catch at all. Hence `*_inst`, `*setup` and `*install*` in the list.

**Bonuses:**

```
+40   the basename looks like the title of the game (normalize both strings:
      lower case, drop everything that is not a letter or a digit, match by inclusion)
+30   sits at the root of the archive
+0…20 in proportion to the size against the largest exe in the list
```

The title of the game is known at ranking time: it is prefilled from the name of the archive (7.3). If the person corrects it, the list should be sorted again.

**The first check on a real archive passed.** Need for Speed: Most Wanted, 1564 files, four `.exe`:

```
  +90  speed.exe               +40 looks like the title, +30 root, +20 size
  +30  shell_inst.exe          +30 root
  +30  safemode_inst.exe       +30 root
  -90  UNINSTALL/unins000.exe  -100 not a game, +10 size
```

The default is guessed, with a threefold lead. But two utilities scored 30 each only because they sit at the root: before the patterns were fixed (above) they got no penalty at all. On an archive where the real exe sits in a subfolder and does not look like the title, such a pair could overtake it.

**About "the root".** The +30 bonus counts from the **common prefix** of the archive, not from its physical root: all 1564 files of this game sit under a single `Need for Speed Most Wanted/` folder, and without the prefix nobody would get the bonus. The prefix is computed from the central directory, and that does not bring back the separate nesting detection from 7.1: `--strip-components` is still not needed, and the path to the exe stays full.

`[?]` The weights are still verified **on one game**. The list of patterns grows with what we run into: that is the expected mode of work, not a sign of an error.

### 7.3 Metadata `[MVP]`

- the title in the library (prefilled from the file listing, without reading the contents: the folder the game was zipped in, then the name of a Unity build, that is an exe with a `<name>_Data` folder next to it, then the name of the archive)
- the prefix architecture, win32 / win64

There is no install folder here: it is asked for on SteamOS (2.8).

### 7.3.1 Detecting DLL wrappers `[MVP]`

**Moved up from `[v2]` after the very first real game.** The game in the archive came with Ultimate ASI Loader: next to the exe sits a `dinput8.dll` that replaces the system one, and seven `.asi` mods in `SCRIPTS/`. Under Wine such a loader does not start by itself, because the engine prefers the built-in library, the mods silently do not load, and the game starts **looking broken**: the 2005 frontend is drawn at 1280×800 without the widescreen fix, and the letters run into each other and get cut off. The cause is anything but obvious: the game works, does not crash and writes nothing to a log.

One line in `LaunchOptions` fixes it:

```
WINEDLLOVERRIDES="dinput8=n,b" %command%
```

Verified on a live game: after the change the frontend came out right.

**Why this is not a manual field.** The user does not know the word `WINEDLLOVERRIDES` and cannot tell a wrapper from the game's own library. A list of names can: Wine has its own implementations of the well-known system DLLs, and a file with such a name next to the exe is almost certainly a wrapper.

```
d3d8 d3d9 d3d10 d3d11 dxgi ddraw   graphics: ReShade, ENB, dgVoodoo
dinput dinput8                     input: Ultimate ASI Loader
dsound winmm msacm32               sound: wrappers, ASI
version xinput1_3 xinput1_4        injection, gamepad
wininet                            network stubs
```

**The heuristic was checked on a real archive and gave no false positives:** next to `speed.exe` sit two DLLs, `dinput8.dll` (in the list, so a wrapper) and `server.dll` (not in the list, so the game's own library, left alone).

The cost is a dozen lines: the file listing is already read from the central directory to choose the exe (7.2), and it only has to be intersected with the table of names. By the criterion of 2.8 this is packing: whether the DLLs are there depends on the archive.

**In the UI:** a checkbox "The game has mods, an override is needed", ticked by default, with what was found listed. It can be unticked, but nobody has to have anything explained.

**Done, and the decision travels in the recipe.** The first implementation showed what it found as a hint, while `install.py` still detected the wrappers itself, so the checkbox would have been dead. Now the recipe has a `dll_overrides` field, and it comes first:

| `dll_overrides` | what the installer does |
|---|---|
| a list of names | writes exactly those |
| `[]` | writes nothing: the checkbox was unticked on purpose |
| no field | detects them itself, as before |

The third row is not compatibility for its own sake: bundles built before the field existed have to install the way they always did. An empty list and a missing field have to differ, or an unticked checkbox would silently turn into auto-detection.

**In `install.log`:** list the signs of mods that were found: `*.asi` files, wrappers from the table, a `SCRIPTS` folder. On someone else's SteamOS it is the only way to tell that the mods did not load.

`[?]` The class is wider than one ASI loader, but how much wider we judge by a single game. A second or third archive will show whether the table needs to grow.

### 7.4 Proton

Moved to install time, see 2.8. It is not chosen in the generator.

### 7.5 Artwork `[MVP]`

A slot is a receiver with a check, not an editor. No editing, no cropping, no resizing: SteamGridDB already has the images at the right sizes, and there is no point in writing canvas code for it. The reasons are in 2.7.

- 4 slots, drag and drop, a preview
- the expected size is written in the slot, the empty state included
- **any extension, within PNG and JPEG.** Verified: Steam picks up `_hero.jpg` just like `.png`, only the name before the extension matters. So there is no need to re-encode what was brought: it goes in as it arrived.

  The limit had to be set from experience: the slot accepted `image/*`, while `install_art` copies only `.png`, `.jpg` and `.jpeg`. A WebP went into meta and silently vanished on the Deck: the slot filled, the library empty. There was nothing to check on the Deck whether Steam understands WebP, so the slots were narrowed to the two formats known to work. The name inside meta comes from the MIME type rather than from the file extension: the type is what the check was made against
- **the file date is part of the contract too.** **Verified** on a Deck (SteamOS 3.8.28): Steam treats an image in `grid/` dated 1970 as missing. Only the icon was left in the library, because it is linked by the path in the shortcut rather than by name. The zero came from meta: the tar is packed with zero mtimes so that the same build gives the same bytes, and `install_art` copied with `copy2`, date included. Now only the contents are copied, and the file gets the time of the copy. On the same Deck, after a `touch` and a Steam restart, the hero and the logo appeared
- a soft size check through `createImageBitmap` (`naturalWidth`/`naturalHeight`): on a mismatch, show what arrived and what is needed, without blocking
- **the one hard check:** a JPEG in the logo slot. The logo is drawn over the hero, and without an alpha channel it becomes a white rectangle
- a link to SteamGridDB under each slot, straight to the section of the right type and size where possible (check the URL format with filters on the site)

**The slot names do not match the sections of the site, and that confuses.** SteamGridDB has four sections (Grids, Heroes, Logos, Icons), while there are five slots, two of which live in the same section and differ only by the size filter:

| slot in the spec | where on the site |
|---|---|
| portrait 600×900 | **Grids**, vertical |
| wide 920×430 | **Grids**, horizontal |
| hero 1920×620 | Heroes |
| logo | Logos |
| icon 1024×1024 | Icons |

Hence the requirement for the link: it has to lead into the section **with the size filter already set**, or the person lands in Grids and does not understand which of the two formats is needed right now. The captions in the UI are worth giving in the site's terms ("Grids, horizontal"), not only in ours.

**We do not generate placeholders.** An empty slot stays empty, and Steam shows what it shows for any game without artwork. Building a missing grid from the neighbouring slots was considered (the hero cropped at the centre plus the logo on top), and technically it works: SteamOS has `ffmpeg`, though not `ImageMagick` or `Pillow`.

It was dropped not because of the complexity. A generated picture is our invention in a place where the person expects either authored artwork or an honest blank. A library with one home-made grid among real ones looks worse than with one default grid. Besides, it would be the only picture the project draws, and with it go the canvas code, the question of recompression quality and handling of EXIF rotation.

The decision also closes the question "where to assemble it, in the generator or in the installer": nowhere.

The wording in the UI: "Ready-made images at these sizes are on SteamGridDB". No "just", and no explanation of how to use them.

What dropped out together with cropping: the canvas code entirely, resizing, the question of recompression quality, handling of EXIF rotation. A slot accepts a file and only a file: the link under it leads the person to where the images are, but they bring them themselves (2.7).

**The file names are verified** on a live set of artwork. All of them derive from the **unsigned 32-bit** appid:

```
<appid>p.png       600×900    portrait
<appid>.png        920×430    wide, no suffix
<appid>_hero.jpg   1920×620   hero
<appid>_logo.png   1200×369   logo, RGBA
<appid>_icon.png   1024×1024  icon
```

A 64-bit name of the form `(appid << 32) | 0x02000000` turned up in the folder as well, but it is **a symlink** left by a third-party tool in 2023, not a live scheme. No need to reproduce it.

`[?]` **The fifth slot is the icon, and it works differently from the rest.** Steam finds the four main pieces of artwork by itself, by the file name in `grid/`. **Not the icon:** a file in the folder is not enough, the `icon` field of the `shortcuts.vdf` entry also needs the absolute path to it. Verified by comparison: a shortcut with a working icon has the field filled with a path like `…/config/grid/<appid>_icon.png`, a freshly added one has an empty string, and a `<appid>_icon.png` file placed next to the others is not applied on its own.

The practical consequence: the icon is the only artwork that **cannot be set by copying a file alone**. It needs the `shortcuts.vdf` writer, and with it shutting Steam down. For the installer that comes free (it writes the entry anyway), but the argument "a slot is cheap to add" falls away: apart from the entry, the slot does not work. The format is 1024×1024 RGB.

**When it is picked up:** Steam reads the files in `config/grid/` lazily. They usually appear without a restart, but there is no guarantee: sometimes the library page has to be switched.

### 7.6 "Advanced", collapsed `[v2]`

- winetricks verbs as checkboxes
- a list of folders for `mkdir -p`
- **the launch line**: one field, see below

**Environment variables and exe arguments are one field, not two.** Both live in the `LaunchOptions` of the `shortcuts.vdf` entry and differ only in where they stand relative to the `%command%` placeholder, where Steam inserts the full launch command (Proton plus the path to the exe):

```
WINEDLLOVERRIDES="dinput8=n,b" %command% -windowed
└─── environment of the process ───┘    └ arguments to the game ┘
```

The previous edition listed them as separate items, which was misleading: it looked like two independent mechanisms needing two input fields. There is one mechanism.

DLL overrides were taken off the list: they are no longer "advanced", since the heuristic of 7.3.1 fills them in by itself, and that is `[MVP]`. The manual field stays as an outlet for what the heuristic will not catch: `PROTON_USE_WINED3D`, `MANGOHUD`, `-windowed` and other special cases. It is not the main path.

### 7.7 Rebuilding `[v2]`

Drop a finished `.run` back in → read `recipe.json` from the first 72 KB → restore the form. Change the artwork and rebuild without filling everything in again.

`[?]` A separate button in the header, or the same drop zone as for the archive?

---

## 8. Limitations

- **Without the picker the browser does the saving.** Firefox, Safari and Brave get the `.run` as an ordinary download (6.2): no choice of folder unless the browser asks, no progress on the page, and no warning about free space (6.3)
- **Twice the disk space** while creating the archive on the source machine
- **The file arrives without the execute bit**, and not only from a Windows file system: the browser drops it on any download. Verified on a file downloaded from our own server
- **"Run in Konsole" does not help**, contrary to an earlier edition of this section. Worked out from `/usr/share/kio/servicemenus/konsolerun.desktop`:

  ```ini
  MimeType=application/x-executable;
  Exec=konsole --hold -e %f
  ```

  `-e %f` runs the file **directly**, so without the bit `execve` refuses. Worse, the menu item **is shown** anyway: `x-shellscript` is a subtype of `x-executable`, so KDE offers an action that is bound to fail. And the message is misleading: konsole prints `Could not find '<path>'`, although the file is there and simply cannot be executed. The person goes looking for a missing file instead of ticking the box
- **A double click** without the bit hands the file to a text editor, which does not open four gigabytes at all. So there is not a single built-in hint: the instructions have to come from the application
- **The controller layout** cannot be baked into `shortcuts.vdf`. The most we can do is put a link to a community layout into the instructions
- **A Steam download in progress will be interrupted** by the install (5.1)
- **SteamOS has no `/usr/bin/time`.** `bash` has only the `time` keyword, and POSIX `sh` not even that. Durations are measured with `date +%s`. Verified: a `/usr/bin/time` wrapper around the unpacking silently ran nothing and still returned exit code zero
- **There is no `bc` either.** Fractional arithmetic goes through `awk`, integer arithmetic through `$(( ))`. Verified on the spot
- **Available:** `sleep` (coreutils 9.7), `awk`, `perl`, `python3` 3.13, `bsdtar`, `unzip`, `7z`, `kdialog`, `zenity`

---

## 9. Order of work

The installer first, then the packing, then the site. The generator is not needed to start: `setup.sh` takes its input from `recipe.json`, and during debugging that is written by hand.

```json
{
  "name": "Need for Speed: Most Wanted",
  "slug": "nfsmw",
  "exe": "speed.exe",
  "prefix_arch": "win32"
}
```

Unpack the archive anywhere, put `recipe.json` next to it, and debug on live data. No `.run`, no `dd`, no browser.

**Stage 1: the installer.** It gives a working thing: a script that installs a game already today.

1.  ~~`vdf.py` **read-only**~~: **done.** Both parsers are written and were run on copies of the live files. The formats of `shortcuts.vdf` and `CompatToolMapping` were taken from a real machine, the results are in 5.2
2.  ~~Set Proton through the UI~~: **not needed for question 3:** the Deck already had three `CompatToolMapping` entries, and the format is visible from them. The step stays useful as a reference for what **Steam itself** writes when a shortcut is added through "Add a Non-Steam Game": the existing entries were made by a third-party tool
3.  `vdf.py` for writing, shutting Steam down, backups: **the `shortcuts.vdf` writer is done.** The key check is **a byte-for-byte round-trip**. A live file was read, serialized back and compared byte by byte: 3952 B → 3952 B, a full match. That proves the format is understood whole, with no "almost understood" places, and that a rewrite loses nothing. The key order holds by itself: `dict` is ordered in Python 3.7+.

    The technique is worth remembering and repeating for `config.vdf` **before** the first write into it: if the round-trip of the text KeyValues does not match byte for byte, the live file must not be written to under any circumstances (the risk from 2.2)
4.  `setup.sh` as a whole: `kdialog`, unpacking, appid, artwork

**Debug step 3 on copies only.** Copy `shortcuts.vdf` and `config.vdf` into a separate folder and run the parser on them until there is confidence. `config.vdf` holds every client setting, and the first mistake in writing to the live file costs a Steam reinstall. The backup inside the script is a safety net for the user; development needs isolation.

**Stage 1 is done.** The full cycle was verified on a live machine: the game was removed together with its shortcut, mapping, artwork, prefix and folder, then installed again with one call of `setup.sh` from an assembled bundle folder. The acceptance check in separate code (`check-install.py`, which writes nothing) passed 13 checks out of 13: the shortcut, `AppName`, `Exe` in quotes, `StartDir`, the `LaunchOptions` filled in automatically, the icon path, `CompatToolMapping` with `priority`, all five pieces of artwork under the right names.

Numbers from a real run: unpacking 4.7 GB took **29 s**, shutting the client down 3 s, starting it 1 s, the client rewrote `shortcuts.vdf` after 6 s, and the whole install after the unpacking took about **20 s**. First attempt, no retry needed.

What was written: `vdf.py` (both formats, reading and writing), `config_surgery.py` (text edits to `config.vdf` without parsing it into a tree), `steamctl.py` (the client's lifecycle), `steam_install.py` (user, shortcut, Proton, wrappers, artwork), `install.py` (orchestration with verification and retries), `setup.sh` (questions and unpacking), `check-install.py` (acceptance).

**Stage 2: packing.** It turns the working script into one file.

5. ~~A fixed-length header + `dd` extraction~~: **done.** Verified first on a 78 KB dummy, then on a real file
6. ~~Gluing: header + meta + payload verbatim~~: **done**, `make-run.sh`

**Stage 2 is done.** The full cycle passed a second time, now with one file: the game was removed cleanly, the `.run` was run, and the `check-install.py` acceptance gave 13 out of 13.

Numbers: building the `.run` took **7 s** (gluing 4.06 GB), unpacking during the install **32 s**, the whole cycle from starting the `.run` to a verified result **46 s**, on the first attempt.

The resulting file: header 8192 B + meta 5 490 688 B (671 blocks) + the archive 4 059 825 267 B verbatim = **4 065 330 291 B**. The overhead of the format is 5.5 MB, of which 5.3 MB is the artwork.

**Stage 3: the web application.** To be done on a big screen, not on the Deck: it needs Chromium and room for debugging.

7. ~~The central directory parser with Zip64~~: **done**, verified on an archive over 4 GiB (6.1)
8. ~~Streaming build + `showSaveFilePicker`~~: **done**
9. ~~The UI on top of the ready logic~~: **done**

**Stage 3 is done.** The full cycle passed a third time, now from the browser: NFS Carbon (6 547 118 210 B, 7751 entries) went through the generator into a `.run` whose payload matched the original zip byte for byte. On a live Deck (SteamOS 3.8.28) it unpacked 8.2 GB in 57 s and installed on the first attempt, with Proton set; the hero, the logo and the icon showed in the library, and all five artwork files were in `grid/` with the current date.

The `kdialog` and `ActiveUser` checks (questions 2 and 4) get closed along the way at step 4, and `dd` (question 1) at step 5.

---

## 10. Open questions

Collected from the `[?]` marks above:

1. Whether to show `setup.sh` before the build (6.4)
2. Rebuilding: a separate button or a shared drop zone (7.7)
3. Whether to return to fetching artwork automatically if a backend appears for other reasons (2.7)
4. The scoring weights in 7.2.1 are verified on one game
5. ~~Saves on reinstall~~: **done** through `user_data` in the recipe, with those folders skipped when unpacking (5.1 step 3)
6. **Why Steam undid an outside edit of `shortcuts.vdf`** and rolled the file back two years (5.1.0). Steam Cloud is only a hypothesis. The way to check: set the same icon through the client's UI and see whether **its own** entry survives a restart. If it rolls back too, the cause is the sync, not the way the file is written

### Closed

- **Placeholders for empty artwork slots**: not generated. An empty slot stays empty, and Steam shows its default. This also settles the question "in the generator or in the installer" (7.5)
- **How the overrides checkbox reaches SteamOS**: through the `dll_overrides` field in the recipe. An empty list and a missing field mean different things (7.3.1)
- **`dd` extraction from the file itself**: it works. It also turned out not to be needed for the payload at all: the zip is read straight out of the `.run` (3)
- **The icon as a fifth slot**: yes, in the MVP. But it is set not by copying a file but by writing the path into the shortcut's `icon` field (7.5)
- **`ActiveUser` in `registry.vdf`**: the field does not exist at all, nor does the `ActiveProcess` block. There is no `MostRecent` in `loginusers.vdf` either. The mechanism was rewritten as "the only folder → `AutoLogin` → `Timestamp`" (5.1.1)
- **The `CompatToolMapping` format**: taken from a real machine, and the guess was confirmed word for word: the key is the unsigned appid as a decimal string, the fields are `name` / `config` / `priority` = `"250"` (5.2)
- **The set of `shortcuts.vdf` fields**: taken from a real machine, wider than the earlier list; `appid` is written as an explicit field, `tags` is a nested object (5.2)
- **Artwork file names**: from the unsigned 32-bit appid, with the suffixes `p`, `_hero`, `_logo`, `_icon` and none. The 64-bit scheme is a legacy symlink and is not reproduced (7.5)
- **Whether `kdialog` is there**: it is, together with `zenity` (2.8)
- **Fetching artwork automatically from the browser**: no, SteamGridDB's CORS is closed at the preflight, verified. Manual mode (2.7, 7.5)
- **Editing and cropping images**: not needed, ready artwork of the right sizes comes from SteamGridDB (7.5)
- **A folder as an alternative input**: no, zip only. A second path would need a tar writer, recompression and the auto-detection duplicated on top of a different data model (2.4)
- **Which Steam user to take**: not "the first one that comes along": there is `ActiveUser`, then `MostRecent`. The order, from the surest down, is in 5.1.1
- **The registry**: we do not do it. We come back to it only if real tests run into a real problem (2.6)
- **`--strip-components` and nesting detection**: not needed. The path to the exe comes from the central directory together with its nesting, and the archive is unpacked as it is (7.1)
- **Typing the path to the exe by hand**: no. Only a choice from the select: a path typed by hand cannot be checked by anyone before the run on SteamOS (7.2)
- **Whether to limit the exe search to the root**: no, a flat list over the whole tree. Some games keep the exe in a subfolder, and from the root the list would be empty (7.2)
- **Where the install location and the Proton version are chosen**: on SteamOS, not in the generator. The dividing criterion is in 2.8
- **A GUI application of our own for the questions**: no, `kdialog`. A binary of our own is fragile on a read-only rootfs with libraries that get updated (2.8)
- **`launch.sh` as the target of the shortcut**: not needed. It worked around `CompatToolMapping` being out of reach while the client runs; since Steam is shut down, the workaround is gone together with `.desktop`, `steamos-add-to-steam` and `PROTON_PATH` (2.2, 2.3)
- **Two launch modes for debugging**: the question disappeared, there is one mode
- **What Steam puts into `Exe` when a `.desktop` is added**: the question disappeared: we write the entry, and it holds exactly what we put there (2.2)
- **protontricks auto-detection**: works the normal way, the `CompatToolMapping` is in place (5.3)
- **The uninstall asymmetry**: gone, removing an entry is no different from adding one (5.4)
- **Installing from Gaming Mode**: not in v1. Not "might not work" but structurally impossible in the current form; it needs a separate component (a receiver shortcut or a Decky plugin). Postponed, not discarded (1.3)
