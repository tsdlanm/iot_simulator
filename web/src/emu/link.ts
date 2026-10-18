import { EmuSession, type Command, type Snapshot } from './session'

/** A connection to one running emulator, wherever it lives. */
export interface EmuLink {
  send(command: Command): void
  onSnapshot(listener: (snapshot: Snapshot) => void): void
  dispose(): void
}

export const TICK_MS = 25

/** Runs the emulator inside the page. Used where Web Workers are missing, and by tests of the layers above. */
export function createInlineLink(now: () => number = () => performance.now()): EmuLink {
  let listener: (s: Snapshot) => void = () => {}
  const session = new EmuSession(now, (s) => listener(s))
  const timer = setInterval(() => session.tick(), TICK_MS)
  return {
    send: (c) => session.handle(c),
    onSnapshot: (l) => (listener = l),
    dispose: () => clearInterval(timer),
  }
}

/** Runs the emulator in a Web Worker so heavy sketches never freeze the editor. */
export function createWorkerLink(): EmuLink {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  let listener: (s: Snapshot) => void = () => {}
  worker.onmessage = (e: MessageEvent<Snapshot>) => listener(e.data)
  return {
    send: (c) => worker.postMessage(c),
    onSnapshot: (l) => (listener = l),
    dispose: () => worker.terminate(),
  }
}

export function createLink(): EmuLink {
  if (typeof Worker === 'undefined') return createInlineLink()
  try {
    return createWorkerLink()
  } catch {
    return createInlineLink()
  }
}
