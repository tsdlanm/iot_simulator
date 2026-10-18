import { Handle, Position } from '@xyflow/react'
import { useState, type CSSProperties } from 'react'
import { SUPPLY_TEXT, supplyState } from '../components/registry'
import { PART_LAYOUTS, type Side } from '../components/parts/layout'
import PartArt from '../components/parts/PartArt'
import WokwiPart, { type Geometry } from '../components/parts/WokwiPart'
import { WOKWI, type PartRuntime } from '../components/parts/wokwi'
import type { ComponentDef } from '../components/types'
import { useSim } from '../sim/runner'
import { useEditor } from './store'

const SIDE: Record<Side, Position> = { top: Position.Top, bottom: Position.Bottom, left: Position.Left, right: Position.Right }
const PORT_TEXT: Record<string, string> = { number: 'angka', boolean: 'ya/tidak', power: 'daya', gnd: 'ground' }

const fmt = (v: unknown, unit = '') => (typeof v === 'number' ? `${v.toFixed(1)}${unit ? ` ${unit}` : ''}` : '—')
type Props = Record<string, number | string | boolean>

/** The edge a pin sits closest to, which is the way its wire should leave. */
function sideOf(x: number, y: number, w: number, h: number): Side {
  const d = { left: x, right: w - x, top: y, bottom: h - y }
  return (Object.entries(d).sort((a, b) => a[1] - b[1])[0]![0]) as Side
}

interface Anchor {
  port: string
  label: string
  x: number
  y: number
  side: Side
}

