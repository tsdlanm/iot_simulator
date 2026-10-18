import type { Props, Value } from '../components/types'
import { compileSketch, failureText } from './compileClient'
import { createLink, type EmuLink } from './link'
import type { Snapshot } from './session'
import { useEmu } from './store'
import { ANALOG_PINS, INPUT_PINS, OUTPUT_PINS, type Duty } from './uno'

/** Kind of the board that runs real Arduino code. */
export const CPP_KIND = 'mcu-uno'

interface Running {
  link: EmuLink
  duty: Duty
  /** The last inputs sent, so an unchanged circuit does not cost a message every tick. */
  sent: string
}

const running = new Map<string, Running>()

export interface PlainNode {
  id: string
  kind: string
  props: Props
}

export const usesCpp = (n: PlainNode) => n.kind === CPP_KIND && n.props.mode !== 'simple'

function onSnapshot(id: string, s: Snapshot) {
  const r = running.get(id)
  if (!r) return
  if (s.error) {
    useEmu.getState().patch(id, { phase: 'error', message: s.error })
    return
  }
  r.duty = s.duty
  if (s.serial) useEmu.getState().appendSerial(id, s.serial)
}

export type PrepareResult = { ok: true } | { ok: false; nodeId: string; message: string }

/**
 * Compiles every board that runs C++ and starts an emulator for each with the result.
 * Stops at the first board that fails and leaves nothing running.
 */
export async function prepare(nodes: PlainNode[]): Promise<PrepareResult> {
  const boards = nodes.filter(usesCpp)
  dispose()
  const emu = useEmu.getState()
  for (const n of boards) emu.patch(n.id, { phase: 'compiling', diagnostics: [], message: undefined, serial: '' })

  const results = await Promise.all(boards.map((n) => compileSketch(String(n.props.sketch ?? ''))))
  for (const [i, n] of boards.entries()) {
    const r = results[i]!
    if (!r.ok) {
      emu.patch(n.id, { phase: 'error', diagnostics: r.diagnostics, message: r.message ?? failureText(r), compiledCode: String(n.props.sketch ?? '') })
      for (const b of boards) if (b.id !== n.id && emu.boards[b.id]?.phase === 'compiling') emu.patch(b.id, { phase: 'idle' })
      return { ok: false, nodeId: n.id, message: failureText(r) }
    }
  }
  for (const [i, n] of boards.entries()) {
    const r = results[i]!
    if (!r.ok) continue
    const link = createLink()
    const entry: Running = { link, duty: {}, sent: '' }
    link.onSnapshot((s) => onSnapshot(n.id, s))
    link.send({ type: 'load', hex: r.hex })
    running.set(n.id, entry)
    emu.patch(n.id, { phase: 'ready', diagnostics: [], message: undefined, size: r.size, compiledCode: String(n.props.sketch ?? '') })
  }
  return { ok: true }
}

const toVolts = (value: Value | undefined, props: Props) => {
  if (typeof value !== 'number') return 0
  const lo = typeof props.adcMin === 'number' ? props.adcMin : 0
  const hi = typeof props.adcMax === 'number' ? props.adcMax : 500
  return hi === lo ? 0 : ((value - lo) / (hi - lo)) * 5
}

/** Gives a board's emulator the circuit's current inputs and returns what its output pins are doing. */
export function exchange(id: string, inputs: Record<string, Value | undefined>, props: Props): Record<string, Value> {
  const out: Record<string, Value> = {}
  for (const pin of OUTPUT_PINS) out[`D${pin}`] = false
  const r = running.get(id)
  if (!r) return out

  const digital: Record<number, boolean> = {}
  for (const pin of INPUT_PINS) digital[pin] = inputs[`D${pin}`] === true
  const analog: Record<number, number> = {}
  for (let ch = 0; ch < ANALOG_PINS; ch++) analog[ch] = toVolts(inputs[`A${ch}`], props)

  const key = JSON.stringify([digital, analog])
  if (key !== r.sent) {
    r.sent = key
    r.link.send({ type: 'inputs', digital, analog })
  }
  for (const pin of OUTPUT_PINS) out[`D${pin}`] = (r.duty[pin] ?? 0) >= 0.5
  return out
}

export function setRunning(on: boolean) {
  for (const r of running.values()) r.link.send({ type: on ? 'run' : 'pause' })
}

export function setSpeed(value: number) {
  for (const r of running.values()) r.link.send({ type: 'speed', value })
}

/** Stops emulators of boards that were deleted or switched away from C++ while the simulation ran. */
export function sync(nodes: PlainNode[]) {
  const wanted = new Set(nodes.filter(usesCpp).map((n) => n.id))
  for (const [id, r] of running) {
    if (wanted.has(id)) continue
    r.link.dispose()
    running.delete(id)
    useEmu.getState().forget(id)
  }
}

export function dispose() {
  for (const r of running.values()) r.link.dispose()
  running.clear()
}

/** Drops all emulators and their serial output (the Reset button). */
export function reset() {
  dispose()
  useEmu.getState().forget()
}
