'use client'

/**
 * ThemeToggle - alterna light/dark, persistindo em localStorage.
 * Aplica em <html data-theme="..."> pra ativar CSS vars.
 */

import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'psh-theme'

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  // Respeita preferência do SO se nunca escolheu
  const saved = window.localStorage.getItem(STORAGE_KEY) as Theme | null
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)
  window.localStorage.setItem(STORAGE_KEY, theme)
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const t = getInitialTheme()
    setTheme(t)
    applyTheme(t)
    setMounted(true)
  }, [])

  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    applyTheme(next)
  }

  // Evita flicker SSR
  if (!mounted) {
    return (
      <button
        aria-label="Alternar tema"
        style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'transparent', border: 'none',
          cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          color: 'var(--psh-text-secondary)', fontSize: '1.1em',
        }}
      >
        ☀️
      </button>
    )
  }

  return (
    <button
      onClick={toggle}
      title={theme === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro'}
      aria-label="Alternar tema"
      style={{
        width: 36, height: 36, borderRadius: '50%',
        background: 'transparent', border: 'none',
        cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: 'var(--psh-text-secondary)', fontSize: '1.1em',
        transition: 'transform 0.2s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--psh-hover-bg)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  )
}