import { describe, expect, it, vi } from 'vitest'
import { defaultProps, getDef } from '../components/registry'
import { createEngineState, stepEngine, topoOrder, wouldCreateCycle, type Graph, type GraphNode } from './engine'

const node = (id: string, kind: string, props: Record<string, number | string | boolean> = {}): GraphNode => ({
  id,
  kind,
  props: { ...defaultProps(getDef(kind)!), ...props },
})

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string) => ({
  id: `${source}-${target}`,
  source,
  sourceHandle,
  target,
  targetHandle,
})

describe('engine', () => {
  it('propagates a sensor through a comparator to an actuator', () => {
    const graph: Graph = {
      nodes: [
        node('t', 'temp-sensor', { pattern: 'constant', min: 40, max: 40 }),
        node('c', 'compare', { op: '>', threshold: 30 }),
        node('f', 'fan'),
      ],
      edges: [edge('t', 'out', 'c', 'a'), edge('c', 'out', 'f', 'in')],
    }
    const state = createEngineState()
    stepEngine(graph, state, 100)
    expect(state.values.t.outputs.out).toBe(40)
    expect(state.values.c.outputs.out).toBe(true)
    expect(state.values.f.inputs.in).toBe(true)
  })

  it('switches the comparator off when the value is below the threshold', () => {
    const graph: Graph = {
      nodes: [node('t', 'temp-sensor', { pattern: 'constant', min: 10, max: 10 }), node('c', 'compare', { threshold: 30 })],
      edges: [edge('t', 'out', 'c', 'a')],
    }
    const state = createEngineState()
    stepEngine(graph, state, 100)
    expect(state.values.c.outputs.out).toBe(false)
  })

  it('treats unconnected inputs as off', () => {
    const graph: Graph = { nodes: [node('a', 'and'), node('n', 'not')], edges: [] }
    const state = createEngineState()
    stepEngine(graph, state, 100)
    expect(state.values.a.outputs.out).toBe(false)
    expect(state.values.n.outputs.out).toBe(true)
  })

  it('makes the timer wait before turning on and resets when the input drops', () => {
    const graph: Graph = {
      nodes: [node('b', 'button', { pressed: true }), node('t', 'timer', { delay: 1 })],
      edges: [edge('b', 'out', 't', 'in')],
    }
    const state = createEngineState()
    for (let i = 0; i < 9; i++) stepEngine(graph, state, 100)
    expect(state.values.t.outputs.out).toBe(false)
    stepEngine(graph, state, 100)
    expect(state.values.t.outputs.out).toBe(true)

    graph.nodes[0].props.pressed = false
    stepEngine(graph, state, 100)
    expect(state.values.t.outputs.out).toBe(false)
  })

  it('records chart history and caps its length', () => {
    const graph: Graph = {
      nodes: [node('t', 'temp-sensor', { pattern: 'constant', min: 5, max: 5 }), node('c', 'chart')],
      edges: [edge('t', 'out', 'c', 'in')],
    }
    const state = createEngineState()
    for (let i = 0; i < 300; i++) stepEngine(graph, state, 100)
    expect(state.values.c.history).toHaveLength(120)
    expect(state.values.c.history?.every((v) => v === 5)).toBe(true)
  })

  it('ignores a value whose type does not match the port', () => {
    const graph: Graph = {
      nodes: [node('t', 'temp-sensor', { pattern: 'constant', min: 40, max: 40 }), node('f', 'fan')],
      edges: [edge('t', 'out', 'f', 'in')],
    }
    const state = createEngineState()
    stepEngine(graph, state, 100)
    expect(state.values.f.inputs.in).toBeUndefined()
  })

  it('varies a sine sensor over time within its range', () => {
    const graph: Graph = { nodes: [node('t', 'temp-sensor', { pattern: 'sine', min: 20, max: 40, period: 10 })], edges: [] }
    const state = createEngineState()
    const seen: number[] = []
    for (let i = 0; i < 100; i++) {
      stepEngine(graph, state, 100)
      seen.push(state.values.t.outputs.out as number)
    }
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(20)
    expect(Math.max(...seen)).toBeLessThanOrEqual(40)
    expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(15)
  })
})

