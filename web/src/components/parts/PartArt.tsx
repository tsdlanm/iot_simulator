import type { ReactNode } from 'react'
import { PART_LAYOUTS, type PartPin } from './layout'

export interface PartState {
  /** 0 to 1: how far along its range a reading is, or how hard an actuator is driven. */
  level: number
  /** Button pressed, motion seen, buzzer sounding. */
  active: boolean
  /** LED colour name. */
  color: string
}

const FONT = "'Helvetica Neue', Arial, sans-serif"
const MONO = "ui-monospace, 'SF Mono', Menlo, monospace"
const LED_COLORS: Record<string, string> = { amber: '#ffb52e', green: '#2fd87c', red: '#ff4d41', blue: '#3d8dff' }

/** Gradients and shadows shared by every part. Ids are the same in each svg, so repeats are harmless. */
function Defs() {
  return (
    <defs>
      <linearGradient id="pa-leg" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#8f96a1" />
        <stop offset="0.45" stopColor="#f2f4f7" />
        <stop offset="1" stopColor="#8a919c" />
      </linearGradient>
      <linearGradient id="pa-gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f3d97a" />
        <stop offset="1" stopColor="#b8902a" />
      </linearGradient>
      <linearGradient id="pa-black" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#3a3e47" />
        <stop offset="0.55" stopColor="#1d2026" />
        <stop offset="1" stopColor="#101216" />
      </linearGradient>
      <linearGradient id="pa-metal" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f4f6f8" />
        <stop offset="0.5" stopColor="#c3c8cf" />
        <stop offset="1" stopColor="#8f96a0" />
      </linearGradient>
      <linearGradient id="pa-green" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#1fa764" />
        <stop offset="1" stopColor="#0c7a47" />
      </linearGradient>
      <linearGradient id="pa-blue" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#4a97ec" />
        <stop offset="1" stopColor="#1f5fb8" />
      </linearGradient>
      <radialGradient id="pa-dome" cx="0.38" cy="0.3" r="0.8">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.7" stopColor="#e6e9ef" />
        <stop offset="1" stopColor="#bfc5d0" />
      </radialGradient>
      <radialGradient id="pa-cap" cx="0.35" cy="0.3" r="0.85">
        <stop offset="0" stopColor="#ff7a70" />
        <stop offset="1" stopColor="#c4261d" />
      </radialGradient>
      <filter id="pa-drop" x="-20%" y="-10%" width="140%" height="130%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.32" />
      </filter>
    </defs>
  )
}

/** A metal leg from the body down to where the wire attaches. */
function Leg({ pin, from, wide = 4.2 }: { pin: PartPin; from: number; wide?: number }) {
  if (pin.side === 'left' || pin.side === 'right') {
    const x0 = pin.side === 'left' ? pin.x : from
    const w = Math.abs(pin.side === 'left' ? from - pin.x : pin.x - from)
    return <rect x={x0} y={pin.y - wide / 2} width={w} height={wide} rx={wide / 2} fill="url(#pa-leg)" stroke="#6c727c" strokeWidth={0.5} />
  }
  return <rect x={pin.x - wide / 2} y={from} width={wide} height={pin.y - from} rx={wide / 2} fill="url(#pa-leg)" stroke="#6c727c" strokeWidth={0.5} />
}

/** Silkscreen-style pin name under a leg. */
function Tag({ pin, dy = 13 }: { pin: PartPin; dy?: number }) {
  return (
    <text x={pin.x} y={pin.y + dy} textAnchor="middle" fontSize={9.5} fontWeight={600} fontFamily={FONT} fill="currentColor" opacity={0.7}>
      {pin.label}
    </text>
  )
}

const heat = (level: number) => `hsl(${Math.round(215 - 215 * level)} 88% 56%)`

/** Gold header pins on a PCB, for the breakout modules. */
function Header({ pins, y }: { pins: PartPin[]; y: number }) {
  const x0 = pins[0]!.x - 9
  const x1 = pins[pins.length - 1]!.x + 9
  return (
    <g>
      <rect x={x0} y={y} width={x1 - x0} height={14} rx={2} fill="#17181b" stroke="#050506" strokeWidth={0.6} />
      {pins.map((p) => (
        <g key={p.label}>
          <rect x={p.x - 2.6} y={y + 4} width={5.2} height={5.2} fill="url(#pa-gold)" stroke="#7a5e16" strokeWidth={0.5} />
          <rect x={p.x - 1.6} y={y + 12} width={3.2} height={p.y - y - 12} fill="url(#pa-gold)" stroke="#7a5e16" strokeWidth={0.4} />
        </g>
      ))}
    </g>
  )
}

