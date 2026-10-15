#!/bin/sh
# Builds a .run: header (8 KB) + meta.tar.gz (whole 8 KB blocks) + the archive
# verbatim.
#
# The other producer of this format is the generator in the browser,
# packages/frontend/app/services/bundle/bundle.ts. The format is section 3 of
# the spec; a change in one place takes the same change in the other.
#
# Unlike the first edition of section 3, meta is not fixed at 64 KB: the
# artwork does not fit in it (5+ MB a set). The header carries the number of
# meta blocks instead, and the offset of the archive is written down nowhere:
# the installer finds the end of the zip from the end of the file and works
# the prefix out itself. So the payload is never extracted, and no copy the
# size of the game is needed. It takes zipfile to read it: bsdtar manages only
# below 4 GiB, where the archive has no Zip64 records (src/unpack.py).
set -eu

usage() { echo "make-run.sh <meta-dir> <archive.zip> <out.run>" >&2; exit 2; }
[ $# -eq 3 ] || usage
META_DIR=$1; ARCHIVE=$2; OUT=$3
BS=8192

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

tar -czf "$TMP/meta.tar.gz" -C "$META_DIR" .
MS=$(stat -c%s "$TMP/meta.tar.gz")
BLOCKS=$(( (MS + BS - 1) / BS ))

# The header, with the block count already filled in. Word for word the one
# buildHeader writes in the browser.
cat > "$TMP/header" <<HEOF
#!/bin/sh
# Plumber self-extracting installer.
# [0..8191] this script | [8192..] meta.tar.gz ($BLOCKS blocks) | then the archive
set -eu
SELF=\$(CDPATH= cd -- "\$(dirname -- "\$0")" && pwd)/\$(basename -- "\$0")
TMP=\$(mktemp -d)
trap 'rm -rf "\$TMP"' EXIT
dd if="\$SELF" bs=$BS skip=1 count=$BLOCKS 2>/dev/null | tar -xz -C "\$TMP"
# no exec: it replaces the shell, and the cleanup trap never fires - meta
# with the artwork in it would be left behind in /tmp on every run
ARCHIVE="\$SELF" sh "\$TMP/setup.sh" "\$@"
exit 0
HEOF
HS=$(stat -c%s "$TMP/header")
[ "$HS" -lt "$BS" ] || { echo "The header does not fit in $BS bytes: $HS" >&2; exit 1; }
{ cat "$TMP/header"
  i=$HS; while [ $i -lt $((BS - 1)) ]; do printf '#'; i=$((i+1)); done
  printf '\n'
} > "$TMP/header.padded"

# meta is padded with zeros to a whole block: gzip ignores trailing zeros
cp "$TMP/meta.tar.gz" "$TMP/meta.padded"
PAD=$(( BLOCKS * BS - MS ))
[ "$PAD" -gt 0 ] && dd if=/dev/zero bs=1 count=$PAD >> "$TMP/meta.padded" 2>/dev/null

cat "$TMP/header.padded" "$TMP/meta.padded" "$ARCHIVE" > "$OUT"
chmod +x "$OUT"

echo "built: $OUT"
echo "  header   $BS B"
echo "  meta     $MS B -> $BLOCKS blocks ($((BLOCKS * BS)) B, $PAD of padding)"
echo "  archive  $(stat -c%s "$ARCHIVE") B verbatim"
echo "  total    $(stat -c%s "$OUT") B"
