/**
 * A zip stores names in the original IBM PC character set unless flag bit 11
 * says UTF-8. TextDecoder has no cp437, so the upper half lives here.
 *
 * For a Russian archive packed without the UTF-8 flag this produces garbage -
 * which is correct, and exactly what the warning in 6.3 is about.
 */
const HIGH = 'ÇüéâäàåçêëèïîìÄÅ'
  + 'ÉæÆôöòûùÿÖÜ¢£¥₧ƒ'
  + 'áíóúñÑªº¿⌐¬½¼¡«»'
  + '░▒▓│┤╡╢╖╕╣║╗╝╜╛┐'
  + '└┴┬├─┼╞╟╚╔╩╦╠═╬╧'
  + '╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀'
  + 'αßΓπΣσµτΦΘΩδ∞φε∩'
  + '≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ '
/** Bytes below this are plain ASCII; the table covers the rest. */
const HIGH_START = 0x80
const ASCII_MAX = 0x7f

/** @returns The name as cp437 decodes it. */
export function decodeCp437(bytes: Uint8Array) {
  let out = ''

  for (const byte of bytes) {
    out += byte < HIGH_START ? String.fromCharCode(byte) : HIGH[byte - HIGH_START]
  }

  return out
}

/** @returns Whether any byte is outside plain ASCII. */
export function hasNonAscii(bytes: Uint8Array) {
  return bytes.some(byte => byte > ASCII_MAX)
}
