import type { ReactNode } from 'react'

/** One monoline icon per component, so the palette and the canvas look like a single set. */
const PATHS: Record<string, ReactNode> = {
  'temp-sensor': <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />,
  'humidity-sensor': <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />,
  'light-sensor': (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </>
  ),
  'pir-sensor': <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />,
  button: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </>
  ),
  compare: (
    <>
      <path d="m7 5 10 6-10 6" />
      <path d="M7 21h10" />
    </>
  ),
  and: <path d="M6 19 12 5l6 14" />,
  or: <path d="M6 5l6 14 6-14" />,
  not: <path d="M5 9h14v6" />,
  timer: (
    <>
      <path d="M10 2h4" />
      <path d="m12 14 3-3" />
      <circle cx="12" cy="14" r="8" />
    </>
  ),
  'power-5v': <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  'ntc-sensor': <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z M10 16h4" />,
  pot: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 12 16 7" />
    </>
  ),
  'slide-pot': (
    <>
      <path d="M3 12h18" />
      <rect x="9" y="7" width="5" height="10" rx="1.5" />
    </>
  ),
  joystick: (
    <>
      <circle cx="12" cy="9" r="4" />
      <path d="M12 13v5M7 20h10" />
    </>
  ),
  'gas-sensor': <path d="M4 9h12a3 3 0 1 0-3-3M4 14h15a3 3 0 1 1-3 3M4 19h7" />,
  'flame-sensor': <path d="M12 22a6 6 0 0 0 6-6c0-3-2-5-3-7-1 1.5-2 2-3 2 0-3-1-6-3-8-1 4-5 6-5 12a6 6 0 0 0 8 7z" />,
  'sound-sensor': (
    <>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
    </>
  ),
  'soil-sensor': <path d="M12 3c3 4 5 6.5 5 9a5 5 0 0 1-10 0c0-2.5 2-5 5-9zM4 21h16" />,
  'tilt-switch': (
    <>
      <rect x="5" y="9" width="14" height="6" rx="3" transform="rotate(-20 12 12)" />
      <circle cx="9" cy="13" r="1.4" fill="currentColor" />
    </>
  ),
  'rgb-led': (
    <>
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6M10 22h4" />
    </>
  ),
  led: (
    <>
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6M10 22h4" />
    </>
  ),
  fan: (
    <>
      <circle cx="12" cy="12" r="1.6" />
      <path d="M12 10.3C10.4 7.6 10.6 3.6 12.5 3c1.9.6 2 4.6-.5 7.3z" />
      <path d="M12 10.3C10.4 7.6 10.6 3.6 12.5 3c1.9.6 2 4.6-.5 7.3z" transform="rotate(120 12 12)" />
      <path d="M12 10.3C10.4 7.6 10.6 3.6 12.5 3c1.9.6 2 4.6-.5 7.3z" transform="rotate(240 12 12)" />
    </>
  ),
  buzzer: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
  gauge: (
    <>
      <path d="m12 14 4-4" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </>
  ),
  chart: (
    <>
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-3 3" />
    </>
  ),
  mcu: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2" />
    </>
  ),
}

export default function ComponentIcon({ kind, size = 18, className }: { kind: string; size?: number; className?: string }) {
  const icon = PATHS[kind] ?? (kind.startsWith('mcu-') ? PATHS.mcu : null)
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {icon}
    </svg>
  )
}
