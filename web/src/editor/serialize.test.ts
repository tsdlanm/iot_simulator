import { describe, expect, it } from 'vitest'
import { EXAMPLES, logicExample } from './example'
import { parseProject } from './serialize'

describe('parseProject', () => {
  it.each(EXAMPLES)('accepts the "$name" example unchanged', ({ build }) => {
    const p = build()
    expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p)
  })

  it('rejects unknown versions, unknown kinds and non-objects', () => {
    expect(parseProject(null)).toBeNull()
    expect(parseProject('x')).toBeNull()
    expect(parseProject({ ...logicExample(), version: 99 })).toBeNull()
    const bad = logicExample()
    bad.nodes[0].kind = 'warp-drive'
    expect(parseProject(bad)).toBeNull()
  })

  it('rejects edges that point at missing nodes or reuse an input', () => {
    const missing = logicExample()
    missing.edges[0].target = 'ghost'
    expect(parseProject(missing)).toBeNull()

    const dup = logicExample()
    dup.edges.push({ id: 'dup', source: 'gauge', sourceHandle: 'out', target: 'cmp', targetHandle: 'a' })
    expect(parseProject(dup)).toBeNull()
  })

  it('falls back to defaults for props with the wrong type', () => {
    const p = logicExample()
    const i = p.nodes.findIndex((n) => n.kind === 'compare')
    ;(p.nodes[i].props as Record<string, unknown>).threshold = 'hot'
    ;(p.nodes[i].props as Record<string, unknown>).evil = '<script>'
    const parsed = parseProject(p)!
    expect(parsed.nodes[i].props.threshold).toBe(30)
    expect(parsed.nodes[i].props).not.toHaveProperty('evil')
  })

  it('drops oversized string props instead of loading them', () => {
    const p = EXAMPLES[0].build()
    p.nodes[0].props.program = 'D13 = true\n'.repeat(1000)
    const parsed = parseProject(p)!
    expect(String(parsed.nodes[0].props.program).length).toBeLessThan(500)
  })

  describe('wire shape', () => {
    const withWire = (extra: Record<string, unknown>) => {
      const p = logicExample() as ReturnType<typeof logicExample> & { edges: Record<string, unknown>[] }
      Object.assign(p.edges[0]!, extra)
      return parseProject(JSON.parse(JSON.stringify(p)))!
    }

    it('keeps bend points and a palette colour', () => {
      const parsed = withWire({ points: [{ x: 10, y: 20 }, { x: 30.5, y: -4 }], color: '#e5484d' })
      expect(parsed.edges[0]).toMatchObject({ points: [{ x: 10, y: 20 }, { x: 30.5, y: -4 }], color: '#e5484d' })
    })

    it('drops malformed points instead of rejecting the whole file', () => {
      const parsed = withWire({ points: [{ x: 1, y: 2 }, { x: 'a', y: 2 }, null, { x: NaN, y: 1 }, { x: Infinity, y: 0 }, 7] })
      expect(parsed.edges[0]!.points).toEqual([{ x: 1, y: 2 }])
    })

    it('caps the number of points', () => {
      const many = Array.from({ length: 500 }, (_, i) => ({ x: i, y: i }))
      expect(withWire({ points: many }).edges[0]!.points).toHaveLength(24)
    })

    it('refuses colours that are not in the palette, so a file cannot inject CSS', () => {
      for (const color of ['red', '#ff0000', 'red; background:url(//evil)', 42, null]) {
        expect(withWire({ color }).edges[0]).not.toHaveProperty('color')
      }
    })

    it('ignores points that are not an array', () => {
      expect(withWire({ points: 'oops' }).edges[0]).not.toHaveProperty('points')
    })

    it('round-trips through toProject', async () => {
      const { toProject } = await import('./serialize')
      const edges = [{ id: 'e', type: 'wire' as const, source: 'a', sourceHandle: 'out', target: 'b', targetHandle: 'in', data: { points: [{ x: 1, y: 2 }], color: '#30a46c' } }]
      expect(toProject('x', [], edges).edges[0]).toMatchObject({ points: [{ x: 1, y: 2 }], color: '#30a46c' })
      expect(toProject('x', [], [{ ...edges[0]!, data: undefined }]).edges[0]).not.toHaveProperty('points')
    })
  })
})
