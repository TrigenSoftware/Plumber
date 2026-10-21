#!/bin/sh
# The installer's entry point: asks the questions, then hands over to the
# Python side, which unpacks the game and adds it to Steam.
#
# No GUI of its own, on purpose (2.8): the rootfs is read-only, libraries
# change with SteamOS updates, and kdialog survives them along with the system.
#
# Everything shown to the person has to explain itself: they started one file
# with a double click and should not have to guess what the window is about.
set -eu

HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
RECIPE="$HERE/recipe.json"
ART="$HERE/art"
ARCHIVE="${ARCHIVE:-$HERE/game.archive}"
DRYRUN=""
UNINSTALL=""
# Windows make sense only when the questions were asked in windows too. When
# the folder and the Proton version come from outside, another script is
# calling this one, and it has to stay quiet and speak through its exit code.
GUI=""
[ -z "${DEST:-}" ] && [ -z "${PROTON:-}" ] && GUI="yes"

# A place of our own for what cannot be carried out of a pipeline: the exit
# code of install.py. The left side of a pipeline in POSIX sh is a subshell,
# and its variables do not come back out.
TMPDIR_SETUP=$(mktemp -d)

for arg in "$@"; do
    case "$arg" in
        --dry-run)   DRYRUN="--dry-run" ;;
        --uninstall) UNINSTALL="--uninstall" ;;
        --archive=*) ARCHIVE="${arg#--archive=}" ;;
        --dest=*)    DEST="${arg#--dest=}" ;;
        *) echo "unknown argument: $arg" >&2; exit 2 ;;
    esac
done

have() { command -v "$1" >/dev/null 2>&1; }
die() {
    echo "ERROR: $*" >&2
    [ -n "$GUI" ] && have kdialog && kdialog --title "$NAME" --error "$*" 2>/dev/null || true
    exit 1
}

[ -f "$RECIPE" ] || { echo "recipe.json not found next to the script" >&2; exit 1; }
NAME=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["name"])' "$RECIPE")
SLUG=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["slug"])' "$RECIPE")

# ------------------------------------------------------------- progress
# kdialog --progressbar hands back a DBus reference, and qdbus moves the bar
# through it. Without it the screen freezes for a minute after the Proton
# choice, and the person decides that everything has hung. The window has a
# Cancel button of its own, and install.py is the one that answers it.
QDBUS=$(command -v qdbus6 2>/dev/null || command -v qdbus 2>/dev/null || true)
PROGRESS=""
progress_open() {
    [ -n "$GUI" ] || return 0
    have kdialog && [ -n "$QDBUS" ] || return 0
    PROGRESS=$(kdialog --title "$NAME" --progressbar "$1" 100 2>/dev/null || true)
}
progress_pct()   { [ -n "$PROGRESS" ] && $QDBUS $PROGRESS Set "" value "$1" >/dev/null 2>&1 || true; }
progress_text()  { [ -n "$PROGRESS" ] && $QDBUS $PROGRESS setLabelText "$1" >/dev/null 2>&1 || true; }
progress_close() { [ -n "$PROGRESS" ] && $QDBUS $PROGRESS close >/dev/null 2>&1 || true; PROGRESS=""; }
cleanup() { progress_close; rm -rf "$TMPDIR_SETUP"; }
trap 'cleanup' EXIT

# ------------------------------------------------------------ questions
ask_dir() {
    _def="$1"
    if have kdialog; then
        kdialog --title "Where to install $NAME" \
                --getexistingdirectory "$_def" 2>/dev/null || echo "$_def"
    elif have zenity; then
        zenity --file-selection --directory --title="Where to install $NAME" \
                --filename="$_def" 2>/dev/null || echo "$_def"
    elif [ -t 0 ]; then
        printf 'Install to [%s]: ' "$_def" >&2
        read -r _a </dev/tty; echo "${_a:-$_def}"
    else
        echo "$_def"
    fi
}

