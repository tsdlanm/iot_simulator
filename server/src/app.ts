import { Hono } from 'hono'
import type { Pool } from './db/client.js'
import { compileRoutes, type CompilerLike } from './routes/compile.js'
import { healthRoutes } from './routes/health.js'
import type { RateLimiter } from './rateLimit.js'

export interface Deps {
  pool?: Pick<Pool, 'query'>
  compiler?: CompilerLike
  limiter?: RateLimiter
  trustProxy?: boolean
}

/** Builds the HTTP app. It owns no sockets, so tests call `app.request(...)` directly. */
export function createApp(deps: Deps = {}) {
  const app = new Hono()

  app.route('/api', healthRoutes(deps.pool))
  if (deps.compiler) app.route('/api', compileRoutes({ compiler: deps.compiler, limiter: deps.limiter, trustProxy: deps.trustProxy }))

  app.notFound((c) => c.json({ error: 'not_found' }, 404))
  app.onError((err, c) => {
    console.error(err)
    return c.json({ error: 'internal_error' }, 500)
  })

  return app
}
