import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import { create } from 'zustand'
import { defaultProps, getDef } from '../components/registry'
import type { PropValue, Props } from '../components/types'
import { wouldCreateCycle } from '../sim/engine'
import { exampleProject } from './example'
import { loadStored } from './storage'
import { parseProject, type Project } from './serialize'
import { shiftPoints, type Pt } from './wire'

export type IotNodeData = { kind: string; props: Props }
export type IotNode = Node<IotNodeData, 'iot'>

/** What a wire remembers about its shape. Both are optional: a fresh wire is a plain curve. */
export type WireData = { points?: Pt[]; color?: string }
export type WireEdge = Edge<WireData, 'wire'>

interface Snapshot {
  nodes: IotNode[]
  edges: WireEdge[]
}

const HISTORY_LIMIT = 100

export const newId = () => Math.random().toString(36).slice(2, 10)

function fromProject(p: Project): Snapshot & { name: string } {
  return {
    name: p.name,
    nodes: p.nodes.map((n) => ({
      id: n.id,
      type: 'iot',
      position: { x: n.x, y: n.y },
      data: { kind: n.kind, props: n.props },
    })),
    edges: p.edges.map((e) => ({
      id: e.id,
      type: 'wire' as const,
      source: e.source,
      sourceHandle: e.sourceHandle,
      target: e.target,
      targetHandle: e.targetHandle,
      ...(e.points || e.color ? { data: { ...(e.points ? { points: e.points } : {}), ...(e.color ? { color: e.color } : {}) } } : {}),
    })),
  }
}

interface EditorState extends Snapshot {
  name: string
  past: Snapshot[]
  future: Snapshot[]
  setName: (name: string) => void
  onNodesChange: (changes: NodeChange<IotNode>[]) => void
  onEdgesChange: (changes: EdgeChange<WireEdge>[]) => void
  onConnect: (c: Connection) => void
  isValidConnection: (c: Connection | Edge) => boolean
  beginDrag: () => void
  addNode: (kind: string, position: { x: number; y: number }) => void
  updateProp: (id: string, key: string, value: PropValue) => void
  removeNode: (id: string) => void
  /** Call once when the user starts reshaping a wire, so the whole drag is a single undo step. */
  beginWireEdit: () => void
  setWire: (id: string, patch: Partial<WireData>) => void
  removeWire: (id: string) => void
  /** Deletes every selected component and wire as one undo step. */
  removeSelected: () => void
  selectAll: () => void
  /** Copies the selected components, and the wires between them, slightly offset. */
  duplicateSelected: () => void
  undo: () => void
  redo: () => void
  load: (p: Project) => void
  clear: () => void
}

let lastPropEdit: { id: string; key: string; at: number } | null = null

// React Flow reports one deletion through both onNodesChange and onEdgesChange in the same
// task. Only the first call may record history, otherwise one delete would need two undos.
let historyLocked = false

const initial = fromProject(loadStored() ?? parseProject(exampleProject()) ?? exampleProject())