ask_proton() {
    _list=$(python3 "$HERE/install.py" --list-proton)
    [ -n "$_list" ] || { echo ""; return; }
    _first=$(echo "$_list" | head -1 | cut -f1)

    # The tag/item pairs go into the positional parameters: names like
    # "Proton 9.0" contain spaces, and splitting a $(...) would shift every
    # pair after them.
    set --
    _tab=$(printf '\t')
    while IFS="$_tab" read -r _tag _label; do
        [ -n "$_tag" ] || continue
        set -- "$@" "$_tag" "$_label"
    done <<EOF
$_list
EOF
    [ $# -gt 0 ] || { echo "$_first"; return; }

    if have kdialog; then
        kdialog --title "Proton version for $NAME" \
                --menu "Which Proton to run the game with. If unsure, keep the first one." \
                "$@" 2>/dev/null || echo "$_first"
    elif have zenity; then
        zenity --list --title "Proton version" --text "Run $NAME with:" \
                --column "tag" --column "Version" --hide-column=1 --print-column=1 \
                "$@" 2>/dev/null || echo "$_first"
    else
        echo "$_first"
    fi
}

# The Steam account is asked about only when there really is a choice: a
# personal console has a single folder in userdata/, and the question never
# comes up (5.1.1).
ask_user() {
    _users=$(python3 "$HERE/install.py" --list-users)
    _count=$(printf '%s\n' "$_users" | grep -c . || true)
    [ "$_count" -gt 1 ] || { echo ""; return; }

    _first=$(printf '%s\n' "$_users" | head -1 | cut -f1)
    set --
    _tab=$(printf '\t')
    while IFS="$_tab" read -r _uid _label; do
        [ -n "$_uid" ] || continue
        set -- "$@" "$_uid" "$_label"
    done <<EOF
$_users
EOF
    [ $# -gt 0 ] || { echo "$_first"; return; }

    if [ -n "$GUI" ] && have kdialog; then
        kdialog --title "Steam account" \
                --menu "Which library should $NAME be added to?" \
                "$@" 2>/dev/null || echo "$_first"
    else
        echo "$_first"
    fi
}

if [ -n "$UNINSTALL" ]; then
    DEST="${DEST:-$HOME/Games}"
    exec python3 "$HERE/install.py" --recipe "$RECIPE" \
        --game-dir "$DEST/$SLUG/game" --uninstall $DRYRUN
fi

# ----------------------------------------------- greeting and questions
if [ -z "$DRYRUN" ] && [ -n "$GUI" ] && have kdialog; then
    kdialog --title "Install game" --icon dialog-information \
        --yesno "Install <b>$NAME</b>?

The game will be unpacked to disk and added to your Steam
library with artwork and Proton already set up.

Steam will be restarted briefly." 2>/dev/null || exit 0
fi

DEST="${DEST:-$(ask_dir "$HOME/Games")}"
[ -n "$DEST" ] || die "no folder selected"
GAMEDIR="$DEST/$SLUG/game"

# Another game in the folder is asked about before a byte is written there:
# two games can share a slug, and the second one unpacked over the first
# breaks it (folder_occupant in install.py). Without windows to ask in, the
# answer is no.
if [ -z "$DRYRUN" ]; then
    while :; do
        THERE=$(python3 "$HERE/install.py" --recipe "$RECIPE" --game-dir "$GAMEDIR" \
            --check-folder 2>/dev/null) || THERE="files that could not be checked"
        [ -n "$THERE" ] || break
        { [ -n "$GUI" ] && have kdialog; } || die "$GAMEDIR already holds $THERE"
        _s=0
        kdialog --title "$NAME" --warningyesnocancel "The folder <b>$GAMEDIR</b> already holds <b>$THERE</b>.

Installing <b>$NAME</b> there would overwrite the files the two have in
common, and the other game could stop working." \
            --yes-label "Choose another folder" --no-label "Install there anyway" \
            2>/dev/null || _s=$?
        case $_s in
            0)
                DEST=$(ask_dir "$DEST")
                [ -n "$DEST" ] || die "no folder selected"
                GAMEDIR="$DEST/$SLUG/game" ;;
            1) break ;;
            *) exit 0 ;;
        esac
    done
fi

