import type { ReactNode } from 'react'

export const FONT = "'Helvetica Neue', Arial, sans-serif"
export const MONO = "ui-monospace, 'SF Mono', Menlo, monospace"

/** Gradients, shadows and glows shared by every part. Ids repeat across svgs, which is harmless: they are identical. */
export function Defs() {
  const mask = (id: string, a: string, b: string) => (
    <linearGradient id={`pa-${id}`} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor={a} />
      <stop offset="1" stopColor={b} />
    </linearGradient>
  )
  return (
    <defs>
      {mask('green', '#13a05e', '#0a6b3f')}
      {mask('blue', '#2f7fe0', '#17479c')}
      {mask('red', '#d8453a', '#9b261f')}
      {mask('black', '#30343c', '#14161a')}
      {mask('purple', '#7a4fc9', '#4b2b92')}
      <linearGradient id="pa-leg" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#7d848f" />
        <stop offset="0.45" stopColor="#f4f6f9" />
        <stop offset="1" stopColor="#7a818c" />
      </linearGradient>
      <linearGradient id="pa-gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f7e08a" />
        <stop offset="1" stopColor="#b48a26" />
      </linearGradient>
      <linearGradient id="pa-metal" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fbfcfd" />
        <stop offset="0.45" stopColor="#c9ced6" />
        <stop offset="1" stopColor="#8b929d" />
      </linearGradient>
      <linearGradient id="pa-plastic" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#3b3f47" />
        <stop offset="0.5" stopColor="#1e2127" />
        <stop offset="1" stopColor="#0f1114" />
      </linearGradient>
      <linearGradient id="pa-white" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#d8dce4" />
      </linearGradient>
      <radialGradient id="pa-dome" cx="0.36" cy="0.3" r="0.85">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.65" stopColor="#e9ecf1" />
        <stop offset="1" stopColor="#bcc3cf" />
      </radialGradient>
      <radialGradient id="pa-knob" cx="0.35" cy="0.3" r="0.9">
        <stop offset="0" stopColor="#fdfdfe" />
        <stop offset="0.55" stopColor="#c6ccd6" />
        <stop offset="1" stopColor="#8a919c" />
      </radialGradient>
      <radialGradient id="pa-cap" cx="0.35" cy="0.3" r="0.85">
        <stop offset="0" stopColor="#ff8a80" />
        <stop offset="1" stopColor="#bf2219" />
      </radialGradient>
      <radialGradient id="pa-stick" cx="0.38" cy="0.32" r="0.8">
        <stop offset="0" stopColor="#4a4f59" />
        <stop offset="1" stopColor="#14161a" />
      </radialGradient>
      <filter id="pa-drop" x="-20%" y="-12%" width="140%" height="135%">
        <feDropShadow dx="0" dy="3" stdDeviation="3.2" floodColor="#000" floodOpacity="0.34" />
      </filter>
      <filter id="pa-soft" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="6" />
      </filter>
      <filter id="pa-bloom" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="9" />
      </filter>
      <pattern id="pa-mesh" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="5" height="5" fill="#b8bdc6" />
        <path d="M0 0H5M0 0V5" stroke="#6f7682" strokeWidth="1.1" />
      </pattern>
      <pattern id="pa-knurl" width="4" height="4" patternUnits="userSpaceOnUse">
        <rect width="4" height="4" fill="none" />
        <path d="M2 0V4" stroke="#00000022" strokeWidth="1" />
      </pattern>
    </defs>
  )
}

export type Mask = 'green' | 'blue' | 'red' | 'black' | 'purple'

/** A printed circuit board: solder mask, a lighter rim, and a drop shadow. */
export function Pcb({ x, y, w, h, r = 6, mask = 'green' }: { x: number; y: number; w: number; h: number; r?: number; mask?: Mask }) {
  return (
    <g>
      <g filter="url(#pa-drop)">
        <rect x={x} y={y} width={w} height={h} rx={r} fill={`url(#pa-${mask})`} stroke="#00000066" strokeWidth={1.2} />
      </g>
      <rect x={x + 2} y={y + 2} width={w - 4} height={h - 4} rx={r - 1.5} fill="none" stroke="#ffffff" strokeOpacity={0.13} strokeWidth={1.2} />
    </g>
  )
}

export function Mount({ x, y, r = 5 }: { x: number; y: number; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r + 2.6} fill="url(#pa-gold)" opacity={0.9} />
      <circle cx={x} cy={y} r={r} fill="#0a0b0d" />
      <circle cx={x} cy={y} r={r} fill="none" stroke="#00000088" strokeWidth={0.8} />
    </g>
  )
}

/** Straight metal pin from a body down to where the wire attaches. */
export function Pin({ x, from, to, w = 4.4 }: { x: number; from: number; to: number; w?: number }) {
  return <rect x={x - w / 2} y={from} width={w} height={Math.max(0, to - from)} rx={w / 2} fill="url(#pa-leg)" stroke="#5f6670" strokeWidth={0.5} />
}

