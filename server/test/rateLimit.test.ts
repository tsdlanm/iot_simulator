import { describe, expect, it } from 'vitest'
import { RateLimiter } from '../src/rateLimit.js'

describe('RateLimiter', () => {
  it('allows up to max per window, then refuses', () => {
    let t = 0
    const l = new RateLimiter(2, 1000, () => t)
    expect(l.take('a')).toBe(true)
    expect(l.take('a')).toBe(true)
    expect(l.take('a')).toBe(false)
  })

  it('counts each key separately', () => {
    const l = new RateLimiter(1, 1000, () => 0)
    expect(l.take('a')).toBe(true)
    expect(l.take('b')).toBe(true)
    expect(l.take('a')).toBe(false)
  })

  it('lets a key back in once the window has passed', () => {
    let t = 0
    const l = new RateLimiter(1, 1000, () => t)
    l.take('a')
    t = 999
    expect(l.take('a')).toBe(false)
    t = 1000
    expect(l.take('a')).toBe(true)
  })

  it('tells how long to wait, at least one second', () => {
    let t = 0
    const l = new RateLimiter(1, 10_000, () => t)
    l.take('a')
    t = 2500
    expect(l.retryAfter('a')).toBe(8)
    expect(l.retryAfter('unknown')).toBe(1)
  })
})