export const useEditor = create<EditorState>((set, get) => {
  const snapshot = (): Snapshot => ({ nodes: get().nodes, edges: get().edges })

  const pushHistory = () => {
    lastPropEdit = null
    if (historyLocked) return
    historyLocked = true
    queueMicrotask(() => {
      historyLocked = false
    })
    set((s) => ({ past: [...s.past, snapshot()].slice(-HISTORY_LIMIT), future: [] }))
  }

  return {
    ...initial,
    past: [],
    future: [],

    setName: (name) => set({ name }),

    onNodesChange: (changes) => {
      const removed = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id))
      if (removed.size > 0) pushHistory()
      set((s) => {
        // How far each node moved in this update, so a wire between two nodes dragged together keeps its shape.
        const moved = new Map<string, Pt>()
        for (const c of changes) {
          if (c.type !== 'position' || !c.position) continue
          const before = s.nodes.find((n) => n.id === c.id)?.position
          if (before) moved.set(c.id, { x: c.position.x - before.x, y: c.position.y - before.y })
        }
        let edges = removed.size > 0 ? s.edges.filter((e) => !removed.has(e.source) && !removed.has(e.target)) : s.edges
        if (moved.size > 1) {
          edges = edges.map((e) => {
            const a = moved.get(e.source)
            const b = moved.get(e.target)
            const points = e.data?.points
            if (!a || !b || !points?.length || (a.x === 0 && a.y === 0) || a.x !== b.x || a.y !== b.y) return e
            return { ...e, data: { ...e.data, points: shiftPoints(points, a.x, a.y) } }
          })
        }
        return { nodes: applyNodeChanges(changes, s.nodes), edges }
      })
    },

    onEdgesChange: (changes) => {
      const existing = new Set(get().edges.map((e) => e.id))
      if (changes.some((c) => c.type === 'remove' && existing.has(c.id))) pushHistory()
      set((s) => ({ edges: applyEdgeChanges(changes, s.edges) }))
    },

    isValidConnection: (c) => connectionProblem(c) === null,

    onConnect: (c) => {
      if (!get().isValidConnection(c)) return
      pushHistory()
      const edge: WireEdge = {
        id: `e-${newId()}`,
        type: 'wire',
        source: c.source,
        sourceHandle: c.sourceHandle,
        target: c.target,
        targetHandle: c.targetHandle,
      }
      set((s) => ({ edges: [...s.edges, edge] }))
    },

    beginDrag: () => pushHistory(),

    beginWireEdit: () => pushHistory(),

    setWire: (id, patch) =>
      set((s) => ({
        edges: s.edges.map((e) => {
          if (e.id !== id) return e
          const data: WireData = { ...e.data, ...patch }
          if (!data.points?.length) delete data.points
          if (!data.color) delete data.color
          return { ...e, data }
        }),
      })),

    removeWire: (id) => {
      pushHistory()
      set((s) => ({ edges: s.edges.filter((e) => e.id !== id) }))
    },

    addNode: (kind, position) => {
      const def = getDef(kind)
      if (!def) return
      pushHistory()
      const node: IotNode = {
        id: newId(),
        type: 'iot',
        position,
        data: { kind, props: defaultProps(def) },
        selected: true,
      }
      set((s) => ({ nodes: [...s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), node] }))
    },

    updateProp: (id, key, value) => {
      const last = lastPropEdit
      // Typing in a field is one undo step, not one per keystroke.
      if (!(last && last.id === id && last.key === key && Date.now() - last.at < 1000)) pushHistory()
      lastPropEdit = { id, key, at: Date.now() }
      set((s) => ({
        nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, props: { ...n.data.props, [key]: value } } } : n)),
      }))
    },

    removeNode: (id) => {
      pushHistory()
      set((s) => ({
        nodes: s.nodes.filter((n) => n.id !== id),
        edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      }))
    },

    removeSelected: () => {
      const { nodes, edges } = get()
      const gone = new Set(nodes.filter((n) => n.selected).map((n) => n.id))
      const goneEdges = new Set(edges.filter((e) => e.selected).map((e) => e.id))
      if (gone.size === 0 && goneEdges.size === 0) return
      pushHistory()
      set({
        nodes: nodes.filter((n) => !gone.has(n.id)),
        edges: edges.filter((e) => !goneEdges.has(e.id) && !gone.has(e.source) && !gone.has(e.target)),
      })
    },

    selectAll: () => set((s) => ({ nodes: s.nodes.map((n) => (n.selected ? n : { ...n, selected: true })) })),

    duplicateSelected: () => {
      const { nodes, edges } = get()
      const picked = nodes.filter((n) => n.selected)
      if (picked.length === 0) return
      pushHistory()
      const ids = new Map(picked.map((n) => [n.id, newId()]))
      const copies: IotNode[] = picked.map((n) => ({
        ...n,
        id: ids.get(n.id)!,
        position: { x: n.position.x + 40, y: n.position.y + 40 },
        data: { ...n.data, props: { ...n.data.props } },
        selected: true,
      }))
      const wires: WireEdge[] = edges
        .filter((e) => ids.has(e.source) && ids.has(e.target))
        .map((e) => ({
          ...e,
          id: `e-${newId()}`,
          source: ids.get(e.source)!,
          target: ids.get(e.target)!,
          selected: false,
          // The copies sit 40px away, so their bends move with them.
          data: e.data?.points ? { ...e.data, points: shiftPoints(e.data.points, 40, 40) } : e.data,
        }))
      set({ nodes: [...nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), ...copies], edges: [...edges, ...wires] })
    },

    undo: () => {
      const { past, future } = get()
      const prev = past[past.length - 1]
      if (!prev) return
      lastPropEdit = null
      set({ ...prev, past: past.slice(0, -1), future: [snapshot(), ...future] })
    },

    redo: () => {
      const { past, future } = get()
      const next = future[0]
      if (!next) return
      lastPropEdit = null
      set({ ...next, past: [...past, snapshot()], future: future.slice(1) })
    },

    load: (p) => {
      lastPropEdit = null
      set({ ...fromProject(p), past: [], future: [] })
    },

    clear: () => {
      pushHistory()
      set({ nodes: [], edges: [] })
    },
  }
})

const typeName = (t: 'number' | 'boolean') => (t === 'number' ? 'angka' : 'ya/tidak')

/** Why a wire cannot be made, in plain language, or null if it is allowed. */
export function connectionProblem(c: Connection | Edge): string | null {
  const { nodes, edges } = useEditor.getState()
  if (!c.source || !c.target || !c.sourceHandle || !c.targetHandle) return 'Sambungkan dari titik keluaran ke titik masukan'
  if (c.source === c.target) return 'Tidak bisa menyambung ke komponen yang sama'

  const src = nodes.find((n) => n.id === c.source)
  const dst = nodes.find((n) => n.id === c.target)
  const out = src && getDef(src.data.kind)?.outputs.find((p) => p.id === c.sourceHandle)
  const inp = dst && getDef(dst.data.kind)?.inputs.find((p) => p.id === c.targetHandle)
  if (!out || !inp) return 'Sambungkan dari titik keluaran ke titik masukan'
  if (out.type !== inp.type) {
    return `Tipe tidak cocok: ${out.label} (${typeName(out.type)}) tidak bisa masuk ke ${inp.label} (${typeName(inp.type)})`
  }
  if (edges.some((e) => e.target === c.target && e.targetHandle === c.targetHandle)) {
    return `${inp.label} sudah punya kabel. Hapus kabel lama dulu`
  }
  if (wouldCreateCycle(edges, c.source, c.target)) return 'Kabel ini membuat putaran (loop), dan loop belum didukung'
  return null
}
