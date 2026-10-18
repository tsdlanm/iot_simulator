import type { ReactNode } from 'react'
import type { PartPin } from '../layout'
import { Chip, Header, Indicator, Mount, Pcb, Pin, Silk, Smd, Trimmer, FONT, MONO } from './primitives'

export interface PartState {
  /** 0 to 1: how far along its range a reading is, or how hard an actuator is driven. */
  level: number
  /** Button pressed, motion seen, buzzer sounding, power present. */
  active: boolean
  /** LED colour name. */
  color: string
  /** Extra values some parts draw: joystick x/y (-1 to 1), RGB channel levels, knob angle. */
  aux: Record<string, number>
}

export type Draw = (s: PartState, pins: PartPin[]) => ReactNode

const xs = (pins: PartPin[]) => pins.map((p) => p.x)
const tip = (pins: PartPin[]) => pins[0]!.y

function Tags({ pins, dy = 14 }: { pins: PartPin[]; dy?: number }) {
  return (
    <>
      {pins.map((p) => (
        <text key={p.label} x={p.x} y={p.y + dy} textAnchor="middle" fontSize={9.5} fontWeight={600} fontFamily={FONT} fill="currentColor" opacity={0.72}>
          {p.label}
        </text>
      ))}
    </>
  )
}

/** Silkscreen pin names printed on the board just above its header. */
function BoardLabels({ pins, y }: { pins: PartPin[]; y: number }) {
  return (
    <>
      {pins.map((p) => (
        <Silk key={p.label} x={p.x} y={y} size={7}>
          {p.label}
        </Silk>
      ))}
    </>
  )
}

// A TI LM35 in a TO-92 package: black epoxy half-cylinder with a flat marked face and three thin legs.
const lm35: Draw = (_s, pins) => (
  <>
    {pins.map((p) => (
      <Pin key={p.label} x={p.x} from={112} to={p.y} w={5} />
    ))}
    <g filter="url(#pa-drop)">
      <path d="M12 124V60a53 53 0 0 1 106 0v64z" fill="url(#pa-plastic)" stroke="#050607" strokeWidth={1.4} />
    </g>
    <path d="M12 124V60a53 53 0 0 1 20-41" fill="none" stroke="#7b8190" strokeWidth={3} strokeLinecap="round" opacity={0.55} />
    <rect x={12} y={112} width={106} height={12} fill="#000" opacity={0.28} />
    <rect x={12} y={110} width={106} height={2} fill="#fff" opacity={0.1} />
    <text x={65} y={60} textAnchor="middle" fontSize={21} fontWeight={800} fontFamily={MONO} fill="#eef0f5">
      LM35
    </text>
    <text x={65} y={78} textAnchor="middle" fontSize={11} fontFamily={MONO} fill="#a4abb8">
      DZ
    </text>
    <text x={65} y={96} textAnchor="middle" fontSize={9} fontFamily={MONO} fill="#7e8695">
      TI 7A2G
    </text>
    <Tags pins={pins} />
  </>
)

// A capacitive soil-moisture probe: a long board with a copper sensing area; the lower part darkens when wet.
const soil: Draw = ({ level }, pins) => (
  <>
    <Pcb x={10} y={40} w={80} h={276} mask="black" r={10} />
    <rect x={20} y={176} width={60} height={130} rx={4} fill="#c9a24a" opacity={0.2} />
    {[0, 1, 2, 3, 4, 5, 6].map((i) => (
      <path key={i} d={`M28 ${186 + i * 17}H72`} stroke="#d9b45a" strokeWidth={2} opacity={0.55} />
    ))}
    <rect x={20} y={176 + (1 - level) * 130} width={60} height={level * 130} rx={4} fill="#2f7fe0" opacity={0.35} />
    <path d="M50 176v-48" stroke="#d9b45a" strokeWidth={2} opacity={0.6} />
    <Chip x={30} y={96} w={40} h={22} text={['555', 'TLC555']} pins={4} />
    <Smd x={26} y={134} w={16} h={8} label="104" />
    <Smd x={58} y={134} w={16} h={8} label="103" />
    <rect x={32} y={196} width={36} height={14} rx={2} fill="#00000044" />
    <Silk x={50} y={206} size={7}>
      CAPACITIVE
    </Silk>
    <Silk x={50} y={316 - 8} size={7} rot={0}>
      v1.2
    </Silk>
    <path d="M10 296H90" stroke="#fff" strokeOpacity={0.25} strokeDasharray="3 3" />
    
    {/* header pointing up: legs go to the pin ends above the housing */}
    {pins.map((p) => (
      <rect key={`l${p.label}`} x={p.x - 2.2} y={tip(pins)} width={4.4} height={30} rx={2.2} fill="url(#pa-gold)" stroke="#7a5e16" strokeWidth={0.5} />
    ))}
    <rect x={pins[0]!.x - 8} y={24} width={pins[2]!.x - pins[0]!.x + 16} height={16} rx={2.5} fill="url(#pa-plastic)" stroke="#050506" strokeWidth={0.8} />
    {pins.map((p) => (
      <rect key={`t${p.label}`} x={p.x - 3.2} y={29} width={6.4} height={6.4} rx={1} fill="url(#pa-gold)" stroke="#7a5e16" strokeWidth={0.6} />
    ))}
    {pins.map((p) => (
      <Silk key={p.label} x={p.x} y={64} size={6.6}>
        {p.label}
      </Silk>
    ))}
  </>
)

export const SENSORS: Record<string, Draw> = {
  'temp-sensor': lm35,
  'soil-sensor': soil,
}
