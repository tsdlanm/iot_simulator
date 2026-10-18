import type { ReactNode } from 'react'

interface Props {
  kind: string
  /** 0 to 1: how far along its range the reading is. */
  level?: number
  /** Active: button pressed, motion detected. */
  active?: boolean
  /** LED colour name. */
  color?: string
}

const LED_COLORS: Record<string, string> = { amber: '#ffc233', green: '#3ddc84', red: '#ff5a4d', blue: '#4d9bff' }

const LEG = '#b8bcc6'

function Legs({ xs, from = 44, to = 62 }: { xs: number[]; from?: number; to?: number }) {
  return (
    <>
      {xs.map((x) => (
        <line key={x} x1={x} y1={from} x2={x} y2={to} stroke={LEG} strokeWidth="2.4" strokeLinecap="round" />
      ))}
    </>
  )
}

/** Hot readings run toward red, cold toward blue. */
const heat = (level: number) => `hsl(${Math.round(215 - 215 * level)} 85% 55%)`

const ART: Record<string, (p: Required<Props>) => ReactNode> = {
  // A 5 mm LED: the lens glows in proportion to the level, so PWM dims it.
  led: ({ level, color }) => {
    const c = LED_COLORS[color] ?? LED_COLORS.amber!
    return (
      <>
        <circle cx="60" cy="22" r="26" fill={c} opacity={level * 0.22} />
        <circle cx="60" cy="22" r="20" fill={c} opacity={level * 0.3} />
        <line x1="54" y1="40" x2="54" y2="62" stroke={LEG} strokeWidth="2.4" strokeLinecap="round" />
        <line x1="66" y1="40" x2="66" y2="58" stroke={LEG} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M46 40V22a14 14 0 0 1 28 0v18z" fill={c} fillOpacity={0.28 + level * 0.72} stroke={c} strokeWidth="2" />
        <rect x="43" y="38" width="34" height="5" rx="1.5" fill={c} fillOpacity={0.5} />
        <ellipse cx="54" cy="15" rx="3" ry="5" fill="#fff" opacity={0.35 + level * 0.3} />
      </>
    )
  },
  // A small DC fan: the rotor spins faster as the level rises.
  fan: ({ level }) => (
    <>
      <rect x="34" y="2" width="52" height="52" rx="7" fill="#3a3f4a" />
      <circle cx="60" cy="28" r="22" fill="#23262e" />
      <g
        className={`fan-rotor ${level > 0.02 ? 'spinning' : ''}`}
        style={{ ['--spin' as string]: `${(0.9 - level * 0.75).toFixed(2)}s`, transformOrigin: '60px 28px' }}
      >
        {[0, 90, 180, 270].map((a) => (
          <path key={a} d="M60 28c-2-8-1-15 4-18 5 3 5 11 0 18z" fill="#9db4ff" transform={`rotate(${a} 60 28)`} />
        ))}
        <circle cx="60" cy="28" r="4.5" fill="#5c6a99" />
      </g>
      {[[39, 7], [81, 7], [39, 49], [81, 49]].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="1.8" fill="#1b1d23" />
      ))}
    </>
  ),
  // A piezo buzzer: black can with a sound hole; arcs appear while it sounds.
  buzzer: ({ active }) => (
    <>
      <Legs xs={[52, 68]} from={48} />
      <circle cx="60" cy="26" r="22" fill="#1f2228" stroke="#3a3f4a" strokeWidth="2" />
      <circle cx="60" cy="26" r="4" fill="#0b0c0f" />
      <text x="48" y="17" fontSize="9" fontWeight="700" fill="#9aa0ad">+</text>
      {active && (
        <g className="waves" fill="none" stroke="#ffc233" strokeWidth="2.4" strokeLinecap="round">
          <path d="M90 16a14 14 0 0 1 0 20" />
          <path d="M98 10a22 22 0 0 1 0 32" />
          <path d="M30 16a14 14 0 0 0 0 20" />
          <path d="M22 10a22 22 0 0 0 0 32" />
        </g>
      )}
    </>
  ),
  // LM35 in a TO-92 package: a flat face on a half-round body.
  'temp-sensor': ({ level }) => (
    <>
      <Legs xs={[50, 60, 70]} />
      <path d="M43 44V24a17 17 0 0 1 34 0v20z" fill="#2a2e36" />
      <path d="M43 44V24a17 17 0 0 1 3-9.5" fill="none" stroke="#454b57" strokeWidth="2" />
      <rect x="43" y="38" width="34" height="6" fill={heat(level)} opacity="0.9" />
      <text x="60" y="33" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#e8eaf0" fontFamily="ui-monospace, monospace">
        LM35
      </text>
    </>
  ),
  // A blue humidity module with a vented grille, like a DHT22.
  'humidity-sensor': ({ level }) => (
    <>
      <Legs xs={[48, 56, 64, 72]} from={46} />
      <rect x="40" y="6" width="40" height="40" rx="4" fill="#3b82d6" />
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={i} x1="46" x2="74" y1={13 + i * 5} y2={13 + i * 5} stroke="#1e56a0" strokeWidth="2" strokeLinecap="round" />
      ))}
      <path d="M60 30c-3 4-4.5 6-4.5 8a4.5 4.5 0 0 0 9 0c0-2-1.5-4-4.5-8z" fill="#cfe6ff" opacity={0.25 + level * 0.75} />
    </>
  ),
  // A photoresistor: ceramic disc, zigzag track, glow that follows the light level.
  'light-sensor': ({ level }) => (
    <>
      <circle cx="60" cy="24" r={14 + level * 8} fill="#ffd45a" opacity={0.12 + level * 0.35} />
      <Legs xs={[54, 66]} from={36} />
      <circle cx="60" cy="24" r="14" fill="#d9a35c" stroke="#a9763a" strokeWidth="2" />
      <path d="M50 24h4l2-5 4 10 4-10 2 5h4" fill="none" stroke="#5a3a14" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </>
  ),
  // A PIR module: green board, white Fresnel dome that lights up on motion.
  'pir-sensor': ({ active }) => (
    <>
      <Legs xs={[48, 60, 72]} from={44} />
      <rect x="34" y="30" width="52" height="16" rx="3" fill="#2f8f5b" />
      <circle cx="60" cy="22" r="17" fill={active ? '#fff3b0' : '#eef0f4'} stroke="#c3c8d2" strokeWidth="2" />
      {active && <circle cx="60" cy="22" r="22" fill="none" stroke="#ffc233" strokeWidth="2.4" opacity="0.8" />}
      {[-8, 0, 8].map((dx) => (
        <path key={dx} d={`M${60 + dx} 12v20`} stroke="#c3c8d2" strokeWidth="1.4" />
      ))}
    </>
  ),
  // A tactile switch with a red cap that sinks when pressed.
  button: ({ active }) => (
    <>
      <Legs xs={[40, 80]} from={34} to={50} />
      <rect x="38" y="8" width="44" height="40" rx="5" fill="#4a4f5a" />
      <circle cx="60" cy="28" r={active ? 12 : 14} fill={active ? '#b3261e' : '#e5484d'} stroke="#8c1d18" strokeWidth="2" />
      {[44, 76].flatMap((x) => [12, 44].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.8" fill="#262a32" />))}
    </>
  ),
}

/** A drawing of the real part, so sensors look like what you would hold, not a labelled box. */
export default function PartArt({ kind, level = 0.5, active = false, color = 'amber' }: Props) {
  const draw = ART[kind]
  if (!draw) return null
  return (
    <svg className="part-art" viewBox="0 0 120 64" role="img" aria-hidden="true">
      {draw({ kind, level: Math.min(1, Math.max(0, level)), active, color })}
    </svg>
  )
}

export const hasArt = (kind: string) => kind in ART
