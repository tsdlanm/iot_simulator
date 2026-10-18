/** Geometry for wires that can be bent through user-placed points. Pure functions, no React. */

export interface Pt {
  x: number
  y: number
}

export type Side = 'left' | 'right' | 'top' | 'bottom'

/** More than this would make a wire unreadable and a saved file needlessly large. */
export const MAX_POINTS = 24

/** How far a wire runs straight out of a pin before it may turn. */
export const STUB = 16

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
const r2 = (n: number) => Math.round(n * 100) / 100

const OUT: Record<Side, Pt> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
}

/** The anchors a wire passes through: its two pins and every point the user placed. */
export const anchorsOf = (source: Pt, points: Pt[], target: Pt): Pt[] => [source, ...points, target]

/**
 * The full line to draw once the user has bent it: out of the source pin, through the points, into the
 * target pin. The short straight stubs keep the wire leaving a pin in the direction the pin faces.
 */
export function routeOf(source: Pt, sourceSide: Side, points: Pt[], target: Pt, targetSide: Side): Pt[] {
  const s = OUT[sourceSide]
  const t = OUT[targetSide]
  return [
    source,
    { x: source.x + s.x * STUB, y: source.y + s.y * STUB },
    ...points,
    { x: target.x + t.x * STUB, y: target.y + t.y * STUB },
    target,
  ]
}

/** A polyline with every corner rounded by `radius` (less where segments are too short for it). */
export function roundedPath(route: Pt[], radius = 14): string {
  const first = route[0]
  if (!first || route.length < 2) return ''
  let d = `M ${r2(first.x)} ${r2(first.y)}`
  for (let i = 1; i < route.length - 1; i++) {
    const prev = route[i - 1]!
    const cur = route[i]!
    const next = route[i + 1]!
    const l1 = dist(prev, cur)
    const l2 = dist(cur, next)
    if (l1 < 1e-6 || l2 < 1e-6) continue // a duplicate point has no direction to round
    const r = Math.min(radius, l1 / 2, l2 / 2)
    const a = { x: cur.x - ((cur.x - prev.x) / l1) * r, y: cur.y - ((cur.y - prev.y) / l1) * r }
    const b = { x: cur.x + ((next.x - cur.x) / l2) * r, y: cur.y + ((next.y - cur.y) / l2) * r }
    d += ` L ${r2(a.x)} ${r2(a.y)} Q ${r2(cur.x)} ${r2(cur.y)} ${r2(b.x)} ${r2(b.y)}`
  }
  const last = route[route.length - 1]!
  return `${d} L ${r2(last.x)} ${r2(last.y)}`
}

export function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return dist(p, a)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy })
}

/** The segment of the anchor chain closest to `p`; `index` is where a new point would be inserted. */
export function nearestSegment(anchors: Pt[], p: Pt): { index: number; distance: number } {
  let best = { index: 0, distance: Infinity }
  for (let i = 0; i < anchors.length - 1; i++) {
    const d = distanceToSegment(p, anchors[i]!, anchors[i + 1]!)
    if (d < best.distance) best = { index: i, distance: d }
  }
  return best
}

/** The middle of every segment, where "add a bend here" handles are shown. */
export const midpoints = (anchors: Pt[]): Pt[] =>
  anchors.slice(0, -1).map((a, i) => ({ x: (a.x + anchors[i + 1]!.x) / 2, y: (a.y + anchors[i + 1]!.y) / 2 }))

/** The point halfway along the line's length. Used to place the wire's toolbar. */
export function pointAtHalfLength(route: Pt[]): Pt {
  const total = route.slice(1).reduce((sum, p, i) => sum + dist(route[i]!, p), 0)
  let left = total / 2
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!
    const b = route[i]!
    const len = dist(a, b)
    if (left <= len && len > 0) {
      const t = left / len
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
    left -= len
  }
  return route[route.length - 1] ?? { x: 0, y: 0 }
}

export function insertPoint(points: Pt[], index: number, p: Pt): Pt[] {
  if (points.length >= MAX_POINTS) return points
  const at = Math.max(0, Math.min(points.length, index))
  return [...points.slice(0, at), { x: r2(p.x), y: r2(p.y) }, ...points.slice(at)]
}

export const removePointAt = (points: Pt[], index: number): Pt[] => points.filter((_, i) => i !== index)

export const movePoint = (points: Pt[], index: number, p: Pt): Pt[] =>
  points.map((q, i) => (i === index ? { x: r2(p.x), y: r2(p.y) } : q))

export const shiftPoints = (points: Pt[], dx: number, dy: number): Pt[] =>
  points.map((p) => ({ x: r2(p.x + dx), y: r2(p.y + dy) }))

/**
 * Pulls a dragged point onto the same x or y as its neighbours when it is close, so straight
 * horizontal and vertical runs are easy to make. `index` is the position in the anchor chain.
 */
export function alignToNeighbors(anchors: Pt[], index: number, p: Pt, tolerance = 7): Pt {
  const prev = anchors[index - 1]
  const next = anchors[index + 1]
  let { x, y } = p
  for (const n of [prev, next]) {
    if (!n) continue
    if (Math.abs(n.x - x) <= tolerance) x = n.x
    if (Math.abs(n.y - y) <= tolerance) y = n.y
  }
  return { x, y }
}

/** Colours a wire can be given. `auto` (no colour) picks one from the kind of signal it carries. */
export const WIRE_COLORS = [
  { id: 'red', value: '#e5484d', label: 'Merah' },
  { id: 'orange', value: '#f08a24', label: 'Oranye' },
  { id: 'yellow', value: '#e5b800', label: 'Kuning' },
  { id: 'green', value: '#30a46c', label: 'Hijau' },
  { id: 'blue', value: '#3e8ef7', label: 'Biru' },
  { id: 'purple', value: '#8e4ec6', label: 'Ungu' },
  { id: 'gray', value: '#8b8d98', label: 'Abu-abu' },
] as const

const COLOR_VALUES = new Set<string>(WIRE_COLORS.map((c) => c.value))

/** Only colours from the palette are accepted, so a file cannot smuggle arbitrary CSS into a style. */
export const isWireColor = (v: unknown): v is string => typeof v === 'string' && COLOR_VALUES.has(v)
