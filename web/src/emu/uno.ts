import {
  AVRADC,
  AVRIOPort,
  AVRTimer,
  AVRUSART,
  CPU,
  PinState,
  adcConfig,
  avrInstruction,
  portBConfig,
  portCConfig,
  portDConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  usart0Config,
} from 'avr8js'
import { parseHex } from './hex'

export const CLOCK_HZ = 16_000_000
export const FLASH_BYTES = 32 * 1024

/** Digital pins the board exposes as outputs (D8..D13, port B) and inputs (D2..D7, port D). */
export const OUTPUT_PINS = [8, 9, 10, 11, 12, 13] as const
export const INPUT_PINS = [2, 3, 4, 5, 6, 7] as const
export const ANALOG_PINS = 6

/** Work is done in short slices so input changes (such as a pull-up being switched on) are seen quickly. */
const SLICE_CYCLES = 8000

/** Serial output beyond this is dropped, so a sketch that prints in a tight loop cannot grow memory forever. */
const MAX_SERIAL_BUFFER = 64 * 1024

export type Duty = Record<number, number>

/**
 * An Arduino Uno (ATmega328P at 16 MHz) running a compiled sketch.
 * Pure: it knows nothing about time, workers or React; callers decide how many cycles to run.
 */
export class UnoMachine {
  private cpu!: CPU
  private portB!: AVRIOPort
  private portC!: AVRIOPort
  private portD!: AVRIOPort
  private adc!: AVRADC
  private serial = ''
  private serialDropped = 0
  private program: Uint8Array = new Uint8Array(FLASH_BYTES).fill(0xff)

  /** What the outside world says each digital input pin is doing (true = active/pressed). */
  private readonly active = new Map<number, boolean>()
  /** Pin states already applied, so unchanged pins are not rewritten every slice. */
  private applied = new Map<number, boolean>()

  // Duty-cycle bookkeeping for the output pins, in CPU cycles since the last takeOutputs().
  private high = new Map<number, number>()
  private level = new Map<number, boolean>()
  private since = new Map<number, number>()
  private windowStart = 0

  constructor() {
    this.build()
  }

  get cycles() {
    return this.cpu.cycles
  }

  /** Replaces the program with compiled HEX and restarts the board. */
  load(hex: string) {
    this.program = parseHex(hex, FLASH_BYTES)
    this.reset()
  }

  /** Power-cycles the board. Input levels and analog voltages set from outside are kept. */
  reset() {
    const volts = this.adc ? Array.from({ length: ANALOG_PINS }, (_, i) => Number(this.adc.channelValues[i]) || 0) : []
    this.build()
    volts.forEach((v, i) => (this.adc.channelValues[i] = v))
    this.serial = ''
    this.serialDropped = 0
    this.applied = new Map()
    this.applyInputs()
  }

  private build() {
    const cpu = new CPU(new Uint16Array(FLASH_BYTES / 2))
    new Uint8Array(cpu.progMem.buffer).set(this.program)
    this.cpu = cpu
    new AVRTimer(cpu, timer0Config)
    new AVRTimer(cpu, timer1Config)
    new AVRTimer(cpu, timer2Config)
    this.portB = new AVRIOPort(cpu, portBConfig)
    this.portC = new AVRIOPort(cpu, portCConfig)
    this.portD = new AVRIOPort(cpu, portDConfig)
    this.adc = new AVRADC(cpu, adcConfig)
    const usart = new AVRUSART(cpu, usart0Config, CLOCK_HZ)
    usart.onByteTransmit = (byte) => {
      if (this.serial.length >= MAX_SERIAL_BUFFER) this.serialDropped++
      else this.serial += String.fromCharCode(byte)
    }

    this.high = new Map()
    this.level = new Map()
    this.since = new Map()
    this.windowStart = 0
    for (const pin of OUTPUT_PINS) {
      this.level.set(pin, false)
      this.since.set(pin, 0)
      this.high.set(pin, 0)
    }
    this.portB.addListener(() => this.sampleOutputs())
  }

  /** Records how long each output pin has been high, using the exact cycle of every change. */
  private sampleOutputs() {
    const now = this.cpu.cycles
    for (const pin of OUTPUT_PINS) {
      const isHigh = this.portB.pinState(pin - 8) === PinState.High
      if (isHigh === this.level.get(pin)) continue
      if (this.level.get(pin)) this.high.set(pin, this.high.get(pin)! + (now - this.since.get(pin)!))
      this.level.set(pin, isHigh)
      this.since.set(pin, now)
    }
  }

  /**
   * Sets a digital input from the circuit. `active` means pressed or on. For a pin using the internal
   * pull-up that pulls the pin low (a button to ground); otherwise it drives the pin high.
   */
  setDigital(pin: number, active: boolean) {
    this.active.set(pin, active)
    this.applyInputs()
  }

  /** Sets an analog input in volts (0 to 5). */
  setAnalog(channel: number, volts: number) {
    if (channel < 0 || channel >= ANALOG_PINS) return
    this.adc.channelValues[channel] = Math.min(5, Math.max(0, Number.isFinite(volts) ? volts : 0))
  }

  private applyInputs() {
    for (const pin of INPUT_PINS) {
      const bit = pin // port D bit n is pin n
      const pullUp = this.portD.pinState(bit) === PinState.InputPullUp
      const level = this.active.get(pin) === true ? !pullUp : pullUp
      if (this.applied.get(pin) === level) continue
      this.applied.set(pin, level)
      this.portD.setPin(bit, level)
    }
  }

  /** Runs at least `cycles` CPU cycles. */
  run(cycles: number) {
    const end = this.cpu.cycles + cycles
    const cpu = this.cpu
    while (cpu.cycles < end) {
      const sliceEnd = Math.min(end, cpu.cycles + SLICE_CYCLES)
      this.applyInputs()
      while (cpu.cycles < sliceEnd) {
        avrInstruction(cpu)
        cpu.tick()
      }
    }
  }

  /**
   * Fraction of time (0 to 1) each output pin was high since the last call. A plain on/off pin gives 0 or 1;
   * a PWM pin gives its duty cycle.
   */
  takeOutputs(): Duty {
    const now = this.cpu.cycles
    const span = now - this.windowStart
    const duty: Duty = {}
    for (const pin of OUTPUT_PINS) {
      let high = this.high.get(pin)!
      if (this.level.get(pin)) high += now - this.since.get(pin)!
      duty[pin] = span > 0 ? Math.min(1, high / span) : this.level.get(pin) ? 1 : 0
      this.high.set(pin, 0)
      this.since.set(pin, now)
    }
    this.windowStart = now
    return duty
  }

  /** Text the sketch has printed on Serial since the last call. */
  takeSerial(): string {
    const text = this.serial
    this.serial = ''
    return text
  }

  get droppedSerialBytes() {
    return this.serialDropped
  }
}
