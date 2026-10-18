import { BaseEdge, EdgeLabelRenderer, getBezierPath, Position, useReactFlow, type EdgeProps } from '@xyflow/react'
import { memo, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { getDef } from '../components/registry'
import Icon from '../ui/Icon'
import { useEditor, type WireEdge as WireEdgeType } from './store'
import {
  alignToNeighbors,
  anchorsOf,
  insertPoint,
  midpoints,
  movePoint,
  removePointAt,
  roundedPath,
  routeOf,
  WIRE_COLORS,
  type Pt,
  type Side,
} from './wire'

const SIDE: Record<Position, Side> = {
  [Position.Left]: 'left',
  [Position.Right]: 'right',
  [Position.Top]: 'top',
  [Position.Bottom]: 'bottom',
}

/** A cable: thick, coloured by what it carries, and bendable through points the user drags around. */
function Wire({
  id,
  source,
  sourceHandleId,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps<WireEdgeType>) {
  const { screenToFlowPosition } = useReactFlow()
  const sourceKind = useEditor((s) => s.nodes.find((n) => n.id === source)?.data.kind)
  const signal = sourceKind ? getDef(sourceKind)?.outputs.find((p) => p.id === sourceHandleId)?.type : undefined

  const points = data?.points ?? []
  const from: Pt = { x: sourceX, y: sourceY }
  const to: Pt = { x: targetX, y: targetY }
  const bent = points.length > 0

  let path: string
  if (bent) {
    path = roundedPath(routeOf(from, SIDE[sourcePosition], points, to, SIDE[targetPosition]))
  } else {
    path = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, curvature: 0.32 })[0]
  }
  // The toolbar floats above the whole wire so it never covers a bend handle being dragged.
  const xs = [from, ...points, to].map((p) => p.x)
  const ys = [from, ...points, to].map((p) => p.y)
  const bar: Pt = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.min(...ys) }

  const style = data?.color ? ({ '--wire': data.color } as CSSProperties) : undefined
  const anchors = anchorsOf(from, points, to)

  /** Drags the point at `index`. Pointer capture keeps the drag going even when the cursor outruns the handle. */
  const drag = (e: ReactPointerEvent<SVGElement>, index: number, start: Pt[]) => {
    e.stopPropagation()
    e.preventDefault()
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    const store = useEditor.getState()
    store.beginWireEdit()
    store.setWire(id, { points: start })

    let current = start
    const move = (ev: PointerEvent) => {
      const p = screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
      // Hold Alt to place the point exactly where the cursor is.
      const placed = ev.altKey ? p : alignToNeighbors(anchorsOf(from, current, to), index + 1, p)
      current = movePoint(current, index, placed)
      useEditor.getState().setWire(id, { points: current })
    }
    const stop = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', stop)
      handle.removeEventListener('pointercancel', stop)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', stop)
    handle.addEventListener('pointercancel', stop)
  }

  return (
    <g className="wire" data-signal={signal} data-auto={data?.color ? 'false' : 'true'} style={style}>
      {selected && <path className="wire-halo" d={path} />}
      <path className="wire-casing" d={path} />
      <path className="wire-core" d={path} />
      <path className="wire-flow" d={path} />
      {/* A wide invisible copy makes the thin line easy to click and double-click. */}
      <BaseEdge path={path} className="wire-hit" interactionWidth={22} style={{ stroke: 'transparent', strokeWidth: 0 }} />

      {selected && (
        <>
          {midpoints(anchors).map((m, i) => (
            <circle
              key={`ghost-${i}`}
              className="wire-ghost nopan nodrag"
              cx={m.x}
              cy={m.y}
              r={4.5}
              onPointerDown={(e) => {
                const next = insertPoint(points, i, m)
                if (next !== points) drag(e, i, next)
              }}
            >
              <title>Seret untuk membelokkan kabel</title>
            </circle>
          ))}
          {points.map((p, i) => (
            <circle
              key={`point-${i}`}
              className="wire-handle nopan nodrag"
              cx={p.x}
              cy={p.y}
              r={6}
              onPointerDown={(e) => drag(e, i, points)}
              onDoubleClick={(e) => {
                e.stopPropagation()
                useEditor.getState().beginWireEdit()
                useEditor.getState().setWire(id, { points: removePointAt(points, i) })
              }}
            >
              <title>Seret untuk memindahkan. Klik dua kali untuk menghapus titik.</title>
            </circle>
          ))}
        </>
      )}

      {selected && (
        <EdgeLabelRenderer>
          <div
            className="wire-bar nodrag nopan"
            style={{ transform: `translate(-50%, calc(-100% - 22px)) translate(${bar.x}px, ${bar.y}px)` }}
            role="toolbar"
            aria-label="Pengaturan kabel"
          >
            <button
              type="button"
              className={`swatch swatch-auto ${data?.color ? '' : 'on'}`}
              title="Warna otomatis"
              aria-label="Warna otomatis"
              aria-pressed={!data?.color}
              onClick={() => {
                useEditor.getState().beginWireEdit()
                useEditor.getState().setWire(id, { color: undefined })
              }}
            />
            {WIRE_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`swatch ${data?.color === c.value ? 'on' : ''}`}
                style={{ background: c.value }}
                title={c.label}
                aria-label={c.label}
                aria-pressed={data?.color === c.value}
                onClick={() => {
                  useEditor.getState().beginWireEdit()
                  useEditor.getState().setWire(id, { color: c.value })
                }}
              />
            ))}
            <span className="sep" aria-hidden="true" />
            {bent && (
              <button
                type="button"
                className="tool"
                title="Kembalikan bentuk kabel"
                aria-label="Kembalikan bentuk kabel"
                onClick={() => {
                  useEditor.getState().beginWireEdit()
                  useEditor.getState().setWire(id, { points: [] })
                }}
              >
                <Icon name="reset" size={14} />
              </button>
            )}
            <button type="button" className="tool danger" title="Hapus kabel" aria-label="Hapus kabel" onClick={() => useEditor.getState().removeWire(id)}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  )
}

export default memo(Wire)
