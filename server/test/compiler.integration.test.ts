import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { Compiler } from '../src/compile/compiler.js'

const AVR_DIR = process.env.COMPILE_AVR_DIR ?? '/usr/share/arduino/hardware/arduino/avr'
const hasToolchain = (() => {
  try {
    execFileSync('avr-g++', ['--version'], { stdio: 'ignore' })
    return existsSync(join(AVR_DIR, 'cores', 'arduino'))
  } catch {
    return false
  }
})()

// Runs the real avr-gcc and Arduino core. Skipped where they are not installed (CI installs them).
describe.skipIf(!hasToolchain)('Compiler with the real toolchain', () => {
  let cacheDir: string
  const make = async () => {
    cacheDir ??= await mkdtemp(join(tmpdir(), 'compile-it-'))
    return new Compiler({ avrDir: AVR_DIR, cacheDir, timeoutMs: 60_000, concurrency: 2 })
  }
  afterAll(() => cacheDir && rm(cacheDir, { recursive: true, force: true }))

  it('turns a blink sketch into Intel HEX', async () => {
    const r = await (await make()).compile('void setup() { pinMode(13, OUTPUT); }\nvoid loop() { digitalWrite(13, HIGH); delay(500); digitalWrite(13, LOW); delay(500); }\n')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.hex.startsWith(':')).toBe(true)
      expect(r.hex.trimEnd().endsWith(':00000001FF')).toBe(true)
      expect(r.size.flash).toBeGreaterThan(500)
    }
  }, 120_000)

  it('accepts functions used before they are defined', async () => {
    const r = await (await make()).compile('void setup() { go(); }\nvoid loop() {}\nvoid go() { pinMode(13, OUTPUT); }\n')
    expect(r.ok).toBe(true)
  }, 120_000)

  it('reports a syntax error on the right line', async () => {
    const r = await (await make()).compile('void setup() {\n  pinMode(13, OUTPUT)\n}\nvoid loop() {}\n')
    expect(r).toMatchObject({ ok: false, reason: 'compile' })
    if (!r.ok) expect(r.diagnostics[0]?.line).toBe(3)
  }, 120_000)

  it('does not leak the server paths', async () => {
    const r = await (await make()).compile('void setup() { nope(); }\nvoid loop() {}\n')
    expect(JSON.stringify(r)).not.toContain(AVR_DIR)
  }, 120_000)
})
