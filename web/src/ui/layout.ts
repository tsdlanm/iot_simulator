import { create } from 'zustand'

const KEY = 'iot-designer:ui:v2'

export type Tool = 'select' | 'pan'
export type Side = 'left' | 'right'
export type RightTab = 'props' | 'code'

export const WIDTH = {
  left: { min: 200, max: 420, default: 252 },
  right: { min: 280, max: 860, default: 340 },
} as const

/** Smallest canvas we allow when a sidebar is dragged wider. */
const MIN_CANVAS = 360

/** Keeps a sidebar width inside its own limits and leaves room for the canvas. */
export function clampWidth(side: Side, width: number, viewport: number): number {
  const { min, max } = WIDTH[side]
  const room = Math.max(min, viewport - MIN_CANVAS)
  return Math.round(Math.min(Math.min(max, room), Math.max(min, width)))
}

interface LayoutState {
  leftOpen: boolean
  rightOpen: boolean
  leftWidth: number
  rightWidth: number
  /** select: drag on empty canvas draws a selection box. pan: drag moves the canvas. */
  tool: Tool
  /** Which tab the right sidebar shows, and which board the Code tab edits when none is selected. */
  rightTab: RightTab
  codeTarget: string | null
  setRightTab: (tab: RightTab) => void
  /** Opens the Code tab, optionally on a given board. */
  showCode: (nodeId?: string) => void
  toggleLeft: () => void
  toggleRight: () => void
  setWidth: (side: Side, width: number) => void
  resetWidth: (side: Side) => void
  setTool: (tool: Tool) => void
}

type Persisted = Pick<LayoutState, 'leftOpen' | 'rightOpen' | 'leftWidth' | 'rightWidth'>

function stored(): Persisted {
  const fallback: Persisted = { leftOpen: true, rightOpen: true, leftWidth: WIDTH.left.default, rightWidth: WIDTH.right.default }
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    const width = (side: Side, v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? clampWidth(side, v, window.innerWidth) : WIDTH[side].default)
    return {
      leftOpen: raw.leftOpen !== false,
      rightOpen: raw.rightOpen !== false,
      leftWidth: width('left', raw.leftWidth),
      rightWidth: width('right', raw.rightWidth),
    }
  } catch {
    return fallback
  }
}

export const useLayout = create<LayoutState>((set) => ({
  ...stored(),
  tool: 'select',
  rightTab: 'props',
  codeTarget: null,
  setRightTab: (rightTab) => set({ rightTab }),
  showCode: (nodeId) => set((s) => ({ rightOpen: true, rightTab: 'code', codeTarget: nodeId ?? s.codeTarget })),
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
  setWidth: (side, width) =>
    set(side === 'left' ? { leftWidth: clampWidth('left', width, window.innerWidth) } : { rightWidth: clampWidth('right', width, window.innerWidth) }),
  resetWidth: (side) => set(side === 'left' ? { leftWidth: WIDTH.left.default } : { rightWidth: WIDTH.right.default }),
  setTool: (tool) => set({ tool }),
}))

// Remember sidebar state and widths. The tool is deliberately not remembered.
useLayout.subscribe((s, prev) => {
  if (s.leftOpen === prev.leftOpen && s.rightOpen === prev.rightOpen && s.leftWidth === prev.leftWidth && s.rightWidth === prev.rightWidth) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ leftOpen: s.leftOpen, rightOpen: s.rightOpen, leftWidth: s.leftWidth, rightWidth: s.rightWidth }))
  } catch {
    // Storage can be unavailable; the layout still works for this session.
  }
})
