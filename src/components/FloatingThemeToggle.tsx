import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../theme'

export function FloatingThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  return (
    <button className="floating-theme-toggle" type="button" onClick={toggleTheme} aria-label={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`}>
      {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  )
}
