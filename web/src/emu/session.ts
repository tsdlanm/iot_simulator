import { CLOCK_HZ, UnoMachine, type Duty } from './uno'

export type Command =
  | { type: 'load'; hex: string }
  | { type: 'inputs'; digital: Record<number, boolean>; analog: Record<number, number> }
  | { type: 'speed'; value: number }
  | { type: 'run' }
  | { type: 'pause' }
  | { type: 'reset' }

export interface Snapshot {
  /** Fraction of time each output pin (8 to 13) was high since the previous snapshot. */
  duty: Duty
  /** New Serial output since the previous snapshot. */
  serial: string
  cycles: number
  /** Set when the firmware could not be loaded or the emulator stopped. */
  error?: string
}

/** If the page was stalled, run at most this much real time at once so the emulator never spirals. */
export const MAX_CATCH_UP_MS = 100

/**
 * Drives a machine in real time: every tick it runs as many cycles as the wall clock allows (times the speed).
 * It has no timers of its own, so tests can step a fake clock; a worker or in-page host calls tick() on an interval.
 */
export class EmuSession {
  private readonly machine = new UnoMachine()
  private running = false
  private speed = 1
  private last = 0
  private loaded = false

  constructor(
    private readonly now: () => number,
    private readonly emit: (snapshot: Snapshot) => void,
  ) {}

  handle(command: Command) {
    switch (command.type) {
      case 'load':
        try {
          this.machine.load(command.hex)
          this.loaded = true
        } catch (err) {
          this.loaded = false
          this.running = false
          this.emit({ duty: {}, serial: '', cycles: 0, error: err instanceof Error ? err.message : 'Firmware tidak bisa dimuat' })
        }
        return
      case 'inputs':
        for (const [pin, active] of Object.entries(command.digital)) this.machine.setDigital(Number(pin), active)
        for (const [ch, volts] of Object.entries(command.analog)) this.machine.setAnalog(Number(ch), volts)
        return
      case 'speed':
        this.speed = Math.min(20, Math.max(0.1, command.value))
        return
      case 'run':
        if (!this.loaded) return
        this.running = true
        this.last = this.now()
        return
      case 'pause':
        this.running = false
        return
      case 'reset':
        if (this.loaded) this.machine.reset()
        this.last = this.now()
        return
    }
  }

  tick() {
    if (!this.running) return
    const t = this.now()
    const elapsed = Math.min(MAX_CATCH_UP_MS, Math.max(0, t - this.last))
    this.last = t
    try {
      this.machine.run(Math.round((elapsed / 1000) * CLOCK_HZ * this.speed))
    } catch (err) {
      this.running = false
      this.emit({ duty: {}, serial: '', cycles: this.machine.cycles, error: err instanceof Error ? err.message : 'Emulator berhenti' })
      return
    }
    this.emit({ duty: this.machine.takeOutputs(), serial: this.machine.takeSerial(), cycles: this.machine.cycles })
  }
}
