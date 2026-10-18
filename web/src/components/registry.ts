import { CPP_KIND, exchange, levels } from '../emu/bridge'
import { compileCached, execute, MAX_PROGRAM_LENGTH, type PinSpec } from '../sim/firmware'
import { ESP32, PICO, UNO } from './boards'
import type { BoardLayout, Category, ComponentDef, Needs, PortDef, Props, PropDef, StepContext, Value } from './types'

const num = (props: Props, key: string, fallback = 0): number => {
  const v = props[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const isOn = (v: Value | undefined) => v === true

function analogSensor(ctx: StepContext): Record<string, Value> {
  const a = num(ctx.props, 'min')
  const b = num(ctx.props, 'max')
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  const mid = (lo + hi) / 2

  switch (ctx.props.pattern) {
    case 'sine': {
      const period = Math.max(num(ctx.props, 'period', 20), 0.1) * 1000
      return { out: mid + ((hi - lo) / 2) * Math.sin((2 * Math.PI * ctx.time) / period) }
    }
    case 'random': {
      let v = typeof ctx.state.v === 'number' ? ctx.state.v : mid
      v = clamp(v + (Math.random() - 0.5) * (hi - lo) * 0.2 * (ctx.dt / 100), lo, hi)
      ctx.state.v = v
      return { out: v }
    }
    case 'manual':
      return { out: clamp(num(ctx.props, 'value', mid), lo, hi) }
    default:
      return { out: mid }
  }
}

const analogProps = (min: number, max: number, period: number): PropDef[] => [
  {
    key: 'pattern',
    label: 'Pola nilai',
    type: 'select',
    default: 'sine',
    options: [
      { value: 'sine', label: 'Gelombang sinus' },
      { value: 'random', label: 'Acak halus' },
      { value: 'constant', label: 'Tetap (tengah rentang)' },
      { value: 'manual', label: 'Manual (geser di komponen)' },
    ],
  },
  { key: 'value', label: 'Nilai manual', type: 'number', default: (min + max) / 2, step: 1 },
  { key: 'min', label: 'Nilai minimum', type: 'number', default: min, step: 1 },
  { key: 'max', label: 'Nilai maksimum', type: 'number', default: max, step: 1 },
  { key: 'period', label: 'Periode sinus (detik)', type: 'number', default: period, min: 1, step: 1 },
]

interface AnalogSpec {
  kind: string
  label: string
  unit: string
  description: string
  min: number
  max: number
  period: number
  needs: Needs
  /** The voltage on the analog pin for a reading; `inputs` holds the supply the part is wired to. */
  volts: (value: number, inputs: Record<string, Value | undefined>) => number
  pattern?: string
  /** Port id of the analog output, `out` unless a module names its pins differently. */
  port?: string
  /** Other outputs derived from the reading, such as a comparator's digital pin. */
  also?: { ports: PortDef[]; props?: PropDef[]; compute: (value: number, props: Props) => Record<string, Value> }
}

const vccOf = (inputs: Record<string, Value | undefined>) => (typeof inputs.vcc === 'number' ? inputs.vcc : 5)

function analogSensorDef(spec: AnalogSpec): ComponentDef {
  const port = spec.port ?? 'out'
  const props = analogProps(spec.min, spec.max, spec.period).map((p): PropDef => (p.key === 'pattern' && p.type === 'select' && spec.pattern ? { ...p, default: spec.pattern } : p))
  return {
    kind: spec.kind,
    label: spec.label,
    category: 'sensor',
    unit: spec.unit,
    description: spec.description,
    view: 'analog',
    inputs: [vccIn, gndIn],
    outputs: [{ id: port, label: 'nilai', type: 'number' }, ...(spec.also?.ports ?? [])],
    needs: spec.needs,
    props: [...props, ...(spec.also?.props ?? [])],
    volts: (value, _props, inputs) => clamp(spec.volts(value, inputs), 0, 5),
    step: (ctx) => {
      if (supplyState(spec.needs, ctx.inputs) !== 'ok') return {}
      const value = analogSensor(ctx).out
      if (typeof value !== 'number') return {}
      return { [port]: value, ...(spec.also?.compute(value, ctx.props) ?? {}) }
    },
  }
}

/** Resistance of a 10k NTC with beta 3950 at the given temperature, in ohms. */
const ntcOhms = (celsius: number) => 10000 * Math.exp(3950 * (1 / (celsius + 273.15) - 1 / 298.15))

const rgbPort = (id: string, label: string): PortDef => ({ id, label, type: 'boolean' })

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

/** The pins a board's program can read and write, taken from its layout. */
export function pinSpec(board: BoardLayout): PinSpec {
  return {
    inputs: Object.fromEntries(
      board.pins.filter((p) => p.role === 'in-num' || p.role === 'in-bool').map((p) => [p.id, p.role === 'in-num' ? 'number' : 'boolean']),
    ),
    outputs: board.pins.filter((p) => p.role === 'out').map((p) => p.id),
  }
}

/** Longest Arduino sketch the compile service accepts. */
export const SKETCH_LIMIT = 64 * 1024

export const UNO_SKETCH = `// A0 = sensor suhu LM35 (10 mV per °C)
const int KIPAS = 13;
const int LAMPU = 12;

bool lampuNyala = false;

void setup() {
  pinMode(KIPAS, OUTPUT);
  pinMode(LAMPU, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  float suhu = analogRead(A0) * 500.0 / 1023.0;

  digitalWrite(KIPAS, suhu > 30 ? HIGH : LOW);

  lampuNyala = !lampuNyala;
  digitalWrite(LAMPU, lampuNyala);

  Serial.println(suhu);
  delay(500);
}
`

/** Extra properties of the Arduino Uno, which can run real C++ as well as the mini language. */
const UNO_PROPS: PropDef[] = [
  {
    key: 'mode',
    label: 'Bahasa',
    type: 'select',
    default: 'cpp',
    hidden: true,
    options: [
      { value: 'cpp', label: 'Arduino C++' },
      { value: 'simple', label: 'Sederhana' },
    ],
  },
  { key: 'sketch', label: 'Sketch', type: 'code', default: UNO_SKETCH, hidden: true, rows: 14, maxLength: SKETCH_LIMIT },
]

function boardDef(kind: string, label: string, description: string, board: BoardLayout, program: string, extra: PropDef[] = []): ComponentDef {
  const pins = pinSpec(board)
  return {
    kind,
    label,
    category: 'mcu',
    description,
    view: 'board',
    board,
    inputs: board.pins
      .filter((p) => p.role === 'in-num' || p.role === 'in-bool')
      .map((p) => ({ id: p.id, label: p.label, type: p.role === 'in-num' ? ('number' as const) : ('boolean' as const) })),
    outputs: [
      ...board.pins.filter((p) => p.role === 'out').map((p) => ({ id: p.id, label: p.label, type: 'boolean' as const })),
      ...board.pins.filter((p) => p.role === 'power' || p.role === 'gnd').map((p) => ({ id: p.id, label: p.label, type: p.role === 'power' ? ('power' as const) : ('gnd' as const) })),
    ],
    supply: Object.fromEntries(board.pins.filter((p) => p.role === 'power' || p.role === 'gnd').map((p) => [p.id, p.role === 'gnd' ? 0 : (POWER_VOLTS[p.id] ?? 5)])),
    props: [{ key: 'program', label: 'Program', type: 'code', default: program, hidden: true, rows: 10, maxLength: MAX_PROGRAM_LENGTH }, ...extra],
    ...(kind === CPP_KIND ? { levels: ({ id }: { id: string }) => levels(id) } : {}),
    step: (ctx) => {
      if (kind === CPP_KIND && ctx.props.mode !== 'simple') return exchange(ctx.id, ctx.inputs, ctx.volts)
      const source = typeof ctx.props.program === 'string' ? ctx.props.program : ''
      return execute(compileCached(kind, source, pins), pins, ctx.inputs, ctx.time / 1000)
    },
  }
}

export const MCU_PROGRAM_LIMIT = MAX_PROGRAM_LENGTH

/** What each power pin holds with the board running from USB. */
const POWER_VOLTS: Record<string, number> = { '5V': 5, '3V3': 3.3, VIN: 5, VBUS: 5, VSYS: 5 }

const bool = (id: string, label: string) => ({ id, label, type: 'boolean' as const })
const vccIn: PortDef = { id: 'vcc', label: 'VCC', type: 'power' }
const gndIn: PortDef = { id: 'gnd', label: 'GND', type: 'gnd' }

export type SupplyState = 'ok' | 'none' | 'low' | 'high'

/** Whether a part is wired to a supply it can live on. Ground alone is not enough when it needs a voltage. */
export function supplyState(needs: Needs | undefined, inputs: Record<string, Value | undefined>): SupplyState {
  if (!needs) return 'ok'
  if (inputs.gnd === undefined) return 'none'
  if (needs === 'gnd') return 'ok'
  const v = inputs.vcc
  if (typeof v !== 'number') return 'none'
  return v < needs.min ? 'low' : v > needs.max ? 'high' : 'ok'
}

export const SUPPLY_TEXT: Record<SupplyState, string> = {
  ok: '',
  none: 'Belum ada daya',
  low: 'Tegangan terlalu rendah',
  high: 'Tegangan terlalu tinggi',
}

export const COMPONENTS: ComponentDef[] = [
  // Microcontroller boards
  boardDef('mcu-uno', 'Arduino Uno', 'Papan Arduino Uno R3 (ATmega328P). Pin analog A0 sampai A5, digital D2 sampai D13.', UNO, UNO_PROGRAM, UNO_PROPS),
  boardDef('mcu-esp32', 'ESP32 DevKit', 'ESP32 DevKit V1 30 pin. Enam masukan analog dan 13 pin keluaran.', ESP32, ESP32_PROGRAM),
  boardDef('mcu-pico', 'Raspberry Pi Pico', 'Raspberry Pi Pico (RP2040) dengan 40 pin. Tiga masukan analog GP26 sampai GP28.', PICO, PICO_PROGRAM),

  // Power
  {
    kind: 'power-5v',
    label: 'Catu daya 5 V',
    category: 'power',
    description: 'Sumber 5 V dan ground, untuk rangkaian tanpa papan.',
    view: 'digital',
    inputs: [],
    outputs: [
      { id: 'vcc', label: '5V', type: 'power' },
      { id: 'gnd', label: 'GND', type: 'gnd' },
    ],
    supply: { vcc: 5, gnd: 0 },
    props: [],
    step: () => ({}),
  },

  // Sensors
  analogSensorDef({
    kind: 'temp-sensor',
    label: 'Sensor suhu (LM35)',
    unit: '°C',
    description: 'LM35: 10 mV per °C, jadi analogRead(A0) * 500.0 / 1023.0 memberi suhu.',
    min: 20,
    max: 40,
    period: 30,
    needs: { min: 4, max: 20 },
    volts: (c) => c * 0.01,
  }),
  analogSensorDef({
    kind: 'ntc-sensor',
    label: 'Sensor suhu (NTC)',
    unit: '°C',
    description: 'Termistor NTC 10k (beta 3950) dengan resistor 10k, seperti contoh Arduino-nya.',
    min: 10,
    max: 40,
    period: 30,
    needs: { min: 3, max: 5.5 },
    volts: (c, i) => {
      const r = ntcOhms(c)
      return (vccOf(i) * r) / (r + 10000)
    },
  }),
  analogSensorDef({
    kind: 'humidity-sensor',
    label: 'Sensor kelembapan',
    unit: '%',
    description: 'Keluaran analog 0 sampai 5 V untuk 0 sampai 100 %: analogRead(A0) * 100.0 / 1023.0.',
    min: 30,
    max: 90,
    period: 40,
    needs: { min: 3, max: 5.5 },
    volts: (h) => (h / 100) * 5,
  }),
  analogSensorDef({
    kind: 'light-sensor',
    label: 'Sensor cahaya (LDR)',
    unit: 'lux',
    description: 'Modul LDR: 0 sampai 1000 lux menjadi 0 sampai 5 V, jadi analogRead(A0) * 1000.0 / 1023.0.',
    min: 0,
    max: 1000,
    period: 25,
    needs: { min: 3, max: 5.5 },
    volts: (lux) => (lux / 1000) * 5,
  }),
  analogSensorDef({
    kind: 'pot',
    label: 'Potensiometer',
    unit: '%',
    description: 'Pembagi tegangan: SIG = VCC × posisi putaran, jadi analogRead(A0) bernilai 0 sampai 1023 sesuai putaran.',
    min: 0,
    max: 100,
    period: 20,
    pattern: 'manual',
    port: 'out',
    needs: { min: 1, max: 12 },
    volts: (pos, i) => (vccOf(i) * pos) / 100,
  }),
  analogSensorDef({
    kind: 'gas-sensor',
    label: 'Sensor gas (MQ-2)',
    unit: 'ppm',
    description: 'AO naik bersama kadar gas (0 sampai 1000 ppm menjadi 0 sampai 5 V); DO menyala di atas ambang batas.',
    min: 0,
    max: 1000,
    period: 30,
    port: 'ao',
    needs: { min: 4.5, max: 5.5 },
    volts: (ppm) => (ppm / 1000) * 5,
    also: {
      ports: [{ id: 'do', label: 'DO', type: 'boolean' }],
      props: [{ key: 'threshold', label: 'Ambang batas DO (ppm)', type: 'number', default: 400, min: 0, step: 10 }],
      compute: (ppm, props) => ({ do: ppm > num(props, 'threshold', 400) }),
    },
  }),
  analogSensorDef({
    kind: 'soil-sensor',
    label: 'Sensor kelembapan tanah',
    unit: '%',
    description: 'Sensor kapasitif: makin basah tanahnya, makin rendah tegangannya (2,8 V kering sampai 1,2 V basah).',
    min: 20,
    max: 80,
    period: 40,
    needs: { min: 3, max: 5.5 },
    volts: (wet) => 2.8 - 1.6 * (wet / 100),
  }),
  analogSensorDef({
    kind: 'slide-pot',
    label: 'Potensiometer geser',
    unit: '%',
    description: 'Seperti potensiometer putar, tetapi digeser: SIG = VCC × posisi.',
    min: 0,
    max: 100,
    period: 20,
    pattern: 'manual',
    needs: { min: 1, max: 12 },
    volts: (pos, i) => (vccOf(i) * pos) / 100,
  }),
  analogSensorDef({
    kind: 'flame-sensor',
    label: 'Sensor api',
    unit: '%',
    description: 'Modul inframerah: AOUT turun saat ada api (5 V tanpa api), DOUT menyala di atas ambang batas.',
    min: 0,
    max: 100,
    period: 30,
    port: 'ao',
    needs: { min: 3, max: 5.5 },
    volts: (v) => 5 * (1 - v / 100),
    also: {
      ports: [{ id: 'do', label: 'DOUT', type: 'boolean' }],
      props: [{ key: 'threshold', label: 'Ambang batas DOUT (%)', type: 'number', default: 50, min: 0, max: 100, step: 5 }],
      compute: (v, props) => ({ do: v > num(props, 'threshold', 50) }),
    },
  }),
  analogSensorDef({
    kind: 'sound-sensor',
    label: 'Sensor suara',
    unit: 'dB',
    description: 'Mikrofon: AOUT naik bersama kerasnya suara (30 sampai 110 dB menjadi 0 sampai 5 V), DOUT menyala di atas ambang batas.',
    min: 30,
    max: 110,
    period: 12,
    port: 'ao',
    needs: { min: 3, max: 5.5 },
    volts: (db) => (5 * (db - 30)) / 80,
    also: {
      ports: [{ id: 'do', label: 'DOUT', type: 'boolean' }],
      props: [{ key: 'threshold', label: 'Ambang batas DOUT (dB)', type: 'number', default: 70, min: 30, max: 110, step: 5 }],
      compute: (db, props) => ({ do: db > num(props, 'threshold', 70) }),
    },
  }),
  {
    kind: 'tilt-switch',
    label: 'Sakelar miring',
    category: 'sensor',
    description: 'OUT tinggi saat modul dimiringkan.',
    view: 'digital',
    inputs: [vccIn, gndIn],
    outputs: [bool('out', 'OUT')],
    needs: { min: 3, max: 5.5 },
    props: [{ key: 'tilted', label: 'Miring', type: 'boolean', default: false }],
    step: (ctx) => ({ out: supplyState({ min: 3, max: 5.5 }, ctx.inputs) === 'ok' && ctx.props.tilted === true }),
  },
  {
    kind: 'joystick',
    label: 'Joystick (KY-023)',
    category: 'sensor',
    description: 'Dua sumbu analog (2,5 V di tengah) dan tombol tekan. Geser tuas di komponen.',
    view: 'analog',
    inputs: [vccIn, gndIn],
    outputs: [
      { id: 'x', label: 'VRx', type: 'number' },
      { id: 'y', label: 'VRy', type: 'number' },
      { id: 'sw', label: 'SW', type: 'boolean' },
    ],
    needs: { min: 3, max: 5.5 },
    props: [
      { key: 'x', label: 'Sumbu X (−100 sampai 100)', type: 'number', default: 0, min: -100, max: 100, step: 5 },
      { key: 'y', label: 'Sumbu Y (−100 sampai 100)', type: 'number', default: 0, min: -100, max: 100, step: 5 },
      { key: 'pressed', label: 'Tombol ditekan', type: 'boolean', default: false },
    ],
    volts: (value, _props, inputs) => clamp((vccOf(inputs) * (1 + value / 100)) / 2, 0, 5),
    step: (ctx): Record<string, Value> =>
      supplyState({ min: 3, max: 5.5 }, ctx.inputs) === 'ok'
        ? { x: clamp(num(ctx.props, 'x'), -100, 100), y: clamp(num(ctx.props, 'y'), -100, 100), sw: ctx.props.pressed === true }
        : {},
  },
  {
    kind: 'pir-sensor',
    label: 'Sensor gerak (PIR)',
    category: 'sensor',
    description: 'Aktif sebentar secara acak, seperti mendeteksi gerakan.',
    view: 'digital',
    inputs: [vccIn, gndIn],
    outputs: [bool('out', 'gerak')],
    needs: { min: 4.5, max: 12 },
    props: [
      {
        key: 'pattern',
        label: 'Pola',
        type: 'select',
        default: 'random',
        options: [
          { value: 'random', label: 'Acak' },
          { value: 'manual', label: 'Manual (tombol di komponen)' },
        ],
      },
      { key: 'detected', label: 'Gerakan terdeteksi (manual)', type: 'boolean', default: false },
      { key: 'chance', label: 'Peluang gerak per detik (%)', type: 'number', default: 20, min: 0, max: 100, step: 5 },
      { key: 'hold', label: 'Lama aktif (detik)', type: 'number', default: 3, min: 0.5, step: 0.5 },
    ],
    step: (ctx) => {
      if (supplyState({ min: 4.5, max: 12 }, ctx.inputs) !== 'ok') return { out: false }
      if (ctx.props.pattern === 'manual') return { out: ctx.props.detected === true }
      const until = typeof ctx.state.until === 'number' ? ctx.state.until : 0
      let active = ctx.time < until
      if (!active && Math.random() < (num(ctx.props, 'chance', 20) / 100) * (ctx.dt / 1000)) {
        ctx.state.until = ctx.time + num(ctx.props, 'hold', 3) * 1000
        active = true
      }
      return { out: active }
    },
  },
  {
    kind: 'button',
    label: 'Tombol',
    category: 'sensor',
    description: 'Saklar yang bisa Anda tekan sendiri saat simulasi berjalan.',
    view: 'button',
    inputs: [],
    outputs: [bool('out', 'tekan')],
    props: [{ key: 'pressed', label: 'Ditekan', type: 'boolean', default: false }],
    step: (ctx) => ({ out: ctx.props.pressed === true }),
  },

  // Logic
  {
    kind: 'compare',
    label: 'Pembanding',
    category: 'logic',
    description: 'Bernilai benar kalau nilai masuk memenuhi perbandingan dengan ambang batas.',
    view: 'digital',
    inputs: [{ id: 'a', label: 'nilai', type: 'number' }],
    outputs: [bool('out', 'hasil')],
    props: [
      {
        key: 'op',
        label: 'Operator',
        type: 'select',
        default: '>',
        options: [
          { value: '>', label: 'lebih besar (>)' },
          { value: '>=', label: 'lebih besar sama dengan (≥)' },
          { value: '<', label: 'lebih kecil (<)' },
          { value: '<=', label: 'lebih kecil sama dengan (≤)' },
        ],
      },
      { key: 'threshold', label: 'Ambang batas', type: 'number', default: 30, step: 1 },
    ],
    step: (ctx) => {
      const a = typeof ctx.inputs.a === 'number' ? ctx.inputs.a : 0
      const t = num(ctx.props, 'threshold')
      switch (ctx.props.op) {
        case '>=':
          return { out: a >= t }
        case '<':
          return { out: a < t }
        case '<=':
          return { out: a <= t }
        default:
          return { out: a > t }
      }
    },
  },
  {
    kind: 'and',
    label: 'AND',
    category: 'logic',
    description: 'Benar kalau kedua masukan benar.',
    view: 'digital',
    inputs: [bool('a', 'A'), bool('b', 'B')],
    outputs: [bool('out', 'hasil')],
    props: [],
    step: (ctx) => ({ out: isOn(ctx.inputs.a) && isOn(ctx.inputs.b) }),
  },
  {
    kind: 'or',
    label: 'OR',
    category: 'logic',
    description: 'Benar kalau salah satu masukan benar.',
    view: 'digital',
    inputs: [bool('a', 'A'), bool('b', 'B')],
    outputs: [bool('out', 'hasil')],
    props: [],
    step: (ctx) => ({ out: isOn(ctx.inputs.a) || isOn(ctx.inputs.b) }),
  },
  {
    kind: 'not',
    label: 'NOT',
    category: 'logic',
    description: 'Membalik masukan.',
    view: 'digital',
    inputs: [bool('in', 'masuk')],
    outputs: [bool('out', 'hasil')],
    props: [],
    step: (ctx) => ({ out: !isOn(ctx.inputs.in) }),
  },
  {
    kind: 'timer',
    label: 'Timer (tunda)',
    category: 'logic',
    description: 'Keluaran baru benar setelah masukan benar terus-menerus selama waktu tunda.',
    view: 'digital',
    inputs: [bool('in', 'masuk')],
    outputs: [bool('out', 'hasil')],
    props: [{ key: 'delay', label: 'Waktu tunda (detik)', type: 'number', default: 3, min: 0, step: 0.5 }],
    step: (ctx) => {
      const on = isOn(ctx.inputs.in)
      const prev = typeof ctx.state.elapsed === 'number' ? ctx.state.elapsed : 0
      const elapsed = on ? prev + ctx.dt : 0
      ctx.state.elapsed = elapsed
      return { out: on && elapsed >= num(ctx.props, 'delay', 3) * 1000 }
    },
  },

  // Actuators
  {
    kind: 'led',
    label: 'LED',
    category: 'actuator',
    description: 'Menyala kalau masukan benar.',
    view: 'led',
    inputs: [bool('in', 'anoda'), gndIn],
    needs: 'gnd',
    outputs: [],
    props: [
      {
        key: 'color',
        label: 'Warna',
        type: 'select',
        default: 'amber',
        options: [
          { value: 'amber', label: 'Kuning' },
          { value: 'green', label: 'Hijau' },
          { value: 'red', label: 'Merah' },
          { value: 'blue', label: 'Biru' },
        ],
      },
    ],
    step: () => ({}),
  },
  {
    kind: 'rgb-led',
    label: 'LED RGB',
    category: 'actuator',
    description: 'LED tiga warna katoda bersama. Tiap kaki warna menyala sendiri atau dengan PWM, dan warnanya bercampur.',
    view: 'led',
    inputs: [rgbPort('r', 'R'), rgbPort('g', 'G'), rgbPort('b', 'B'), gndIn],
    needs: 'gnd',
    outputs: [],
    props: [],
    step: () => ({}),
  },
  {
    kind: 'fan',
    label: 'Kipas (modul relay)',
    category: 'actuator',
    description: 'Kipas 5 V lewat modul relay: perlu VCC dan GND, berputar saat IN aktif.',
    view: 'fan',
    inputs: [vccIn, gndIn, bool('in', 'IN')],
    needs: { min: 4, max: 6 },
    outputs: [],
    props: [],
    step: () => ({}),
  },
  {
    kind: 'buzzer',
    label: 'Buzzer',
    category: 'actuator',
    description: 'Berbunyi (ditandai animasi) kalau masukan benar.',
    view: 'buzzer',
    inputs: [bool('in', '+'), gndIn],
    needs: 'gnd',
    outputs: [],
    props: [],
    step: () => ({}),
  },

  // Displays
  {
    kind: 'gauge',
    label: 'Gauge',
    category: 'display',
    description: 'Menampilkan nilai angka sebagai bar.',
    view: 'gauge',
    inputs: [{ id: 'in', label: 'nilai', type: 'number' }],
    outputs: [],
    props: [
      { key: 'min', label: 'Minimum', type: 'number', default: 0, step: 1 },
      { key: 'max', label: 'Maksimum', type: 'number', default: 100, step: 1 },
      { key: 'unit', label: 'Satuan', type: 'select', default: '', options: [
        { value: '', label: '(tanpa)' },
        { value: '°C', label: '°C' },
        { value: '%', label: '%' },
        { value: 'lux', label: 'lux' },
      ] },
    ],
    step: () => ({}),
  },
  {
    kind: 'chart',
    label: 'Grafik garis',
    category: 'display',
    description: 'Menggambar riwayat nilai terakhir.',
    view: 'chart',
    inputs: [{ id: 'in', label: 'nilai', type: 'number' }],
    outputs: [],
    props: [],
    recordInput: 'in',
    step: () => ({}),
  },
]

const byKind = new Map(COMPONENTS.map((c) => [c.kind, c]))

export const getDef = (kind: string): ComponentDef | undefined => byKind.get(kind)

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'mcu', label: 'Mikrokontroler' },
  { id: 'power', label: 'Daya' },
  { id: 'sensor', label: 'Sensor' },
  { id: 'logic', label: 'Logika' },
  { id: 'actuator', label: 'Aktuator' },
  { id: 'display', label: 'Tampilan' },
]

export function defaultProps(def: ComponentDef): Props {
  return Object.fromEntries(def.props.map((p) => [p.key, p.default]))
}
