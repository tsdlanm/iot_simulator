import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'

describe('loadConfig', () => {
  it('has sensible defaults', () => {
    expect(loadConfig({})).toMatchObject({
      NODE_ENV: 'development',
      PORT: 8080,
      COMPILE_AVR_DIR: '/usr/share/arduino/hardware/arduino/avr',
      COMPILE_TIMEOUT_MS: 20_000,
      COMPILE_CONCURRENCY: 2,
      COMPILE_RATE_LIMIT: 30,
      TRUST_PROXY: false,
    })
  })

  it('reads the compile settings and rejects nonsense for them', () => {
    expect(loadConfig({ COMPILE_CONCURRENCY: '4', COMPILE_TIMEOUT_MS: '5000', TRUST_PROXY: 'true' })).toMatchObject({ COMPILE_CONCURRENCY: 4, COMPILE_TIMEOUT_MS: 5000, TRUST_PROXY: true })
    expect(() => loadConfig({ COMPILE_CONCURRENCY: '0' })).toThrow(/COMPILE_CONCURRENCY/)
    expect(() => loadConfig({ COMPILE_TIMEOUT_MS: '10' })).toThrow(/COMPILE_TIMEOUT_MS/)
    expect(() => loadConfig({ TRUST_PROXY: 'yes' })).toThrow(/TRUST_PROXY/)
  })

  it('reads the port and database url', () => {
    const c = loadConfig({ PORT: '3000', DATABASE_URL: 'postgres://u:p@localhost:5432/db', NODE_ENV: 'production' })
    expect(c).toMatchObject({ PORT: 3000, NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@localhost:5432/db' })
  })

  it('treats an empty value as not set', () => {
    expect(loadConfig({ DATABASE_URL: '', PORT: '' })).toMatchObject({ NODE_ENV: 'development', PORT: 8080 })
    expect(loadConfig({ DATABASE_URL: '' })).not.toHaveProperty('DATABASE_URL')
  })

  it('rejects a bad port and says which variable is wrong', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/)
    expect(() => loadConfig({ PORT: '70000' })).toThrow(/PORT/)
    expect(() => loadConfig({ PORT: '0' })).toThrow(/PORT/)
  })

  it('rejects a database url that is not postgres', () => {
    expect(() => loadConfig({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(/DATABASE_URL/)
    expect(() => loadConfig({ DATABASE_URL: 'not a url' })).toThrow(/DATABASE_URL/)
  })

  it('lists every problem at once', () => {
    expect(() => loadConfig({ PORT: 'x', NODE_ENV: 'staging' })).toThrow(/PORT.*NODE_ENV|NODE_ENV.*PORT/)
  })
})
