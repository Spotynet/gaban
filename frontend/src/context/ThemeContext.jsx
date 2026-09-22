import { createContext, useContext, useEffect, useState } from 'react'
import { api, getToken } from '../api/client.js'

export const THEMES = [
  { id: 'indigo', name: 'Índigo', color: '#4f46e5' },
  { id: 'blue', name: 'Azul', color: '#2563eb' },
  { id: 'emerald', name: 'Esmeralda', color: '#059669' },
  { id: 'teal', name: 'Turquesa', color: '#0d9488' },
  { id: 'violet', name: 'Violeta', color: '#7c3aed' },
  { id: 'rose', name: 'Rosa', color: '#e11d48' },
  { id: 'amber', name: 'Ámbar', color: '#d97706' },
  { id: 'slate', name: 'Pizarra', color: '#475569' },
]

const ThemeContext = createContext(null)
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(localStorage.getItem('gaban_mode') || 'system')   // light | dark | system
  const [theme, setTheme] = useState(localStorage.getItem('gaban_theme') || 'indigo')

  // Aplica el tono de color
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('gaban_theme', theme)
  }, [theme])

  // Aplica el modo (resuelve "system" con la preferencia del dispositivo)
  useEffect(() => {
    localStorage.setItem('gaban_mode', mode)
    const apply = () => {
      const resolved = mode === 'system' ? (media().matches ? 'dark' : 'light') : mode
      document.documentElement.dataset.mode = resolved
    }
    apply()
    if (mode === 'system') {
      const m = media()
      m.addEventListener('change', apply)
      return () => m.removeEventListener('change', apply)
    }
  }, [mode])

  // Al iniciar sesión: trae el tema de la empresa y el modo guardado del usuario (servidor)
  function loadFromServer() {
    if (!getToken()) return
    api.uiConfig().then(c => c?.theme && setTheme(c.theme)).catch(() => {})
    api.prefs().then(p => p?.mode && setMode(p.mode)).catch(() => {})
  }

  useEffect(() => {
    loadFromServer()
    window.addEventListener('gaban-login', loadFromServer)
    return () => window.removeEventListener('gaban-login', loadFromServer)
  }, [])

  // El usuario cambia su modo: local + servidor (para que lo siga entre dispositivos)
  async function chooseMode(m) {
    setMode(m)
    if (getToken()) { try { await api.savePrefs(m) } catch {} }
  }

  // El admin guarda el tema para toda la empresa
  async function saveTheme(t) {
    setTheme(t)
    try { await api.saveUiConfig(t) } catch {}
  }

  return (
    <ThemeContext.Provider value={{ mode, setMode, chooseMode, theme, setTheme, saveTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
