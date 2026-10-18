import { afterEach, describe, expect, it, vi } from 'vitest'

const fixtures = import.meta.glob('./fixtures/*.hex', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

vi.mock('./compileClient', async (orig) => {
  const real = await orig<typeof import('./compileClient')>()
  return {
    ...real,
    compileSketch: vi.fn(async (code: string) => {
      if (code.includes('BROKEN')) return { ok: false, reason: 'compile', diagnostics: [{ line: 2, severity: 'error', message: 'oops' }] }
      const name = code.includes('Serial') ? 'serial' : 'blink'
      return { ok: true, hex: fixtures[`./fixtures/${name}.hex`], cached: false, size: { flash: 1, ram: 1, flashMax: 2, ramMax: 2 } }
    }),
  }
})

import { dispose, exchange, prepare, reset, setRunning, sync, type PlainNode } from './bridge'
import { useEmu } from './store'

const uno = (id: string, sketch: string, extra: PlainNode['props'] = {}): PlainNode => ({ id, kind: 'mcu-uno', props: { mode: 'cpp', sketch, ...extra } })
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

afterEach(() => reset())

describe('bridge', () => {
  it('compiles, runs the firmware and reports pins as booleans', async () => {
    expect(await prepare([uno('u', 'void setup(){}')])).toEqual({ ok: true })
    expect(useEmu.getState().boards.u).toMatchObject({ phase: 'ready' })
    setRunning(true)
    await wait(150)
    expect(exchange('u', {}, {}).D13).toBe(true) // blink is on for its first 500 ms
  })

  it('returns every output off when no emulator exists', () => {
    const out = exchange('nobody', {}, {})
    expect(Object.keys(out)).toEqual(['D8', 'D9', 'D10', 'D11', 'D12', 'D13'])
    expect(Object.values(out).every((v) => v === false)).toBe(true)
  })

  it('stops at a failing board, names it, and keeps its diagnostics for the editor', async () => {
    const r = await prepare([uno('a', 'ok'), uno('b', 'BROKEN')])
    expect(r).toMatchObject({ ok: false, nodeId: 'b', message: 'Baris 2: oops' })
    expect(useEmu.getState().boards.b).toMatchObject({ phase: 'error', diagnostics: [{ line: 2 }] })
    expect(exchange('a', {}, {}).D13).toBe(false) // nothing was started
  })

  it('ignores boards in the simple language', async () => {
    const simple: PlainNode = { id: 's', kind: 'mcu-uno', props: { mode: 'simple' } }
    expect(await prepare([simple, { id: 'x', kind: 'led', props: {} }])).toEqual({ ok: true })
    expect(useEmu.getState().boards.s).toBeUndefined()
  })

  it('collects serial output in the store', async () => {
    await prepare([uno('u', 'Serial')])
    setRunning(true)
    await wait(300)
    expect(useEmu.getState().boards.u?.serial).toContain('halo')
  })

  it('drops emulators of boards that were removed', async () => {
    await prepare([uno('u', 'x')])
    sync([])
    expect(useEmu.getState().boards.u).toBeUndefined()
    dispose()
  })
})
