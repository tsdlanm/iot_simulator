import { defaultProps, getDef, UNO_SKETCH } from '../components/registry'
import { PROJECT_VERSION, type Project } from './serialize'

type N = Project['nodes'][number]
type E = Project['edges'][number]

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): E => ({
  id,
  source,
  sourceHandle,
  target,
  targetHandle,
})

const UNO_PROGRAM = `# A0 = suhu (angka), D2..D7 = masukan ya/tidak, D8..D13 = keluaran.
# Kipas di D13 menyala kalau suhu di atas 30.
D13 = A0 > 30
# D12 berkedip tiap 2 detik sebagai penanda papan hidup.
D12 = time % 2 < 1
`

const ESP32_PROGRAM = `# D34 = sensor cahaya (angka), D25..D27 dan D14 = masukan ya/tidak.
# Lampu di D4 menyala saat gelap.
D4 = D34 < 300
# Buzzer di D5 bunyi kalau tombol ditekan dan ada gerakan.
D5 = D25 and D26
# LED bawaan papan (D2) mengikuti lampu.
D2 = D4
`

const PICO_PROGRAM = `# GP0..GP5 = masukan ya/tidak, GP26..GP28 = masukan angka.
# GP6..GP22 = keluaran.
# GP22 berkedip: nyala 0,5 detik tiap 1 detik.
GP22 = time % 1 < 0.5
# GP21 mengikuti tombol di GP0.
GP21 = GP0
`

export interface Example {
  id: string
  name: string
  build: () => Project
}

const uno = (): Project => ({
  version: PROJECT_VERSION,
  name: 'Kipas otomatis (Arduino Uno)',
  nodes: [
    { id: 'uno', kind: 'mcu-uno', x: 330, y: 170, props: { mode: 'cpp', sketch: UNO_SKETCH, program: UNO_PROGRAM } },
    { id: 'temp', kind: 'temp-sensor', x: 40, y: 420, props: { pattern: 'sine', min: 20, max: 40, period: 30 } },
    { id: 'fan', kind: 'fan', x: 800, y: 40, props: {} },
    { id: 'led', kind: 'led', x: 1000, y: 60, props: { color: 'green' } },
    { id: 'gauge', kind: 'gauge', x: 560, y: 620, props: { min: 0, max: 50, unit: '°C' } },
    { id: 'chart', kind: 'chart', x: 800, y: 620, props: {} },
  ] as N[],
  edges: [
    edge('e1', 'temp', 'out', 'uno', 'A0'),
    edge('e2', 'uno', 'D13', 'fan', 'in'),
    edge('e3', 'uno', 'D12', 'led', 'in'),
    edge('e4', 'temp', 'out', 'gauge', 'in'),
    edge('e5', 'temp', 'out', 'chart', 'in'),
    // Supply: every part needs its own VCC/GND wire, like on a breadboard.
    edge('p1', 'uno', '5V', 'temp', 'vcc'),
    edge('p2', 'uno', 'GND_1', 'temp', 'gnd'),
    edge('p3', 'uno', '5V', 'fan', 'vcc'),
    edge('p4', 'uno', 'GND_1', 'fan', 'gnd'),
    edge('p5', 'uno', 'GND_2', 'led', 'gnd'),
  ],
})

const esp32 = (): Project => ({
  version: PROJECT_VERSION,
  name: 'Lampu dan alarm (ESP32)',
  nodes: [
    { id: 'esp', kind: 'mcu-esp32', x: 420, y: 110, props: { program: ESP32_PROGRAM } },
    { id: 'light', kind: 'light-sensor', x: 40, y: 40, props: { pattern: 'sine', min: 0, max: 1000, period: 24 } },
    { id: 'btn', kind: 'button', x: 40, y: 330, props: { pressed: false } },
    { id: 'pir', kind: 'pir-sensor', x: 230, y: 300, props: { chance: 40, hold: 4 } },
    { id: 'lamp', kind: 'led', x: 740, y: 300, props: { color: 'amber' } },
    { id: 'buzz', kind: 'buzzer', x: 740, y: 40, props: {} },
    { id: 'gauge', kind: 'gauge', x: 980, y: 300, props: { min: 0, max: 1000, unit: 'lux' } },
  ] as N[],
  edges: [
    edge('e1', 'light', 'out', 'esp', 'D34'),
    edge('e2', 'btn', 'out', 'esp', 'D25'),
    edge('e3', 'pir', 'out', 'esp', 'D26'),
    edge('e4', 'esp', 'D4', 'lamp', 'in'),
    edge('e5', 'esp', 'D5', 'buzz', 'in'),
    edge('e6', 'light', 'out', 'gauge', 'in'),
    edge('p1', 'esp', '3V3', 'light', 'vcc'),
    edge('p2', 'esp', 'GND_R', 'light', 'gnd'),
    edge('p3', 'esp', 'VIN', 'pir', 'vcc'),
    edge('p4', 'esp', 'GND_L', 'pir', 'gnd'),
    edge('p5', 'esp', 'GND_R', 'lamp', 'gnd'),
    edge('p6', 'esp', 'GND_R', 'buzz', 'gnd'),
  ],
})

