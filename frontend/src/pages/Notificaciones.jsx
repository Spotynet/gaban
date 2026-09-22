import { useEffect, useState } from 'react'
import { api } from '../api/client.js'

const SEV = {
  critical: { bg: '#fef2f2', bd: '#fca5a5', fg: '#dc2626', icon: '🚨', label: 'Crítico' },
  warning:  { bg: '#fffbeb', bd: '#fde68a', fg: '#b45309', icon: '⚠️', label: 'Advertencia' },
  info:     { bg: '#eff6ff', bd: '#bfdbfe', fg: '#1d4ed8', icon: 'ℹ️', label: 'Info' },
}

export default function Notificaciones() {
  const [data, setData]     = useState({ total: 0, alerts: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')

  async function load() {
    setLoading(true); setError('')
    try { setData(await api.notificaciones()) } catch (e) { setError(e.message) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const criticals = data.alerts.filter(a => a.severity === 'critical').length
  const warnings  = data.alerts.filter(a => a.severity === 'warning').length

  return (
    <div className="module-root">
      <div className="module-header">
        <button className="action-btn action-btn-ghost" onClick={load}>↻ Actualizar</button>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Resumen */}
      {!loading && data.total > 0 && (
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          <div className="kpi">
            <div className="label">Total alertas</div>
            <div className="value" style={{ color: 'var(--brand)' }}>{data.total}</div>
          </div>
          {criticals > 0 && (
            <div className="kpi">
              <div className="label">Críticas</div>
              <div className="value" style={{ color: '#dc2626' }}>{criticals}</div>
            </div>
          )}
          {warnings > 0 && (
            <div className="kpi">
              <div className="label">Advertencias</div>
              <div className="value" style={{ color: '#b45309' }}>{warnings}</div>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted)', padding: 40 }}>
          <div className="loading-spinner" /> Cargando…
        </div>
      )}

      {!loading && data.alerts.length === 0 && (
        <div className="empty-state" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
          <div className="empty-state-icon">✅</div>
          <p style={{ color: '#059669' }}>Todo en orden. No hay alertas pendientes.</p>
        </div>
      )}

      <div className="alerts-grid">
        {data.alerts.map((a, i) => {
          const c = SEV[a.severity] || SEV.info
          return (
            <div key={i} className="alert-card" style={{ background: c.bg, borderColor: c.bd }}>
              <div className="alert-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{c.icon}</span>
                  <span className="badge" style={{ background: 'rgba(255,255,255,.8)', color: c.fg }}>{a.module}</span>
                </div>
                <span className="alert-severity" style={{ color: c.fg }}>{c.label}</span>
              </div>
              <div className="alert-title" style={{ color: c.fg }}>{a.title}</div>
              {a.detail && <div className="alert-detail">{a.detail}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
