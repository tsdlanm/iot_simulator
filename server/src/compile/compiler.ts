import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseDiagnostics, scrubPaths, type Diagnostic } from './diagnostics.js'
import { generatePrototypes } from './prototypes.js'
import { checkSketch } from './sanitize.js'
import { spawnRunner, withProcessLimits, type Runner } from './runner.js'

export type { Diagnostic } from './diagnostics.js'

export interface CompileOk {
  ok: true
  hex: string
  size: { flash: number; ram: number; flashMax: number; ramMax: number }
  cached: boolean
}

export interface CompileFail {
  ok: false
  /** rejected: refused before compiling. compile: the compiler found errors. The rest are service problems. */
  reason: 'rejected' | 'compile' | 'timeout' | 'busy' | 'unavailable'
  diagnostics: Diagnostic[]
  message?: string
}

export type CompileResult = CompileOk | CompileFail

export interface CompilerOptions {
  /** The Arduino AVR platform, for example /usr/share/arduino/hardware/arduino/avr. */
  avrDir: string
  cacheDir: string
  /** Time allowed for one compile, in milliseconds. */
  timeoutMs: number
  /** How many sketches may compile at the same time. */
  concurrency: number
  /** How many more may wait for a free slot before new ones are turned away. */
  maxQueue?: number
  /** Replaces the process runner; tests pass a fake. */
  run?: Runner
  /** Run compilers under prlimit when available. Defaults to true. */
  limitProcesses?: boolean
}

const MCU = 'atmega328p'
const FLASH_MAX = 32256 // 32 KB minus the Optiboot bootloader
const RAM_MAX = 2048
const MAX_CACHED = 200
const MAX_HEX_BYTES = 256 * 1024

const COMMON = ['-c', '-Os', '-w', '-ffunction-sections', '-fdata-sections', `-mmcu=${MCU}`, '-DF_CPU=16000000L', '-DARDUINO=10806', '-DARDUINO_AVR_UNO', '-DARDUINO_ARCH_AVR',
  // Older avr-gcc (Debian ships 5.4) lacks this in <float.h>, and the Arduino core's WString uses it. Newer ones define it identically.
  '-DDECIMAL_DIG=__DECIMAL_DIG__']
const C_FLAGS = ['-std=gnu11']
const CXX_FLAGS = ['-std=gnu++11', '-fpermissive', '-fno-exceptions', '-fno-threadsafe-statics', '-Wno-error=narrowing']

export class Compiler {
  private readonly run: Runner
  private readonly maxQueue: number
  private readonly cache = new Map<string, CompileResult>()
  private core?: Promise<string>
  private statusCache?: { at: number; value: Status }
  private active = 0
  private readonly waiting: Array<() => void> = []

  constructor(private readonly options: CompilerOptions) {
    const base = options.run ?? spawnRunner
    this.run = options.run || options.limitProcesses === false ? base : withProcessLimits(base, { memory: 2_000_000_000, cpu: 60, fileSize: 64_000_000 })
    this.maxQueue = options.maxQueue ?? 8
  }

  private get coreDir() {
    return join(this.options.avrDir, 'cores', 'arduino')
  }
  private get variantDir() {
    return join(this.options.avrDir, 'variants', 'standard')
  }

  async status(): Promise<Status> {
    const now = Date.now()
    if (this.statusCache && now - this.statusCache.at < 30_000) return this.statusCache.value
    // The probe runs inside the cache directory, so it has to exist or the spawn fails for the wrong reason.
    await mkdir(this.options.cacheDir, { recursive: true })
    const probe = await this.run('avr-g++', ['--version'], { cwd: this.options.cacheDir, timeoutMs: 5000 }).catch(() => null)
    const hasCore = await stat(this.coreDir).then((s) => s.isDirectory(), () => false)
    const value: Status =
      probe?.code === 0 && hasCore
        ? { available: true, toolchain: probe.stdout.split('\n')[0]?.trim() ?? 'avr-g++', boards: ['uno'] }
        : { available: false, toolchain: '', boards: [], reason: probe?.code === 0 ? 'Inti Arduino AVR tidak ditemukan' : 'avr-gcc tidak terpasang' }
    this.statusCache = { at: now, value }
    return value
  }

