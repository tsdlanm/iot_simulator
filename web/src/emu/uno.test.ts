import { describe, expect, it } from 'vitest'
import { parseHex, HexError } from './hex'
import { CLOCK_HZ, UnoMachine } from './uno'

const fixtures = import.meta.glob('./fixtures/*.hex', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const fixture = (name: string) => fixtures[`./fixtures/${name}.hex`]!
const seconds = (m: UnoMachine, s: number) => m.run(Math.round(s * CLOCK_HZ))
const machine = (name: string) => {
  const m = new UnoMachine()
  m.load(fixture(name))
  return m
}

describe('parseHex', () => {
  it('reads bytes at their address', () => {
    // 2 bytes (AA BB) at 0x0004
    const image = parseHex(':02000400AABB95\n:00000001FF\n', 16)
    expect([...image.slice(3, 7)]).toEqual([0xff, 0xaa, 0xbb, 0xff])
  })

  it('rejects a bad checksum, missing end, and data past the flash', () => {
    expect(() => parseHex(':02000400AABB00\n:00000001FF\n', 16)).toThrow(HexError)
    expect(() => parseHex(':02000400AABB95\n', 16)).toThrow(/penutup/)
    expect(() => parseHex(':02001000AABB89\n:00000001FF\n', 8)).toThrow(/melebihi/)
    expect(() => parseHex('hello', 8)).toThrow(HexError)
  })
})

describe('UnoMachine running real compiled sketches', () => {
  it('blinks LED 13 at 1 Hz (500 ms on, 500 ms off)', () => {
    const m = machine('blink')
    seconds(m, 0.1)
    const first = m.takeOutputs()
    expect(first[13]).toBeGreaterThan(0.95) // on right after setup
    seconds(m, 0.5)
    expect(m.takeOutputs()[13]).toBeCloseTo(0.8, 1) // window 0.1 s to 0.6 s: on until 0.5 s
    seconds(m, 0.4)
    const off = m.takeOutputs() // window 0.6 s to 1.0 s: off
    expect(off[13]).toBeLessThan(0.05)
    // Over a whole second it is half on.
    m.takeOutputs()
    seconds(m, 1)
    expect(m.takeOutputs()[13]).toBeCloseTo(0.5, 1)
  })

  it('reports PWM as a duty cycle', () => {
    const m = machine('pwm')
    seconds(m, 0.2)
    m.takeOutputs()
    seconds(m, 0.2)
    expect(m.takeOutputs()[9]).toBeCloseTo(64 / 255, 1)
  })

  it('collects Serial output', () => {
    const m = machine('serial')
    seconds(m, 0.35)
    expect(m.takeSerial()).toMatch(/^(halo\r\n){3,4}$/)
    expect(m.takeSerial()).toBe('')
  })

  it('reads an analog voltage through analogRead', () => {
    const m = machine('io')
    m.setAnalog(0, 2.5)
    seconds(m, 0.3)
    const lines = m.takeSerial().trim().split('\r\n')
    expect(Number(lines.at(-1))).toBeGreaterThanOrEqual(510)
    expect(Number(lines.at(-1))).toBeLessThanOrEqual(514)
  })

  it('reads a plain input as high when the circuit says active', () => {
    const m = machine('io')
    seconds(m, 0.2)
    m.takeOutputs()
    seconds(m, 0.2)
    expect(m.takeOutputs()[12]).toBeLessThan(0.05)
    m.setDigital(2, true)
    seconds(m, 0.2)
    m.takeOutputs()
    seconds(m, 0.2)
    expect(m.takeOutputs()[12]).toBeGreaterThan(0.95)
  })

  it('treats an active pull-up input as pulled to ground, like a button wired to GND', () => {
    const m = machine('io')
    seconds(m, 0.2)
    m.takeOutputs()
    seconds(m, 0.2)
    expect(m.takeOutputs()[13]).toBeGreaterThan(0.95) // released: pull-up reads high
    m.setDigital(4, true)
    seconds(m, 0.2)
    m.takeOutputs()
    seconds(m, 0.2)
    expect(m.takeOutputs()[13]).toBeLessThan(0.05) // pressed: reads low
  })

  it('restarts from the beginning on reset but keeps analog levels', () => {
    const m = machine('io')
    m.setAnalog(0, 5)
    seconds(m, 0.2)
    m.reset()
    expect(m.takeSerial()).toBe('')
    expect(m.cycles).toBe(0)
    seconds(m, 0.2)
    expect(Number(m.takeSerial().trim().split('\r\n').at(-1))).toBe(1023)
  })

  it('rejects a corrupt program without breaking the machine', () => {
    const m = machine('blink')
    expect(() => m.load('garbage')).toThrow(HexError)
    seconds(m, 0.1)
    expect(m.cycles).toBeGreaterThan(0)
  })
})
