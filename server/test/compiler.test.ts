import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Compiler, assemble, parseSize } from '../src/compile/compiler.js'
import type { Runner, RunResult } from '../src/compile/runner.js'

const done = (over: Partial<RunResult> = {}): RunResult => ({ code: 0, stdout: '', stderr: '', timedOut: false, ...over })

let dir: string
let avr: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'compiler-test-'))
  avr = join(dir, 'avr')
  await mkdir(join(avr, 'cores', 'arduino'), { recursive: true })
  await writeFile(join(avr, 'cores', 'arduino', 'main.cpp'), '')
  await mkdir(join(avr, 'variants', 'standard'), { recursive: true })
})
afterEach(() => rm(dir, { recursive: true, force: true }))

/** A runner that pretends to be the toolchain; `calls` records what the compiler asked for. */
function fake(handler: (cmd: string, args: string[]) => Partial<RunResult> | Promise<Partial<RunResult>> = () => ({})) {
  const calls: string[] = []
  const run: Runner = async (cmd, args, { cwd }) => {
    calls.push(cmd)
    const custom = await handler(cmd, args)
    if (cmd === 'avr-objcopy') await writeFile(join(cwd, 'sketch.hex'), ':00000001FF\n')
    if (cmd === 'avr-size') return done({ stdout: '   text\tdata\tbss\tdec\thex\tfilename\n   100\t20\t30\t150\t96\tsketch.elf\n', ...custom })
    if (cmd === 'avr-g++' && args[0] === '--version') return done({ stdout: 'avr-g++ (fake) 1.0\n', ...custom })
    return done(custom)
  }
  return { run, calls }
}

const make = (run: Runner, over = {}) =>
  new Compiler({ avrDir: avr, cacheDir: join(dir, 'cache'), timeoutMs: 5000, concurrency: 1, maxQueue: 1, run, ...over })

const GOOD = 'void setup() {}\nvoid loop() {}\n'

describe('Compiler', () => {
  it('compiles, links and returns hex with sizes', async () => {
    const { run } = fake()
    const r = await make(run).compile(GOOD)
    expect(r).toMatchObject({ ok: true, hex: ':00000001FF\n', cached: false, size: { flash: 120, ram: 50 } })
  })

  it('serves a repeated sketch from the cache without running the toolchain', async () => {
    const f = fake()
    const c = make(f.run)
    await c.compile(GOOD)
    const before = f.calls.length
    const again = await c.compile(GOOD)
    expect(again).toMatchObject({ ok: true, cached: true })
    expect(f.calls.length).toBe(before)
  })

  it('refuses a rejected sketch before touching the toolchain', async () => {
    const f = fake()
    const r = await make(f.run).compile('#include <Servo.h>\n')
    expect(r).toMatchObject({ ok: false, reason: 'rejected' })
    expect(f.calls).toHaveLength(0)
  })

  it('reports compiler errors on the user line, without server paths', async () => {
    const f = fake((cmd, args) =>
      cmd === 'avr-g++' && args.includes('sketch.o') ? { code: 1, stderr: 'sketch.ino:3:1: error: expected \';\' before \'}\' token\n' } : {},
    )
    const r = await make(f.run).compile(GOOD)
    expect(r).toMatchObject({ ok: false, reason: 'compile', diagnostics: [{ line: 3, severity: 'error' }] })
  })

  it('reports a timeout', async () => {
    const f = fake((cmd, args) => (cmd === 'avr-g++' && args.includes('sketch.o') ? { code: null, timedOut: true } : {}))
    expect(await make(f.run).compile(GOOD)).toMatchObject({ ok: false, reason: 'timeout' })
  })

  it('does not cache timeouts', async () => {
    let slow = true
    const f = fake((cmd, args) => (slow && cmd === 'avr-g++' && args.includes('sketch.o') ? { code: null, timedOut: true } : {}))
    const c = make(f.run)
    await c.compile(GOOD)
    slow = false
    expect(await c.compile(GOOD)).toMatchObject({ ok: true })
  })

  it('is unavailable when the toolchain is missing', async () => {
    const f = fake((cmd) => (cmd === 'avr-g++' ? { code: 127 } : {}))
    const c = make(f.run)
    expect(await c.status()).toMatchObject({ available: false, reason: 'avr-gcc tidak terpasang' })
    expect(await c.compile(GOOD)).toMatchObject({ ok: false, reason: 'unavailable' })
  })

  it('turns away work beyond the queue and finishes what is queued', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const f = fake(async (cmd, args) => {
      if (cmd === 'avr-g++' && args.includes('sketch.o')) await gate
      return {}
    })
    const c = make(f.run) // 1 running + 1 waiting allowed
    const a = c.compile('void setup(){}\nvoid loop(){} // a\n')
    await new Promise((r) => setTimeout(r, 50))
    const b = c.compile('void setup(){}\nvoid loop(){} // b\n')
    await new Promise((r) => setTimeout(r, 20))
    const third = await c.compile('void setup(){}\nvoid loop(){} // c\n')
    expect(third).toMatchObject({ ok: false, reason: 'busy' })
    release()
    expect(await a).toMatchObject({ ok: true })
    expect(await b).toMatchObject({ ok: true })
  })

  it('builds the core only once for concurrent sketches', async () => {
    const f = fake()
    const c = make(f.run, { concurrency: 2 })
    await Promise.all([c.compile('void setup(){}\nvoid loop(){} // 1\n'), c.compile('void setup(){}\nvoid loop(){} // 2\n')])
    expect(f.calls.filter((x) => x === 'avr-ar')).toHaveLength(1)
  })
})

describe('parseSize', () => {
  it('adds text and data for flash, data and bss for RAM', () => {
    expect(parseSize('text data bss dec hex filename\n 4000 272 200 4472 1178 x.elf\n')).toMatchObject({ flash: 4272, ram: 472 })
  })
  it('survives garbage', () => {
    expect(parseSize('')).toMatchObject({ flash: 0, ram: 0 })
  })
})

describe('assemble', () => {
  it('starts with the Arduino header and maps lines back to the sketch', () => {
    const out = assemble('void setup() {}\nvoid loop() {}\n')
    expect(out.startsWith('#include <Arduino.h>\n#line 1 "sketch.ino"\n')).toBe(true)
  })
})
