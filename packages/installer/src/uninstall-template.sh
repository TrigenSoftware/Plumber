#!/bin/sh
# Removes a game installed by Plumber.
#
# Put into the game folder at install time, so the game can be removed
# without keeping a four-gigabyte installer around. The working modules sit
# in a hidden subfolder, out of the way in the file manager.
set -eu

HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
LIB="$HERE/.plumber"
RECIPE="$LIB/recipe.json"

have() { command -v "$1" >/dev/null 2>&1; }

[ -f "$RECIPE" ] || {
    msg="Broken installation: $LIB/recipe.json is missing."
    have kdialog && kdialog --error "$msg" 2>/dev/null || echo "$msg" >&2
    exit 1
}
NAME=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["name"])' "$RECIPE")

# ------------------------------------------------------------ what to remove
# Two different actions, and the difference matters: the saves live next to
# the exe, so removing everything takes them too.
MODE=""
if have kdialog; then
    MODE=$(kdialog --title "Uninstall $NAME" \
        --radiolist "What should be removed?" \
        steam "Remove from Steam only (keep game files and saves)" on \
        all   "Remove everything: game files, saves and Proton prefix" off \
        2>/dev/null) || exit 0
elif [ -t 0 ]; then
    printf 'Remove [s]team entry only or [a]ll files? [s]: ' >&2
    read -r _a </dev/tty
    case "${_a:-s}" in a|A) MODE=all ;; *) MODE=steam ;; esac
else
    MODE=steam
fi
[ -n "$MODE" ] || exit 0

PURGE=""
if [ "$MODE" = "all" ]; then
    SAVES=$(find "$HERE" -type d -name SAVES 2>/dev/null | head -1)
    WARN="This deletes the game folder and its Proton prefix."
    [ -n "$SAVES" ] && WARN="$WARN

Saved games in SAVES/ will be deleted too."
    if have kdialog; then
        kdialog --title "Uninstall $NAME" --warningyesno "$WARN

Continue?" 2>/dev/null || exit 0
    fi
    PURGE="--purge"
fi

# ------------------------------------------------------------------ the work
QDBUS=$(command -v qdbus6 2>/dev/null || command -v qdbus 2>/dev/null || true)
PROGRESS=""
if have kdialog && [ -n "$QDBUS" ]; then
    PROGRESS=$(kdialog --title "$NAME" --progressbar "Removing..." 100 2>/dev/null || true)
    [ -n "$PROGRESS" ] && $QDBUS $PROGRESS Set "" value 20 >/dev/null 2>&1 || true
fi

set +e
python3 "$LIB/install.py" --recipe "$RECIPE" --game-dir "$HERE" --uninstall $PURGE
RC=$?
set -e

[ -n "$PROGRESS" ] && $QDBUS $PROGRESS close >/dev/null 2>&1 || true

if [ $RC -eq 0 ]; then
    if have kdialog; then
        if [ "$MODE" = "all" ]; then
            kdialog --title "Done" --icon dialog-ok \
                --msgbox "<b>$NAME</b> has been removed." 2>/dev/null || true
        else
            kdialog --title "Done" --icon dialog-ok \
                --msgbox "<b>$NAME</b> was removed from Steam.

The game files are still on disk:
$HERE" 2>/dev/null || true
        fi
    fi
else
    have kdialog && kdialog --title "Uninstall failed" --error \
        "Could not finish. Steam may be running and refusing to close." 2>/dev/null || true
fi
exit $RC