/** A row of male header pins: black plastic housing, gold tips, legs down to the pin end. */
export function Header({ xs, y, tip, pitch = 22, housing = 16 }: { xs: number[]; y: number; tip: number; pitch?: number; housing?: number }) {
  const x0 = xs[0]! - pitch / 2 + 3
  const x1 = xs[xs.length - 1]! + pitch / 2 - 3
  return (
    <g>
      {xs.map((x) => (
        <rect key={`l${x}`} x={x - 2.2} y={y + housing - 2} width={4.4} height={tip - y - housing + 2} rx={2.2} fill="url(#pa-gold)" stroke="#7a5e16" strokeWidth={0.5} />
      ))}
      <rect x={x0} y={y} width={x1 - x0} height={housing} rx={2.5} fill="url(#pa-plastic)" stroke="#050506" strokeWidth={0.8} />
      <rect x={x0 + 1.5} y={y + 1.5} width={x1 - x0 - 3} height={3} rx={1.5} fill="#fff" opacity={0.12} />
      {xs.map((x) => (
        <rect key={`t${x}`} x={x - 3.2} y={y + 5} width={6.4} height={6.4} rx={1} fill="url(#pa-gold)" stroke="#7a5e16" strokeWidth={0.6} />
      ))}
    </g>
  )
}

export function Silk({ x, y, children, size = 8, anchor = 'middle', rot = 0, fill = '#fff', weight = 600 }: { x: number; y: number; children: ReactNode; size?: number; anchor?: 'start' | 'middle' | 'end'; rot?: number; fill?: string; weight?: number }) {
  return (
    <text x={x} y={y} fontSize={size} fontFamily={FONT} fontWeight={weight} textAnchor={anchor} fill={fill} opacity={0.92} transform={rot ? `rotate(${rot} ${x} ${y})` : undefined}>
      {children}
    </text>
  )
}

/** A surface-mount resistor or capacitor. */
export function Smd({ x, y, w = 14, h = 7, label, body = '#1b1d21' }: { x: number; y: number; w?: number; h?: number; label?: string; body?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={1} fill={body} stroke="#000" strokeWidth={0.5} />
      <rect x={x} y={y} width={3} height={h} fill="#cfd3da" />
      <rect x={x + w - 3} y={y} width={3} height={h} fill="#cfd3da" />
      {label && (
        <text x={x + w / 2} y={y + h / 2 + 2} fontSize={4.6} fontFamily={MONO} textAnchor="middle" fill="#e8eaf0">
          {label}
        </text>
      )}
    </g>
  )
}

/** A small SOIC chip with a pin-1 dot and a few printed characters. */
export function Chip({ x, y, w = 34, h = 22, text = ['LM393', 'N 1234'], pins = 4 }: { x: number; y: number; w?: number; h?: number; text?: string[]; pins?: number }) {
  const step = (w - 6) / pins
  return (
    <g>
      {Array.from({ length: pins }, (_, i) => (
        <g key={i}>
          <rect x={x + 4 + i * step} y={y - 3} width={3} height={4} fill="#c9ced6" />
          <rect x={x + 4 + i * step} y={y + h - 1} width={3} height={4} fill="#c9ced6" />
        </g>
      ))}
      <rect x={x} y={y} width={w} height={h} rx={1.5} fill="url(#pa-plastic)" stroke="#000" strokeWidth={0.6} />
      <circle cx={x + 5} cy={y + h - 5} r={1.4} fill="#6d7480" />
      {text.map((t, i) => (
        <text key={t} x={x + w / 2 + 2} y={y + 9 + i * 7} fontSize={5.4} fontFamily={MONO} textAnchor="middle" fill="#aab0bc">
          {t}
        </text>
      ))}
    </g>
  )
}

/** A blue multi-turn trimmer with a brass adjustment screw. */
export function Trimmer({ x, y, size = 26, angle = 35 }: { x: number; y: number; size?: number; angle?: number }) {
  const c = size / 2
  return (
    <g>
      <rect x={x} y={y} width={size} height={size} rx={2} fill="url(#pa-blue)" stroke="#0c2f6c" strokeWidth={0.9} />
      <rect x={x + 1.5} y={y + 1.5} width={size - 3} height={4} rx={1} fill="#fff" opacity={0.16} />
      <circle cx={x + c} cy={y + c} r={size * 0.32} fill="url(#pa-knob)" stroke="#7a6a2f" strokeWidth={0.8} />
      <path d={`M${x + c - 5} ${y + c}H${x + c + 5}`} stroke="#3b3320" strokeWidth={2} strokeLinecap="round" transform={`rotate(${angle} ${x + c} ${y + c})`} />
    </g>
  )
}

/** A 3 mm indicator LED soldered flat to a board. */
export function Indicator({ x, y, on, color = '#ff4d41', glow = true }: { x: number; y: number; on: boolean; color?: string; glow?: boolean }) {
  return (
    <g>
      {on && glow && <circle cx={x + 5} cy={y + 3} r={12} fill={color} opacity={0.45} filter="url(#pa-soft)" />}
      <rect x={x} y={y} width={10} height={6} rx={2} fill={on ? color : '#3b3f47'} stroke="#111" strokeWidth={0.6} />
      <rect x={x + 1.5} y={y + 1} width={4} height={1.6} rx={0.8} fill="#fff" opacity={on ? 0.7 : 0.18} />
    </g>
  )
}

export const hot = (level: number) => `hsl(${Math.round(215 - 215 * level)} 88% 56%)`
