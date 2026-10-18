import type { Props, Value } from '../types'

/**
 * Parts drawn by @wokwi/elements (MIT, https://github.com/wokwi/wokwi-elements): the same web components
 * Wokwi uses, so these look like the real boards and parts. Each spec says which element to use, which of its
 * pins is which port of our component, and how to show our simulation state on it.
 */

export interface PartRuntime {
  /** 0 to 1 drive or reading level. */
  level: number
  powered: boolean
  color: string
  props: Props
  outputs: Record<string, Value | undefined>
  /** Per-input drive levels, for parts with several (RGB LED). */
  drive: Record<string, number>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WokwiElement = HTMLElement & Record<string, any>

export interface WokwiSpec {
  tag: string
  load: () => Promise<unknown>
  /** Element pin name to our port id. Pins not listed are drawn on the part but cannot be wired. */
  pins: Record<string, string>
  apply?: (el: WokwiElement, r: PartRuntime) => void
  /** Hooks user interaction on the element up to the component's properties. Returns a cleanup. */
  listen?: (el: WokwiElement, set: (key: string, value: number | boolean | string) => void, props: Props) => () => void
  /** The part takes mouse input itself, so dragging it must not move the node. */
  interactive?: boolean
  /** Drawn size relative to the real part; small discrete parts are enlarged so they are easy to wire. */
  scale?: number
}

const on = (el: HTMLElement, type: string, fn: (e: Event) => void) => {
  el.addEventListener(type, fn)
  return () => el.removeEventListener(type, fn)
}

const LED_COLOR: Record<string, string> = { amber: 'yellow', green: 'green', red: 'red', blue: 'blue' }
const num = (p: Props, k: string, d = 0) => (typeof p[k] === 'number' ? (p[k] as number) : d)

/** Analog modules with LEDs (gas, flame, sound): the power LED and the signal LED follow the simulation. */
const moduleLeds = (power: string, signal: string) => (el: WokwiElement, r: PartRuntime) => {
  el[power] = r.powered
  el[signal] = r.powered && r.outputs.do === true
}

export const WOKWI: Record<string, WokwiSpec> = {
  led: {
    tag: 'wokwi-led',
    load: () => import('@wokwi/elements/dist/esm/led-element.js'),
    pins: { A: 'in', C: 'gnd' },
    scale: 2.6,
    apply: (el, r) => {
      el.color = LED_COLOR[r.color] ?? 'red'
      el.value = r.level > 0.02
      el.brightness = r.level
    },
  },
  'rgb-led': {
    tag: 'wokwi-rgb-led',
    load: () => import('@wokwi/elements/dist/esm/rgb-led-element.js'),
    pins: { R: 'r', G: 'g', B: 'b', COM: 'gnd' },
    scale: 2.6,
    apply: (el, r) => {
      el.ledRed = r.drive.r ?? 0
      el.ledGreen = r.drive.g ?? 0
      el.ledBlue = r.drive.b ?? 0
    },
  },
  buzzer: {
    tag: 'wokwi-buzzer',
    load: () => import('@wokwi/elements/dist/esm/buzzer-element.js'),
    pins: { '2': 'in', '1': 'gnd' },
    apply: (el, r) => {
      el.hasSignal = r.level >= 0.5
    },
  },
  pot: {
    tag: 'wokwi-potentiometer',
    load: () => import('@wokwi/elements/dist/esm/potentiometer-element.js'),
    pins: { VCC: 'vcc', SIG: 'out', GND: 'gnd' },
    interactive: true,
    apply: (el, r) => {
      el.min = num(r.props, 'min', 0)
      el.max = num(r.props, 'max', 100)
      el.step = 0.5
      el.value = num(r.props, 'value', 50)
    },
    listen: (el, set) =>
      on(el, 'input', () => {
        set('pattern', 'manual')
        set('value', Number(el.value))
      }),
  },
  'slide-pot': {
    tag: 'wokwi-slide-potentiometer',
    load: () => import('@wokwi/elements/dist/esm/slide-potentiometer-element.js'),
    pins: { VCC: 'vcc', SIG: 'out', GND: 'gnd' },
    interactive: true,
    apply: (el, r) => {
      el.min = num(r.props, 'min', 0)
      el.max = num(r.props, 'max', 100)
      el.step = 0.5
      el.value = num(r.props, 'value', 50)
    },
    listen: (el, set) =>
      on(el, 'input', () => {
        set('pattern', 'manual')
        set('value', Number(el.value))
      }),
  },
  joystick: {
    tag: 'wokwi-analog-joystick',
    load: () => import('@wokwi/elements/dist/esm/analog-joystick-element.js'),
    pins: { VCC: 'vcc', HORZ: 'x', VERT: 'y', SEL: 'sw', GND: 'gnd' },
    interactive: true,
    apply: (el, r) => {
      // The element counts left and up as positive.
      el.xValue = -num(r.props, 'x') / 100
      el.yValue = num(r.props, 'y') / 100
      el.pressed = r.props.pressed === true
    },
    listen: (el, set) => {
      const stops = [
        on(el, 'input', () => {
          set('x', Math.round(-Number(el.xValue) * 100))
          set('y', Math.round(Number(el.yValue) * 100))
        }),
        on(el, 'button-press', () => set('pressed', true)),
        on(el, 'button-release', () => set('pressed', false)),
      ]
      return () => stops.forEach((s) => s())
    },
  },
  button: {
    tag: 'wokwi-pushbutton',
    load: () => import('@wokwi/elements/dist/esm/pushbutton-element.js'),
    pins: { '2.r': 'out' },
    interactive: true,
    apply: (el, r) => {
      el.pressed = r.props.pressed === true
      el.color = 'red'
    },
    listen: (el, set) => {
      const stops = [on(el, 'button-press', () => set('pressed', true)), on(el, 'button-release', () => set('pressed', false))]
      return () => stops.forEach((s) => s())
    },
  },
  'humidity-sensor': {
    tag: 'wokwi-dht22',
    load: () => import('@wokwi/elements/dist/esm/dht22-element.js'),
    pins: { VCC: 'vcc', SDA: 'out', GND: 'gnd' },
    scale: 2.2,
  },
  'pir-sensor': {
    tag: 'wokwi-pir-motion-sensor',
    load: () => import('@wokwi/elements/dist/esm/pir-motion-sensor-element.js'),
    pins: { VCC: 'vcc', OUT: 'out', GND: 'gnd' },
  },
  'ntc-sensor': {
    tag: 'wokwi-ntc-temperature-sensor',
    load: () => import('@wokwi/elements/dist/esm/ntc-temperature-sensor-element.js'),
    pins: { VCC: 'vcc', OUT: 'out', GND: 'gnd' },
  },
  'light-sensor': {
    tag: 'wokwi-photoresistor-sensor',
    load: () => import('@wokwi/elements/dist/esm/photoresistor-sensor-element.js'),
    pins: { VCC: 'vcc', GND: 'gnd', AO: 'out' },
    apply: (el, r) => {
      el.ledPower = r.powered
      el.ledDO = r.powered && r.level > 0.5
    },
  },
  'gas-sensor': {
    tag: 'wokwi-gas-sensor',
    load: () => import('@wokwi/elements/dist/esm/gas-sensor-element.js'),
    pins: { VCC: 'vcc', GND: 'gnd', DOUT: 'do', AOUT: 'ao' },
    apply: moduleLeds('ledPower', 'ledD0'),
  },
  'flame-sensor': {
    tag: 'wokwi-flame-sensor',
    load: () => import('@wokwi/elements/dist/esm/flame-sensor-element.js'),
    pins: { VCC: 'vcc', GND: 'gnd', DOUT: 'do', AOUT: 'ao' },
    apply: moduleLeds('ledPower', 'ledSignal'),
  },
  'sound-sensor': {
    tag: 'wokwi-big-sound-sensor',
    load: () => import('@wokwi/elements/dist/esm/big-sound-sensor-element.js'),
    pins: { VCC: 'vcc', GND: 'gnd', DOUT: 'do', AOUT: 'ao' },
    apply: (el, r) => {
      el.led1 = r.powered
      el.led2 = r.powered && r.outputs.do === true
    },
  },
  'tilt-switch': {
    tag: 'wokwi-tilt-switch',
    load: () => import('@wokwi/elements/dist/esm/tilt-switch-element.js'),
    pins: { VCC: 'vcc', GND: 'gnd', OUT: 'out' },
  },
}

export const hasWokwi = (kind: string) => kind in WOKWI
