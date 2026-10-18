import { Handle, Position, type NodeProps } from '@xyflow/react'
import { memo, type CSSProperties } from 'react'
import BoardArt from '../components/boards/BoardArt'
import PartArt from '../components/parts/PartArt'
import { PART_LAYOUTS } from '../components/parts/layout'
import { getDef, SUPPLY_TEXT, supplyState } from '../components/registry'
import type { BoardPin, ComponentDef, PortDef } from '../components/types'
import { useSim } from '../sim/runner'
import ComponentIcon from '../ui/ComponentIcon'
import { useEditor, type IotNode } from './store'

const PORT_TEXT: Record<string, string> = { number: 'angka', boolean: 'ya/tidak', power: 'daya', gnd: 'ground' }

const portTop = (i: number, n: number) => `${((i + 1) / (n + 1)) * 100}%`

function fmt(v: unknown, unit = ''): string {
  if (typeof v === 'number') return `${v.toFixed(1)}${unit ? ` ${unit}` : ''}`
  if (typeof v === 'boolean') return v ? 'ON' : 'OFF'
  return '—'
}

function Ports({ ports, side }: { ports: PortDef[]; side: 'in' | 'out' }) {
  return (
    <>
      {ports.map((p, i) => (
        <span key={p.id}>
          <Handle
            id={p.id}
            type={side === 'in' ? 'target' : 'source'}
            position={side === 'in' ? Position.Left : Position.Right}
            className={`port port-${p.type}`}
            style={{ top: portTop(i, ports.length) }}
            title={`${p.label} (${PORT_TEXT[p.type]})`}
          />
          {/* Only label ports when a node has several; a single port is obvious and the label would cover the card. */}
          {ports.length > 1 && (
            <span className={`port-label port-label-${side}`} style={{ top: portTop(i, ports.length) }}>
              {p.label}
            </span>
          )}
        </span>
      ))}
    </>
  )
}

