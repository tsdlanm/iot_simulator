import { stripNonCode } from './sanitize.js'

export interface Prototypes {
  /** Declarations for the sketch's own functions, so they can be called before they are defined. */
  text: string
  /** 1-based line of the first function; the declarations go just before it. */
  beforeLine: number
}

const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'return', 'else', 'sizeof', 'do', 'catch'])

/**
 * The Arduino IDE lets a sketch call a function before defining it by generating declarations for it.
 * Plain g++ does not, so do the same here: find the top-level function definitions and declare them.
 * It is a pragmatic scan, not a C++ parser: functions with default arguments are left alone.
 */
export function generatePrototypes(source: string): Prototypes | null {
  const code = stripNonCode(source)
  // Reduce every top-level { ... } to {}, keeping a map back to positions in the source.
  const top: string[] = []
  const at: number[] = []
  let depth = 0
  for (let i = 0; i < code.length; i++) {
    const c = code[i]!
    if (c === '{') {
      if (depth === 0) {
        top.push('{')
        at.push(i)
      }
      depth++
    } else if (c === '}') {
      depth = Math.max(0, depth - 1)
      if (depth === 0) {
        top.push('}')
        at.push(i)
      }
    } else if (depth === 0) {
      top.push(c)
      at.push(i)
    }
  }
  // Preprocessor lines are not declarations.
  const flat = top.join('').replace(/^[ \t]*#.*$/gm, (m) => ' '.repeat(m.length))

  const found: string[] = []
  let firstIndex = -1
  const def =
    /(?<=^|[;}])\s*((?:(?:static|inline|extern|const|unsigned|signed|long|short|volatile)\s+)*[A-Za-z_][\w:]*(?:\s*[*&]+\s*|\s+)([A-Za-z_]\w*))\s*\(([^()]*)\)\s*(?:const\s*)?\{\}/g
  for (const m of flat.matchAll(def)) {
    const name = m[2]!
    const params = m[3]!
    if (KEYWORDS.has(name) || name === 'main' || params.includes('=')) continue
    const head = m[1]!.replace(/\s+/g, ' ').replace(/^(static|inline|extern)\s+/, '')
    found.push(`${head}(${params.replace(/\s+/g, ' ').trim()});`)
    if (firstIndex === -1) firstIndex = m.index + m[0].indexOf(m[1]!)
  }
  if (found.length === 0 || firstIndex === -1) return null

  const original = at[firstIndex]!
  const beforeLine = source.slice(0, original).split('\n').length
  return { text: found.join('\n'), beforeLine }
}
