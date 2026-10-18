import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import type { CompileResult } from '../src/compile/compiler.js'
import { RateLimiter } from '../src/rateLimit.js'

const ok: CompileResult = { ok: true, hex: ':00000001FF\n', size: { flash: 1, ram: 1, flashMax: 2, ramMax: 2 }, cached: false }

function setup(result: CompileResult = ok, limiter?: RateLimiter) {
  const compile = vi.fn().mockResolvedValue(result)
  const status = vi.fn().mockResolvedValue({ available: true, toolchain: 'fake', boards: ['uno'] })
  const app = createApp({ compiler: { compile, status }, limiter })
  const post = (body: unknown, raw = false) =>
    app.request('/api/compile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ? (body as string) : JSON.stringify(body) })
  return { app, compile, post }
}

describe('POST /api/compile', () => {
  it('returns the firmware for a good sketch', async () => {
    const { post, compile } = setup()
    const res = await post({ code: 'void setup(){} void loop(){}' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, hex: ':00000001FF\n' })
    expect(compile).toHaveBeenCalledWith('void setup(){} void loop(){}')
  })

  it('answers errors in the sketch with 200 so the editor can show them', async () => {
    const { post } = setup({ ok: false, reason: 'compile', diagnostics: [{ line: 3, severity: 'error', message: 'x' }] })
    const res = await post({ code: 'x' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: false, reason: 'compile' })
  })

  it('maps service problems to 503 and busy to 429 with Retry-After', async () => {
    expect((await setup({ ok: false, reason: 'unavailable', diagnostics: [] }).post({ code: 'x' })).status).toBe(503)
    const busy = await setup({ ok: false, reason: 'busy', diagnostics: [] }).post({ code: 'x' })
    expect(busy.status).toBe(429)
    expect(busy.headers.get('retry-after')).toBe('5')
  })

  it('rejects malformed bodies with 400', async () => {
    const { post, compile } = setup()
    expect((await post('not json', true)).status).toBe(400)
    expect((await post({ code: 5 })).status).toBe(400)
    expect((await post({ code: 'x', board: 'esp32' })).status).toBe(400)
    expect(compile).not.toHaveBeenCalled()
  })

  it('rejects oversized bodies with 413', async () => {
    const { post, compile } = setup()
    const res = await post({ code: 'a'.repeat(200 * 1024) })
    expect(res.status).toBe(413)
    expect(compile).not.toHaveBeenCalled()
  })

  it('rate limits per client', async () => {
    const { post, compile } = setup(ok, new RateLimiter(2, 60_000))
    expect((await post({ code: 'x' })).status).toBe(200)
    expect((await post({ code: 'x' })).status).toBe(200)
    const res = await post({ code: 'x' })
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBeTruthy()
    expect(compile).toHaveBeenCalledTimes(2)
  })
})

describe('GET /api/compile/status', () => {
  it('reports the toolchain', async () => {
    const res = await setup().app.request('/api/compile/status')
    expect(await res.json()).toMatchObject({ available: true, boards: ['uno'] })
  })
})