export default function PartCard({ id, def, props, selected }: { id: string; def: ComponentDef; props: Props; selected: boolean }) {
  const values = useSim((s) => s.values[id])
  const updateProp = useEditor((s) => s.updateProp)
  const wokwi = WOKWI[def.kind]
  const [geometry, setGeometry] = useState<Geometry | null>(null)

  // The reading on a sensor's main analog pin: the first numeric output.
  const main = def.outputs.find((o) => o.type === 'number')?.id ?? 'out'
  const out = values?.outputs[main]
  const lo = Math.min(Number(props.min), Number(props.max))
  const hi = Math.max(Number(props.min), Number(props.max))
  const manual = props.pattern === 'manual'
  const supply = supplyState(def.needs, values?.inputs ?? {})
  const powered = supply === 'ok' || !values

  // A PWM pin reports how much of the time it is high; a plain signal is all or nothing.
  const driveOf = (port: string) => (values?.inputs[port] === undefined ? 0 : (values.levels?.[port] ?? (values.inputs[port] === true ? 1 : 0)))
  const drive: Record<string, number> = {}
  for (const i of def.inputs) drive[i.id] = powered ? driveOf(i.id) : 0

  let level = drive.in ?? 0
  if (def.kind === 'rgb-led') level = Math.max(drive.r ?? 0, drive.g ?? 0, drive.b ?? 0)
  if (def.view === 'analog') level = typeof out === 'number' && hi > lo ? (out - lo) / (hi - lo) : 0.5
  let active = powered && level >= 0.5
  if (def.kind === 'pir-sensor') active = powered && out === true
  if (def.kind === 'button') active = props.pressed === true

  const runtime: PartRuntime = { level, powered, color: String(props.color ?? 'amber'), props, outputs: values?.outputs ?? {}, drive }

  // Where the wire handles go: on the Wokwi pins, or on the legs of our own drawing.
  let width: number
  let height: number
  let anchors: Anchor[]
  if (wokwi) {
    width = geometry?.width ?? 0
    height = geometry?.height ?? 0
    anchors = (geometry?.pins ?? []).flatMap((p) => {
      const port = wokwi.pins[p.name]
      return port ? [{ port, label: p.name, x: p.x, y: p.y, side: sideOf(p.x, p.y, width, height) }] : []
    })
  } else {
    const layout = PART_LAYOUTS[def.kind]!
    width = layout.width
    height = layout.height
    anchors = layout.pins.flatMap((p) => (p.port ? [{ port: p.port, label: p.label, x: p.x, y: p.y, side: p.side }] : []))
  }

  const stateClass = active && def.kind === 'led' ? 'led-on' : level >= 0.5 && def.kind === 'fan' ? 'fan-on' : active && def.kind === 'buzzer' ? 'buzzer-on' : undefined

  return (
    <div className={`part-node ${selected ? 'node-selected' : ''} ${wokwi?.interactive ? 'nodrag' : ''} ${stateClass ?? ''}`} style={{ width: width || undefined, minHeight: height || undefined }}>
      {wokwi ? (
        <WokwiPart kind={def.kind} runtime={runtime} onGeometry={setGeometry} onChange={(k, v) => updateProp(id, k, v)} />
      ) : (
        <PartArt kind={def.kind} state={{ level, active, color: runtime.color, aux: {} }} />
      )}
      {anchors.map((p) => {
        const outPort = def.outputs.find((o) => o.id === p.port)
        const port = outPort ?? def.inputs.find((i) => i.id === p.port)
        if (!port) return null
        const v = outPort ? values?.outputs[p.port] : values?.inputs[p.port]
        const style: CSSProperties = { left: p.x, top: p.y, right: 'auto', bottom: 'auto', transform: 'translate(-50%, -50%)' }
        return (
          <Handle
            key={p.port}
            id={p.port}
            type={outPort ? 'source' : 'target'}
            position={SIDE[p.side]}
            className={`pin pin-${outPort ? 'out' : 'in'} port-${port.type} ${v === true || (typeof v === 'number' && v !== 0 && port.type !== 'power') ? 'pin-on' : ''}`}
            style={style}
            title={`${def.label}: ${p.label} (${PORT_TEXT[port.type]})`}
          />
        )
      })}
      <div className="part-info" style={wokwi ? { marginTop: 10 } : undefined}>
        <span className="part-name">{def.label}</span>
        {!powered && <span className="part-warn">{SUPPLY_TEXT[supply]}</span>}
        {def.view === 'analog' && def.kind !== 'joystick' && (
          <>
            <span className="readout">{fmt(powered ? (out ?? (manual ? Number(props.value) : undefined)) : undefined, def.unit)}</span>
            {manual && !['pot', 'slide-pot'].includes(def.kind) && (
              <input
                type="range"
                className="slider nodrag nopan"
                aria-label={`Nilai ${def.label}`}
                min={lo}
                max={hi}
                step={(hi - lo) / 200 || 1}
                value={Number(props.value)}
                onChange={(e) => updateProp(id, 'value', Number(e.target.value))}
              />
            )}
          </>
        )}
        {def.kind === 'joystick' && (
          <span className="readout small">
            X {Number(props.x)} · Y {Number(props.y)}
          </span>
        )}
        {(def.kind === 'gas-sensor' || def.kind === 'flame-sensor' || def.kind === 'sound-sensor') && (
          <span className={`pill ${values?.outputs.do === true ? 'pill-on' : ''}`}>{values?.outputs.do === true ? 'Terdeteksi' : 'Aman'}</span>
        )}
        {def.kind === 'tilt-switch' && (
          <button type="button" className={`toggle nodrag ${props.tilted === true ? 'toggle-on' : ''}`} aria-pressed={props.tilted === true} onClick={() => updateProp(id, 'tilted', props.tilted !== true)}>
            {props.tilted === true ? 'Miring' : 'Tegak'}
          </button>
        )}
        {def.kind === 'pir-sensor' &&
          (manual ? (
            <button type="button" className={`toggle nodrag ${props.detected === true ? 'toggle-on' : ''}`} aria-pressed={props.detected === true} onClick={() => updateProp(id, 'detected', props.detected !== true)}>
              {props.detected === true ? 'Ada gerakan' : 'Tidak ada gerakan'}
            </button>
          ) : (
            <span className={`pill ${out === true ? 'pill-on' : ''}`}>{out === true ? 'Gerak' : 'Diam'}</span>
          ))}
      </div>
    </div>
  )
}
