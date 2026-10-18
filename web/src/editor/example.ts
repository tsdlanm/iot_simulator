import { UNO_SKETCH } from '../components/registry'
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
    { id: 'uno', kind: 'mcu-uno', x: 330, y: 150, props: { mode: 'cpp', sketch: UNO_SKETCH, program: UNO_PROGRAM, adcMin: 0, adcMax: 500 } },
    { id: 'temp', kind: 'temp-sensor', x: 40, y: 520, props: { pattern: 'sine', min: 20, max: 40, period: 30 } },
    { id: 'fan', kind: 'fan', x: 540, y: 0, props: {} },
    { id: 'led', kind: 'led', x: 780, y: 0, props: { color: 'green' } },
    { id: 'gauge', kind: 'gauge', x: 640, y: 520, props: { min: 0, max: 50, unit: '°C' } },
    { id: 'chart', kind: 'chart', x: 860, y: 520, props: {} },
  ] as N[],
  edges: [
    edge('e1', 'temp', 'out', 'uno', 'A0'),
    edge('e2', 'uno', 'D13', 'fan', 'in'),
    edge('e3', 'uno', 'D12', 'led', 'in'),
    edge('e4', 'temp', 'out', 'gauge', 'in'),
    edge('e5', 'temp', 'out', 'chart', 'in'),
  ],
})

const esp32 = (): Project => ({
  version: PROJECT_VERSION,
  name: 'Lampu dan alarm (ESP32)',
  nodes: [
    { id: 'esp', kind: 'mcu-esp32', x: 380, y: 130, props: { program: ESP32_PROGRAM } },
    { id: 'light', kind: 'light-sensor', x: 60, y: 130, props: { pattern: 'sine', min: 0, max: 1000, period: 24 } },
    { id: 'btn', kind: 'button', x: 60, y: 290, props: { pressed: false } },
    { id: 'pir', kind: 'pir-sensor', x: 60, y: 430, props: { chance: 40, hold: 4 } },
    { id: 'lamp', kind: 'led', x: 720, y: 300, props: { color: 'amber' } },
    { id: 'buzz', kind: 'buzzer', x: 720, y: 140, props: {} },
    { id: 'gauge', kind: 'gauge', x: 720, y: 450, props: { min: 0, max: 1000, unit: 'lux' } },
  ] as N[],
  edges: [
    edge('e1', 'light', 'out', 'esp', 'D34'),
    edge('e2', 'btn', 'out', 'esp', 'D25'),
    edge('e3', 'pir', 'out', 'esp', 'D26'),
    edge('e4', 'esp', 'D4', 'lamp', 'in'),
    edge('e5', 'esp', 'D5', 'buzz', 'in'),
    edge('e6', 'light', 'out', 'gauge', 'in'),
  ],
})

const pico = (): Project => ({
  version: PROJECT_VERSION,
  name: 'Lampu berkedip (Raspberry Pi Pico)',
  nodes: [
    { id: 'pico', kind: 'mcu-pico', x: 380, y: 100, props: { program: PICO_PROGRAM } },
    { id: 'btn', kind: 'button', x: 80, y: 120, props: { pressed: false } },
    { id: 'blink', kind: 'led', x: 640, y: 240, props: { color: 'red' } },
    { id: 'follow', kind: 'led', x: 640, y: 340, props: { color: 'blue' } },
  ] as N[],
  edges: [
    edge('e1', 'btn', 'out', 'pico', 'GP0'),
    edge('e2', 'pico', 'GP22', 'blink', 'in'),
    edge('e3', 'pico', 'GP21', 'follow', 'in'),
  ],
})

/** The same idea built from plain logic blocks, no board. */
const logic = (): Project => ({
  version: PROJECT_VERSION,
  name: 'Kipas otomatis (tanpa papan)',
  nodes: [
    { id: 'temp', kind: 'temp-sensor', x: 40, y: 120, props: { pattern: 'sine', min: 20, max: 40, period: 30 } },
    { id: 'cmp', kind: 'compare', x: 340, y: 120, props: { op: '>', threshold: 30 } },
    { id: 'fan', kind: 'fan', x: 640, y: 40, props: {} },
    { id: 'led', kind: 'led', x: 640, y: 230, props: { color: 'red' } },
    { id: 'gauge', kind: 'gauge', x: 340, y: 330, props: { min: 0, max: 50, unit: '°C' } },
    { id: 'chart', kind: 'chart', x: 640, y: 400, props: {} },
  ] as N[],
  edges: [
    edge('e1', 'temp', 'out', 'cmp', 'a'),
    edge('e2', 'cmp', 'out', 'fan', 'in'),
    edge('e3', 'cmp', 'out', 'led', 'in'),
    edge('e4', 'temp', 'out', 'gauge', 'in'),
    edge('e5', 'temp', 'out', 'chart', 'in'),
  ],
})

export const EXAMPLES: Example[] = [
  { id: 'uno', name: 'Kipas otomatis · Arduino Uno', build: uno },
  { id: 'esp32', name: 'Lampu dan alarm · ESP32', build: esp32 },
  { id: 'pico', name: 'Lampu berkedip · Raspberry Pi Pico', build: pico },
  { id: 'logic', name: 'Kipas otomatis · tanpa papan', build: logic },
]

/** What a first-time visitor sees. */
export const exampleProject = (): Project => uno()
export const logicExample = (): Project => logic()