  async compile(code: string): Promise<CompileResult> {
    const problems = checkSketch(code)
    if (problems.length > 0) {
      return { ok: false, reason: 'rejected', diagnostics: problems.map((p) => ({ line: p.line, severity: 'error', message: p.message })) }
    }

    const key = createHash('sha256').update(`${MCU}\n${code}`).digest('hex')
    const hit = this.cache.get(key)
    if (hit) return hit.ok ? { ...hit, cached: true } : hit

    if (!(await this.status()).available) {
      return { ok: false, reason: 'unavailable', diagnostics: [], message: 'Layanan kompilasi belum siap di server ini' }
    }
    if (!(await this.acquire())) {
      return { ok: false, reason: 'busy', diagnostics: [], message: 'Server sedang sibuk mengompilasi. Coba lagi sebentar lagi.' }
    }
    try {
      const result = await this.build(code)
      if (result.ok || result.reason === 'compile') this.remember(key, result)
      return result
    } finally {
      this.release()
    }
  }

  private remember(key: string, result: CompileResult) {
    if (this.cache.size >= MAX_CACHED) this.cache.delete(this.cache.keys().next().value as string)
    this.cache.set(key, result)
  }

  private async acquire(): Promise<boolean> {
    if (this.active < this.options.concurrency) {
      this.active++
      return true
    }
    if (this.waiting.length >= this.maxQueue) return false
    await new Promise<void>((resolve) => this.waiting.push(resolve)) // the slot is handed over, not re-counted
    return true
  }

  private release() {
    const next = this.waiting.shift()
    if (next) next()
    else this.active--
  }

  private async build(code: string): Promise<CompileResult> {
    const deadline = Date.now() + this.options.timeoutMs
    const left = () => Math.max(1000, deadline - Date.now())
    let corePath: string
    try {
      corePath = await this.ensureCore()
    } catch (err) {
      return { ok: false, reason: 'unavailable', diagnostics: [], message: err instanceof Error ? err.message : 'Inti Arduino gagal dibangun' }
    }

    await mkdir(this.options.cacheDir, { recursive: true })
    const work = await mkdtemp(join(this.options.cacheDir, 'work-'))
    const dirs = [work, this.options.avrDir, this.options.cacheDir]
    try {
      await writeFile(join(work, 'sketch.cpp'), assemble(code), 'utf8')
      const env = { TMPDIR: work }
      const cxx = await this.run('avr-g++', [...COMMON, ...CXX_FLAGS, ...this.includes(), 'sketch.cpp', '-o', 'sketch.o'], { cwd: work, timeoutMs: left(), env })
      if (cxx.timedOut) return timeout()
      if (cxx.code !== 0) return compileError(cxx.stderr, dirs)

      const link = await this.run('avr-gcc', ['-w', '-Os', '-Wl,--gc-sections', `-mmcu=${MCU}`, '-o', 'sketch.elf', 'sketch.o', corePath, '-lm'], { cwd: work, timeoutMs: left(), env })
      if (link.timedOut) return timeout()
      if (link.code !== 0) return compileError(link.stderr, dirs)

      const copy = await this.run('avr-objcopy', ['-O', 'ihex', '-R', '.eeprom', 'sketch.elf', 'sketch.hex'], { cwd: work, timeoutMs: left(), env })
      if (copy.code !== 0) return { ok: false, reason: 'unavailable', diagnostics: [], message: 'avr-objcopy gagal' }
      const sized = await this.run('avr-size', ['sketch.elf'], { cwd: work, timeoutMs: left(), env })

      const hex = await readFile(join(work, 'sketch.hex'), 'utf8')
      if (hex.length > MAX_HEX_BYTES) return { ok: false, reason: 'compile', diagnostics: [{ line: 1, severity: 'error', message: 'Hasil kompilasi terlalu besar' }] }
      return { ok: true, hex, size: parseSize(sized.stdout), cached: false }
    } finally {
      await rm(work, { recursive: true, force: true })
    }
  }

  private includes() {
    return ['-I', this.coreDir, '-I', this.variantDir]
  }

  /** Builds the Arduino core into core.a once and keeps it; every sketch links against it. */
  private ensureCore(): Promise<string> {
    this.core ??= this.buildCore().catch((err) => {
      this.core = undefined // try again next time instead of failing forever
      throw err
    })
    return this.core
  }

