import { useEffect } from 'react'

/* ── Toast ──────────────────────────────────────────── */
export function Toast({ msg, type = 'ok', onClose }) {
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(onClose, 4500)
    return () => clearTimeout(t)
  }, [msg])
  if (!msg) return null
  const C = {
    ok:    { bg: '#f0fdf4', bd: '#86efac', fg: '#166534', icon: '✓' },
    error: { bg: '#fef2f2', bd: '#fca5a5', fg: '#991b1b', icon: '✕' },
    warn:  { bg: '#fffbeb', bd: '#fde68a', fg: '#92400e', icon: '⚠' },
  }
  const c = C[type] || C.ok
  return (
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 500,
      background: c.bg, border: `1px solid ${c.bd}`, color: c.fg,
      padding: '12px 18px', borderRadius: 10,
      boxShadow: '0 4px 16px rgba(0,0,0,.12)',
      display: 'flex', alignItems: 'center', gap: 10,
      fontSize: 14, fontWeight: 500, maxWidth: 400,
      animation: 'slideUp .2s ease',
    }}>
      <span style={{ fontWeight: 700, fontSize: 16 }}>{c.icon}</span>
      <span style={{ flex: 1 }}>{msg}</span>
      <button onClick={onClose} style={{
        background: 'none', border: 'none', color: c.fg,
        cursor: 'pointer', padding: 0, margin: 0,
        width: 'auto', fontSize: 16, opacity: .6,
      }}>✕</button>
    </div>
  )
}

export function useToast() {
  const [toast, setToast] = window.__toastState || [null, () => {}]
  return toast
}

/* ── EmptyState ─────────────────────────────────────── */
export function EmptyState({ icon = '📭', text = 'Sin datos', sub }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <p>{text}</p>
      {sub && <small style={{ color: 'var(--muted)', fontSize: 12 }}>{sub}</small>}
    </div>
  )
}

/* ── StatusBadge ────────────────────────────────────── */
const STATUS_MAP = {
  pending:   { label: 'Pendiente',  color: '#b45309', bg: '#fffbeb' },
  delivered: { label: 'Entregado',  color: '#059669', bg: '#ecfdf5' },
  received:  { label: 'Recibida',   color: '#059669', bg: '#ecfdf5' },
  paid:      { label: 'Pagado',     color: '#2563eb', bg: '#eff6ff' },
  active:    { label: 'Activo',     color: '#059669', bg: '#ecfdf5' },
  inactive:  { label: 'Inactivo',   color: '#dc2626', bg: '#fef2f2' },
  cancelled: { label: 'Cancelado',  color: '#dc2626', bg: '#fef2f2' },
  draft:     { label: 'Borrador',   color: '#6b7280', bg: '#f3f4f6' },
  open:      { label: 'Abierta',    color: '#b45309', bg: '#fffbeb' },
}

export function StatusBadge({ status, label }) {
  const s = STATUS_MAP[status] || { label: label || status, color: 'var(--muted)', bg: 'var(--surface-2)' }
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 20,
      fontSize: 12, fontWeight: 600, background: s.bg, color: s.color,
      border: `1px solid ${s.bg}`,
    }}>{s.label}</span>
  )
}

/* ── ActiveBadge ─────────────────────────────────────── */
export function ActiveBadge({ active, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '4px 11px', borderRadius: 20, border: 'none',
        cursor: onClick && !disabled ? 'pointer' : 'default',
        fontWeight: 700, fontSize: 11,
        background: active ? '#dcfce7' : 'var(--surface-2)',
        color: active ? '#15803d' : 'var(--muted)',
      }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? '#16a34a' : '#9ca3af', flexShrink: 0 }} />
      {active ? 'Activo' : 'Inactivo'}
    </button>
  )
}

/* ── TabBar ─────────────────────────────────────────── */
export function TabBar({ tabs, active, onChange }) {
  return (
    <div className="vtab-bar">
      {tabs.map(t => (
        <button key={t.id}
          className={`vtab-btn ${active === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}>
          {t.icon && <span className="vtab-icon">{t.icon}</span>}
          <span className="vtab-label">{t.label}</span>
        </button>
      ))}
    </div>
  )
}

/* ── PageHeader ─────────────────────────────────────── */
export function PageHeader({ title, children }) {
  return (
    <div className="section-header" style={{ marginBottom: 20 }}>
      <h2 className="section-title">{title}</h2>
      {children && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{children}</div>}
    </div>
  )
}

/* ── ActionBtn ──────────────────────────────────────── */
export function ActionBtn({ onClick, variant = 'ghost', children, disabled }) {
  return (
    <button className={`action-btn action-btn-${variant}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

/* ── FormCard ───────────────────────────────────────── */
export function FormCard({ title, onSubmit, children, style }) {
  return (
    <form className="form-card" onSubmit={onSubmit} style={style}>
      {title && <h3 className="form-card-title">{title}</h3>}
      {children}
    </form>
  )
}

/* ── Field ──────────────────────────────────────────── */
export function Field({ label, children, row }) {
  return (
    <div className={row ? 'form-row' : 'form-field'}>
      {label && <label>{label}</label>}
      {children}
    </div>
  )
}

/* ── SectionCard ────────────────────────────────────── */
export function SectionCard({ title, action, children, style }) {
  return (
    <div className="section-card" style={style}>
      {(title || action) && (
        <div className="section-card-header">
          {title && <h3 className="section-card-title">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}
