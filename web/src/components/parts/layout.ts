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

/** A row of pins along the bottom edge, one per [port, label]. */
const bottom = (specs: [port: string | undefined, label: string][], xs: number[], y: number): PartPin[] =>
  specs.map(([port, label], i) => ({ port, label, x: xs[i]!, y, side: 'bottom' as const }))

/** Where each part's legs end. Wires attach to the pins that have a `port`. */
export const PART_LAYOUTS: Record<string, PartLayout> = {
  'temp-sensor': {
    width: 130,
    height: 206,
    pins: bottom([['vcc', '+Vs'], ['out', 'Vout'], ['gnd', 'GND']], [35, 65, 95], 184),
  },
  'soil-sensor': {
    width: 100,
    height: 330,
    pins: [
      { port: 'gnd', label: 'GND', x: 28, y: 14, side: 'top' },
      { port: 'vcc', label: 'VCC', x: 50, y: 14, side: 'top' },
      { port: 'out', label: 'AOUT', x: 72, y: 14, side: 'top' },
    ],
  },
  fan: {
    width: 150,
    height: 252,
    pins: bottom([['vcc', 'VCC'], ['gnd', 'GND'], ['in', 'IN']], [47, 75, 103], 236),
  },
}

export const hasPartArt = (kind: string) => kind in PART_LAYOUTS
