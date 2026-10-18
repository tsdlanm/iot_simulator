export interface Diagnostic {
  line: number
  column?: number
  severity: 'error' | 'warning'
  message: string
}

const SKETCH_LINE = /^sketch\.ino:(\d+):(?:(\d+):)?\s*(fatal error|error|warning): (.*)$/

/** Hides the server's directories from messages that go back to the user. */
export function scrubPaths(text: string, dirs: string[]): string {
  let out = text
  for (const dir of dirs.filter(Boolean).sort((a, b) => b.length - a.length)) out = out.split(dir).join('<server>')
  return out.replace(/\/(?:usr|tmp|var|home|opt)\/[^\s:'"]+/g, '<server>')
}

/** Turns avr-g++ output into diagnostics tied to lines of the user's sketch. */
export function parseDiagnostics(output: string, dirs: string[] = []): Diagnostic[] {
  const found: Diagnostic[] = []
  const unplaced: string[] = []
  for (const raw of scrubPaths(output, dirs).split('\n')) {
    const m = SKETCH_LINE.exec(raw.trim())
    if (m) {
      found.push({
        line: Number(m[1]),
        ...(m[2] ? { column: Number(m[2]) } : {}),
        severity: m[3] === 'warning' ? 'warning' : 'error',
        message: m[4]!,
      })
    } else if (/(undefined reference|multiple definition|will not fit in region|cannot find|ld returned)/.test(raw)) {
      unplaced.push(raw.trim())
    }
  }
  // Link errors have no line in the sketch; show them at the top rather than dropping them.
  for (const message of unplaced.slice(0, 5)) found.push({ line: 1, severity: 'error', message })
  return found
}