  private async buildCore(): Promise<string> {
    const files = (await readdir(this.coreDir)).filter((f) => /\.(c|cpp|S)$/.test(f)).sort()
    await mkdir(this.options.cacheDir, { recursive: true })
    const version = await this.run('avr-g++', ['--version'], { cwd: this.options.cacheDir, timeoutMs: 5000 })
    const tag = createHash('sha1').update([version.stdout, ...files, ...COMMON, ...C_FLAGS, ...CXX_FLAGS].join('\n')).digest('hex').slice(0, 12)
    const dir = join(this.options.cacheDir, `core-${tag}`)
    const archive = join(dir, 'core.a')
    if (await stat(archive).then(() => true, () => false)) return archive

    await mkdir(this.options.cacheDir, { recursive: true })
    const tmp = await mkdtemp(join(this.options.cacheDir, 'core-build-'))
    try {
      const compileOne = async (file: string) => {
        const src = join(this.coreDir, file)
        const out = `${file}.o`
        const isCxx = file.endsWith('.cpp')
        const flags = file.endsWith('.S') ? ['-x', 'assembler-with-cpp'] : isCxx ? CXX_FLAGS : C_FLAGS
        const r = await this.run(isCxx ? 'avr-g++' : 'avr-gcc', [...COMMON, ...flags, ...this.includes(), src, '-o', out], { cwd: tmp, timeoutMs: 60_000 })
        if (r.code !== 0) throw new Error(`Gagal membangun inti Arduino (${file}): ${scrubPaths(r.stderr, [tmp, this.options.avrDir]).slice(0, 300)}`)
        return out
      }
      const objects: string[] = []
      for (let i = 0; i < files.length; i += 4) objects.push(...(await Promise.all(files.slice(i, i + 4).map(compileOne))))
      const ar = await this.run('avr-ar', ['rcs', 'core.a', ...objects], { cwd: tmp, timeoutMs: 30_000 })
      if (ar.code !== 0) throw new Error('avr-ar gagal membuat core.a')
      await rename(tmp, dir).catch(async () => {
        // Another process finished first; its copy is as good as ours.
        await rm(tmp, { recursive: true, force: true })
      })
      return archive
    } catch (err) {
      await rm(tmp, { recursive: true, force: true })
      throw err
    }
  }
}

export interface Status {
  available: boolean
  toolchain: string
  boards: string[]
  reason?: string
}

const timeout = (): CompileFail => ({ ok: false, reason: 'timeout', diagnostics: [], message: 'Kompilasi terlalu lama dan dihentikan' })

function compileError(stderr: string, dirs: string[]): CompileFail {
  const diagnostics = parseDiagnostics(stderr, dirs)
  const hasError = diagnostics.some((d) => d.severity === 'error')
  if (hasError) return { ok: false, reason: 'compile', diagnostics }
  // The compiler failed but said nothing we can place on a line: show a trimmed version of what it said.
  const message = scrubPaths(stderr, dirs).trim().split('\n').slice(0, 6).join('\n') || 'Kompilasi gagal'
  return { ok: false, reason: 'compile', diagnostics: [{ line: 1, severity: 'error', message }] }
}

/** avr-size prints "text data bss dec hex filename". Flash holds text and data, RAM holds data and bss. */
export function parseSize(output: string): CompileOk['size'] {
  const row = output.trim().split('\n').pop()?.trim().split(/\s+/).map(Number) ?? []
  const [text = 0, data = 0, bss = 0] = row
  return { flash: text + data, ram: data + bss, flashMax: FLASH_MAX, ramMax: RAM_MAX }
}

/**
 * Turns the user's sketch into a C++ file: the Arduino header first, then declarations for the sketch's
 * own functions, then the code with `#line` so compiler messages use the user's line numbers.
 */
export function assemble(code: string): string {
  const header = '#include <Arduino.h>\n'
  const protos = generatePrototypes(code)
  if (!protos) return `${header}#line 1 "sketch.ino"\n${code}`
  const lines = code.split('\n')
  const before = lines.slice(0, protos.beforeLine - 1).join('\n')
  const after = lines.slice(protos.beforeLine - 1).join('\n')
  return `${header}#line 1 "sketch.ino"\n${before}\n${protos.text}\n#line ${protos.beforeLine} "sketch.ino"\n${after}`
}

