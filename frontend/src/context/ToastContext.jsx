import { createContext, useContext, useState, useCallback } from 'react'

const ToastCtx = createContext(null)

const DURATIONS = { ok: 3500, error: 6000, warn: 5000, info: 4000 }

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  const notify = useCallback((msg, type = 'ok', opts = {}) => {
    const id = Date.now() + Math.random()
    const duration = opts.duration ?? DURATIONS[type] ?? 4000
    const title = opts.title ?? null
    setToasts(t => [...t.slice(-4), { id, msg, type, title }]) // máx 5 simultáneos
    setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  return (
    <ToastCtx.Provider value={notify}>
      {children}
      <ToastStack toasts={toasts} onClose={dismiss} />
    </ToastCtx.Provider>
  )
}

export const useNotify = () => useContext(ToastCtx)

/* ── Stack renderer ─────────────────────────────────────────────────── */
const STYLES = {
  ok:    { bg: '#f0fdf4', bd: '#86efac', fg: '#166534', icon: '✓' },
  error: { bg: '#fef2f2', bd: '#fca5a5', fg: '#991b1b', icon: '✕' },
  warn:  { bg: '#fffbeb', bd: '#fde68a', fg: '#92400e', icon: '⚠' },
  info:  { bg: '#eff6ff', bd: '#bfdbfe', fg: '#1e40af', icon: 'ℹ' },
}

function ToastStack({ toasts, onClose }) {
  if (!toasts.length) return null
  return (
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 9000,
      display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'none',
    }}>
      {toasts.map(t => {
        const c = STYLES[t.type] || STYLES.ok
        return (
          <div key={t.id} style={{
            background: c.bg, border: `1px solid ${c.bd}`, color: c.fg,
            padding: '10px 16px', borderRadius: 10,
            boxShadow: '0 4px 20px rgba(0,0,0,.13)',
            display: 'flex', alignItems: 'flex-start', gap: 10,
            fontSize: 13, fontWeight: 500, maxWidth: 420, minWidth: 260,
            animation: 'slideUp .2s ease',
            pointerEvents: 'all',
          }}>
            <span style={{ fontWeight: 700, fontSize: 15, flexShrink: 0, lineHeight: 1.4 }}>{c.icon}</span>
            <div style={{ flex: 1 }}>
              {t.title && <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{t.title}</div>}
              <div style={{ lineHeight: 1.4 }}>{t.msg}</div>
            </div>
            <button onClick={() => onClose(t.id)} style={{
              background: 'none', border: 'none', color: c.fg,
              cursor: 'pointer', padding: 0, fontSize: 15, opacity: .5,
              lineHeight: 1, flexShrink: 0, marginTop: 1,
            }}>✕</button>
          </div>
        )
      })}
    </div>
  )
}
