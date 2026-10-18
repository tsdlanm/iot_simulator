import { Header, Indicator, Mount, Pcb, Smd, FONT, MONO } from './primitives'
import type { Draw } from './sensors'

function Tags({ pins, dy = 14 }: { pins: { label: string; x: number; y: number }[]; dy?: number }) {
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

// A 40 mm DC fan wired to a relay module. The rotor spins faster with the level and smears when fast.
const fan: Draw = ({ level, active }, pins) => {
  const spin = level > 0.02
  return (
    <>
      <path d="M44 138C44 160 40 164 40 176M106 138C106 160 110 164 110 176" fill="none" stroke="#d9362c" strokeWidth={3} strokeLinecap="round" />
      <path d="M52 138C52 158 48 166 48 176M98 138C98 158 102 166 102 176" fill="none" stroke="#1d2026" strokeWidth={3} strokeLinecap="round" />
      <g filter="url(#pa-drop)">
        <path d="M24 8h102a14 14 0 0 1 14 14v102a14 14 0 0 1-14 14H24a14 14 0 0 1-14-14V22A14 14 0 0 1 24 8z" fill="url(#pa-plastic)" stroke="#050607" strokeWidth={1.4} />
      </g>
      {[[24, 24], [126, 24], [24, 122], [126, 122]].map(([x, y]) => (
        <g key={`${x}${y}`}>
          <circle cx={x} cy={y} r={7.5} fill="#05060a" />
          <circle cx={x} cy={y} r={7.5} fill="none" stroke="#4a5060" strokeWidth={1.2} />
        </g>
      ))}
      <circle cx={75} cy={73} r={52} fill="#08090c" stroke="#3a4050" strokeWidth={2} />
      <circle cx={75} cy={73} r={49} fill="none" stroke="#fff" strokeOpacity={0.07} strokeWidth={1.2} />
      <g className={`fan-rotor ${spin ? 'spinning' : ''}`} style={{ ['--spin' as string]: `${(0.9 - level * 0.78).toFixed(2)}s`, transformOrigin: '75px 73px' }}>
        {Array.from({ length: 7 }, (_, i) => (
          <path key={i} d="M75 73C66 58 66 38 82 24c13 12 11 31-7 49z" fill="#8aa4ff" stroke="#4a63c4" strokeWidth={1} transform={`rotate(${(i * 360) / 7} 75 73)`} />
        ))}
        {Array.from({ length: 7 }, (_, i) => (
          <path key={`h${i}`} d="M75 73C70 62 70 50 78 40" fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={2} transform={`rotate(${(i * 360) / 7} 75 73)`} />
        ))}
        <circle cx={75} cy={73} r={14} fill="url(#pa-metal)" stroke="#6a717c" />
        <text x={75} y={76} textAnchor="middle" fontSize={7} fontWeight={800} fontFamily={MONO} fill="#2b3038">
          5V
        </text>
      </g>
      {level > 0.6 && <circle cx={75} cy={73} r={46} fill="#8aa4ff" opacity={0.18} />}
      {/* relay module */}
      <Pcb x={22} y={168} w={106} h={52} mask="blue" r={5} />
      <rect x={32} y={174} width={40} height={36} rx={3} fill="#2a63c9" stroke="#0e2f70" />
      <rect x={32} y={174} width={40} height={6} rx={3} fill="#fff" opacity={0.18} />
      <text x={52} y={191} textAnchor="middle" fontSize={7} fontWeight={700} fontFamily={MONO} fill="#e8f0ff">
        SRD-05VDC
      </text>
      <text x={52} y={200} textAnchor="middle" fontSize={5.6} fontFamily={MONO} fill="#bcd0f5">
        10A 250VAC
      </text>
      <Indicator x={80} y={176} on={active} color="#ff4d41" />
      <Smd x={80} y={190} w={14} h={7} label="1N" />
      <Mount x={30} y={212} r={2.6} />
      <Mount x={120} y={212} r={2.6} />
      <Header xs={pins.map((p) => p.x)} y={216} tip={pins[0]!.y} housing={14} />
      <Tags pins={pins} dy={14} />
    </>
  )
}

export const ACTUATORS: Record<string, Draw> = { fan }
