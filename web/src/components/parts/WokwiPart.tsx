import { useEffect, useRef, useState } from 'react'
import { WOKWI, type PartRuntime, type WokwiElement } from './wokwi'

/** The Wokwi artwork is drawn at real size; this brings it to the scale of our boards (2.54 mm pitch = 14 px). */
export const SCALE = 1.5

export interface Geometry {
  width: number
  height: number
  pins: { name: string; x: number; y: number }[]
}

interface Props {
  kind: string
  runtime: PartRuntime
  onGeometry: (g: Geometry) => void
  onChange: (key: string, value: number | boolean | string) => void
}

/** Hosts one Wokwi web component, keeps it in step with the simulation, and reports where its pins ended up. */
export default function WokwiPart({ kind, runtime, onGeometry, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const element = useRef<WokwiElement | null>(null)
  const latest = useRef({ runtime, onChange })
  latest.current = { runtime, onChange }
  const spec = WOKWI[kind]!
  const scale = spec.scale ?? SCALE
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    let stop: (() => void) | undefined
    let observer: ResizeObserver | undefined

    void spec.load().then(async () => {
      if (cancelled || !host.current) return
      const el = document.createElement(spec.tag) as WokwiElement
      el.style.display = 'inline-block'
      el.style.verticalAlign = 'top'
      host.current.appendChild(el)
      element.current = el
      spec.apply?.(el, latest.current.runtime)
      await el.updateComplete
      if (cancelled) return

      const measure = () => {
        const info = (el.pinInfo ?? []) as { name: string; x: number; y: number }[]
        const width = el.offsetWidth * scale
        const height = el.offsetHeight * scale
        setSize({ w: width, h: height })
        onGeometry({ width, height, pins: info.map((p) => ({ name: p.name, x: p.x * scale, y: p.y * scale })) })
      }
      measure()
      // Some parts move their pins when a property changes (a flipped LED, a slid potentiometer).
      el.addEventListener('pininfo-change', measure)
      observer = new ResizeObserver(measure)
      observer.observe(el)
      stop = spec.listen?.(el, (k, v) => latest.current.onChange(k, v), latest.current.runtime.props)
    })

    return () => {
      cancelled = true
      stop?.()
      observer?.disconnect()
      element.current?.remove()
      element.current = null
    }
    // The element is created once per part; later renders only change its properties.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])

  useEffect(() => {
    if (element.current) spec.apply?.(element.current, runtime)
  })

  // The element is drawn at real size and scaled up; the outer box takes the scaled size so the layout around it is right.
  return (
    <div className="wokwi-box" style={{ width: size?.w, height: size?.h }}>
      <div ref={host} className="wokwi-host" style={{ transform: `scale(${scale})`, transformOrigin: '0 0', width: 'max-content' }} />
    </div>
  )
}
