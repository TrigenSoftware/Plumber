"""Surgical edits to config.vdf: add or remove a single CompatToolMapping
entry without touching the rest of the file.

There is deliberately NO parse-into-a-tree-and-serialize-back here. config.vdf
holds every client setting, and any loss during a round-trip breaks Steam
completely (2.2). So we work on the text: find the block boundaries by counting
braces and replace exactly the piece we need. Everything outside those
boundaries stays byte for byte.
"""

import re

PATH = ('InstallConfigStore', 'Software', 'Valve', 'Steam')
CTM = 'CompatToolMapping'


def _find_block(text, key, start=0, end=None):
    """Boundaries of the "key" { ... } block.

    The key is matched regardless of case, the way Steam itself reads it:
    KeyValues keys are case-insensitive, and the client spells the same path
    differently from version to version - `"valve"` as well as `"Valve"`.
    A case-sensitive search raises on such a file, and it raises after the
    shortcut is already written: the game lands in the library with no
    Proton and no artwork. Only a key that opens a block counts: a value
    with the same name is not one, so the '{' has to follow the key.

    Returns (kstart, bopen, bclose_after) where kstart is the start of the line
    holding the key, bopen is the index of '{' and bclose_after is the index
    just past the matching '}'. Or None.
    """
    end = len(text) if end is None else end
    pat = re.compile(r'^[ \t]*"%s"\s*\{' % re.escape(key), re.M | re.I)
    for m in pat.finditer(text, start, end):
        i = m.end() - 1
        depth, j = 0, i
        while j < end:
            c = text[j]
            if c == '"':                      # skip over a quoted string
                j += 1
                while j < end and text[j] != '"':
                    j += 2 if text[j] == '\\' else 1
            elif c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0:
                    return m.start(), i, j + 1
            j += 1
    return None


def _locate_steam(text):
    """Descends through PATH.

    Returns the '{' index and the index past the matching '}' of the Steam
    block - the one CompatToolMapping lives in.
    """
    lo, hi = 0, len(text)
    for key in PATH:
        got = _find_block(text, key, lo, hi)
        if not got:
            raise KeyError('block %r not found under %s' % (key, '/'.join(PATH)))
        _, lo, hi = got
    return lo, hi


def _locate_ctm(text):
    """Boundaries of the CompatToolMapping block, or None if there is none."""
    bopen, bclose = _locate_steam(text)
    return _find_block(text, CTM, bopen, bclose)


def _create_ctm(text):
    """Adds an empty CompatToolMapping block to Software/Valve/Steam.

    If no compatibility tool has ever been set, there is no such block, and
    the install would otherwise die here - after the client is already down and
    the shortcut already written. Inserted the same way an entry is: in front of
    the closing brace, indented one level in, everything else untouched.
    """
    bopen, bclose = _locate_steam(text)
    ind = _indent_of(text, bopen) + '\t'
    block = '%s"%s"\n%s{\n%s}\n' % (ind, CTM, ind, ind)
    close_line = text.rfind('\n', bopen, bclose - 1) + 1
    return text[:close_line] + block + text[close_line:]


def _indent_of(text, pos):
    ls = text.rfind('\n', 0, pos) + 1
    return text[ls:pos]


def set_mapping(text, appid, tool_name, priority='250'):
    """Adds or replaces the entry for appid. Returns the new text."""
    appid = str(appid)
    if _locate_ctm(text) is None:
        text = _create_ctm(text)
    ctm = _locate_ctm(text)
    if ctm is None:
        raise KeyError('could not create the %s block' % CTM)
    _, bopen, bclose = ctm

    base = _indent_of(text, bopen)          # indent of the line holding CTM's '{'
    ind = base + '\t'
    body = ('%s"%s"\n%s{\n%s\t"name" "%s"\n%s\t"config" ""\n'
            '%s\t"priority" "%s"\n%s}\n'
            % (ind, appid, ind, ind, tool_name, ind, ind, priority, ind))

    inner = _find_block(text, appid, bopen, bclose)
    if inner:
        kstart, _, kend = inner
        # take the newline after the entry's closing brace with it
        if text[kend:kend + 1] == '\n':
            kend += 1
        return text[:kstart] + body + text[kend:]

    # insert before the closing brace of the CTM block
    close_line = text.rfind('\n', bopen, bclose - 1) + 1
    return text[:close_line] + body + text[close_line:]


def remove_mapping(text, appid):
    """Removes the entry for appid if there is one."""
    appid = str(appid)
    ctm = _locate_ctm(text)
    if ctm is None:
        return text
    _, bopen, bclose = ctm
    inner = _find_block(text, appid, bopen, bclose)
    if not inner:
        return text
    kstart, _, kend = inner
    if text[kend:kend + 1] == '\n':
        kend += 1
    return text[:kstart] + text[kend:]


def get_mapping(text, appid):
    ctm = _locate_ctm(text)
    if ctm is None:
        return None
    _, bopen, bclose = ctm
    inner = _find_block(text, str(appid), bopen, bclose)
    if not inner:
        return None
    kstart, _, kend = inner
    chunk = text[kstart:kend]
    # Field names too are keys, and keys are case-insensitive (_find_block)
    return {k.lower(): v for k, v in re.findall(r'"(\w+)"[ \t]+"([^"]*)"', chunk)}