describe('graph helpers', () => {
  it('orders nodes so sources come first', () => {
    const order = topoOrder([{ id: 'c' }, { id: 'b' }, { id: 'a' }], [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
    ])
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('detects loops', () => {
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
    ]
    expect(wouldCreateCycle(edges, 'c', 'a')).toBe(true)
    expect(wouldCreateCycle(edges, 'a', 'c')).toBe(false)
    expect(wouldCreateCycle(edges, 'a', 'a')).toBe(true)
  })
})

describe('microcontroller boards', () => {
  it('runs the Uno program: analog in, digital out', () => {
    const graph: Graph = {
      nodes: [
        node('t', 'temp-sensor', { pattern: 'constant', min: 40, max: 40 }),
        node('u', 'mcu-uno', { mode: 'simple' }),
        node('f', 'fan'),
      ],
      edges: [edge('t', 'out', 'u', 'A0'), edge('u', 'D13', 'f', 'in')],
    }
    const state = createEngineState()
    stepEngine(graph, state, 100)
    expect(state.values.u.inputs.A0).toBe(40)
    expect(state.values.u.outputs.D13).toBe(true)
    expect(state.values.f.inputs.in).toBe(true)

    graph.nodes[0].props.min = 10
    graph.nodes[0].props.max = 10
    stepEngine(graph, state, 100)
    expect(state.values.f.inputs.in).toBe(false)
  })

  it('blinks D12 from simulated time', () => {
    const graph: Graph = { nodes: [node('u', 'mcu-uno', { mode: 'simple' })], edges: [] }
    const state = createEngineState()
    const seen = new Set<boolean>()
    for (let i = 0; i < 40; i++) {
      stepEngine(graph, state, 100)
      seen.add(state.values.u.outputs.D12 as boolean)
    }
    expect(seen).toEqual(new Set([true, false]))
  })

  it('reads boolean inputs on the ESP32 and drives several outputs', () => {
    const graph: Graph = {
      nodes: [
        node('b', 'button', { pressed: true }),
        node('p', 'button', { pressed: true }),
        node('e', 'mcu-esp32'),
        node('z', 'buzzer'),
      ],
      edges: [edge('b', 'out', 'e', 'D25'), edge('p', 'out', 'e', 'D26'), edge('e', 'D5', 'z', 'in')],
    }
    const state = createEngineState()
    stepEngine(graph, state, 100)
    expect(state.values.e.outputs.D5).toBe(true)
    graph.nodes[1].props.pressed = false
    stepEngine(graph, state, 100)
    expect(state.values.e.outputs.D5).toBe(false)
  })

  it('runs the Pico program and ignores a broken program line without crashing', () => {
    const graph: Graph = { nodes: [node('p', 'mcu-pico', { program: 'GP22 = true\nthis is not valid\nGP21 = 1 +' })], edges: [] }
    const state = createEngineState()
    stepEngine(graph, state, 100)
    expect(state.values.p.outputs.GP22).toBe(true)
    expect(state.values.p.outputs.GP21).toBe(false)
  })

  it('refuses wires from a number output into a boolean pin', () => {
    // D13 is boolean, so the Uno cannot feed an analog-only input such as a gauge.
    const graph: Graph = { nodes: [node('u', 'mcu-uno', { mode: 'simple' }), node('g', 'gauge')], edges: [edge('u', 'D13', 'g', 'in')] }
    const state = createEngineState()
    stepEngine(graph, state, 100)
    expect(state.values.g.inputs.in).toBeUndefined()
  })
})

describe('sensors and actuators', () => {
  it('gives analog sensors an electrical output for the emulator', () => {
    const volts = (kind: string, props: Record<string, number | string | boolean>) => {
      const graph: Graph = { nodes: [node('s', kind, { pattern: 'manual', ...props }), node('u', 'mcu-uno')], edges: [edge('s', 'out', 'u', 'A0')] }
      const spy = vi.spyOn(getDef('mcu-uno')!, 'step')
      stepEngine(graph, createEngineState(), 100)
      const got = spy.mock.calls[0]![0].volts.A0
      spy.mockRestore()
      return got
    }
    expect(volts('temp-sensor', { value: 30, min: 0, max: 100 })).toBeCloseTo(0.3) // LM35: 10 mV per degree
    expect(volts('humidity-sensor', { value: 50, min: 0, max: 100 })).toBeCloseTo(2.5)
    expect(volts('light-sensor', { value: 1000, min: 0, max: 1000 })).toBeCloseTo(5)
    expect(volts('temp-sensor', { value: 900, min: 0, max: 1000 })).toBe(5) // never above the 5 V rail
  })

  it('manual sensors hold the value you set, within their range', () => {
    const run = (value: number) => {
      const s = createEngineState()
      stepEngine({ nodes: [node('t', 'temp-sensor', { pattern: 'manual', value, min: 0, max: 50 })], edges: [] }, s, 100)
      return s.values.t.outputs.out
    }
    expect(run(23)).toBe(23)
    expect(run(99)).toBe(50)
  })

  it('a manual PIR follows its switch', () => {
    const run = (detected: boolean) => {
      const s = createEngineState()
      stepEngine({ nodes: [node('p', 'pir-sensor', { pattern: 'manual', detected })], edges: [] }, s, 100)
      return s.values.p.outputs.out
    }
    expect(run(true)).toBe(true)
    expect(run(false)).toBe(false)
  })

  it('carries a PWM level from a board pin to the actuator wired to it', () => {
    const def = getDef('mcu-uno')!
    const orig = def.levels
    def.levels = () => ({ D9: 0.25 })
    const graph: Graph = { nodes: [node('u', 'mcu-uno', { mode: 'cpp' }), node('l', 'led')], edges: [edge('u', 'D9', 'l', 'in')] }
    const s = createEngineState()
    stepEngine(graph, s, 100)
    def.levels = orig
    expect(s.values.l.levels).toEqual({ in: 0.25 })
  })
})