PROTON="${PROTON:-$(ask_proton)}"
STEAM_USER="${STEAM_USER:-$(ask_user)}"
echo "Installing: $NAME"
echo "  folder: $GAMEDIR"
echo "  Proton: ${PROTON:-(none)}"

# -------------------------------------------------- unpacking and Steam
# Python unpacks too, not bsdtar: bsdtar cannot open a Zip64 archive - one
# over 4 GiB - with anything in front of it, and in a .run the script and the
# meta come first (3). The first game that size failed to install.
#
# The log is written by this script, not by Python: everything install.py
# prints, tracebacks included, goes into the file as it is printed. Otherwise
# the log depends on Python getting as far as writing it, and it is needed
# exactly when Python did not. The path is settled before the run, so the
# error window names a file that is there.
LOG=/dev/null
if [ -z "$DRYRUN" ]; then
    mkdir -p "$GAMEDIR" 2>/dev/null || true
    LOG="$GAMEDIR/install.log"
    touch "$LOG" 2>/dev/null || LOG="${TMPDIR:-/tmp}/$SLUG-install.log"
    progress_open "Preparing..."
fi

# The exit code goes through a file: the pipeline's own is tee's. It is caught
# with `|| _s=$?` because under set -eu a failing command would kill the
# subshell before it could write the code down.
# -u makes the lines reach the file at once, not in one block at exit.
# PYTHON_COLORS=0 because Python 3.13 colors tracebacks when FORCE_COLOR is in
# the environment, and the log is read in a text editor.
_rc_file="$TMPDIR_SETUP/install-rc"
echo 1 > "$_rc_file"
{
    _s=0
    PYTHON_COLORS=0 python3 -u "$HERE/install.py" \
        --recipe "$RECIPE" --game-dir "$GAMEDIR" --archive "$ARCHIVE" \
        --proton "$PROTON" --art "$ART" $DRYRUN \
        ${STEAM_USER:+--steam-user "$STEAM_USER"} \
        ${PROGRESS:+--progress-ref "$PROGRESS"} 2>&1 || _s=$?
    echo "$_s" > "$_rc_file"
} | tee "$LOG" || true
RC=$(cat "$_rc_file" 2>/dev/null || echo 1)

progress_pct 100
progress_close

if [ -z "$DRYRUN" ] && [ -n "$GUI" ] && have kdialog; then
    # install.py writes "NOTE: ..." lines for the person: something that did
    # not go as planned without making the game any less installed
    _notes=$(grep '^NOTE: ' "$LOG" 2>/dev/null | cut -c7- || true)
    case $RC in
        0)
            kdialog --title "Done" --icon dialog-ok \
                --msgbox "<b>$NAME</b> is installed.

It is now in your Steam library.
If you don't see it, switch library pages to refresh.${_notes:+

$_notes}" 2>/dev/null || true
            ;;
        4)
            # The game is in the library, but a step after the shortcut did not
            # go through. Without Proton it will not start, hence the advice.
            kdialog --title "Installed with problems" --icon dialog-warning \
                --msgbox "<b>$NAME</b> is in your Steam library, but part of its setup did not finish.

If the game does not start, open its Properties, then Compatibility,
turn on \"Force the use of a specific Steam Play compatibility tool\"
and pick a Proton version.${_notes:+

$_notes}

Details in:
$LOG" 2>/dev/null || true
            ;;
        6)
            # The window was closed while Steam was untouched: the person
            # stopped the install, and nothing of theirs has changed
            kdialog --title "Install cancelled" --icon dialog-information \
                --msgbox "<b>$NAME</b> was not installed, and Steam was not touched.

The files unpacked so far are in:
$GAMEDIR" 2>/dev/null || true
            ;;
        *)
            # install.py writes its "ERROR: ..." lines for the person: what is
            # wrong and what to do about it. The last one goes into the window,
            # the rest stays in the log.
            _why=$(grep '^ERROR: ' "$LOG" 2>/dev/null | tail -1 | cut -c8-)
            kdialog --title "Install failed" --error \
                "The installation did not finish.${_why:+

$_why}

Details in:
$LOG" 2>/dev/null || true
            ;;
    esac
fi
exit $RC
