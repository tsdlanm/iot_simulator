import { getConnInfo } from '@hono/node-server/conninfo'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import type { CompileResult, Status } from '../compile/compiler.js'
import { MAX_SKETCH_BYTES } from '../compile/sanitize.js'
import type { RateLimiter } from '../rateLimit.js'

export interface CompilerLike {
  compile(code: string): Promise<CompileResult>
  status(): Promise<Status>
}

export interface CompileRouteOptions {
  compiler: CompilerLike
  limiter?: RateLimiter
  /** Believe X-Forwarded-For. Only turn this on behind a proxy you control, since clients can forge the header. */
  trustProxy?: boolean
}

const body = z.object({ code: z.string(), board: z.literal('uno').default('uno') })

function clientKey(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    if (forwarded) return forwarded
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown'
  } catch {
    return 'local' // no socket, for example when tests call the app directly
  }
}

export function compileRoutes({ compiler, limiter, trustProxy = false }: CompileRouteOptions) {
  const routes = new Hono()

  routes.get('/compile/status', async (c) => c.json(await compiler.status()))

  routes.post(
    '/compile',
    // A little above the sketch limit, to leave room for the JSON around it.
    bodyLimit({ maxSize: MAX_SKETCH_BYTES * 2, onError: (c) => c.json({ error: 'payload_too_large' }, 413) }),
    async (c) => {
      const key = clientKey(c, trustProxy)
      if (limiter && !limiter.take(key)) {
        c.header('Retry-After', String(limiter.retryAfter(key)))
        return c.json({ ok: false, reason: 'rate_limited', diagnostics: [], message: 'Terlalu banyak permintaan. Coba lagi sebentar lagi.' }, 429)
      }

      const parsed = body.safeParse(await c.req.json().catch(() => null))
      if (!parsed.success) return c.json({ error: 'bad_request' }, 400)

      const result = await compiler.compile(parsed.data.code)
      if (result.ok) return c.json(result)
      // Errors in the user's code are an expected answer (200). Problems with the service are not.
      if (result.reason === 'unavailable') return c.json(result, 503)
      if (result.reason === 'busy') {
        c.header('Retry-After', '5')
        return c.json(result, 429)
      }
      return c.json(result)
    },
  )

  return routes
}
