import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  /** The Arduino AVR platform used to compile sketches. */
  COMPILE_AVR_DIR: z.string().default('/usr/share/arduino/hardware/arduino/avr'),
  COMPILE_CACHE_DIR: z.string().default(join(tmpdir(), 'iot-designer-compile')),
  COMPILE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(20_000),
  COMPILE_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  /** Compile requests allowed per client per minute. */
  COMPILE_RATE_LIMIT: z.coerce.number().int().min(1).max(10_000).default(30),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Optional so the API can start (and be tested) without a database. */
  DATABASE_URL: z
    .string()
    .url()
    .refine((u) => /^postgres(ql)?:\/\//.test(u), 'must be a postgres:// URL')
    .optional(),
})

export type Config = z.infer<typeof schema>

/** Reads and validates the environment. Throws one readable error listing every problem. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // An empty value (for example `DATABASE_URL=` in a .env file) means "not set".
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ''))
  const result = schema.safeParse(cleaned)
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`)
    throw new Error(`Invalid environment: ${problems.join('; ')}`)
  }
  return result.data
}
