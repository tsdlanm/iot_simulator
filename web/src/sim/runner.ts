import { create } from 'zustand'
import * as emu from '../emu/bridge'
import { useEditor } from '../editor/store'
import { useLayout } from '../ui/layout'
import { toast } from '../ui/toast'
import { createEngineState, stepEngine, type Graph, type NodeValues } from './engine'

export const TICK_MS = 100
export const SPEEDS = [1, 2, 5] as const

type Status = 'stopped' | 'compiling' | 'running' | 'paused'

interface SimState {
  status: Status
  speed: number
  time: number
  values: Record<string, NodeValues>
  start: () => Promise<void>
  pause: () => void
  reset: () => void
  setSpeed: (speed: number) => void
}

let engine = createEngineState()
let timer: ReturnType<typeof setInterval> | undefined
/** Bumped by every start and reset, so a compile that finishes after Reset is thrown away. */
let generation = 0

function currentGraph(): Graph {
  const { nodes, edges } = useEditor.getState()
  return {
    nodes: nodes.map((n) => ({ id: n.id, kind: n.data.kind, props: n.data.props })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle ?? '',
      target: e.target,
      targetHandle: e.targetHandle ?? '',
    })),
  }
}

// The graph is re-read on every tick, so edits made while running take effect immediately.
function tick() {
  const graph = currentGraph()
  emu.sync(graph.nodes)
  // Higher speeds run more fixed-size steps per tick instead of one big step.
  for (let i = 0; i < useSim.getState().speed; i++) stepEngine(graph, engine, TICK_MS)
  useSim.setState({ time: engine.time, values: engine.values })
}

export const useSim = create<SimState>((set, get) => ({
  status: 'stopped',
  speed: 1,
  time: 0,
  values: {},

  start: async () => {
    const { status } = get()
    if (status === 'running' || status === 'compiling') return

    if (status === 'stopped') {
      const mine = ++generation
      const boards = currentGraph().nodes.filter(emu.usesCpp)
      if (boards.length > 0) {
        set({ status: 'compiling' })
        const result = await emu.prepare(boards)
        if (mine !== generation) return // reset while compiling
        if (!result.ok) {
          set({ status: 'stopped' })
          useLayout.getState().showCode(result.nodeId)
          toast.error(result.message)
          return
        }
        emu.setSpeed(get().speed)
      }
    }

    set({ status: 'running' })
    emu.setRunning(true)
    timer = setInterval(tick, TICK_MS)
  },

  pause: () => {
    if (get().status !== 'running') return
    clearInterval(timer)
    emu.setRunning(false)
    set({ status: 'paused' })
  },

  reset: () => {
    generation++
    clearInterval(timer)
    emu.reset()
    engine = createEngineState()
    set({ status: 'stopped', time: 0, values: {} })
  },

  setSpeed: (speed) => {
    emu.setSpeed(speed)
    set({ speed })
  },
}))
