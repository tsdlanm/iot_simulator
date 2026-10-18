import { beforeEach, describe, expect, it } from 'vitest'
import { useEditor, type IotNode } from './store'

const node = (id: string, kind: string, x = 0, y = 0, selected = false): IotNode => ({
  id,
  type: 'iot',
  position: { x, y },
  data: { kind, props: {} },
  selected,
})

const wire = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) => ({
  id,
  type: 'wire' as const,
  source,
  sourceHandle,
  target,
  targetHandle,
})

beforeEach(() => {
  useEditor.setState({
    nodes: [node('t', 'temp-sensor'), node('c', 'compare'), node('f', 'fan'), node('l', 'led')],
    edges: [wire('e1', 't', 'out', 'c', 'a'), wire('e2', 'c', 'out', 'f', 'in'), wire('e3', 'c', 'out', 'l', 'in')],
    past: [],
    future: [],
  })
})

const select = (...ids: string[]) =>
  useEditor.setState((s) => ({ nodes: s.nodes.map((n) => ({ ...n, selected: ids.includes(n.id) })) }))

describe('removeSelected', () => {
  it('deletes the selected components and every wire attached to them', () => {
    select('c')
    useEditor.getState().removeSelected()
    const { nodes, edges } = useEditor.getState()
    expect(nodes.map((n) => n.id)).toEqual(['t', 'f', 'l'])
    expect(edges).toHaveLength(0)
  })

  it('removes several components in one go and undoes them with a single Ctrl+Z', () => {
    select('t', 'f')
    useEditor.getState().removeSelected()
    expect(useEditor.getState().nodes.map((n) => n.id)).toEqual(['c', 'l'])
    expect(useEditor.getState().edges.map((e) => e.id)).toEqual(['e3'])
    useEditor.getState().undo()
    expect(useEditor.getState().nodes).toHaveLength(4)
    expect(useEditor.getState().edges).toHaveLength(3)
  })

  it('removes a selected wire without touching components', () => {
    useEditor.setState((s) => ({ edges: s.edges.map((e) => ({ ...e, selected: e.id === 'e2' })) }))
    useEditor.getState().removeSelected()
    expect(useEditor.getState().nodes).toHaveLength(4)
    expect(useEditor.getState().edges.map((e) => e.id)).toEqual(['e1', 'e3'])
  })

  it('does nothing, and records no history, when nothing is selected', () => {
    useEditor.getState().removeSelected()
    expect(useEditor.getState().nodes).toHaveLength(4)
    expect(useEditor.getState().past).toHaveLength(0)
  })
})

describe('selectAll', () => {
  it('selects every component', () => {
    useEditor.getState().selectAll()
    expect(useEditor.getState().nodes.every((n) => n.selected)).toBe(true)
  })
})

describe('duplicateSelected', () => {
  it('copies components with new ids, offset, and selects the copies', () => {
    select('t', 'c')
    useEditor.getState().duplicateSelected()
    const { nodes } = useEditor.getState()
    expect(nodes).toHaveLength(6)
    const copies = nodes.filter((n) => n.selected)
    expect(copies).toHaveLength(2)
    expect(copies.map((n) => n.id).every((id) => !['t', 'c', 'f', 'l'].includes(id))).toBe(true)
    expect(copies[0].position).toEqual({ x: 40, y: 40 })
    expect(nodes.filter((n) => !n.selected)).toHaveLength(4)
  })

  it('copies wires between the selected components only', () => {
    select('t', 'c')
    useEditor.getState().duplicateSelected()
    const { nodes, edges } = useEditor.getState()
    expect(edges).toHaveLength(4)
    const copyIds = new Set(nodes.filter((n) => n.selected).map((n) => n.id))
    const added = edges.filter((e) => !['e1', 'e2', 'e3'].includes(e.id))
    expect(added).toHaveLength(1)
    expect(copyIds.has(added[0].source) && copyIds.has(added[0].target)).toBe(true)
    expect([added[0].sourceHandle, added[0].targetHandle]).toEqual(['out', 'a'])
  })

  it('gives the copy its own props so editing one does not change the other', () => {
    select('t')
    useEditor.getState().duplicateSelected()
    const copy = useEditor.getState().nodes.find((n) => n.selected)!
    useEditor.getState().updateProp(copy.id, 'min', 5)
    expect(useEditor.getState().nodes.find((n) => n.id === 't')!.data.props).not.toHaveProperty('min')
  })

  it('is one undo step', () => {
    select('t', 'c')
    useEditor.getState().duplicateSelected()
    useEditor.getState().undo()
    expect(useEditor.getState().nodes).toHaveLength(4)
    expect(useEditor.getState().edges).toHaveLength(3)
  })
})

