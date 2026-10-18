import { ACTUATORS } from './art/actuators'
import { Defs } from './art/primitives'
import { SENSORS, type Draw, type PartState } from './art/sensors'
import { PART_LAYOUTS } from './layout'

export type { PartState }

const ART: Record<string, Draw> = { ...SENSORS, ...ACTUATORS }

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
