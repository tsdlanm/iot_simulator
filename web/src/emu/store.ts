import { create } from 'zustand'
import type { CompileSize, Diagnostic } from './compileClient'

export type Phase = 'idle' | 'compiling' | 'ready' | 'error'

export interface BoardRun {
  phase: Phase
  diagnostics: Diagnostic[]
  /** Set for problems that are not tied to a line, such as the server being down. */
  message?: string
  size?: CompileSize
  /** The sketch that is actually loaded in the emulator, to tell the user when the editor has moved on. */
  compiledCode?: string
  serial: string
}

const EMPTY: BoardRun = { phase: 'idle', diagnostics: [], serial: '' }

/** Keeps the serial monitor from growing without bound. */
export const MAX_SERIAL_CHARS = 20_000

interface EmuState {
  boards: Record<string, BoardRun>
  patch: (id: string, change: Partial<BoardRun>) => void
  appendSerial: (id: string, text: string) => void
  clearSerial: (id: string) => void
  /** Forget a board's run (reset or removal) but keep nothing stale. */
  forget: (id?: string) => void
}

export const useEmu = create<EmuState>((set) => ({
  boards: {},
  patch: (id, change) => set((s) => ({ boards: { ...s.boards, [id]: { ...(s.boards[id] ?? EMPTY), ...change } } })),
  appendSerial: (id, text) =>
    set((s) => {
      const cur = s.boards[id] ?? EMPTY
      return { boards: { ...s.boards, [id]: { ...cur, serial: (cur.serial + text).slice(-MAX_SERIAL_CHARS) } } }
    }),
  clearSerial: (id) => set((s) => (s.boards[id] ? { boards: { ...s.boards, [id]: { ...s.boards[id], serial: '' } } } : s)),
  forget: (id) =>
    set((s) => {
      if (id === undefined) return { boards: {} }
      const { [id]: _gone, ...rest } = s.boards
      return { boards: rest }
    }),
}))

export const runOf = (boards: Record<string, BoardRun>, id: string | undefined): BoardRun => (id && boards[id]) || EMPTY