describe('wires with a custom shape', () => {
  const bend = [{ x: 100, y: 50 }, { x: 100, y: 200 }]

  it('stores points and colour on the wire, and clears them again', () => {
    useEditor.getState().setWire('e1', { points: bend, color: '#e5484d' })
    expect(useEditor.getState().edges.find((e) => e.id === 'e1')?.data).toEqual({ points: bend, color: '#e5484d' })
    useEditor.getState().setWire('e1', { points: [], color: undefined })
    expect(useEditor.getState().edges.find((e) => e.id === 'e1')?.data).toEqual({})
  })

  it('makes a whole drag a single undo step', () => {
    const { beginWireEdit, setWire, undo } = useEditor.getState()
    beginWireEdit()
    for (let i = 1; i <= 20; i++) setWire('e1', { points: [{ x: i, y: i }] })
    expect(useEditor.getState().past).toHaveLength(1)
    undo()
    expect(useEditor.getState().edges.find((e) => e.id === 'e1')?.data?.points).toBeUndefined()
  })

  it('removes a wire and brings it back with undo', () => {
    useEditor.getState().removeWire('e2')
    expect(useEditor.getState().edges.map((e) => e.id)).toEqual(['e1', 'e3'])
    useEditor.getState().undo()
    expect(useEditor.getState().edges).toHaveLength(3)
  })

  it('moves the bends along when both ends are dragged together', () => {
    useEditor.getState().setWire('e1', { points: bend })
    useEditor.getState().onNodesChange([
      { type: 'position', id: 't', position: { x: 30, y: 10 } },
      { type: 'position', id: 'c', position: { x: 30, y: 10 } },
    ])
    expect(useEditor.getState().edges.find((e) => e.id === 'e1')?.data?.points).toEqual([
      { x: 130, y: 60 },
      { x: 130, y: 210 },
    ])
  })

  it('leaves the bends alone when only one end moves', () => {
    useEditor.getState().setWire('e1', { points: bend })
    useEditor.getState().onNodesChange([{ type: 'position', id: 't', position: { x: 30, y: 10 } }])
    expect(useEditor.getState().edges.find((e) => e.id === 'e1')?.data?.points).toEqual(bend)
  })

  it('leaves the bends alone when the ends move by different amounts', () => {
    useEditor.getState().setWire('e1', { points: bend })
    useEditor.getState().onNodesChange([
      { type: 'position', id: 't', position: { x: 30, y: 10 } },
      { type: 'position', id: 'c', position: { x: 50, y: 10 } },
    ])
    expect(useEditor.getState().edges.find((e) => e.id === 'e1')?.data?.points).toEqual(bend)
  })

  it('copies the shape with a duplicate, moved with the copy and independent of the original', () => {
    useEditor.getState().setWire('e1', { points: [{ x: 100, y: 50 }], color: '#30a46c' })
    useEditor.setState((s) => ({ nodes: s.nodes.map((n) => ({ ...n, selected: n.id === 't' || n.id === 'c' })) }))
    useEditor.getState().duplicateSelected()
    const copy = useEditor.getState().edges.find((e) => !['e1', 'e2', 'e3'].includes(e.id))!
    expect(copy.data).toEqual({ points: [{ x: 140, y: 90 }], color: '#30a46c' })
    expect(useEditor.getState().edges.find((e) => e.id === 'e1')?.data?.points).toEqual([{ x: 100, y: 50 }])
  })
})

