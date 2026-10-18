import {
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  useStore,
  type Edge,
  type FinalConnectionState,
  type NodeTypes,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, type DragEvent } from 'react'
import { getDef } from '../components/registry'
import { useSim } from '../sim/runner'
import Icon from '../ui/Icon'
import { useLayout } from '../ui/layout'
import { useTheme } from '../ui/theme'
import { toast } from '../ui/toast'
import NodeCard from './NodeCard'
import { DRAG_MIME } from './Palette'
import { connectionProblem, useEditor, type IotNode } from './store'
import { clampZoom, easeZoom, flowPointAt, MAX_ZOOM, MIN_ZOOM, sliderToZoom, viewportAround, wheelZoomFactor, zoomToSlider } from './zoom'

const nodeTypes: NodeTypes = { iot: NodeCard }

const nodeColor = (n: IotNode) => `var(--cat-${getDef(n.data.kind)?.category ?? 'sensor'})`

/** Wheel = zoom toward the cursor, eased over a few frames. Shift + wheel pans sideways. */
function useSmoothWheelZoom(host: React.RefObject<HTMLDivElement | null>) {
  const rf = useReactFlow()

  useEffect(() => {
    const el = host.current
    if (!el) return
    let raf = 0
    let target: number | null = null
    let anchor = { sx: 0, sy: 0, px: 0, py: 0 }

    const frame = () => {
      raf = 0
      if (target === null) return
      const z = easeZoom(rf.getViewport().zoom, target)
      rf.setViewport(viewportAround({ x: anchor.px, y: anchor.py }, anchor.sx, anchor.sy, z))
      if (z === target) target = null
      else raf = requestAnimationFrame(frame)
    }

    const onWheel = (e: WheelEvent) => {
      // Let overlays that scroll or zoom on their own (minimap, dock) keep their behaviour.
      if ((e.target as Element | null)?.closest('.react-flow__minimap, .dock, .nowheel')) return
      e.preventDefault()
      const vp = rf.getViewport()

      if (e.shiftKey) {
        rf.setViewport({ x: vp.x - (e.deltaX || e.deltaY), y: vp.y, zoom: vp.zoom })
        return
      }

      const rect = el.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      target = clampZoom((target ?? vp.zoom) * wheelZoomFactor(e))
      const p = flowPointAt(vp, sx, sy)
      anchor = { sx, sy, px: p.x, py: p.y }
      if (!raf) raf = requestAnimationFrame(frame)
    }

    // If the user grabs the canvas mid-zoom, stop animating so we do not fight their drag.
    const stop = () => {
      target = null
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', stop)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', stop)
      cancelAnimationFrame(raf)
    }
  }, [host, rf])
}

/** Tools and zoom in one small floating bar. */
function Dock() {
  const rf = useReactFlow()
  const zoom = useStore((s) => s.transform[2])
  const width = useStore((s) => s.width)
  const height = useStore((s) => s.height)
  const tool = useLayout((s) => s.tool)
  const setTool = useLayout((s) => s.setTool)

  const zoomTo = (z: number) => {
    const vp = rf.getViewport()
    const p = flowPointAt(vp, width / 2, height / 2)
    rf.setViewport(viewportAround(p, width / 2, height / 2, clampZoom(z)))
  }

  return (
    <Panel position="bottom-center" className="dock">
      <div className="seg" role="group" aria-label="Alat">
        <button type="button" className={tool === 'select' ? 'on' : ''} aria-pressed={tool === 'select'} title="Pilih (V): seret area kosong untuk memilih banyak" aria-label="Alat pilih" onClick={() => setTool('select')}>
          <Icon name="pointer" size={16} />
        </button>
        <button type="button" className={tool === 'pan' ? 'on' : ''} aria-pressed={tool === 'pan'} title="Tangan (H): seret untuk menggeser kanvas" aria-label="Alat tangan" onClick={() => setTool('pan')}>
          <Icon name="hand" size={16} />
        </button>
      </div>
      <span className="sep" aria-hidden="true" />
      <button type="button" className="dock-btn" title="Perkecil" aria-label="Perkecil" onClick={() => zoomTo(zoom / 1.25)}>
        <Icon name="minus" size={15} />
      </button>
      <input
        className="zoom-slider"
        type="range"
        min={0}
        max={1000}
        step={1}
        value={Math.round(zoomToSlider(zoom) * 1000)}
        aria-label="Zoom"
        aria-valuetext={`${Math.round(zoom * 100)} persen`}
        onChange={(e) => zoomTo(sliderToZoom(Number(e.target.value) / 1000))}
      />
      <button type="button" className="dock-btn" title="Perbesar" aria-label="Perbesar" onClick={() => zoomTo(zoom * 1.25)}>
        <Icon name="plus" size={15} />
      </button>
      <button type="button" className="zoom-value" title="Kembali ke 100%" onClick={() => zoomTo(1)}>
        {Math.round(zoom * 100)}%
      </button>
      <span className="sep" aria-hidden="true" />
      <button type="button" className="dock-btn" title="Tampilkan semua" aria-label="Tampilkan semua" onClick={() => void rf.fitView({ padding: 0.2, maxZoom: 1, minZoom: MIN_ZOOM, duration: 300 })}>
        <Icon name="fit" size={15} />
      </button>
    </Panel>
  )
}

