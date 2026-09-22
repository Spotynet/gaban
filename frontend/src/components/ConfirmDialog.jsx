import { useEffect } from 'react'
import { Ab } from './IconBtn.jsx'

/*
  Usage:
    <ConfirmDialog
      open={!!confirmState}
      title="Eliminar proveedor"
      message={`¿Estás seguro de eliminar "${confirmState?.name}"? Esta acción no se puede deshacer.`}
      confirmLabel="Eliminar"
      variant="danger"
      onConfirm={handleConfirm}
      onCancel={() => setConfirmState(null)}
    />
*/
export default function ConfirmDialog({ open, title, message, confirmLabel = 'Confirmar', variant = 'danger', onConfirm, onCancel, loading }) {
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onCancel?.() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        backdropFilter: 'blur(2px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onCancel?.() }}
    >
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '28px 28px 22px',
        maxWidth: 380,
        width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        animation: 'fadeInUp .15s ease',
      }}>
        {/* Icon */}
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: variant === 'danger' ? '#fef2f2' : 'var(--brand-soft)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 14,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={variant === 'danger' ? '#dc2626' : 'var(--brand)'}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 8 }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 22 }}>
          {message}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Ab label="Cancelar" variant="ghost" onClick={onCancel} />
          <Ab
            label={loading ? 'Eliminando…' : confirmLabel}
            icon={variant === 'danger' ? 'delete' : 'check'}
            variant={variant === 'danger' ? 'danger' : 'primary'}
            disabled={loading}
            onClick={onConfirm}
          />
        </div>
      </div>
    </div>
  )
}
