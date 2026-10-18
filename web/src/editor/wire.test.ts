import { describe, expect, it } from 'vitest'
import {
  alignToNeighbors,
  anchorsOf,
  distanceToSegment,
  insertPoint,
  isWireColor,
  MAX_POINTS,
  midpoints,
  movePoint,
  nearestSegment,
  pointAtHalfLength,
  removePointAt,
  roundedPath,
  routeOf,
  shiftPoints,
  STUB,
} from './wire'

const P = (x: number, y: number) => ({ x, y })

describe('roundedPath', () => {
  it('draws a straight line for two points', () => {
    expect(roundedPath([P(0, 0), P(100, 0)])).toBe('M 0 0 L 100 0')
  })

  it('rounds a right-angle corner with the corner as the curve control point', () => {
    expect(roundedPath([P(0, 0), P(100, 0), P(100, 100)], 10)).toBe('M 0 0 L 90 0 Q 100 0 100 10 L 100 100')
  })

  it('shrinks the radius where a segment is too short for it', () => {
    // 6px segment: the corner can use at most half of it
    const d = roundedPath([P(0, 0), P(6, 0), P(6, 100)], 14)
    expect(d).toBe('M 0 0 L 3 0 Q 6 0 6 3 L 6 100')
  })

  it('survives duplicate points and too few points', () => {
    expect(roundedPath([])).toBe('')
    expect(roundedPath([P(1, 1)])).toBe('')
    const d = roundedPath([P(0, 0), P(10, 0), P(10, 0), P(10, 10)])
    expect(d).not.toMatch(/NaN|Infinity/)
  })
})

describe('routeOf', () => {
  it('leaves each pin in the direction it faces', () => {
    const r = routeOf(P(100, 100), 'right', [P(300, 200)], P(500, 100), 'left')
    expect(r[0]).toEqual(P(100, 100))
    expect(r[1]).toEqual(P(100 + STUB, 100))
    expect(r[2]).toEqual(P(300, 200))
    expect(r[3]).toEqual(P(500 - STUB, 100))
    expect(r[4]).toEqual(P(500, 100))
  })

  it('handles pins on the top and bottom edges', () => {
    const r = routeOf(P(0, 0), 'top', [], P(50, 50), 'bottom')
    expect(r[1]).toEqual(P(0, -STUB))
    expect(r[2]).toEqual(P(50, 50 + STUB))
  })
})

describe('hit testing', () => {
  it('measures the distance to a segment, including beyond its ends', () => {
    expect(distanceToSegment(P(5, 3), P(0, 0), P(10, 0))).toBe(3)
    expect(distanceToSegment(P(-4, 3), P(0, 0), P(10, 0))).toBe(5)
    expect(distanceToSegment(P(3, 4), P(0, 0), P(0, 0))).toBe(5)
  })

  it('finds the closest segment and the index a new point would take', () => {
    const anchors = anchorsOf(P(0, 0), [P(100, 0), P(100, 100)], P(200, 100))
    expect(nearestSegment(anchors, P(50, 4)).index).toBe(0)
    expect(nearestSegment(anchors, P(104, 50)).index).toBe(1)
    expect(nearestSegment(anchors, P(150, 98)).index).toBe(2)
  })
})

describe('editing points', () => {
  it('adds a handle in the middle of every segment', () => {
    expect(midpoints(anchorsOf(P(0, 0), [P(100, 0)], P(100, 100)))).toEqual([P(50, 0), P(100, 50)])
    expect(midpoints(anchorsOf(P(0, 0), [], P(10, 20)))).toEqual([P(5, 10)])
  })

  it('inserts at the right place and never past the limit', () => {
    expect(insertPoint([P(1, 1), P(3, 3)], 1, P(2, 2))).toEqual([P(1, 1), P(2, 2), P(3, 3)])
    expect(insertPoint([], 0, P(5, 5))).toEqual([P(5, 5)])
    const full = Array.from({ length: MAX_POINTS }, (_, i) => P(i, i))
    expect(insertPoint(full, 3, P(0, 0))).toBe(full)
  })

  it('moves, removes and shifts without touching the original', () => {
    const pts = [P(1, 1), P(2, 2)]
    expect(movePoint(pts, 1, P(9, 9))).toEqual([P(1, 1), P(9, 9)])
    expect(removePointAt(pts, 0)).toEqual([P(2, 2)])
    expect(shiftPoints(pts, 10, -5)).toEqual([P(11, -4), P(12, -3)])
    expect(pts).toEqual([P(1, 1), P(2, 2)])
  })

  it('snaps a dragged point to its neighbours only when close', () => {
    const anchors = [P(0, 0), P(50, 50), P(100, 100)]
    expect(alignToNeighbors(anchors, 1, P(4, 96))).toEqual(P(0, 100)) // near prev.x and next.y
    expect(alignToNeighbors(anchors, 1, P(30, 70))).toEqual(P(30, 70)) // far from both
    expect(alignToNeighbors([P(0, 0), P(5, 5)], 1, P(2, 2))).toEqual(P(0, 0)) // end of the chain
  })
})

describe('pointAtHalfLength', () => {
  it('lands on the corner of a symmetric L and on the middle of a straight line', () => {
    expect(pointAtHalfLength([P(0, 0), P(10, 0), P(10, 10)])).toEqual(P(10, 0))
    expect(pointAtHalfLength([P(0, 0), P(100, 0)])).toEqual(P(50, 0))
    expect(pointAtHalfLength([])).toEqual(P(0, 0))
  })
})

describe('isWireColor', () => {
  it('accepts palette colours only', () => {
    expect(isWireColor('#e5484d')).toBe(true)
    expect(isWireColor('red')).toBe(false)
    expect(isWireColor('#e5484d; background:url(x)')).toBe(false)
    expect(isWireColor(42)).toBe(false)
  })
})
