import { afterEach, describe, expect, it, vi } from 'vitest'
import { oppositeTheme, resolveTheme } from './theme'

describe('resolveTheme', () => {
  it('follows the system only in system mode', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })
})

describe('oppositeTheme', () => {
  it('flips what is shown', () => {
    expect(oppositeTheme('dark')).toBe('light')
    expect(oppositeTheme('light')).toBe('dark')
  })
})

describe('the store', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  async function load(stored: string | null, systemDark: boolean) {
    const data = new Map<string, string>(stored ? [['iot-designer:theme', stored]] : [])
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    })
    vi.stubGlobal('matchMedia', () => ({ matches: systemDark, addEventListener() {}, removeEventListener() {} }))
    vi.resetModules()
    const mod = await import('./theme')
    return { ...mod, data }
  }

  it('starts from the system setting when nothing is saved', async () => {
    expect((await load(null, true)).useTheme.getState().theme).toBe('dark')
    expect((await load(null, false)).useTheme.getState().theme).toBe('light')
  })

  it('a saved choice beats the system setting', async () => {
    expect((await load('light', true)).useTheme.getState().theme).toBe('light')
    expect((await load('dark', false)).useTheme.getState().theme).toBe('dark')
  })

  it('ignores a corrupted saved value', async () => {
    const { useTheme } = await load('purple', false)
    expect(useTheme.getState()).toMatchObject({ mode: 'system', theme: 'light' })
  })

  it('toggling switches the shown theme and saves it', async () => {
    const { useTheme, data } = await load(null, true)
    useTheme.getState().toggle()
    expect(useTheme.getState()).toMatchObject({ mode: 'light', theme: 'light' })
    expect(data.get('iot-designer:theme')).toBe('light')
    useTheme.getState().toggle()
    expect(data.get('iot-designer:theme')).toBe('dark')
  })

  it('still works when storage throws', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    vi.resetModules()
    const { useTheme } = await import('./theme')
    expect(() => useTheme.getState().toggle()).not.toThrow()
    expect(useTheme.getState().theme).toBe('dark')
  })
})