function SelectionBar() {
  const count = useEditor((s) => s.nodes.filter((n) => n.selected).length)
  const duplicate = useEditor((s) => s.duplicateSelected)
  const remove = useEditor((s) => s.removeSelected)
  if (count < 2) return null
  return (
    <Panel position="top-center" className="selbar" role="toolbar" aria-label="Aksi untuk pilihan">
      <span>{count} dipilih</span>
      <button type="button" onClick={duplicate}>
        <Icon name="copy" size={14} /> Duplikat
      </button>
      <button type="button" className="danger" onClick={remove}>
        <Icon name="trash" size={14} /> Hapus
      </button>
    </Panel>
  )
}

export default function Canvas() {
  const nodes = useEditor((s) => s.nodes)
  const edges = useEditor((s) => s.edges)
  const onNodesChange = useEditor((s) => s.onNodesChange)
  const onEdgesChange = useEditor((s) => s.onEdgesChange)
  const onConnect = useEditor((s) => s.onConnect)
  const isValidConnection = useEditor((s) => s.isValidConnection)
  const beginDrag = useEditor((s) => s.beginDrag)
  const addNode = useEditor((s) => s.addNode)
  const values = useSim((s) => s.values)
  const status = useSim((s) => s.status)
  const tool = useLayout((s) => s.tool)
  const theme = useTheme((s) => s.theme)
  const { screenToFlowPosition } = useReactFlow()
  const host = useRef<HTMLDivElement>(null)

  useSmoothWheelZoom(host)

  // While running, colour each wire by the value it carries.
  const styledEdges = useMemo<Edge[]>(() => {
    if (status === 'stopped') return edges
    return edges.map((e) => {
      const v = values[e.source]?.outputs[e.sourceHandle ?? '']
      const live = v === true || (typeof v === 'number' && v !== 0)
      return { ...e, animated: live, className: live ? 'wire-live' : 'wire-idle' }
    })
  }, [edges, values, status])

  // Dropping a wire on an unsuitable pin used to do nothing; say why instead.
  const onConnectEnd = useCallback((_: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    const { fromHandle: from, toHandle: to } = state
    if (state.isValid !== false || !from || !to || !from.id || !to.id) return
    if (from.type === to.type) {
      toast.error('Sambungkan dari titik keluaran ke titik masukan')
      return
    }
    const wire =
      from.type === 'source'
        ? { source: from.nodeId, sourceHandle: from.id, target: to.nodeId, targetHandle: to.id }
        : { source: to.nodeId, sourceHandle: to.id, target: from.nodeId, targetHandle: from.id }
    const problem = connectionProblem(wire)
    if (problem) toast.error(problem)
  }, [])

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const onDrop = (e: DragEvent) => {
    const kind = e.dataTransfer.getData(DRAG_MIME)
    if (!kind) return
    e.preventDefault()
    addNode(kind, screenToFlowPosition({ x: e.clientX, y: e.clientY }))
  }

  return (
    <div ref={host} className={`canvas tool-${tool}`} onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        onNodeDragStart={beginDrag}
        colorMode={theme}
        fitView
        fitViewOptions={{ maxZoom: 1, minZoom: MIN_ZOOM, padding: 0.2 }}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        // Zoom is handled by useSmoothWheelZoom; dragging either pans or draws a selection box.
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        panOnScroll={false}
        panOnDrag={tool === 'pan' ? true : [1, 2]}
        selectionOnDrag={tool === 'select'}
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        panActivationKeyCode="Space"
        deleteKeyCode={['Backspace', 'Delete']}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
        <MiniMap pannable zoomable nodeColor={nodeColor} nodeStrokeWidth={0} />
        <Panel position="top-left" className="stats">
          {nodes.length} komponen · {edges.length} kabel
        </Panel>
        <SelectionBar />
        <Dock />
      </ReactFlow>
      {nodes.length === 0 && (
        <div className="empty">
          <p>Kanvas kosong.</p>
          <p>Seret komponen dari kiri, lalu tarik garis dari titik keluaran ke titik masukan.</p>
        </div>
      )}
    </div>
  )
}