const Silk = ({ x, y, children, size = 7, anchor = 'middle' }: { x: number; y: number; children: ReactNode; size?: number; anchor?: 'start' | 'middle' | 'end' }) => (
  <text x={x} y={y} fontSize={size} fontFamily={FONT} fontWeight={600} textAnchor={anchor} fill="#fff" opacity={0.9}>
    {children}
  </text>
)

type Draw = (s: PartState, pins: PartPin[]) => ReactNode

const ART: Record<string, Draw> = {
  // LM35 in a TO-92 package: half-round black body, flat face with the part name, three legs.
  'temp-sensor': ({ level }, pins) => (
    <>
      {pins.map((p) => (
        <g key={p.label}>
          <Leg pin={p} from={96} />
          <Tag pin={p} />
        </g>
      ))}
      <g filter="url(#pa-drop)">
        <path d="M14 100V54a46 46 0 0 1 92 0v46z" fill="url(#pa-black)" stroke="#07080a" strokeWidth={1.2} />
        <path d="M14 100V54a46 46 0 0 1 14-33" fill="none" stroke="#5a606c" strokeWidth={2.4} strokeLinecap="round" opacity={0.7} />
      </g>
      <rect x={14} y={84} width={92} height={16} fill={heat(level)} opacity={0.92} />
      <rect x={14} y={84} width={92} height={5} fill="#fff" opacity={0.18} />
      <text x={60} y={54} textAnchor="middle" fontSize={17} fontWeight={700} fontFamily={MONO} fill="#e9ecf2">
        LM35
      </text>
      <text x={60} y={70} textAnchor="middle" fontSize={8.5} fontFamily={MONO} fill="#9aa1ae">
        10 mV/°C
      </text>
    </>
  ),
  // A humidity breakout: perforated sensor housing on a blue PCB with a 3-pin header.
  'humidity-sensor': ({ level }, pins) => (
    <>
      <g filter="url(#pa-drop)">
        <rect x={20} y={4} width={90} height={138} rx={6} fill="url(#pa-blue)" stroke="#173f7c" strokeWidth={1.2} />
      </g>
      <rect x={30} y={12} width={70} height={80} rx={5} fill="#f1f4f8" stroke="#c4cad4" strokeWidth={1.2} />
      {Array.from({ length: 6 }, (_, r) =>
        Array.from({ length: 7 }, (_, c) => <circle key={`${r}${c}`} cx={40 + c * 8.4} cy={22 + r * 11.4} r={2.6} fill="#8a93a3" />),
      )}
      <path d="M65 100c-5 6-7 9-7 12a7 7 0 0 0 14 0c0-3-2-6-7-12z" fill="#cfe6ff" opacity={0.3 + level * 0.7} stroke="#fff" strokeWidth={1} />
      <rect x={28} y={118} width={22} height={14} rx={1.5} fill="#16181c" />
      <Silk x={89} y={129} size={8}>
        HUM
      </Silk>
      <Header pins={pins} y={128} />
      {pins.map((p) => (
        <Tag key={p.label} pin={p} />
      ))}
    </>
  ),
  // An LDR module: photoresistor with a zigzag track, trim pot, comparator chip and indicator LED.
  'light-sensor': ({ level }, pins) => (
    <>
      <g filter="url(#pa-drop)">
        <rect x={14} y={4} width={102} height={134} rx={6} fill="url(#pa-green)" stroke="#075c36" strokeWidth={1.2} />
      </g>
      <circle cx={65} cy={42} r={26 + level * 10} fill="#ffd45a" opacity={0.08 + level * 0.28} />
      <circle cx={65} cy={42} r={25} fill="#e4b06a" stroke="#9a6a2d" strokeWidth={2} />
      <path
        d="M47 42h8l3-12 6 24 6-24 6 24 3-12h8"
        fill="none"
        stroke="#4d3010"
        strokeWidth={3}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <rect x={26} y={84} width={26} height={26} rx={3} fill="url(#pa-blue)" stroke="#173f7c" />
      <circle cx={39} cy={97} r={8} fill="url(#pa-metal)" stroke="#6a7078" />
      <path d="M33 97h12" stroke="#555" strokeWidth={1.4} />
      <rect x={66} y={88} width={34} height={16} rx={1.5} fill="url(#pa-black)" />
      <circle cx={70} cy={92} r={1.2} fill="#888" />
      <rect x={90} y={112} width={10} height={6} rx={1} fill={level > 0.5 ? '#ffd45a' : '#7c6a32'} />
      <Header pins={pins} y={134 - 6} />
      {pins.map((p) => (
        <Tag key={p.label} pin={p} dy={13} />
      ))}
    </>
  ),
  // A PIR module: Fresnel dome on a green board; the dome and a ring light up when it sees motion.
  'pir-sensor': ({ active }, pins) => (
    <>
      <g filter="url(#pa-drop)">
        <rect x={10} y={30} width={120} height={104} rx={6} fill="url(#pa-green)" stroke="#075c36" strokeWidth={1.2} />
      </g>
      <rect x={22} y={98} width={34} height={16} rx={2} fill="url(#pa-black)" />
      <rect x={90} y={96} width={26} height={22} rx={2} fill="#c9a24a" opacity={0.9} />
      {active && <circle cx={70} cy={58} r={50} fill="none" stroke="#ffc233" strokeWidth={3} opacity={0.7} />}
      <circle cx={70} cy={58} r={42} fill={active ? '#fff3b0' : 'url(#pa-dome)'} stroke="#aab1bf" strokeWidth={2} />
      {Array.from({ length: 6 }, (_, i) => (
        <path key={i} d={`M${70 + (i - 2.5) * 12} ${58 - Math.sqrt(Math.max(0, 42 ** 2 - ((i - 2.5) * 12) ** 2))}V${58 + Math.sqrt(Math.max(0, 42 ** 2 - ((i - 2.5) * 12) ** 2))}`} stroke="#b9c0cd" strokeWidth={1.2} opacity={0.8} />
      ))}
      <Header pins={pins} y={130 - 4} />
      {pins.map((p) => (
        <Tag key={p.label} pin={p} dy={13} />
      ))}
    </>
  ),
  // A 12 mm tactile switch with a red cap that sinks when pressed. Legs run out left and right.
  button: ({ active }, pins) => (
    <>
      {pins.map((p) => (
        <g key={p.label}>
          <Leg pin={p} from={p.side === 'left' ? 30 : 100} />
          <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize={9.5} fontWeight={600} fontFamily={FONT} fill="currentColor" opacity={0.7}>
            {p.label}
          </text>
        </g>
      ))}
      <g filter="url(#pa-drop)">
        <rect x={26} y={8} width={78} height={78} rx={8} fill="url(#pa-metal)" stroke="#6c727c" strokeWidth={1.2} />
      </g>
      <rect x={32} y={14} width={66} height={66} rx={6} fill="url(#pa-black)" />
      {[[38, 20], [92, 20], [38, 74], [92, 74]].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r={2.4} fill="#6c727c" />
      ))}
      <circle cx={65} cy={47} r={active ? 21 : 24} fill="url(#pa-cap)" stroke="#8c1d18" strokeWidth={2} />
      <ellipse cx={58} cy={39} rx={active ? 6 : 8} ry={active ? 3.5 : 5} fill="#fff" opacity={active ? 0.18 : 0.38} />
    </>
  ),
  // A 5 mm LED: translucent lens, flat rim, long anode and short cathode. The glow follows the level, so PWM dims it.
  led: ({ level, color }, pins) => {
    const c = LED_COLORS[color] ?? LED_COLORS.amber!
    return (
      <>
        <circle cx={50} cy={52} r={46} fill={c} opacity={level * 0.16} />
        <circle cx={50} cy={52} r={34} fill={c} opacity={level * 0.26} />
        {pins.map((p) => (
          <g key={p.label}>
            <Leg pin={p} from={100} />
            <Tag pin={p} dy={13} />
          </g>
        ))}
        <g filter="url(#pa-drop)">
          <path d="M18 98V52a32 32 0 0 1 64 0v46z" fill={c} fillOpacity={0.26 + level * 0.74} stroke={c} strokeWidth={2.2} />
          <rect x={12} y={94} width={76} height={9} rx={3} fill={c} fillOpacity={0.55} stroke={c} strokeWidth={1.5} />
        </g>
        <path d="M30 80V54M70 80V60" stroke="#fff" strokeWidth={3} opacity={0.2 + level * 0.1} strokeLinecap="round" />
        <ellipse cx={36} cy={30} rx={6} ry={11} fill="#fff" opacity={0.3 + level * 0.35} />
      </>
    )
  },
  // A 40 mm DC fan: square frame, four screw holes, rotor that spins faster as the level rises.
  fan: ({ level }, pins) => (
    <>
      {pins.map((p) => (
        <g key={p.label}>
          <rect x={p.x - 2.6} y={150} width={5.2} height={p.y - 150} rx={2.6} fill={p.port === 'vcc' ? '#d9362c' : p.port === 'gnd' ? '#23262c' : '#e5b800'} stroke="#0006" strokeWidth={0.5} />
          <Tag pin={p} dy={12} />
        </g>
      ))}
      <g filter="url(#pa-drop)">
        <rect x={10} y={8} width={110} height={110} rx={12} fill="url(#pa-black)" stroke="#07080a" strokeWidth={1.2} />
      </g>
      {[[22, 20], [108, 20], [22, 106], [108, 106]].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r={4.5} fill="#07080a" stroke="#3a3f4a" />
      ))}
      <circle cx={65} cy={63} r={48} fill="#0e1014" stroke="#2b2f37" strokeWidth={2} />
      <g
        className={`fan-rotor ${level > 0.02 ? 'spinning' : ''}`}
        style={{ ['--spin' as string]: `${(0.9 - level * 0.75).toFixed(2)}s`, transformOrigin: '65px 63px' }}
      >
        {[0, 72, 144, 216, 288].map((a) => (
          <path key={a} d="M65 63C58 46 60 28 74 20c9 11 7 29-9 43z" fill="#7f9bff" stroke="#4a63c4" strokeWidth={1} transform={`rotate(${a} 65 63)`} />
        ))}
        <circle cx={65} cy={63} r={9} fill="url(#pa-metal)" stroke="#6a7078" />
      </g>
      <rect x={10} y={118} width={110} height={32} fill="none" />
      <text x={65} y={140} textAnchor="middle" fontSize={8.5} fontFamily={MONO} fill="currentColor" opacity={0.55}>
        5V DC
      </text>
    </>
  ),
  // A piezo buzzer: black can with a sound hole and a + mark; waves show while it sounds.
  buzzer: ({ active }, pins) => (
    <>
      {pins.map((p) => (
        <g key={p.label}>
          <Leg pin={p} from={110} />
          <Tag pin={p} dy={13} />
        </g>
      ))}
      {active && (
        <g className="waves" fill="none" stroke="#ffb52e" strokeWidth={3} strokeLinecap="round">
          <path d="M104 40a26 26 0 0 1 0 40" />
          <path d="M114 28a42 42 0 0 1 0 64" />
          <path d="M16 40a26 26 0 0 0 0 40" />
          <path d="M6 28a42 42 0 0 0 0 64" />
        </g>
      )}
      <g filter="url(#pa-drop)">
        <circle cx={60} cy={62} r={46} fill="url(#pa-black)" stroke="#07080a" strokeWidth={1.2} />
        <circle cx={60} cy={62} r={38} fill="none" stroke="#3a3f4a" strokeWidth={1.4} />
      </g>
      <circle cx={60} cy={62} r={7} fill="#050608" />
      <text x={34} y={44} fontSize={15} fontWeight={700} fontFamily={FONT} fill="#aeb4c0">
        +
      </text>
      <path d="M26 98a46 46 0 0 0 8 8" stroke="#5a606c" strokeWidth={2} fill="none" opacity={0.6} />
    </>
  ),
}

/** The drawing of one real part, at the size its layout says. */
export default function PartArt({ kind, state }: { kind: string; state: PartState }) {
  const layout = PART_LAYOUTS[kind]
  const draw = ART[kind]
  if (!layout || !draw) return null
  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width={layout.width}
      height={layout.height}
      style={{ overflow: 'visible', display: 'block' }}
      aria-hidden="true"
    >
      <Defs />
      {draw({ ...state, level: Math.min(1, Math.max(0, state.level)) }, layout.pins)}
    </svg>
  )
}