const pico = (): Project => ({
  version: PROJECT_VERSION,
  name: 'Lampu berkedip (Raspberry Pi Pico)',
  nodes: [
    { id: 'pico', kind: 'mcu-pico', x: 420, y: 90, props: { program: PICO_PROGRAM } },
    { id: 'btn', kind: 'button', x: 100, y: 160, props: { pressed: false } },
    { id: 'blink', kind: 'led', x: 700, y: 160, props: { color: 'red' } },
    { id: 'follow', kind: 'led', x: 880, y: 160, props: { color: 'blue' } },
  ] as N[],
  edges: [
    edge('e1', 'btn', 'out', 'pico', 'GP0'),
    edge('e2', 'pico', 'GP22', 'blink', 'in'),
    edge('e3', 'pico', 'GP21', 'follow', 'in'),
    edge('p1', 'pico', 'GND_4', 'blink', 'gnd'),
    edge('p2', 'pico', 'GND_4', 'follow', 'gnd'),
  ],
})

/** The same idea built from plain logic blocks, no board. */
const logic = (): Project => ({
  version: PROJECT_VERSION,
  name: 'Kipas otomatis (tanpa papan)',
  nodes: [
    { id: 'psu', kind: 'power-5v', x: 40, y: 460, props: {} },
    { id: 'temp', kind: 'temp-sensor', x: 40, y: 60, props: { pattern: 'sine', min: 20, max: 40, period: 30 } },
    { id: 'cmp', kind: 'compare', x: 340, y: 120, props: { op: '>', threshold: 30 } },
    { id: 'fan', kind: 'fan', x: 640, y: 40, props: {} },
    { id: 'led', kind: 'led', x: 860, y: 60, props: { color: 'red' } },
    { id: 'gauge', kind: 'gauge', x: 340, y: 380, props: { min: 0, max: 50, unit: '°C' } },
    { id: 'chart', kind: 'chart', x: 620, y: 420, props: {} },
  ] as N[],
  edges: [
    edge('e1', 'temp', 'out', 'cmp', 'a'),
    edge('e2', 'cmp', 'out', 'fan', 'in'),
    edge('e3', 'cmp', 'out', 'led', 'in'),
    edge('e4', 'temp', 'out', 'gauge', 'in'),
    edge('e5', 'temp', 'out', 'chart', 'in'),
  ],
})

/** Examples list only what they change; every other property takes its default, as when a part is dropped on the canvas. */
const complete = (build: () => Project) => (): Project => {
  const p = build()
  return { ...p, nodes: p.nodes.map((n) => ({ ...n, props: { ...defaultProps(getDef(n.kind)!), ...n.props } })) }
}

export const EXAMPLES: Example[] = [
  { id: 'uno', name: 'Kipas otomatis · Arduino Uno', build: complete(uno) },
  { id: 'esp32', name: 'Lampu dan alarm · ESP32', build: complete(esp32) },
  { id: 'pico', name: 'Lampu berkedip · Raspberry Pi Pico', build: complete(pico) },
  { id: 'logic', name: 'Kipas otomatis · tanpa papan', build: complete(logic) },
]

/** What a first-time visitor sees. */
export const exampleProject = (): Project => complete(uno)()
export const logicExample = (): Project => complete(logic)()
