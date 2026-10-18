import { create } from 'zustand'

const KEY = 'iot-designer:theme'

export type ThemeMode = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

export function resolveTheme(mode: ThemeMode, systemDark: boolean): Theme {
  return mode === 'system' ? (systemDark ? 'dark' : 'light') : mode
}

/** The mode a click on the toggle switches to: always the opposite of what is shown now. */
export const oppositeTheme = (shown: Theme): Theme => (shown === 'dark' ? 'light' : 'dark')

const prefersDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches

function storedMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

interface ThemeState {
  mode: ThemeMode
  /** What is actually shown: the mode with "system" resolved. */
  theme: Theme
  toggle: () => void
}

const initial = storedMode()

export const useTheme = create<ThemeState>((set, get) => ({
  mode: initial,
  theme: resolveTheme(initial, prefersDark()),
  toggle: () => {
    const next = oppositeTheme(get().theme)
    set({ mode: next, theme: next })
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // Without storage the choice only lasts for this visit.
    }
  },
}))

/** Applies the theme to <html> and keeps following the system setting until the user picks one. */
export function startTheme(): () => void {
  const apply = (theme: Theme) => {
    document.documentElement.dataset.theme = theme
  }
  apply(useTheme.getState().theme)
  const unsubscribe = useTheme.subscribe((s, prev) => {
    if (s.theme !== prev.theme) apply(s.theme)
  })

  const query = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
  const onSystemChange = () => {
    const { mode } = useTheme.getState()
    if (mode === 'system') useTheme.setState({ theme: resolveTheme('system', prefersDark()) })
  }
  query?.addEventListener('change', onSystemChange)
  return () => {
    unsubscribe()
    query?.removeEventListener('change', onSystemChange)
  }
}
