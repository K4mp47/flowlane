import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'

type Theme = 'light' | 'dark'
export type Palette = 'red' | 'green' | 'blue' | 'orange' | 'purple' | 'yellow' | 'cyan' | 'teal' | 'lime' | 'pink' | 'indigo' | 'rose'

interface ThemeContextValue {
  theme: Theme
  palette: Palette
  toggleTheme: () => void
  setPalette: (palette: Palette) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const palettes = new Set<Palette>(['red', 'green', 'blue', 'orange', 'purple', 'yellow', 'cyan', 'teal', 'lime', 'pink', 'indigo', 'rose'])

function getInitialTheme(): Theme {
  const saved = window.localStorage.getItem('flowlane-theme')
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getInitialPalette(): Palette {
  const saved = window.localStorage.getItem('flowlane-palette') as Palette | null
  return saved && palettes.has(saved) ? saved : 'red'
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [palette, setPalette] = useState<Palette>(getInitialPalette)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('flowlane-theme', theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.palette = palette
    window.localStorage.setItem('flowlane-palette', palette)
  }, [palette])

  const value = useMemo(() => ({
    theme,
    palette,
    toggleTheme: () => setTheme((current) => current === 'dark' ? 'light' : 'dark'),
    setPalette,
  }), [palette, theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside ThemeProvider')
  return context
}
