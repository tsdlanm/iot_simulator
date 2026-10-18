/**
 * First line of defence for the compile service. It refuses sketches that try to read files off the
 * server (inline assembly with .incbin, #include of arbitrary paths) or to smuggle those through the
 * preprocessor (## token pasting, line continuations splitting a keyword).
 *
 * This is defence in depth, not a sandbox: production must still run the compiler in a container with
 * no secrets, no network and hard CPU, memory and time limits.
 */

export const MAX_SKETCH_BYTES = 64 * 1024

export interface SketchProblem {
  line: number
  message: string
}

/** Headers a sketch may include: the Arduino core and the parts of avr-libc and libc it builds on. */
export const ALLOWED_HEADERS: ReadonlySet<string> = new Set([
  'Arduino.h',
  'stdint.h',
  'stdbool.h',
  'stddef.h',
  'stdlib.h',
  'stdio.h',
  'string.h',
  'math.h',
  'ctype.h',
  'inttypes.h',
  'limits.h',
  'avr/io.h',
  'avr/interrupt.h',
  'avr/pgmspace.h',
  'avr/wdt.h',
  'avr/sleep.h',
  'avr/power.h',
  'avr/eeprom.h',
  'util/delay.h',
  'util/delay_basic.h',
  'util/atomic.h',
])

const ALLOWED_DIRECTIVES = new Set(['', 'include', 'define', 'undef', 'if', 'ifdef', 'ifndef', 'else', 'elif', 'endif', 'error', 'warning'])
const BANNED_WORDS = /\b(asm|__asm__|__asm|incbin|__has_include|__has_include_next)\b/g

export interface Joined {
  text: string
  /** The line of the original source each character of `text` came from (1-based). */
  lines: Int32Array
}

/** Removes backslash-newline pairs, which the compiler does before anything else, so `as\<newline>m` is seen as `asm`. */
export function joinContinuations(src: string): Joined {
  const out: string[] = []
  const lines: number[] = []
  let line = 1
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!
    if (c === '\\' && (src[i + 1] === '\n' || (src[i + 1] === '\r' && src[i + 2] === '\n'))) {
      i += src[i + 1] === '\r' ? 2 : 1
      line++
      continue
    }
    out.push(c)
    lines.push(line)
    if (c === '\n') line++
  }
  return { text: out.join(''), lines: Int32Array.from(lines) }
}

/** Blanks out comments and string/character literals (keeping every newline) so later checks only see code. */
export function stripNonCode(src: string): string {
  const out: string[] = []
  const blank = (s: string) => s.replace(/[^\n]/g, ' ')
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    const n = src[i + 1]
    if (c === '/' && n === '/') {
      const end = src.indexOf('\n', i)
      const stop = end === -1 ? src.length : end
      out.push(blank(src.slice(i, stop)))
      i = stop
    } else if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? src.length : end + 2
      out.push(blank(src.slice(i, stop)))
      i = stop
    } else if (c === '"' && src[i - 1] === 'R') {
      // C++11 raw string: R"delim( ... )delim"
      const open = src.indexOf('(', i + 1)
      const delim = open === -1 ? null : src.slice(i + 1, open)
      const close = delim !== null && delim.length <= 16 && !/[\s()\\]/.test(delim) ? src.indexOf(`)${delim}"`, open) : -1
      if (close !== -1) {
        const stop = close + delim!.length + 2
        out.push(blank(src.slice(i, stop)))
        i = stop
      } else {
        out.push(c)
        i++
      }
    } else if (c === '"' || c === "'") {
      let j = i + 1
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1
      const stop = Math.min(src.length, j + 1)
      out.push(c, blank(src.slice(i + 1, stop - 1)), src[stop - 1] === c ? c : '')
      i = stop
    } else {
      out.push(c)
      i++
    }
  }
  return out.join('')
}

export function checkSketch(src: string): SketchProblem[] {
  if (Buffer.byteLength(src, 'utf8') > MAX_SKETCH_BYTES) {
    return [{ line: 1, message: `Kode terlalu besar (maksimum ${MAX_SKETCH_BYTES / 1024} KB)` }]
  }
  if (src.includes('\0')) return [{ line: 1, message: 'Kode mengandung karakter yang tidak valid' }]

  const problems: SketchProblem[] = []
  const joined = joinContinuations(src)
  const code = stripNonCode(joined.text)
  const lineAt = (index: number) => joined.lines[Math.min(index, joined.lines.length - 1)] ?? 1

  for (const m of code.matchAll(BANNED_WORDS)) {
    problems.push({ line: lineAt(m.index), message: `"${m[1]}" tidak diizinkan di layanan kompilasi ini` })
  }
  for (const m of code.matchAll(/##/g)) {
    problems.push({ line: lineAt(m.index), message: 'Operator ## tidak diizinkan' })
  }

  let offset = 0
  for (const raw of code.split('\n')) {
    const lineStart = offset
    offset += raw.length + 1
    const text = raw.trim()
    if (!text.startsWith('#')) continue
    const line = lineAt(lineStart)
    const directive = /^#\s*([A-Za-z_]*)\s*(.*)$/.exec(text)
    const name = directive?.[1] ?? ''
    const arg = (directive?.[2] ?? '').trim()

    if (!ALLOWED_DIRECTIVES.has(name)) {
      problems.push({ line, message: `Perintah #${name} tidak diizinkan` })
    } else if (name === 'include') {
      const header = /^<([A-Za-z0-9_./]+)>$/.exec(arg)?.[1]
      if (!header) problems.push({ line, message: 'Gunakan #include <nama.h>. Include dengan tanda kutip atau makro tidak didukung' })
      else if (!ALLOWED_HEADERS.has(header)) problems.push({ line, message: `Library "${header}" belum didukung` })
    }
  }
  return problems
}
