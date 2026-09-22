import { useTheme, THEMES } from '../context/ThemeContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const MODES = [
  { id: 'light',  icon: '☀️', label: 'Claro',   desc: 'Siempre en tema claro' },
  { id: 'dark',   icon: '🌙', label: 'Oscuro',  desc: 'Siempre en tema oscuro' },
  { id: 'system', icon: '💻', label: 'Sistema', desc: 'Sigue la preferencia del dispositivo' },
]

export default function Apariencia() {
  const { mode, chooseMode, theme, saveTheme } = useTheme()
  const { role } = useAuth()
  const isAdmin = role === 'ADMINISTRADOR' || role === 'TENANT_ADMIN'

  return (
    <div className="module-root">
      <p className="muted" style={{ marginTop: -8, marginBottom: 24, fontSize: 13 }}>
        El modo de color se guarda en tu cuenta y te sigue entre dispositivos.
        {isAdmin ? ' El tono de color aplica a toda la empresa.' : ' El tono de color lo define el administrador.'}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Modo de color */}
          <div className="section-card">
            <div className="section-card-header"><h3 className="section-card-title">Modo de color</h3></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0' }}>
              {MODES.map(m => (
                <button key={m.id} onClick={() => chooseMode(m.id)}
                  style={{
                    margin: 0, textAlign: 'left', padding: '14px 16px',
                    display: 'flex', alignItems: 'center', gap: 14,
                    background: mode === m.id ? 'var(--brand-soft)' : 'var(--surface-2)',
                    color: mode === m.id ? 'var(--brand)' : 'var(--text)',
                    border: mode === m.id ? '2px solid var(--brand)' : '1.5px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    transition: 'all var(--transition)',
                    width: '100%',
                  }}>
                  <span style={{ fontSize: 22 }}>{m.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{m.label}</div>
                    <div style={{ fontSize: 12, opacity: .75, marginTop: 2 }}>{m.desc}</div>
                  </div>
                  {mode === m.id && <span style={{ fontSize: 18, fontWeight: 700 }}>✓</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Tono de color */}
          <div className="section-card">
            <div className="section-card-header">
              <h3 className="section-card-title">Tono de color</h3>
              {!isAdmin && <span className="muted" style={{ fontSize: 12 }}>Solo el admin puede cambiar esto</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: '4px 0' }}>
              {THEMES.map(t => (
                <button key={t.id} disabled={!isAdmin} onClick={() => isAdmin && saveTheme(t.id)}
                  style={{
                    margin: 0, padding: '12px 8px', cursor: isAdmin ? 'pointer' : 'default',
                    background: theme === t.id ? 'var(--brand-soft)' : 'var(--surface-2)',
                    border: theme === t.id ? `2px solid ${t.color}` : '1.5px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    opacity: isAdmin ? 1 : .55,
                    transition: 'all var(--transition)',
                  }}>
                  <span style={{ display: 'block', width: 28, height: 28, borderRadius: '50%', background: t.color, boxShadow: theme === t.id ? `0 0 0 3px ${t.color}40` : 'none', transition: 'box-shadow .2s' }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: theme === t.id ? t.color : 'var(--text-2)' }}>{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Vista previa */}
        <div className="section-card">
          <div className="section-card-header"><h3 className="section-card-title">Vista previa en vivo</h3></div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', minHeight: 280 }}>
            <div style={{ display: 'flex', minHeight: 280 }}>
              {/* Mini sidebar */}
              <div style={{ width: 110, background: 'var(--sidebar-bg)', padding: 12, fontSize: 11, flexShrink: 0 }}>
                <div style={{ color: '#fff', fontWeight: 800, marginBottom: 14, fontSize: 14 }}>GabAn <span style={{ color: 'var(--brand-light)', fontSize: 10 }}>POS</span></div>
                {['Ventas','Inventario','Compras','Contabilidad'].map((l, i) => (
                  <div key={l} style={{
                    padding: '6px 8px', borderRadius: 6, marginBottom: 3, fontSize: 12,
                    background: i === 0 ? 'var(--sidebar-active-bg)' : 'transparent',
                    color: i === 0 ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)',
                  }}>{l}</div>
                ))}
              </div>
              {/* Mini content */}
              <div style={{ flex: 1, background: 'var(--bg)', padding: 14 }}>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 10 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6, fontSize: 13 }}>
                    Tarjeta <span style={{ display: 'inline-block', background: 'var(--brand-soft)', color: 'var(--brand)', padding: '1px 7px', borderRadius: 12, fontSize: 11 }}>badge</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>Texto secundario de muestra.</div>
                  <div style={{ marginTop: 8, background: 'var(--brand)', color: '#fff', padding: '6px 12px', borderRadius: 6, display: 'inline-block', fontSize: 12, fontWeight: 600 }}>Botón</div>
                </div>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', fontSize: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'var(--th-bg)', padding: '6px 10px', color: 'var(--muted)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    <span>Producto</span><span>Precio</span>
                  </div>
                  {[['Tenis Nike', '$1,299'],['Camisa slim', '$499'],['Bolso cuero', '$899']].map(([n, p]) => (
                    <div key={n} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '6px 10px', borderTop: '1px solid var(--border)', color: 'var(--text)' }}>
                      <span>{n}</span><span style={{ fontWeight: 600, color: 'var(--brand)' }}>{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 10, textAlign: 'center' }}>
            Modo: <strong>{mode}</strong> · Tono: <strong>{theme}</strong>
          </p>
        </div>
      </div>
    </div>
  )
}
