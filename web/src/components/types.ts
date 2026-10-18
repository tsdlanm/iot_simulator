export type Value = number | boolean
/** number and boolean carry signals; power carries a supply voltage, gnd a ground connection. */
export type PortType = 'number' | 'boolean' | 'power' | 'gnd'
export type PropValue = number | string | boolean
export type Props = Record<string, PropValue>
export type Category = 'mcu' | 'power' | 'sensor' | 'logic' | 'actuator' | 'display'

export interface PortDef {
  id: string
  label: string
  type: PortType
}

interface PropBase {
  key: string
  label: string
  /** Not listed in the generic property fields; edited somewhere else, such as the Code tab. */
  hidden?: boolean
}

export type PropDef =
  | (PropBase & { type: 'number'; default: number; min?: number; max?: number; step?: number })
  | (PropBase & { type: 'select'; default: string; options: { value: string; label: string }[] })
  | (PropBase & { type: 'boolean'; default: boolean })
  | (PropBase & { type: 'code'; default: string; rows?: number; maxLength?: number })

export interface StepContext {
  /** Id of the node being stepped. */
  id: string
  /** For numeric inputs fed by a sensor: the voltage that sensor puts on the wire, in volts. */
  volts: Record<string, number>
  props: Props
  inputs: Record<string, Value | undefined>
  /** Mutable per-node state that survives between ticks. */
  state: Record<string, unknown>
  /** Simulated time in ms since the simulation started. */
  time: number
  /** Simulated time in ms since the previous tick. */
  dt: number
}

/** How the node card renders its live value. */
export type NodeView = 'board' | 'analog' | 'digital' | 'button' | 'led' | 'fan' | 'buzzer' | 'gauge' | 'chart'

/** What a physical pin on a microcontroller board does in the simulation. */
export type PinRole = 'in-num' | 'in-bool' | 'out' | 'power' | 'gnd' | 'other'

export interface BoardPin {
  /** Port id, also the name used in the board's program (for example D13 or GP16). */
  id: string
  /** What is printed on the board's silkscreen. */
  label: string
  role: PinRole
  /** Centre of the pin in the board's pixel space. */
  x: number
  y: number
  /** Which way a wire leaves the pin. */
  side: 'top' | 'bottom' | 'left' | 'right'
}

export interface BoardLayout {
  width: number
  height: number
  pins: BoardPin[]
}

export type Needs = { min: number; max: number } | 'gnd'

export interface ComponentDef {
  kind: string
  label: string
  category: Category
  description: string
  unit?: string
  view: NodeView
  inputs: PortDef[]
  outputs: PortDef[]
  props: PropDef[]
  /** Present for microcontroller boards: where the pins sit on the artwork. */
  board?: BoardLayout
  /** When set, the engine records this input's numeric history for the node. */
  recordInput?: string
  /** What a part needs to work: a supply voltage range on `vcc` plus ground, or just ground. */
  needs?: Needs
  /** Sources of power: the voltage each power output holds (ground outputs hold 0). */
  supply?: Record<string, number>
  /** Sensors with an analog output: the voltage at the pin for a given reading. */
  volts?: (value: number, props: Props, inputs: Record<string, Value | undefined>, port: string) => number
  /** Boards: how much of the time each output pin is high (0 to 1), so PWM can dim an LED or slow a fan. */
  levels?: (ctx: { id: string }) => Record<string, number>
  step: (ctx: StepContext) => Record<string, Value>
}
