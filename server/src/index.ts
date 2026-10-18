import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { Compiler } from './compile/compiler.js'
import { createPool } from './db/client.js'
import { RateLimiter } from './rateLimit.js'

function readConfig() {
  try {
    return loadConfig()
  } catch (err) {
    // One readable line instead of a stack trace: this is a setup mistake, not a crash.
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

const config = readConfig()
const pool = config.DATABASE_URL ? createPool(config.DATABASE_URL) : undefined
const compiler = new Compiler({
  avrDir: config.COMPILE_AVR_DIR,
  cacheDir: config.COMPILE_CACHE_DIR,
  timeoutMs: config.COMPILE_TIMEOUT_MS,
  concurrency: config.COMPILE_CONCURRENCY,
})
const app = createApp({ pool, compiler, limiter: new RateLimiter(config.COMPILE_RATE_LIMIT, 60_000), trustProxy: config.TRUST_PROXY })

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`listening on :${info.port} (${config.NODE_ENV}, database ${pool ? 'configured' : 'not configured'})`)
})

// Finish in-flight requests and release database connections on Ctrl+C or a platform stop.
function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`)
  server.close(() => {
    void (pool?.end() ?? Promise.resolve()).finally(() => process.exit(0))
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
