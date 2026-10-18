/// <reference lib="webworker" />
import { EmuSession, type Command } from './session'
import { TICK_MS } from './link'

const session = new EmuSession(
  () => performance.now(),
  (snapshot) => postMessage(snapshot),
)

self.onmessage = (e: MessageEvent<Command>) => session.handle(e.data)
setInterval(() => session.tick(), TICK_MS)
