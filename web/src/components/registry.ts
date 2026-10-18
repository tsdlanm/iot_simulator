import { CPP_KIND, exchange } from '../emu/bridge'
import { compileCached, execute, MAX_PROGRAM_LENGTH, type PinSpec } from '../sim/firmware'
import { ESP32, PICO, UNO } from './boards'
import type { BoardLayout, Category, ComponentDef, Props, PropDef, StepContext, Value } from './types'

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
    ],
  },
  { key: 'min', label: 'Nilai minimum', type: 'number', default: min, step: 1 },
  { key: 'max', label: 'Nilai maksimum', type: 'number', default: max, step: 1 },
  { key: 'period', label: 'Periode sinus (detik)', type: 'number', default: period, min: 1, step: 1 },
]

function analogSensorDef(
  kind: string,
  label: string,
  unit: string,
  description: string,
  min: number,
  max: number,
  period: number,
): ComponentDef {
  return {
    kind,
    label,
    category: 'sensor',
    unit,
    description,
    view: 'analog',
    inputs: [],
    outputs: [{ id: 'out', label: 'nilai', type: 'number' }],
    props: analogProps(min, max, period),
    step: analogSensor,
  }
}


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

export const UNO_SKETCH = `// A0 = sensor suhu (0 V = 0 °C, 5 V = 500 °C)
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
  { key: 'adcMin', label: 'Nilai sensor di 0 V', type: 'number', default: 0, step: 1 },
  { key: 'adcMax', label: 'Nilai sensor di 5 V', type: 'number', default: 500, step: 1 },
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
    outputs: board.pins.filter((p) => p.role === 'out').map((p) => ({ id: p.id, label: p.label, type: 'boolean' as const })),
    props: [{ key: 'program', label: 'Program', type: 'code', default: program, hidden: true, rows: 10, maxLength: MAX_PROGRAM_LENGTH }, ...extra],
    step: (ctx) => {
      if (kind === CPP_KIND && ctx.props.mode !== 'simple') return exchange(ctx.id, ctx.inputs, ctx.props)
      const source = typeof ctx.props.program === 'string' ? ctx.props.program : ''
      return execute(compileCached(kind, source, pins), pins, ctx.inputs, ctx.time / 1000)
    },
  }
}

export const MCU_PROGRAM_LIMIT = MAX_PROGRAM_LENGTH

const bool = (id: string, label: string) => ({ id, label, type: 'boolean' as const })

export const COMPONENTS: ComponentDef[] = [
  // Microcontroller boards
  boardDef('mcu-uno', 'Arduino Uno', 'Papan Arduino Uno R3 (ATmega328P). Pin analog A0 sampai A5, digital D2 sampai D13.', UNO, UNO_PROGRAM, UNO_PROPS),
  boardDef('mcu-esp32', 'ESP32 DevKit', 'ESP32 DevKit V1 30 pin. Enam masukan analog dan 13 pin keluaran.', ESP32, ESP32_PROGRAM),
  boardDef('mcu-pico', 'Raspberry Pi Pico', 'Raspberry Pi Pico (RP2040) dengan 40 pin. Tiga masukan analog GP26 sampai GP28.', PICO, PICO_PROGRAM),

  // Sensors
  analogSensorDef('temp-sensor', 'Sensor suhu', '°C', 'Menghasilkan suhu dalam derajat Celsius.', 20, 40, 30),
  analogSensorDef('humidity-sensor', 'Sensor kelembapan', '%', 'Menghasilkan kelembapan relatif.', 30, 90, 40),
  analogSensorDef('light-sensor', 'Sensor cahaya', 'lux', 'Menghasilkan intensitas cahaya.', 0, 1000, 25),
  {
    kind: 'pir-sensor',
    label: 'Sensor gerak (PIR)',
    category: 'sensor',
    description: 'Aktif sebentar secara acak, seperti mendeteksi gerakan.',
    view: 'digital',
    inputs: [],
    outputs: [bool('out', 'gerak')],
    props: [
      { key: 'chance', label: 'Peluang gerak per detik (%)', type: 'number', default: 20, min: 0, max: 100, step: 5 },
      { key: 'hold', label: 'Lama aktif (detik)', type: 'number', default: 3, min: 0.5, step: 0.5 },
    ],
    step: (ctx) => {
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
    inputs: [bool('in', 'masuk')],
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
    kind: 'fan',
    label: 'Kipas (relay)',
    category: 'actuator',
    description: 'Berputar kalau masukan benar.',
    view: 'fan',
    inputs: [bool('in', 'masuk')],
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
    inputs: [bool('in', 'masuk')],
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
  { id: 'sensor', label: 'Sensor' },
  { id: 'logic', label: 'Logika' },
  { id: 'actuator', label: 'Aktuator' },
  { id: 'display', label: 'Tampilan' },
]

export function defaultProps(def: ComponentDef): Props {
  return Object.fromEntries(def.props.map((p) => [p.key, p.default]))
}
