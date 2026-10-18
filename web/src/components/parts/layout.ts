export type Side = 'top' | 'bottom' | 'left' | 'right'

export interface PartPin {
  /** The component's port id when a wire can attach here; absent for pins that are only drawn. */
  port?: string
  label: string
  x: number
  y: number
  side: Side
}

export interface PartLayout {
  width: number
  height: number
  pins: PartPin[]
}

/** Where each part's legs end. Wires attach to the pins that have a `port`. */
export const PART_LAYOUTS: Record<string, PartLayout> = {
  'temp-sensor': {
    width: 120,
    height: 176,
    pins: [
      { port: 'vcc', label: '+Vs', x: 36, y: 160, side: 'bottom' },
      { port: 'out', label: 'Vout', x: 60, y: 160, side: 'bottom' },
      { port: 'gnd', label: 'GND', x: 84, y: 160, side: 'bottom' },
    ],
  },
  'humidity-sensor': {
    width: 130,
    height: 176,
    pins: [
      { port: 'vcc', label: 'VCC', x: 38, y: 160, side: 'bottom' },
      { port: 'out', label: 'OUT', x: 65, y: 160, side: 'bottom' },
      { port: 'gnd', label: 'GND', x: 92, y: 160, side: 'bottom' },
    ],
  },
  'light-sensor': {
    width: 130,
    height: 170,
    pins: [
      { port: 'vcc', label: 'VCC', x: 38, y: 154, side: 'bottom' },
      { port: 'gnd', label: 'GND', x: 65, y: 154, side: 'bottom' },
      { port: 'out', label: 'AO', x: 92, y: 154, side: 'bottom' },
    ],
  },
  'pir-sensor': {
    width: 140,
    height: 168,
    pins: [
      { port: 'vcc', label: 'VCC', x: 42, y: 152, side: 'bottom' },
      { port: 'out', label: 'OUT', x: 70, y: 152, side: 'bottom' },
      { port: 'gnd', label: 'GND', x: 98, y: 152, side: 'bottom' },
    ],
  },
  button: {
    width: 130,
    height: 110,
    pins: [
      { label: 'GND', x: 6, y: 78, side: 'left' },
      { port: 'out', label: 'OUT', x: 124, y: 78, side: 'right' },
    ],
  },
  led: {
    width: 100,
    height: 176,
    pins: [
      { port: 'in', label: 'A', x: 38, y: 162, side: 'bottom' },
      { port: 'gnd', label: 'K', x: 62, y: 162, side: 'bottom' },
    ],
  },
  fan: {
    width: 130,
    height: 190,
    pins: [
      { port: 'vcc', label: 'VCC', x: 36, y: 176, side: 'bottom' },
      { port: 'gnd', label: 'GND', x: 65, y: 176, side: 'bottom' },
      { port: 'in', label: 'IN', x: 94, y: 176, side: 'bottom' },
    ],
  },
  buzzer: {
    width: 120,
    height: 168,
    pins: [
      { port: 'in', label: '+', x: 42, y: 154, side: 'bottom' },
      { port: 'gnd', label: '−', x: 78, y: 154, side: 'bottom' },
    ],
  },
}

export const hasPartArt = (kind: string) => kind in PART_LAYOUTS
