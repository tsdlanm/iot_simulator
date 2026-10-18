import { describe, expect, it } from 'vitest'
import { EmuSession, MAX_CATCH_UP_MS, type Snapshot } from './session'

const fixtures = import.meta.glob('./fixtures/*.hex', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const hex = (name: string) => fixtures[`./fixtures/${name}.hex`]!

function setup(name = 'blink') {
  let t = 0
  const out: Snapshot[] = []
  const s = new EmuSession(() => t, (x) => out.push(x))
  s.handle({ type: 'load', hex: hex(name) })
  const advance = (ms: number, step = 25) => {
    for (let spent = 0; spent < ms; spent += step) {
      t += step
      s.tick()
    }
  }
  return { s, out, advance, last: () => out[out.length - 1]! }
}

describe('EmuSession', () => {
  it('does nothing until it is told to run', () => {
    const { advance, out } = setup()
    advance(200)
    expect(out).toHaveLength(0)
  })

  it('follows the wall clock: a 1 Hz blink is on for half of every second', () => {
    const { s, advance, out } = setup()
    s.handle({ type: 'run' })
    advance(1000)
    out.length = 0
    advance(1000)
    const mean = out.reduce((a, x) => a + (x.duty[13] ?? 0), 0) / out.length
    expect(mean).toBeCloseTo(0.5, 1)
  })

  it('runs faster at a higher speed', () => {
    const { s, advance, last } = setup('serial')
    s.handle({ type: 'speed', value: 5 })
    s.handle({ type: 'run' })
    let text = ''
    for (let i = 0; i < 40; i++) {
      advance(25)
      text += last().serial
    }
    // 1 s of wall clock at 5x is 5 s of board time, so about 50 lines of 100 ms each.
    expect(text.split('halo').length - 1).toBeGreaterThan(40)
  })

  it('does not try to catch up on a long stall', () => {
    const { s, out } = setup()
    let t = 0
    const sess = new EmuSession(() => t, (x) => out.push(x))
    sess.handle({ type: 'load', hex: hex('blink') })
    sess.handle({ type: 'run' })
    t = 60_000 // the tab slept for a minute
    sess.tick()
    expect(out.at(-1)!.cycles).toBeLessThanOrEqual(Math.round((MAX_CATCH_UP_MS / 1000) * 16_000_000))
    void s
  })

  it('stops at pause and continues where it was', () => {
    const { s, advance, out, last } = setup('serial')
    s.handle({ type: 'run' })
    advance(300)
    s.handle({ type: 'pause' })
    const n = out.length
    advance(300)
    expect(out).toHaveLength(n)
    const cycles = last().cycles
    s.handle({ type: 'run' })
    advance(50)
    expect(last().cycles).toBeGreaterThan(cycles)
  })

  it('reports bad firmware instead of throwing', () => {
    const { s, out } = setup()
    s.handle({ type: 'load', hex: 'nonsense' })
    expect(out.at(-1)?.error).toMatch(/HEX/)
    s.handle({ type: 'run' }) // nothing loaded: ignored
    s.tick()
    expect(out).toHaveLength(1)
  })

  it('passes circuit inputs to the sketch', () => {
    const { s, advance, last } = setup('io')
    s.handle({ type: 'inputs', digital: {}, analog: { 0: 5 } })
    s.handle({ type: 'run' })
    advance(300)
    advance(300)
    s.handle({ type: 'inputs', digital: { 2: true }, analog: {} })
    advance(100)
    expect(last().duty[12]).toBeGreaterThan(0.9)
  })
})
