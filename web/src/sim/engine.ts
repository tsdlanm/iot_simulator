import { getDef } from '../components/registry'
import type { Props, Value } from '../components/types'

export interface GraphNode {
  id: string
  kind: string
  props: Props
}

export interface GraphEdge {
  id: string
  source: string
  sourceHandle: string
  target: string
  targetHandle: string
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface NodeValues {
  inputs: Record<string, Value | undefined>
  outputs: Record<string, Value>
  /** For inputs fed by a PWM pin: the fraction of time it is high (0 to 1). Absent for plain on/off. */
  levels?: Record<string, number>
  history?: number[]
}

export interface EngineState {
  time: number
  nodeState: Record<string, Record<string, unknown>>
  values: Record<string, NodeValues>
}

export const HISTORY_LEN = 120

export const createEngineState = (): EngineState => ({ time: 0, nodeState: {}, values: {} })

/** Kahn's algorithm. Nodes that sit on a cycle are left out of the result. */
export function topoOrder(nodes: { id: string }[], edges: { source: string; target: string }[]): string[] {
  const ids = new Set(nodes.map((n) => n.id))
  const indegree = new Map<string, number>(nodes.map((n) => [n.id, 0]))
  const next = new Map<string, string[]>()

  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1)
    next.set(e.source, [...(next.get(e.source) ?? []), e.target])
  }

  const queue = nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id)
  const order: string[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    order.push(id)
    for (const t of next.get(id) ?? []) {
      const d = (indegree.get(t) ?? 0) - 1
      indegree.set(t, d)
      if (d === 0) queue.push(t)
    }
  }
  return order
}

/** True if adding source -> target would create a loop (including a self loop). */
export function wouldCreateCycle(
  edges: { source: string; target: string }[],
  source: string,
  target: string,
): boolean {
  if (source === target) return true
  const stack = [target]
  const seen = new Set<string>()
  while (stack.length > 0) {
    const id = stack.pop()!
    if (id === source) return true
    if (seen.has(id)) continue
    seen.add(id)
    for (const e of edges) if (e.source === id) stack.push(e.target)
  }
  return false
}

/** Advances the simulation by `dt` ms. Mutates `state`. */
export function stepEngine(graph: Graph, state: EngineState, dt: number): void {
  state.time += dt

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
  const edgeByTarget = new Map(graph.edges.map((e) => [`${e.target}:${e.targetHandle}`, e]))
  const outputs = new Map<string, Record<string, Value>>()
  const levelsOut = new Map<string, Record<string, number>>()
  const values: Record<string, NodeValues> = {}

  for (const id of topoOrder(graph.nodes, graph.edges)) {
    const node = nodeById.get(id)
    const def = node && getDef(node.kind)
    if (!node || !def) continue

    const inputs: Record<string, Value | undefined> = {}
    const volts: Record<string, number> = {}
    const levels: Record<string, number> = {}
    for (const port of def.inputs) {
      const edge = edgeByTarget.get(`${id}:${port.id}`)
      const v = edge ? outputs.get(edge.source)?.[edge.sourceHandle] : undefined
      inputs[port.id] = typeof v === port.type ? v : undefined
      const level = edge ? levelsOut.get(edge.source)?.[edge.sourceHandle] : undefined
      if (level !== undefined) levels[port.id] = level
      const from = edge && nodeById.get(edge.source)
      const toVolts = from && getDef(from.kind)?.volts
      if (typeof v === 'number' && from && toVolts) volts[port.id] = toVolts(v, from.props)
    }

    const nodeState = (state.nodeState[id] ??= {})
    const out = def.step({ id, volts, props: node.props, inputs, state: nodeState, time: state.time, dt })
    outputs.set(id, out)
    if (def.levels) levelsOut.set(id, def.levels({ id }))

    let history: number[] | undefined
    if (def.recordInput) {
      const v = inputs[def.recordInput]
      history = state.values[id]?.history ?? []
      if (typeof v === 'number') history = [...history, v].slice(-HISTORY_LEN)
    }
    values[id] = { inputs, outputs: out, history, ...(Object.keys(levels).length ? { levels } : {}) }
  }

  for (const id of Object.keys(state.nodeState)) if (!nodeById.has(id)) delete state.nodeState[id]
  state.values = values
}