function Chart({ data }: { data: number[] }) {
  if (data.length < 2) return <div className="chart chart-empty">Tekan Run</div>
  const lo = Math.min(...data)
  const hi = Math.max(...data)
  const span = hi - lo || 1
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * 156 + 2},${46 - ((v - lo) / span) * 40}`)
    .join(' ')
  return (
    <svg className="chart" viewBox="0 0 160 50" role="img" aria-label="Grafik riwayat nilai">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <text x="2" y="8" className="chart-label">{hi.toFixed(1)}</text>
      <text x="2" y="48" className="chart-label">{lo.toFixed(1)}</text>
    </svg>
  )
}

function Body({ id, def, props }: { id: string; def: ComponentDef; props: Record<string, number | string | boolean> }) {
  const values = useSim((s) => s.values[id])
  const updateProp = useEditor((s) => s.updateProp)
  const input = values?.inputs.in
  const out = values?.outputs.out

  switch (def.view) {
    case 'board':
      return null
    case 'digital': {
      const detail = def.kind === 'compare' ? `${String(props.op)} ${String(props.threshold)}` : ''
      return (
        <div className="readout">
          <span className={`pill ${out === true ? 'pill-on' : ''}`}>{fmt(out)}</span>
          {detail && <span className="detail">{detail}</span>}
        </div>
      )
    }
    case 'gauge': {
      const min = Number(props.min)
      const max = Number(props.max)
      const v = typeof input === 'number' ? input : undefined
      const pct = v === undefined || max === min ? 0 : Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))
      return (
        <div>
          <div className="readout">{fmt(v, String(props.unit))}</div>
          <div className="bar"><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
        </div>
      )
    }
    case 'chart':
      return <Chart data={values?.history ?? []} />
    default:
      return null
  }
}


const SIDE: Record<BoardPin['side'], Position> = {
  top: Position.Top,
  bottom: Position.Bottom,
  left: Position.Left,
  right: Position.Right,
}

const ROLE_TEXT: Record<string, string> = {
  power: 'daya',
  gnd: 'ground',
  'in-num': 'masukan angka',
  'in-bool': 'masukan ya/tidak',
  out: 'keluaran',
}

/** A microcontroller: the real board artwork with a wire handle sitting on each usable pin. */
function BoardCard({ id, def, selected }: { id: string; def: ComponentDef; selected: boolean }) {
  const values = useSim((s) => s.values[id])
  const running = useSim((s) => s.status === 'running')
  const board = def.board!

  return (
    <div className={`board-node ${selected ? 'node-selected' : ''}`} style={{ width: board.width, height: board.height }}>
      <BoardArt kind={def.kind} running={running} outputs={values?.outputs} />
      {board.pins
        .filter((p) => p.role === 'in-num' || p.role === 'in-bool' || p.role === 'out' || p.role === 'power' || p.role === 'gnd')
        .map((p) => {
          const isOut = p.role === 'out' || p.role === 'power' || p.role === 'gnd'
          const v = isOut ? values?.outputs[p.id] : values?.inputs[p.id]
          const on = v === true || typeof v === 'number'
          // React Flow positions handles with CSS per side; pin the centre explicitly instead.
          const style: CSSProperties = { left: p.x, top: p.y, right: 'auto', bottom: 'auto', transform: 'translate(-50%, -50%)' }
          return (
            <Handle
              key={p.id}
              id={p.id}
              type={isOut ? 'source' : 'target'}
              position={SIDE[p.side]}
              className={`pin pin-${isOut ? 'out' : 'in'} port-${p.role === 'in-num' ? 'number' : p.role === 'power' ? 'power' : p.role === 'gnd' ? 'gnd' : 'boolean'} ${on && p.role !== 'power' && p.role !== 'gnd' ? 'pin-on' : ''}`}
              style={style}
              title={`${p.id}: ${ROLE_TEXT[p.role]}${v === undefined ? '' : ` = ${typeof v === 'number' ? v.toFixed(1) : v ? 'ON' : 'OFF'}`}`}
            />
          )
        })}
    </div>
  )
}


/** A sensor or actuator drawn as the real part, with a wire handle on the end of each usable leg. */
function PartCard({ id, def, props, selected }: { id: string; def: ComponentDef; props: Record<string, number | string | boolean>; selected: boolean }) {
  const layout = PART_LAYOUTS[def.kind]!
  const values = useSim((s) => s.values[id])
  const updateProp = useEditor((s) => s.updateProp)

  const out = values?.outputs.out
  const input = values?.inputs.in
  // A PWM pin reports how much of the time it is high; a plain signal is simply all or nothing.
  const driven = values?.inputs.in === undefined ? 0 : (values.levels?.in ?? (input === true ? 1 : 0))
  const lo = Math.min(Number(props.min), Number(props.max))
  const hi = Math.max(Number(props.min), Number(props.max))
  const manual = props.pattern === 'manual'
  // Without a supply the part does nothing, like the real one.
  const supply = supplyState(def.needs, values?.inputs ?? {})
  const powered = supply === 'ok' || !values

  let level = powered ? driven : 0
  let active = powered && driven >= 0.5
  if (def.view === 'analog') level = typeof out === 'number' && hi > lo ? (out - lo) / (hi - lo) : 0.5
  if (def.kind === 'pir-sensor') active = powered && out === true
  if (def.kind === 'button') active = props.pressed === true

  return (
    <div className={`part-node ${selected ? 'node-selected' : ''}`} style={{ width: layout.width }}>
      <div className={active && def.kind === 'led' ? 'led-on' : active && def.kind === 'fan' ? 'fan-on' : active && def.kind === 'buzzer' ? 'buzzer-on' : undefined}>
        <PartArt kind={def.kind} state={{ level, active, color: String(props.color ?? 'amber') }} />
      </div>
      {layout.pins
        .filter((p) => p.port)
        .map((p) => {
          const outPort = def.outputs.find((o) => o.id === p.port)
          const port = outPort ?? def.inputs.find((i) => i.id === p.port)
          if (!port) return null
          const v = outPort ? values?.outputs[p.port!] : values?.inputs[p.port!]
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
      <div className="part-info">
        <span className="part-name">{def.label}</span>
        {!powered && <span className="part-warn">{SUPPLY_TEXT[supply]}</span>}
        {def.view === 'analog' && (
          <>
            <span className="readout">{fmt(powered ? (out ?? (manual ? Number(props.value) : undefined)) : undefined, def.unit)}</span>
            {manual && (
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
        {def.kind === 'pir-sensor' &&
          (manual ? (
            <button type="button" className={`toggle nodrag ${props.detected === true ? 'toggle-on' : ''}`} aria-pressed={props.detected === true} onClick={() => updateProp(id, 'detected', props.detected !== true)}>
              {props.detected === true ? 'Ada gerakan' : 'Tidak ada gerakan'}
            </button>
          ) : (
            <span className={`pill ${out === true ? 'pill-on' : ''}`}>{out === true ? 'Gerak' : 'Diam'}</span>
          ))}
        {def.kind === 'button' && (
          <button type="button" className={`toggle nodrag ${props.pressed === true ? 'toggle-on' : ''}`} aria-pressed={props.pressed === true} onClick={() => updateProp(id, 'pressed', props.pressed !== true)}>
            {props.pressed === true ? 'Ditekan' : 'Lepas'}
          </button>
        )}
      </div>
    </div>
  )
}

function NodeCard({ id, data, selected }: NodeProps<IotNode>) {
  const def = getDef(data.kind)
  if (!def) return <div className="node node-unknown">Komponen tidak dikenal: {data.kind}</div>
  if (def.view === 'board' && def.board) return <BoardCard id={id} def={def} selected={selected} />
  if (PART_LAYOUTS[def.kind]) return <PartCard id={id} def={def} props={data.props} selected={selected} />

  const rows = Math.max(def.inputs.length, def.outputs.length)
  return (
    <div className={`node cat-${def.category} ${selected ? 'node-selected' : ''}`} style={{ minHeight: 56 + rows * 14 }}>
      <Ports ports={def.inputs} side="in" />
      <div className="node-head">
        <ComponentIcon kind={def.kind} size={15} className="node-icon" />
        <span>{def.label}</span>
      </div>
      <div className={`node-body ${def.inputs.length > 1 ? 'pad-in' : ''}`}>
        <Body id={id} def={def} props={data.props} />
      </div>
      <Ports ports={def.outputs} side="out" />
    </div>
  )
}

export default memo(NodeCard)
