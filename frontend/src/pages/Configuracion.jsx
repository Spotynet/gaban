import { useEffect, useState, useId, useRef } from 'react'
import { api } from '../api/client.js'
import { useAuth } from '../context/AuthContext.jsx'
import { TabBar, ActiveBadge } from '../components/ui.jsx'
import { useNotify } from '../context/ToastContext.jsx'
import { getCountryConfig } from '../data/countryAddress.js'
import { formatMoney, getCurrencyConfig } from '../utils/currency.js'
import { Ib, Ab } from '../components/IconBtn.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

const TABS = [
  { id: 'general',    label: 'General',      icon: '🏢' },
  { id: 'pos',        label: 'Ventas / POS', icon: '🛒' },
  { id: 'inventario', label: 'Inventario',   icon: '📦' },
  { id: 'compras',    label: 'Compras',      icon: '🧾' },
  { id: 'fiscal',     label: 'Fiscal',       icon: '📑' },
  { id: 'productos',  label: 'Productos',    icon: '🏷️' },
  { id: 'usuarios',   label: 'Usuarios',     icon: '👤' },
  { id: 'roles',      label: 'Roles',        icon: '🔑' },
  { id: 'impresora',  label: 'Impresora',    icon: '🖨️' },
  { id: 'seguridad',  label: 'Seguridad',    icon: '🔒' },
]

const CURRENCIES = ['COP', 'MXN', 'USD', 'EUR', 'PEN', 'CLP', 'ARS', 'BOB', 'PYG', 'UYU']

const ALL_PAY_METHODS = [
  { id: 'efectivo',        label: 'Efectivo',      icon: '💵' },
  { id: 'tarjeta_credito', label: 'Tarjeta Crédito', icon: '💳' },
  { id: 'tarjeta_debito',  label: 'Tarjeta Débito', icon: '🏧' },
  { id: 'transferencia',   label: 'Transferencia',  icon: '📲' },
  { id: 'cheque',          label: 'Cheque',         icon: '📄' },
]

function Toggle({ value, onChange, disabled }) {
  return (
    <button type="button" disabled={disabled} onClick={() => !disabled && onChange(!value)}
      style={{
        position: 'relative', width: 44, height: 24, borderRadius: 12, border: 'none',
        background: value ? 'var(--brand)' : 'var(--border)',
        cursor: disabled ? 'default' : 'pointer', transition: 'background .2s', flexShrink: 0,
        padding: 0, margin: 0,
      }}>
      <span style={{
        position: 'absolute', top: 3, left: value ? 23 : 3,
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,.25)',
      }} />
    </button>
  )
}

function Row({ label, hint, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border)', gap: 16 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  )
}

function FieldRow({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>{label}</label>
      {hint && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 5 }}>{hint}</div>}
      {children}
    </div>
  )
}

/* BarcodeCfg — sección de códigos de barras en tab Inventario */
const BARCODE_TYPES = [
  {
    id: 'ean13',
    label: 'EAN-13',
    icon: '🌐',
    desc: 'Estándar internacional para retail y distribución comercial. 13 dígitos con prefijo de empresa GS1. Compatible con todos los lectores del mercado.',
    recommended: ['Productos físicos de consumo', 'Retail y supermercados', 'Distribución comercial', 'Calzado y moda con tallas'],
    color: '#1d4ed8',
    bg: '#eff6ff',
    border: '#bfdbfe',
  },
  {
    id: 'code128',
    label: 'Code 128',
    icon: '🏭',
    desc: 'Alfanumérico de longitud variable. Ideal para uso interno y logística. No requiere registro GS1. Alta densidad de información.',
    recommended: ['Insumos y materias primas', 'Productos industriales B2B', 'Almacenes y bodegas', 'Activos fijos de la empresa'],
    color: '#7c3aed',
    bg: '#f5f3ff',
    border: '#ddd6fe',
  },
  {
    id: 'qr',
    label: 'QR Code',
    icon: '📱',
    desc: 'Código 2D de alta capacidad. Legible con smartphones sin lector especializado. Permite incluir URLs, lotes, fechas de vencimiento.',
    recommended: ['Productos con trazabilidad especial', 'Farmacéuticos y alimentos', 'Productos con fecha de expiración', 'Marketing y catálogos digitales'],
    color: '#15803d',
    bg: '#f0fdf4',
    border: '#86efac',
  },
]

function BarcodeCfg({ inv, set, isAdmin, isMaster }) {
  const bc = inv.barcode || {}
  const enabled = !!bc.enabled
  const [gs1List, setGs1List] = useState([])

  useEffect(() => {
    api.gs1Prefixes().then(setGs1List).catch(() => {})
  }, [])

  function setBc(k, v) {
    set('inventario', 'barcode', { ...bc, [k]: v })
  }

  // Calcula la estructura del EAN-13 estructurado
  function ean13Preview() {
    const country = (bc.ean13_country || '770').replace(/\D/g, '').slice(0, 3).padEnd(3, '0')
    const company = (bc.ean13_company || '0000').replace(/\D/g, '').padStart(4, '0').slice(0, 4)
    const varDig = bc.ean13_variant_digits || 2
    const prodDig = 12 - country.length - company.length - varDig
    const prodPart = '0'.repeat(Math.max(prodDig, 1))
    const varPart  = '0'.repeat(varDig)
    const body12   = (country + company + prodPart + varPart).slice(0, 12)
    // check digit
    const digits   = body12.split('').map(Number)
    const sum      = digits.reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 1 : 3), 0)
    const check    = (10 - (sum % 10)) % 10
    return { country, company, prodDig, varDig, example: body12 + check }
  }

  return (
    <div className="section-card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header con toggle maestro */}
      <div style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: enabled ? '1px solid var(--border)' : 'none' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>🔖 Gestión de códigos de barras</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
            Activa la identificación de productos por código de barras en inventarios, creación de productos y punto de venta
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {enabled && <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '2px 10px', borderRadius: 12, border: '1px solid #86efac' }}>Activo</span>}
          <Toggle value={enabled} disabled={!isAdmin || isMaster} onChange={v => setBc('enabled', v)} />
        </div>
      </div>

      {enabled && (
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* Módulos donde aplica */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>Módulos habilitados</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { k: 'module_products',   label: 'Creación de productos',  icon: '📦', desc: 'Asignar/generar código en el paso 5 del asistente' },
                { k: 'module_inventory',  label: 'Inventarios',            icon: '🗃️',  desc: 'Lectura para ajustes, traslados y recepción de compras' },
                { k: 'module_sales',      label: 'Punto de venta',         icon: '🛒', desc: 'Escanear para agregar productos a la venta' },
              ].map(m => {
                const active = bc[m.k] !== false
                return (
                  <button key={m.k} type="button" disabled={!isAdmin || isMaster}
                    onClick={() => setBc(m.k, !active)}
                    style={{
                      padding: '12px 14px', borderRadius: 10, cursor: (!isAdmin || isMaster) ? 'default' : 'pointer', textAlign: 'left',
                      border: `2px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
                      background: active ? 'var(--brand-soft)' : 'var(--surface-2)',
                      transition: 'all .15s',
                    }}>
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{m.icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: active ? 'var(--brand)' : 'var(--text)', marginBottom: 3 }}>{m.label}</div>
                    <div style={{ fontSize: 11, color: active ? 'var(--brand)' : 'var(--muted)', lineHeight: 1.4 }}>{m.desc}</div>
                    {active && <div style={{ marginTop: 8, fontSize: 11, fontWeight: 800, color: 'var(--brand)' }}>✓ Activo</div>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Tipo de código predeterminado */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Tipo de código predeterminado</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
              Se aplicará en la creación de nuevos productos. Puede cambiarse por producto individualmente.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {BARCODE_TYPES.map(bt => {
                const sel = (bc.default_type || 'ean13') === bt.id
                return (
                  <button key={bt.id} type="button" disabled={!isAdmin || isMaster}
                    onClick={() => setBc('default_type', bt.id)}
                    style={{
                      padding: '16px 14px', borderRadius: 12, cursor: (!isAdmin || isMaster) ? 'default' : 'pointer', textAlign: 'left',
                      border: `2px solid ${sel ? bt.color : 'var(--border)'}`,
                      background: sel ? bt.bg : 'var(--surface)',
                      transition: 'all .15s',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 24 }}>{bt.icon}</span>
                      {sel && <span style={{ fontSize: 10, fontWeight: 800, color: bt.color, background: bt.bg, border: `1px solid ${bt.border}`, padding: '2px 8px', borderRadius: 10 }}>SELECCIONADO</span>}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: sel ? bt.color : 'var(--text)', marginBottom: 5 }}>{bt.label}</div>
                    <div style={{ fontSize: 11, color: sel ? bt.color : 'var(--muted)', lineHeight: 1.5, marginBottom: 10 }}>{bt.desc}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Recomendado para:</div>
                    <ul style={{ margin: 0, padding: '0 0 0 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {bt.recommended.map(r => (
                        <li key={r} style={{ fontSize: 11, color: sel ? bt.color : 'var(--text-2)' }}>{r}</li>
                      ))}
                    </ul>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Configuración EAN-13 estructurado */}
          {(bc.default_type || 'ean13') === 'ean13' && (() => {
            const prev = ean13Preview()
            const cinfo = gs1List.find(g => g.prefix === (bc.ean13_country || '770'))
            return (
              <div style={{ padding: '16px 18px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8', marginBottom: 4 }}>⚙️ Configuración EAN-13 — Estructura internacional GS1</div>
                <div style={{ fontSize: 12, color: '#1d4ed8', marginBottom: 14, lineHeight: 1.5 }}>
                  Estructura de 13 dígitos conforme al estándar GS1 internacional: <strong>Prefijo país</strong> + <strong>Código empresa</strong> + <strong>Secuencia producto</strong> + <strong>Secuencia variante</strong> + <strong>Dígito verificador</strong>.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '12px 16px', alignItems: 'start' }}>

                  {/* País / prefijo GS1 */}
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', whiteSpace: 'nowrap', paddingTop: 6 }}>País / Prefijo GS1</label>
                  <div>
                    <select
                      disabled={!isAdmin || isMaster}
                      value={bc.ean13_country || '770'}
                      onChange={e => setBc('ean13_country', e.target.value)}
                      style={{ margin: 0, maxWidth: 320, fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>
                      {gs1List.map(g => (
                        <option key={g.prefix + g.country} value={g.prefix}>
                          {g.flag} {g.prefix} — {g.country}
                        </option>
                      ))}
                    </select>
                    {cinfo && <div style={{ fontSize: 11, color: '#1e40af', marginTop: 4 }}>
                      Prefijo GS1 oficial para <strong>{cinfo.country}</strong> ({cinfo.region})
                    </div>}
                  </div>

                  {/* Código de empresa */}
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', whiteSpace: 'nowrap', paddingTop: 6 }}>Código de empresa (4 dígitos)</label>
                  <div>
                    <input
                      type="text" maxLength={4}
                      disabled={!isAdmin || isMaster}
                      value={bc.ean13_company || '0001'}
                      onChange={e => setBc('ean13_company', e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="0001"
                      style={{ margin: 0, maxWidth: 100, fontFamily: 'monospace', fontWeight: 700, fontSize: 15, textAlign: 'center', letterSpacing: 2 }}
                    />
                    <div style={{ fontSize: 11, color: '#1e40af', marginTop: 4 }}>
                      Identifica tu empresa. Asigna un número único (ej. 0001 para la empresa principal).
                    </div>
                  </div>

                  {/* Dígitos para variante */}
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', whiteSpace: 'nowrap', paddingTop: 6 }}>Dígitos para variante</label>
                  <div>
                    <select
                      disabled={!isAdmin || isMaster}
                      value={bc.ean13_variant_digits || 2}
                      onChange={e => setBc('ean13_variant_digits', Number(e.target.value))}
                      style={{ margin: 0, maxWidth: 120 }}>
                      <option value={1}>1 dígito (máx. 9 variantes)</option>
                      <option value={2}>2 dígitos (máx. 99 variantes)</option>
                      <option value={3}>3 dígitos (máx. 999 variantes)</option>
                    </select>
                    <div style={{ fontSize: 11, color: '#1e40af', marginTop: 4 }}>
                      Secuencia para color/talla. Los dígitos restantes se usan para la referencia del producto.
                    </div>
                  </div>

                  {/* Generación automática */}
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', whiteSpace: 'nowrap', paddingTop: 4 }}>Generación automática</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Toggle value={bc.ean_auto !== false} disabled={!isAdmin || isMaster}
                      onChange={v => setBc('ean_auto', v)} />
                    <span style={{ fontSize: 11, color: '#1d4ed8' }}>
                      {bc.ean_auto !== false ? 'El sistema genera el código al crear variantes' : 'El usuario ingresa el código manualmente'}
                    </span>
                  </div>
                </div>

                {/* Vista previa de estructura */}
                <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 8, background: '#dbeafe', fontSize: 12, color: '#1e40af' }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>📋 Estructura del código ({prev.example.length} dígitos)</div>
                  <div style={{ display: 'flex', gap: 2, fontFamily: 'monospace', fontSize: 14, flexWrap: 'wrap', marginBottom: 10 }}>
                    <span title="Prefijo país GS1" style={{ background: '#93c5fd', padding: '3px 8px', borderRadius: 4, fontWeight: 700, letterSpacing: 1 }}>{prev.country}</span>
                    <span title="Código empresa" style={{ background: '#6ee7b7', padding: '3px 8px', borderRadius: 4, fontWeight: 700, letterSpacing: 1 }}>{prev.company}</span>
                    <span title={`Referencia producto (${prev.prodDig} díg.)`} style={{ background: '#fde68a', padding: '3px 8px', borderRadius: 4, fontWeight: 700, letterSpacing: 1 }}>{'0'.repeat(prev.prodDig)}</span>
                    <span title={`Variante (${prev.varDig} díg.)`} style={{ background: '#f9a8d4', padding: '3px 8px', borderRadius: 4, fontWeight: 700, letterSpacing: 1 }}>{'0'.repeat(prev.varDig)}</span>
                    <span title="Dígito verificador" style={{ background: '#d8b4fe', padding: '3px 8px', borderRadius: 4, fontWeight: 700 }}>{prev.example.slice(-1)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11 }}>
                    <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#93c5fd', borderRadius: 2, marginRight: 4 }} />País GS1 ({prev.country.length} díg.)</span>
                    <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#6ee7b7', borderRadius: 2, marginRight: 4 }} />Empresa ({prev.company.length} díg.)</span>
                    <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#fde68a', borderRadius: 2, marginRight: 4 }} />Producto ({prev.prodDig} díg.)</span>
                    <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#f9a8d4', borderRadius: 2, marginRight: 4 }} />Variante ({prev.varDig} díg.)</span>
                    <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#d8b4fe', borderRadius: 2, marginRight: 4 }} />Verificador (1 díg.)</span>
                  </div>
                  <div style={{ marginTop: 8, fontFamily: 'monospace', fontWeight: 700, fontSize: 15, letterSpacing: 2, color: '#1e3a8a' }}>
                    Ejemplo: {prev.example}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Configuración Code 128 */}
          {bc.default_type === 'code128' && (
            <div style={{ padding: '16px 18px', borderRadius: 10, background: '#f5f3ff', border: '1px solid #ddd6fe' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed', marginBottom: 4 }}>⚙️ Configuración Code 128</div>
              <div style={{ fontSize: 12, color: '#7c3aed', marginBottom: 14, lineHeight: 1.5 }}>
                Code 128 permite caracteres alfanuméricos. El código se genera a partir de la referencia (SKU) del producto o variante.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 16px', alignItems: 'center' }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', whiteSpace: 'nowrap' }}>Prefijo de empresa (opcional)</label>
                <input
                  type="text" maxLength={10}
                  disabled={!isAdmin || isMaster}
                  value={bc.c128_prefix || ''}
                  onChange={e => setBc('c128_prefix', e.target.value.toUpperCase())}
                  placeholder="Ej. MIEMPRESA-"
                  style={{ margin: 0, maxWidth: 220, fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}
                />
                <label style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', whiteSpace: 'nowrap' }}>Fuente del código</label>
                <select style={{ margin: 0, maxWidth: 260 }}
                  disabled={!isAdmin || isMaster}
                  value={bc.c128_source || 'variant_sku'}
                  onChange={e => setBc('c128_source', e.target.value)}>
                  <option value="variant_sku">SKU de la variante</option>
                  <option value="product_sku">Referencia del producto</option>
                  <option value="product_code">ID Sistema (ej. 2026-000001)</option>
                  <option value="manual">Ingreso manual</option>
                </select>
              </div>
            </div>
          )}

          {/* Info QR */}
          {bc.default_type === 'qr' && (
            <div style={{ padding: '16px 18px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #86efac' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d', marginBottom: 4 }}>⚙️ Configuración QR Code</div>
              <div style={{ fontSize: 12, color: '#15803d', lineHeight: 1.5 }}>
                El QR se genera con la información del producto: SKU, nombre y referencia interna.
                La lectura desde el POS y el módulo de inventarios se realiza con cualquier lector o cámara que soporte QR.
              </div>
              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 16px', alignItems: 'center' }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#15803d', whiteSpace: 'nowrap' }}>Contenido del QR</label>
                <select style={{ margin: 0, maxWidth: 300 }}
                  disabled={!isAdmin || isMaster}
                  value={bc.qr_content || 'sku'}
                  onChange={e => setBc('qr_content', e.target.value)}>
                  <option value="sku">Solo SKU de variante</option>
                  <option value="full">SKU + Nombre + Precio</option>
                  <option value="url">URL del producto (si aplica)</option>
                </select>
              </div>
            </div>
          )}

          {/* Compatibilidad con lectores */}
          <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 12 }}>
            <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>📡 Compatibilidad con lectores de código de barras</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, color: 'var(--text-2)' }}>
              <div>✅ Lector USB tipo pistola (HID keyboard)</div>
              <div>✅ Lector Bluetooth</div>
              <div>✅ Cámara de smartphone (QR y Code 128)</div>
              <div>✅ Escáner de mano inalámbrico</div>
              <div style={{ color: 'var(--muted)' }}>⬜ Lector de red TCP/IP (próximamente)</div>
              <div style={{ color: 'var(--muted)' }}>⬜ Impresión de etiquetas Zebra (próximamente)</div>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}

/* PosPerfilesCfg — gestión de perfiles de cajeros y vendedores */
function PosPerfilesCfg({ isAdmin, isMaster, notify }) {
  const [profiles, setProfiles] = useState([])
  const [f, setF] = useState({ name: '', role: 'cajero', notes: '' })
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    api.listPosProfiles().then(setProfiles).catch(() => {})
  }, [])

  async function save(e) {
    e.preventDefault()
    try {
      if (editing) {
        await api.updatePosProfile(editing.id, { name: f.name, role: f.role, is_active: editing.is_active, notes: f.notes })
        notify('Perfil actualizado')
        setEditing(null)
      } else {
        await api.createPosProfile({ name: f.name, role: f.role, is_active: true, notes: f.notes })
        notify('Perfil creado')
      }
      setF({ name: '', role: 'cajero', notes: '' })
      setProfiles(await api.listPosProfiles())
    } catch (err) { notify(err.message, 'error') }
  }

  async function toggleActive(p) {
    try {
      await api.updatePosProfile(p.id, { name: p.name, role: p.role, is_active: !p.is_active, notes: p.notes })
      setProfiles(await api.listPosProfiles())
    } catch (err) { notify(err.message, 'error') }
  }

  async function del(id) {
    try {
      await api.deletePosProfile(id)
      setProfiles(await api.listPosProfiles())
    } catch (err) { notify(err.message, 'error') }
  }

  function startEdit(p) {
    setEditing(p)
    setF({ name: p.name, role: p.role, notes: p.notes || '' })
  }

  const roleLabel = { cajero: '🧾 Cajero', vendedor: '🤝 Vendedor', supervisor: '⭐ Supervisor' }

  return (
    <div className="section-card">
      <div className="section-card-header"><h3 className="section-card-title">👤 Perfiles de Cajeros y Vendedores</h3></div>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
        Crea los perfiles que podrán usarse en el POS para identificar quién realizó cada venta.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
        {(isAdmin && !isMaster) && (
          <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '16px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{editing ? 'Editar perfil' : 'Nuevo perfil'}</div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Nombre</label>
              <input placeholder="Ej. María García" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Función</label>
              <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })} style={{ width: '100%' }}>
                <option value="cajero">🧾 Cajero</option>
                <option value="vendedor">🤝 Vendedor</option>
                <option value="supervisor">⭐ Supervisor</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Notas</label>
              <input placeholder="Turno, sucursal, etc." value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="submit" className="primary-btn" style={{ flex: 1, fontSize: 13 }}>
                {editing ? 'Actualizar' : '+ Agregar'}
              </button>
              {editing && (
                <button type="button" className="secondary-btn" style={{ fontSize: 13 }}
                  onClick={() => { setEditing(null); setF({ name: '', role: 'cajero', notes: '' }) }}>
                  Cancelar
                </button>
              )}
            </div>
          </form>
        )}
        <div>
          {profiles.length === 0
            ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>No hay perfiles creados aún.</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {profiles.map(p => (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                    border: '1px solid var(--border)', borderRadius: 8,
                    background: p.is_active ? 'var(--surface)' : 'var(--surface-2)',
                    opacity: p.is_active ? 1 : 0.6,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{roleLabel[p.role] || p.role}{p.notes ? ` · ${p.notes}` : ''}</div>
                    </div>
                    {isAdmin && !isMaster && (
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <Toggle value={p.is_active} onChange={() => toggleActive(p)} />
                        <button onClick={() => startEdit(p)} title="Editar"
                          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 13 }}>✏️</button>
                        <button onClick={() => del(p.id)} title="Eliminar"
                          style={{ background: 'none', border: '1px solid #fecaca', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 13, color: '#dc2626' }}>✕</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  )
}

/* SaveBar — barra sticky de guardado por tab */
function SaveBar({ dirty, saving, onSave, label = 'Guardar cambios' }) {
  if (!dirty) return null
  return (
    <div style={{
      position: 'sticky', bottom: 0, zIndex: 10,
      background: 'var(--surface)',
      borderTop: '1px solid var(--border)',
      padding: '12px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12,
      boxShadow: '0 -4px 16px rgba(0,0,0,.08)',
      borderRadius: '0 0 12px 12px',
      marginTop: 20,
    }}>
      <span style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#f59e0b', fontSize: 16, lineHeight: 1 }}>●</span>
        Tienes cambios sin guardar en esta sección
      </span>
      <button className="primary-btn" onClick={onSave} disabled={saving} style={{ minWidth: 160 }}>
        {saving ? 'Guardando…' : `💾 ${label}`}
      </button>
    </div>
  )
}

export default function Configuracion() {
  const { role } = useAuth()
  const isAdmin = role === 'ADMINISTRADOR' || role === 'TENANT_ADMIN' || role === 'MASTER_ADMIN'

  const [tab, setTab]         = useState('general')
  const [data, setData]       = useState(null)
  const [savingTab, setSavingTab] = useState(null)
  const notify = useNotify()
  const [dirtyTabs, setDirtyTabs] = useState(new Set())

  const [users,    setUsers]    = useState([])
  const [roles,    setRoles]    = useState([])
  const [branches, setBranches] = useState([])
  const [scopes,   setScopes]   = useState([])

  async function refreshUsers() {
    try {
      const [u, r] = await Promise.all([api.listUsers(), api.listRoles()])
      setUsers(u); setRoles(r)
    } catch {}
  }

  useEffect(() => {
    if (tab === 'usuarios' || tab === 'roles') {
      refreshUsers()
      api.me().then(m => setBranches(m.branches || [])).catch(() => {})
      api.scopes().then(setScopes).catch(() => {})
    }
  }, [tab])

  const isDirty = (t) => dirtyTabs.has(t)
  const markDirty = (t) => setDirtyTabs(prev => new Set(prev).add(t))
  const markClean = (t) => setDirtyTabs(prev => { const s = new Set(prev); s.delete(t); return s })

  // section → which tab owns it (for dirty tracking)
  const SECTION_TAB = { general: 'general', pos: 'pos', inventario: 'inventario', compras: 'compras', fiscal: 'fiscal', impresion: 'impresora', seguridad: 'seguridad' }

  useEffect(() => {
    api.getConfig().then(d => setData(d)).catch(e => notify(e.message, 'error'))
  }, [])

  function set(section, key, value) {
    setData(d => ({ ...d, config: { ...d.config, [section]: { ...d.config[section], [key]: value } } }))
    markDirty(SECTION_TAB[section] || section)
  }

  // base_currency and country live in the General tab
  function setBase(key, value) {
    setData(d => ({ ...d, [key]: value }))
    markDirty('general')
  }

  // Save only the sections that belong to a specific tab
  async function saveTab(tabId) {
    setSavingTab(tabId)
    try {
      const payload = {}
      if (tabId === 'general') {
        payload.general      = data.config?.general || {}
        payload.base_currency = data.base_currency
        payload.country       = data.country
      } else if (tabId === 'impresora') {
        payload.impresion = data.config?.impresion || {}
      } else {
        payload[tabId] = data.config?.[tabId] || {}
      }
      await api.saveConfig(payload)
      notify('Cambios guardados correctamente')
      markClean(tabId)
      if (tabId === 'seguridad') {
        const sec = data.config?.seguridad || {}
        window.dispatchEvent(new CustomEvent('gaban-security-config', {
          detail: { inactivity_enabled: sec.inactivity_enabled, inactivity_timeout_minutes: sec.inactivity_timeout_minutes }
        }))
      }
    } catch (e) {
      notify(e.message, 'error')
    }
    setSavingTab(null)
  }

  if (!data) {
    return (
      <div className="module-root">
        <div style={{ display: 'flex', align: 'center', gap: 10, color: 'var(--muted)', padding: 40 }}>
          <div className="loading-spinner" /> Cargando configuración…
        </div>
      </div>
    )
  }

  const cfg = data.config || {}
  const g   = cfg.general    || {}
  const pos = cfg.pos        || {}
  const inv = cfg.inventario || {}
  const com = cfg.compras    || {}
  const fis = cfg.fiscal     || {}
  const sec = cfg.seguridad  || {}

  const isMaster = role === 'MASTER_ADMIN'

  return (
    <div className="module-root">
      <div className="module-header">
        {dirtyTabs.size > 0 && (
          <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>
            ● {dirtyTabs.size} sección{dirtyTabs.size > 1 ? 'es' : ''} con cambios sin guardar
          </span>
        )}
      </div>

      {isMaster && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#92400e' }}>
          ⚠️ Estás en sesión Master. La configuración de módulos es por tenant. Inicia sesión como administrador de un tenant para editarla.
        </div>
      )}

      {/* TabBar con dot en tabs con cambios pendientes */}
      <div className="vtab-bar">
        {TABS.map(t => (
          <button key={t.id}
            className={`vtab-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
            style={{ position: 'relative' }}>
            {t.icon && <span className="vtab-icon">{t.icon}</span>}
            <span className="vtab-label">{t.label}</span>
            {isDirty(t.id) && (
              <span style={{
                position: 'absolute', top: 6, right: 6,
                width: 7, height: 7, borderRadius: '50%',
                background: '#f59e0b', border: '1.5px solid var(--surface)',
              }} />
            )}
          </button>
        ))}
      </div>

      {/* ── GENERAL ── */}
      {tab === 'general' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Fila 1: Identidad + Región/Moneda */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
            <div className="section-card">
              <div className="section-card-header"><h3 className="section-card-title">🏢 Identidad de la empresa</h3></div>
              <FieldRow label="Nombre comercial">
                <input value={g.company_name || data.tenant_name || ''} disabled={!isAdmin || isMaster}
                  onChange={e => set('general', 'company_name', e.target.value)} />
              </FieldRow>
              <FieldRow label="Razón social / Nombre legal">
                <input value={g.legal_name || ''} disabled={!isAdmin || isMaster}
                  onChange={e => set('general', 'legal_name', e.target.value)} />
              </FieldRow>
              <FieldRow label={taxIdLabel(data.country)} hint={taxIdHint(data.country)}>
                <input value={g.tax_id || ''} disabled={!isAdmin || isMaster}
                  onChange={e => set('general', 'tax_id', e.target.value)}
                  placeholder={taxIdPlaceholder(data.country)} />
              </FieldRow>
              <FieldRow label="Teléfono de contacto">
                <input value={g.phone || ''} disabled={!isAdmin || isMaster}
                  onChange={e => set('general', 'phone', e.target.value)} placeholder="+57 300 000 0000" />
              </FieldRow>
              <FieldRow label="Sitio web">
                <input value={g.website || ''} disabled={!isAdmin || isMaster}
                  onChange={e => set('general', 'website', e.target.value)} placeholder="https://miempresa.com" />
              </FieldRow>
              <FieldRow label="Logo (URL)" hint="URL pública de la imagen del logo (PNG/SVG recomendado)">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input value={g.logo_url || ''} disabled={!isAdmin || isMaster}
                    onChange={e => set('general', 'logo_url', e.target.value)} placeholder="https://miempresa.com/logo.png" />
                  {g.logo_url && (
                    <div style={{ padding: 10, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      <img src={g.logo_url} alt="Logo" style={{ maxHeight: 50, maxWidth: 160, objectFit: 'contain', borderRadius: 4 }}
                        onError={e => { e.target.style.display = 'none' }} />
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>Vista previa</span>
                    </div>
                  )}
                </div>
              </FieldRow>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="section-card">
                <div className="section-card-header"><h3 className="section-card-title">🌐 Región y moneda</h3></div>
                <FieldRow label="País" hint="Código ISO de 2 letras — determina los campos de dirección y el estándar fiscal">
                  <CountrySelect value={data.country || ''} disabled={!isAdmin || isMaster}
                    onChange={v => { setBase('country', v); setDirty(true) }} />
                </FieldRow>
                <FieldRow label="Moneda base" hint="Moneda predeterminada para todos los módulos">
                  <select value={data.base_currency || 'USD'} disabled={!isAdmin || isMaster}
                    onChange={e => setBase('base_currency', e.target.value)}>
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </FieldRow>
                <FieldRow label="Formato de moneda" hint="Así se mostrarán los valores monetarios en todo el sistema">
                  {(() => {
                    const cur = data.base_currency || 'USD'
                    const cfg = getCurrencyConfig(cur)
                    const examples = [0, 1234567.89, -9999.5]
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          {[1, 1234.5, 1234567.89].map(v => (
                            <span key={v} style={{
                              display: 'inline-block', padding: '4px 12px', borderRadius: 8,
                              background: 'var(--surface-2)', border: '1px solid var(--border)',
                              fontFamily: 'monospace', fontWeight: 700, fontSize: 14,
                            }}>
                              {formatMoney(v, cur)}
                            </span>
                          ))}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {cfg.name} · {cfg.decimals === 0 ? 'Sin centavos' : `${cfg.decimals} decimales`} · locale <code>{cfg.locale}</code>
                        </div>
                      </div>
                    )
                  })()}
                </FieldRow>
                <FieldRow label="Zona horaria">
                  <select value={g.timezone || 'America/Bogota'} disabled={!isAdmin || isMaster}
                    onChange={e => set('general', 'timezone', e.target.value)}>
                    {(data.timezones || []).map(tz => <option key={tz}>{tz}</option>)}
                  </select>
                </FieldRow>
              </div>

              <div className="section-card" style={{ background: 'var(--brand-soft)', border: '1.5px solid var(--brand)' }}>
                <div className="section-card-header"><h3 className="section-card-title" style={{ color: 'var(--brand)' }}>Resumen activo</h3></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    ['Empresa',  data.tenant_name || '—'],
                    ['Moneda',   data.base_currency || '—'],
                    ['País',     data.country ? `${data.country} · ${getCountryConfig(data.country).label}` : '—'],
                    ['Zona',     g.timezone || 'America/Bogota'],
                    ['Autoridad fiscal', getCountryConfig(data.country).fiscalAuth || '—'],
                    ['Ciudad',   g.addr_city || '—'],
                  ].map(([l, v]) => (
                    <div key={l} style={{ background: 'var(--surface)', borderRadius: 8, padding: '10px 14px' }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{l}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginTop: 3 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Fila 2: Dirección fiscal dinámica */}
          <AddressSection
            country={data.country}
            g={g}
            disabled={!isAdmin || isMaster}
            onChange={(k, v) => set('general', k, v)}
          />

          {/* Fila 3: Redes sociales */}
          <div className="section-card">
            <div className="section-card-header"><h3 className="section-card-title">📱 Redes sociales</h3></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {[
                { key: 'social_facebook',  label: 'Facebook',  icon: '👤', placeholder: 'https://facebook.com/miempresa' },
                { key: 'social_instagram', label: 'Instagram', icon: '📸', placeholder: 'https://instagram.com/miempresa' },
                { key: 'social_twitter',   label: 'X / Twitter', icon: '🐦', placeholder: 'https://x.com/miempresa' },
                { key: 'social_linkedin',  label: 'LinkedIn',  icon: '💼', placeholder: 'https://linkedin.com/company/miempresa' },
                { key: 'social_tiktok',    label: 'TikTok',    icon: '🎵', placeholder: 'https://tiktok.com/@miempresa' },
                { key: 'social_youtube',   label: 'YouTube',   icon: '▶️', placeholder: 'https://youtube.com/@miempresa' },
                { key: 'social_whatsapp',  label: 'WhatsApp (número)', icon: '💬', placeholder: '+57 300 000 0000' },
              ].map(f => (
                <FieldRow key={f.key} label={`${f.icon} ${f.label}`}>
                  <input value={g[f.key] || ''} disabled={!isAdmin || isMaster}
                    onChange={e => set('general', f.key, e.target.value)}
                    placeholder={f.placeholder} style={{ width: '100%' }} />
                </FieldRow>
              ))}
            </div>
          </div>

          {isAdmin && !isMaster && (
            <SaveBar dirty={isDirty('general')} saving={savingTab === 'general'}
              onSave={() => saveTab('general')} label="Guardar General" />
          )}
        </div>
      )}

      {/* ── VENTAS / POS ── */}
      {tab === 'pos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
          <div className="section-card">
            <div className="section-card-header"><h3 className="section-card-title">Impuestos y descuentos</h3></div>
            <Row label="IVA / Tax por defecto (%)" hint="Se aplica automáticamente en nuevas ventas">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="number" min={0} max={100} step={0.5}
                  style={{ width: 80, margin: 0 }}
                  value={pos.tax_default ?? 0} disabled={!isAdmin || isMaster}
                  onChange={e => set('pos', 'tax_default', Number(e.target.value))} />
                <span style={{ color: 'var(--muted)' }}>%</span>
              </div>
            </Row>
            <Row label="Descuentos manuales en POS" hint="El cajero puede aplicar descuentos por línea">
              <Toggle value={!!pos.allow_manual_discount} disabled={!isAdmin || isMaster}
                onChange={v => set('pos', 'allow_manual_discount', v)} />
            </Row>
            <Row label="Descuento máximo permitido (%)" hint="Límite por línea en el carrito (0 = sin límite)">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="number" min={0} max={100}
                  style={{ width: 80, margin: 0 }}
                  value={pos.max_discount_pct ?? 100} disabled={!isAdmin || isMaster}
                  onChange={e => set('pos', 'max_discount_pct', Number(e.target.value))} />
                <span style={{ color: 'var(--muted)' }}>%</span>
              </div>
            </Row>
          </div>

          <div className="section-card">
            <div className="section-card-header"><h3 className="section-card-title">Comportamiento del POS</h3></div>
            <Row label="Modo por defecto al abrir POS" hint="¿Iniciar en modo Venta o Pedido?">
              <select style={{ margin: 0, width: 130 }}
                value={pos.pos_default_mode || 'sale'} disabled={!isAdmin || isMaster}
                onChange={e => set('pos', 'pos_default_mode', e.target.value)}>
                <option value="sale">Venta</option>
                <option value="order">Pedido</option>
              </select>
            </Row>
            <Row label="Requerir cliente en ventas" hint="Obliga seleccionar un cliente antes de cobrar">
              <Toggle value={!!pos.require_customer} disabled={!isAdmin || isMaster}
                onChange={v => set('pos', 'require_customer', v)} />
            </Row>
            <Row label="Permitir venta con stock negativo" hint="Vende aunque no haya existencias">
              <Toggle value={!!pos.allow_negative_stock_sale} disabled={!isAdmin || isMaster}
                onChange={v => set('pos', 'allow_negative_stock_sale', v)} />
            </Row>
            <Row label="Permitir pagos múltiples (split)" hint="El cliente puede pagar con varios métodos">
              <Toggle value={!!pos.allow_multi_payment} disabled={!isAdmin || isMaster}
                onChange={v => set('pos', 'allow_multi_payment', v)} />
            </Row>
            <Row label="Imprimir ticket automáticamente" hint="Abre ventana de impresión al cobrar">
              <Toggle value={!!pos.auto_print_receipt} disabled={!isAdmin || isMaster}
                onChange={v => set('pos', 'auto_print_receipt', v)} />
            </Row>
          </div>
        </div>

        {/* Métodos de pago */}
        <div className="section-card">
          <div className="section-card-header"><h3 className="section-card-title">💳 Métodos de pago activos</h3></div>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
            Solo los métodos seleccionados aparecerán en el módulo de Ventas (POS).
          </p>
          {ALL_PAY_METHODS.map(m => {
            const active = (pos.payment_methods || ALL_PAY_METHODS.map(x => x.id)).includes(m.id)
            return (
              <Row key={m.id} label={`${m.icon} ${m.label}`}>
                <Toggle value={active} disabled={!isAdmin || isMaster} onChange={v => {
                  const cur = pos.payment_methods || ALL_PAY_METHODS.map(x => x.id)
                  set('pos', 'payment_methods', v ? [...cur, m.id] : cur.filter(x => x !== m.id))
                }} />
              </Row>
            )
          })}
        </div>

        {/* Perfiles POS */}
        <PosPerfilesCfg isAdmin={isAdmin} isMaster={isMaster} notify={notify} />

        {isAdmin && !isMaster && (
          <SaveBar dirty={isDirty('pos')} saving={savingTab === 'pos'}
            onSave={() => saveTab('pos')} label="Guardar Ventas / POS" />
        )}
        </div>
      )}

      {/* ── INVENTARIO ── */}
      {tab === 'inventario' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
          <div className="section-card">
            <div className="section-card-header"><h3 className="section-card-title">Costeo y valoración</h3></div>
            <Row label="Método de costeo" hint="Determina cómo se calcula el costo de salidas">
              <select style={{ margin: 0, width: 160 }}
                value={inv.cost_method || 'promedio'} disabled={!isAdmin || isMaster}
                onChange={e => set('inventario', 'cost_method', e.target.value)}>
                <option value="promedio">Promedio ponderado</option>
                <option value="fifo">FIFO (Primero en entrar)</option>
                <option value="lifo">LIFO (Último en entrar)</option>
              </select>
            </Row>
          </div>

          <div className="section-card">
            <div className="section-card-header"><h3 className="section-card-title">Alertas y controles</h3></div>
            <Row label="Activar alertas de stock bajo" hint="Notifica cuando un producto cae bajo el mínimo">
              <Toggle value={!!inv.low_stock_alert} disabled={!isAdmin || isMaster}
                onChange={v => set('inventario', 'low_stock_alert', v)} />
            </Row>
            <Row label="Umbral de alerta global (unidades)" hint="Aplica a productos sin mínimo propio">
              <input type="number" min={0}
                style={{ width: 80, margin: 0 }}
                value={inv.low_stock_threshold ?? 5} disabled={!isAdmin || isMaster}
                onChange={e => set('inventario', 'low_stock_threshold', Number(e.target.value))} />
            </Row>
            <Row label="Traslados libres entre sucursales" hint="Sin requerir aprobación del administrador">
              <Toggle value={!!inv.allow_free_transfers} disabled={!isAdmin || isMaster}
                onChange={v => set('inventario', 'allow_free_transfers', v)} />
            </Row>
            <Row label="Rastrear número de serie" hint="Activa campo de serial en entradas y salidas">
              <Toggle value={!!inv.track_serial} disabled={!isAdmin || isMaster}
                onChange={v => set('inventario', 'track_serial', v)} />
            </Row>
          </div>
        </div>

        {/* ── Códigos de barras ── */}
        <BarcodeCfg inv={inv} set={set} isAdmin={isAdmin} isMaster={isMaster} />

        {isAdmin && !isMaster && (
          <SaveBar dirty={isDirty('inventario')} saving={savingTab === 'inventario'}
            onSave={() => saveTab('inventario')} label="Guardar Inventario" />
        )}
        </div>
      )}

      {/* ── COMPRAS ── */}
      {tab === 'compras' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
          <div className="section-card">
            <div className="section-card-header"><h3 className="section-card-title">Crédito y plazos</h3></div>
            <Row label="Días de crédito por defecto" hint="Plazo aplicado a nuevos proveedores">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="number" min={0}
                  style={{ width: 80, margin: 0 }}
                  value={com.default_credit_days ?? 30} disabled={!isAdmin || isMaster}
                  onChange={e => set('compras', 'default_credit_days', Number(e.target.value))} />
                <span style={{ color: 'var(--muted)' }}>días</span>
              </div>
            </Row>
            <Row label="IVA en compras por defecto (%)" hint="Pre-rellena el impuesto en nuevas órdenes">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="number" min={0} max={100} step={0.5}
                  style={{ width: 80, margin: 0 }}
                  value={com.default_tax_pct ?? 0} disabled={!isAdmin || isMaster}
                  onChange={e => set('compras', 'default_tax_pct', Number(e.target.value))} />
                <span style={{ color: 'var(--muted)' }}>%</span>
              </div>
            </Row>
          </div>

          <div className="section-card">
            <div className="section-card-header"><h3 className="section-card-title">Flujo de órdenes</h3></div>
            <Row label="Recibir órdenes automáticamente" hint="Al crear una orden, se marca como recibida sin confirmar">
              <Toggle value={!!com.auto_receive_po} disabled={!isAdmin || isMaster}
                onChange={v => set('compras', 'auto_receive_po', v)} />
            </Row>
            <Row label="Requerir aprobación de órdenes" hint="Las OC deben ser aprobadas antes de enviarse">
              <Toggle value={!!com.require_po_approval} disabled={!isAdmin || isMaster}
                onChange={v => set('compras', 'require_po_approval', v)} />
            </Row>
          </div>
        </div>
        {isAdmin && !isMaster && (
          <SaveBar dirty={isDirty('compras')} saving={savingTab === 'compras'}
            onSave={() => saveTab('compras')} label="Guardar Compras" />
        )}
        </div>
      )}

      {/* ── FISCAL ── */}
      {tab === 'fiscal' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
          <div className="section-card">
            <div className="section-card-header"><h3 className="section-card-title">Documentos y numeración</h3></div>
            <FieldRow label="Serie de documentos fiscales" hint="Prefijo en facturas y tiquetes (FE, A, B…)">
              <input value={fis.serie || 'FE'} disabled={!isAdmin || isMaster}
                onChange={e => set('fiscal', 'serie', e.target.value)}
                style={{ width: 100 }} maxLength={10} />
            </FieldRow>
            <FieldRow label="Folio inicial" hint="Número a partir del cual inicia la numeración">
              <input type="number" min={1} value={fis.next_folio ?? 1} disabled={!isAdmin || isMaster}
                onChange={e => set('fiscal', 'next_folio', Number(e.target.value))}
                style={{ width: 120 }} />
            </FieldRow>
            <FieldRow label="Régimen fiscal">
              <input value={fis.tax_regime || ''} disabled={!isAdmin || isMaster}
                onChange={e => set('fiscal', 'tax_regime', e.target.value)}
                placeholder="Ej. Simplificado, 601, RIF…" />
            </FieldRow>
          </div>

          <div className="section-card">
            <div className="section-card-header"><h3 className="section-card-title">Resolución DIAN / SAT</h3></div>
            <FieldRow label="Número de resolución">
              <input value={fis.resolution_number || ''} disabled={!isAdmin || isMaster}
                onChange={e => set('fiscal', 'resolution_number', e.target.value)}
                placeholder="18764000001234" />
            </FieldRow>
            <FieldRow label="Fecha de resolución">
              <input type="date" value={fis.resolution_date || ''} disabled={!isAdmin || isMaster}
                onChange={e => set('fiscal', 'resolution_date', e.target.value)} />
            </FieldRow>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FieldRow label="Desde (folio)">
                <input type="number" value={fis.resolution_from || ''} disabled={!isAdmin || isMaster}
                  onChange={e => set('fiscal', 'resolution_from', e.target.value)} />
              </FieldRow>
              <FieldRow label="Hasta (folio)">
                <input type="number" value={fis.resolution_to || ''} disabled={!isAdmin || isMaster}
                  onChange={e => set('fiscal', 'resolution_to', e.target.value)} />
              </FieldRow>
            </div>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.7, marginTop: 8 }}>
              💡 Para Colombia (DIAN) ingresa los datos de la resolución de facturación electrónica.<br/>
              Para México (SAT) se requiere un PAC certificado para el timbrado real.
            </div>
          </div>
        </div>
        {isAdmin && !isMaster && (
          <SaveBar dirty={isDirty('fiscal')} saving={savingTab === 'fiscal'}
            onSave={() => saveTab('fiscal')} label="Guardar Fiscal" />
        )}
        </div>
      )}

      {/* ── PRODUCTOS ── */}
      {tab === 'productos' && <ProductosCatalog isAdmin={isAdmin && !isMaster} notify={notify} />}

      {/* ── USUARIOS ── */}
      {tab === 'usuarios' && (
        <UsuariosTabContent
          users={users} roles={roles} branches={branches}
          refresh={refreshUsers} notify={notify} isAdmin={isAdmin && !isMaster}
        />
      )}

      {/* ── ROLES ── */}
      {tab === 'roles' && (
        <RolesTabContent
          roles={roles} scopes={scopes}
          refresh={refreshUsers} notify={notify} isAdmin={isAdmin && !isMaster}
        />
      )}

      {/* ── IMPRESORA ── */}
      {tab === 'impresora' && (
        <ImpresoraTab
          imp={data?.config?.impresion || {}}
          onChange={(k, v) => set('impresion', k, v)}
          dirty={isDirty('impresora')}
          saving={savingTab === 'impresora'}
          onSave={() => saveTab('impresora')}
          isAdmin={isAdmin && !isMaster}
        />
      )}

      {/* ── SEGURIDAD ── */}
      {tab === 'seguridad' && (() => {
        const enabled  = !!sec.inactivity_enabled
        const minutes  = sec.inactivity_timeout_minutes ?? 30
        const OPTIONS  = [5, 10, 15, 20, 30, 60, 120]
        const disabled = !isAdmin || isMaster

        return (
          <div className="vtab-content">
            <div className="section-card">
              <div className="section-card-header">
                <h3 className="section-card-title">⏱️ Tiempo de inactividad</h3>
              </div>

              {/* Toggle principal */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Cerrar sesión por inactividad</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    Si el usuario no realiza ninguna acción durante el tiempo configurado, el sistema cerrará su sesión automáticamente.
                  </div>
                </div>
                <Toggle value={enabled} disabled={disabled} onChange={v => set('seguridad', 'inactivity_enabled', v)} />
              </div>

              {/* Selector de tiempo */}
              <div style={{ opacity: enabled ? 1 : 0.45, pointerEvents: enabled ? 'auto' : 'none', transition: 'opacity .2s' }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Tiempo de espera</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {OPTIONS.map(m => {
                    const label = m < 60 ? `${m} min` : `${m / 60} h`
                    const active = minutes === m
                    return (
                      <button key={m} type="button" disabled={disabled}
                        onClick={() => set('seguridad', 'inactivity_timeout_minutes', m)}
                        style={{
                          padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: active ? 700 : 500,
                          border: active ? '2px solid var(--brand)' : '1.5px solid var(--border)',
                          background: active ? 'var(--brand-soft, #eef2ff)' : 'var(--surface-2)',
                          color: active ? 'var(--brand)' : 'var(--text)',
                          cursor: disabled ? 'default' : 'pointer', transition: 'all .15s',
                        }}>
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Info box */}
              <div style={{ marginTop: 20, padding: '12px 16px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
                🔒 Cuando la sesión expire por inactividad, el usuario verá un aviso y deberá iniciar sesión de nuevo.<br />
                La inactividad se detecta por movimiento del cursor, teclado, clics y desplazamiento de la pantalla.
              </div>
            </div>

            {isAdmin && !isMaster && (
              <SaveBar dirty={isDirty('seguridad')} saving={savingTab === 'seguridad'}
                onSave={() => saveTab('seguridad')} label="Guardar Seguridad" />
            )}
          </div>
        )
      })()}

      {!isAdmin && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
          Solo el administrador del tenant puede modificar la configuración.
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Helpers para identificación fiscal por país
───────────────────────────────────────────────────────────────────────────── */
const TAX_ID_MAP = {
  CO: { label: 'NIT',  hint: 'Número de Identificación Tributaria (DIAN)', placeholder: '900123456-1' },
  MX: { label: 'RFC',  hint: 'Registro Federal de Contribuyentes (SAT)',    placeholder: 'ABC123456XYZ' },
  US: { label: 'EIN',  hint: 'Employer Identification Number (IRS)',         placeholder: '12-3456789' },
  PE: { label: 'RUC',  hint: 'Registro Único de Contribuyentes (SUNAT)',    placeholder: '20123456789' },
  CL: { label: 'RUT',  hint: 'Rol Único Tributario (SII)',                  placeholder: '76.543.210-K' },
  AR: { label: 'CUIT', hint: 'Clave Única de Identificación Tributaria (AFIP)', placeholder: '30-12345678-9' },
  BO: { label: 'NIT',  hint: 'Número de Identificación Tributaria (SIN)',   placeholder: '1234567' },
  PY: { label: 'RUC',  hint: 'Registro Único del Contribuyente (SET)',      placeholder: '80012345-6' },
  UY: { label: 'RUT',  hint: 'Registro Único Tributario (DGI)',             placeholder: '211234560011' },
  ES: { label: 'NIF/CIF', hint: 'Número de Identificación Fiscal (AEAT)',  placeholder: 'B12345678' },
  EC: { label: 'RUC',  hint: 'Registro Único de Contribuyentes (SRI)',      placeholder: '1790012345001' },
  VE: { label: 'RIF',  hint: 'Registro de Información Fiscal (SENIAT)',     placeholder: 'J-123456789' },
}
const taxIdLabel       = (c) => TAX_ID_MAP[c]?.label       || 'Identificación fiscal (NIT / RFC / RUC)'
const taxIdHint        = (c) => TAX_ID_MAP[c]?.hint        || undefined
const taxIdPlaceholder = (c) => TAX_ID_MAP[c]?.placeholder || 'Ej. 900123456-1'

/* ─────────────────────────────────────────────────────────────────────────────
   CountrySelect — lista de todos los países soportados + texto libre
───────────────────────────────────────────────────────────────────────────── */
const SUPPORTED_COUNTRIES = [
  {v:'CO',l:'🇨🇴 Colombia'}, {v:'MX',l:'🇲🇽 México'}, {v:'US',l:'🇺🇸 United States'},
  {v:'PE',l:'🇵🇪 Perú'},     {v:'CL',l:'🇨🇱 Chile'},  {v:'AR',l:'🇦🇷 Argentina'},
  {v:'BO',l:'🇧🇴 Bolivia'},  {v:'PY',l:'🇵🇾 Paraguay'},{v:'UY',l:'🇺🇾 Uruguay'},
  {v:'ES',l:'🇪🇸 España'},   {v:'EC',l:'🇪🇨 Ecuador'},{v:'VE',l:'🇻🇪 Venezuela'},
]

function CountrySelect({ value, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <select value={value} disabled={disabled} style={{ flex: 1 }}
        onChange={e => onChange(e.target.value)}>
        <option value="">— seleccionar —</option>
        {SUPPORTED_COUNTRIES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
        <option disabled>──────────────</option>
        <option value="GT">🇬🇹 Guatemala</option>
        <option value="SV">🇸🇻 El Salvador</option>
        <option value="HN">🇭🇳 Honduras</option>
        <option value="NI">🇳🇮 Nicaragua</option>
        <option value="CR">🇨🇷 Costa Rica</option>
        <option value="PA">🇵🇦 Panamá</option>
        <option value="DO">🇩🇴 Rep. Dominicana</option>
        <option value="CU">🇨🇺 Cuba</option>
        <option value="BR">🇧🇷 Brasil</option>
        <option value="PT">🇵🇹 Portugal</option>
      </select>
      {value && (
        <span style={{ fontSize: 22, lineHeight: 1 }}>
          {SUPPORTED_COUNTRIES.find(c => c.v === value)?.l.split(' ')[0] || '🌐'}
        </span>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   AddressSection — campos de dirección dinámicos según el país del tenant
───────────────────────────────────────────────────────────────────────────── */
function AddressSection({ country, g, disabled, onChange }) {
  const cfg = getCountryConfig(country)

  return (
    <div className="section-card">
      <div className="section-card-header">
        <h3 className="section-card-title">📍 Dirección fiscal</h3>
        {cfg.fiscalAuth && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 10px',
            background: 'var(--brand-soft)', color: 'var(--brand)',
            borderRadius: 20, border: '1px solid var(--brand)',
          }}>
            {cfg.fiscalAuth} · {cfg.label}
          </span>
        )}
      </div>

      {cfg.fiscalNote && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8,
          padding: '8px 14px', fontSize: 12, color: '#92400e', marginBottom: 16,
          display: 'flex', gap: 8, alignItems: 'flex-start',
        }}>
          <span style={{ flexShrink: 0 }}>💡</span>
          <span>{cfg.fiscalNote}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0 20px' }}>
        {cfg.addrFields.map(field => (
          <AddressField
            key={field.key}
            field={field}
            value={g[`addr_${field.key}`] || ''}
            disabled={disabled}
            onChange={v => onChange(`addr_${field.key}`, v)}
            parentValue={field.key === 'city' && field.type === 'city_select'
              ? g['addr_department'] || ''
              : undefined}
          />
        ))}
      </div>

      {/* Dirección formateada (preview) */}
      {buildAddressPreview(cfg, g) && (
        <div style={{
          marginTop: 14, padding: '10px 14px',
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 8, fontSize: 13, color: 'var(--text-2)',
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <span style={{ color: 'var(--muted)', flexShrink: 0 }}>📋 Dirección:</span>
          <span style={{ fontWeight: 500 }}>{buildAddressPreview(cfg, g)}</span>
        </div>
      )}
    </div>
  )
}

function AddressField({ field, value, disabled, onChange, parentValue }) {
  const listId = `dl_${field.key}_${Math.random().toString(36).slice(2)}`

  if (field.type === 'select') {
    return (
      <FieldRow label={field.label} hint={field.hint}>
        <select value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
          <option value="">— seleccionar —</option>
          {(field.options || []).map(o => (
            <option key={o.v} value={o.v}>{o.l}</option>
          ))}
        </select>
      </FieldRow>
    )
  }

  if (field.type === 'city_select') {
    const cities = typeof field.getCities === 'function'
      ? field.getCities(parentValue)
      : []
    return (
      <FieldRow label={field.label} hint={field.hint}>
        {cities.length > 0 ? (
          <select value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
            <option value="">— seleccionar —</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : (
          <input value={value} disabled={disabled}
            placeholder={field.placeholder || 'Escribe la ciudad'}
            onChange={e => onChange(e.target.value)} />
        )}
      </FieldRow>
    )
  }

  // text / postal con datalist opcional
  const hasList = field.datalist?.length > 0
  return (
    <FieldRow label={field.label} hint={field.hint}>
      <input
        value={value}
        disabled={disabled}
        placeholder={field.placeholder || ''}
        maxLength={field.maxLength}
        list={hasList ? listId : undefined}
        onChange={e => onChange(e.target.value)}
        type={field.type === 'postal' ? 'text' : 'text'}
        inputMode={field.type === 'postal' ? 'numeric' : undefined}
        style={field.type === 'postal' ? { width: 140 } : undefined}
      />
      {hasList && (
        <datalist id={listId}>
          {field.datalist.map(c => <option key={c} value={c} />)}
        </datalist>
      )}
    </FieldRow>
  )
}

function buildAddressPreview(cfg, g) {
  const parts = cfg.addrFields
    .map(f => g[`addr_${f.key}`])
    .filter(Boolean)
  return parts.join(', ')
}

/* ─────────────────────────────────────────────────────────────────────────────
   PencilIcon — ícono de editar unificado para todo el sistema
───────────────────────────────────────────────────────────────────────────── */
function PencilIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

/* Botón de editar con PencilIcon — reutilizable */
function EditBtn({ onClick, title = 'Editar', size = 14, style: extraStyle }) {
  return (
    <button type="button" onClick={onClick} title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
        background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer',
        transition: 'all .12s', flexShrink: 0, ...extraStyle,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-soft)'; e.currentTarget.style.color = 'var(--brand)'; e.currentTarget.style.borderColor = 'var(--brand)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
      <PencilIcon size={size} />
    </button>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   ProductosCatalog — layout de dos paneles: nav izquierdo + workspace derecho
───────────────────────────────────────────────────────────────────────────── */
function ProductosCatalog({ isAdmin, notify }) {
  const [categorias,    setCategorias]    = useState([])
  const [tipos,         setTipos]         = useState([])
  const [colores,       setColores]       = useState([])
  const [tallas,        setTallas]        = useState([])
  const [unidades,      setUnidades]      = useState([])
  const [marcas,        setMarcas]        = useState([])
  const [customCats,    setCustomCats]    = useState([])
  const [suppliers,     setSuppliers]     = useState([])
  const [loading,       setLoading]       = useState(false)
  const [active,        setActive]        = useState('categorias')
  const [showNewVar,    setShowNewVar]    = useState(false)
  const [newVarForm,    setNewVarForm]    = useState({ name: '', description: '', icon: '📋', has_code: true })
  const [savingNewVar,  setSavingNewVar]  = useState(false)
  const [editVarId,     setEditVarId]     = useState(null)
  const [confirmDelVar, setConfirmDelVar] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const [cat, tip, col, tal, uni, mar, cus, sup] = await Promise.all([
        api.getCategorias(), api.getTipos(), api.getColores(),
        api.getTallas(), api.getUnidades(), api.getMarcas(),
        api.getCustomCatalogs(), api.listSuppliers(),
      ])
      setCategorias(cat); setTipos(tip); setColores(col)
      setTallas(tal); setUnidades(uni); setMarcas(mar)
      setCustomCats(cus); setSuppliers(sup)
    } catch (e) { notify(e.message, 'error') }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handle(fn) {
    setLoading(true)
    try { await fn(); await load() }
    catch (e) { notify(e.message, 'error'); setLoading(false) }
  }

  async function saveNewVar(e) {
    e.preventDefault()
    if (!newVarForm.name.trim()) return
    setSavingNewVar(true)
    try {
      if (editVarId) {
        await api.updateCustomCatalog(editVarId, newVarForm)
        notify('Variable actualizada')
      } else {
        const res = await api.createCustomCatalog(newVarForm)
        setActive(`custom_${res.id}`)
        notify('Nueva variable creada')
      }
      setShowNewVar(false); setEditVarId(null)
      setNewVarForm({ name: '', description: '', icon: '📋', has_code: true })
      await load()
    } catch (err) { notify(err.message, 'error') }
    setSavingNewVar(false)
  }

  function openEditVar(cat) {
    setNewVarForm({ name: cat.name, description: cat.description || '', icon: cat.icon || '📋', has_code: cat.has_code })
    setEditVarId(cat.id)
    setShowNewVar(true)
  }

  async function doDeleteVar() {
    if (!confirmDelVar) return
    try {
      await api.deleteCustomCatalog(confirmDelVar.id)
      if (active === `custom_${confirmDelVar.id}`) setActive('categorias')
      notify(`Variable "${confirmDelVar.name}" eliminada`)
      setConfirmDelVar(null); await load()
    } catch (err) { notify(err.message, 'error') }
  }

  const builtinNav = [
    { id: 'categorias', icon: '🗂️', label: 'Categorías',        desc: 'Grupos y subgrupos de productos',       count: categorias.length },
    { id: 'tipos',      icon: '📦', label: 'Tipos de producto',  desc: 'Tallas, vencimiento, características',  count: tipos.length },
    { id: 'colores',    icon: '🎨', label: 'Colores',            desc: 'Paleta de colores para variantes',      count: colores.length },
    { id: 'tallas',     icon: '📏', label: 'Tallas',             desc: 'Sistema de tallas para variantes',      count: tallas.length },
    { id: 'unidades',   icon: '⚖️', label: 'Unidades',          desc: 'KG, UND, LT, m²…',                     count: unidades.length },
    { id: 'marcas',     icon: '🏷️', label: 'Marcas',            desc: 'Fabricantes y marcas comerciales',      count: marcas.length },
  ]

  /* Ítems activos de custom catalog seleccionado */
  const activeCustom = customCats.find(c => `custom_${c.id}` === active)

  /* Botón nav reutilizable */
  function NavBtn({ id, icon, label, desc, count, onEdit, onDelete }) {
    const isActive = active === id
    return (
      <div style={{ position: 'relative' }}
        onMouseEnter={e => e.currentTarget.querySelector('.nav-actions')?.style && (e.currentTarget.querySelector('.nav-actions').style.opacity = '1')}
        onMouseLeave={e => e.currentTarget.querySelector('.nav-actions')?.style && (e.currentTarget.querySelector('.nav-actions').style.opacity = '0')}
      >
        <button onClick={() => setActive(id)} style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          padding: '9px 10px', borderRadius: 8, border: `1px solid ${isActive ? 'var(--brand)' : 'transparent'}`,
          cursor: 'pointer', textAlign: 'left',
          background: isActive ? 'var(--brand-soft)' : 'transparent',
          color: isActive ? 'var(--brand)' : 'var(--text)', transition: 'all .12s',
        }}>
          <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1 }}>{icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
            {desc && <div style={{ fontSize: 10, color: isActive ? 'var(--brand)' : 'var(--muted)', marginTop: 1, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{desc}</div>}
          </div>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, flexShrink: 0,
            background: isActive ? 'var(--brand)' : 'var(--surface)',
            color: isActive ? '#fff' : 'var(--muted)',
            border: `1px solid ${isActive ? 'var(--brand)' : 'var(--border)'}`,
          }}>{count ?? 0}</span>
        </button>
        {(onEdit || onDelete) && (
          <div className="nav-actions" style={{
            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
            display: 'flex', gap: 2, opacity: 0, transition: 'opacity .12s',
            background: 'var(--surface-2)', borderRadius: 6, padding: '2px',
          }} onClick={e => e.stopPropagation()}>
            {onEdit   && <Ib icon="edit"   tip="Editar variable"   variant="ghost"  onClick={onEdit}   />}
            {onDelete && <Ib icon="delete" tip="Eliminar variable" variant="danger" onClick={onDelete} />}
          </div>
        )}
      </div>
    )
  }

  /* Iconos de emoji para el picker */
  const ICONS = ['📋','📌','🔖','🏷️','⭐','💡','🎯','🛠️','🔧','🔑','📐','🧩','🎨','📊','🗃️','🌐','💎','🧪','🎁','📦']

  return (
    <div style={{ display: 'flex', minHeight: 580, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface)' }}>

      {/* ── Nav izquierdo ── */}
      <aside style={{ width: 234, flexShrink: 0, background: 'var(--surface-2)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>Variables de catálogo</div>
          <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>Datos base del módulo de productos</div>
        </div>

        <nav style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1 }}>
          {/* Variables del sistema */}
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', padding: '6px 10px 4px' }}>Sistema</div>
          {builtinNav.map(n => <NavBtn key={n.id} {...n} />)}

          {/* Variables personalizadas */}
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', padding: '14px 10px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Personalizadas</span>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>{customCats.length}</span>
          </div>
          {customCats.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--muted)', padding: '4px 10px 8px', fontStyle: 'italic' }}>
              Sin variables aún
            </div>
          )}
          {customCats.map(c => (
            <NavBtn key={c.id} id={`custom_${c.id}`}
              icon={c.icon} label={c.name} desc={c.description}
              count={c.item_count}
              onEdit={() => openEditVar(c)}
              onDelete={() => setConfirmDelVar(c)}
            />
          ))}
        </nav>

        {/* Botón nueva variable */}
        {isAdmin && (
          <div style={{ padding: '10px 8px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <Ab icon={showNewVar && !editVarId ? 'close' : 'add'}
              label={showNewVar && !editVarId ? 'Cancelar' : 'Nueva variable'}
              variant={showNewVar && !editVarId ? 'ghost' : 'primary'}
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => {
                if (showNewVar && !editVarId) { setShowNewVar(false) }
                else { setShowNewVar(true); setEditVarId(null); setNewVarForm({ name: '', description: '', icon: '📋', has_code: true }) }
              }}
            />
          </div>
        )}
      </aside>

      {/* ── Workspace derecho ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>

        {/* Formulario nueva/editar variable — panel superior */}
        {showNewVar && isAdmin && (
          <div style={{ borderBottom: '1px solid var(--brand)', background: 'var(--brand-soft)', flexShrink: 0 }}>
            <div style={{ padding: '16px 20px 14px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)', marginBottom: 14 }}>
                {editVarId ? '✏️ Editar variable' : '✨ Nueva variable personalizada'}
              </div>
              <form onSubmit={saveNewVar}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div className="form-field" style={{ margin: 0 }}>
                    <label>Nombre de la variable *</label>
                    <input value={newVarForm.name} onChange={e => setNewVarForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Ej. Material, Temporada, País de origen…" required autoFocus />
                  </div>
                  <div className="form-field" style={{ margin: 0 }}>
                    <label>Descripción</label>
                    <input value={newVarForm.description} onChange={e => setNewVarForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Descripción opcional" />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginBottom: 16 }}>
                  {/* Icono */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>Ícono</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 260 }}>
                      {ICONS.map(ic => (
                        <button key={ic} type="button" onClick={() => setNewVarForm(f => ({ ...f, icon: ic }))} style={{
                          width: 32, height: 32, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 6, cursor: 'pointer', border: `2px solid ${newVarForm.icon === ic ? 'var(--brand)' : 'var(--border)'}`,
                          background: newVarForm.icon === ic ? 'var(--brand-soft)' : 'var(--surface)',
                          transition: 'all .1s',
                        }}>{ic}</button>
                      ))}
                    </div>
                  </div>

                  {/* Opciones */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>Campos de cada ítem</div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer', padding: '8px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <input type="checkbox" checked={newVarForm.has_code}
                        onChange={e => setNewVarForm(f => ({ ...f, has_code: e.target.checked }))}
                        style={{ width: 'auto', margin: 0 }} />
                      <div>
                        <div style={{ fontWeight: 600 }}>Incluir campo Código</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>Además del nombre, cada opción tendrá un código corto (ej. MAT-1)</div>
                      </div>
                    </label>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <Ab icon={savingNewVar ? 'refresh' : 'check'}
                    label={savingNewVar ? 'Guardando…' : editVarId ? 'Guardar cambios' : 'Crear variable'}
                    variant="primary" type="submit" disabled={savingNewVar} />
                  <Ab icon="close" label="Cancelar" variant="ghost"
                    onClick={() => { setShowNewVar(false); setEditVarId(null); setNewVarForm({ name: '', description: '', icon: '📋', has_code: true }) }} />
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Workspaces de variables del sistema */}
        {active === 'categorias' && !showNewVar && (
          <CategoriasWorkspace items={categorias} isAdmin={isAdmin} loading={loading}
            onAdd={d => handle(() => api.createCategoria(d))}
            onEdit={(id, d) => handle(() => api.updateCategoria(id, d))}
            onDelete={id => handle(() => api.deleteCategoria(id))}
            onBulkDone={load} />
        )}
        {active === 'tipos' && !showNewVar && (
          <CatalogWorkspace icon="📦" title="Tipos de producto"
            desc="Define si el tipo maneja tallas o tiene vencimiento"
            items={tipos} isAdmin={isAdmin} loading={loading}
            columns={[
              { key: 'name',       label: 'Nombre',            type: 'text',     placeholder: 'Ej. Zapatos', required: true, width: 200 },
              { key: 'has_sizes',  label: 'Maneja tallas',     type: 'checkbox', checkLabel: 'Sí' },
              { key: 'has_expiry', label: 'Tiene vencimiento', type: 'checkbox', checkLabel: 'Sí' },
            ]}
            emptyForm={{ name: '', has_sizes: false, has_expiry: false }}
            csvSchema={{ headers: ['name','has_sizes','has_expiry'], examples: [['Zapatos','true','false'],['Alimentos','false','true']] }}
            onAdd={d => handle(() => api.createTipo(d))}
            onEdit={(id, d) => handle(() => api.updateTipo(id, d))}
            onDelete={id => handle(() => api.deleteTipo(id))}
            onBulkAdd={row => api.createTipo({ name: row.name, has_sizes: row.has_sizes === 'true', has_expiry: row.has_expiry === 'true' })}
            onBulkDone={load} />
        )}
        {active === 'colores' && !showNewVar && (
          <CatalogWorkspace icon="🎨" title="Colores"
            desc="Paleta de colores disponibles para las variantes de producto"
            items={colores} isAdmin={isAdmin} loading={loading}
            columns={[
              { key: 'code', label: 'Código', type: 'text',  placeholder: 'NEGRO',  required: true, width: 90 },
              { key: 'name', label: 'Nombre', type: 'text',  placeholder: 'Negro',  required: true, width: 140 },
              { key: 'hex',  label: 'Color',  type: 'color' },
            ]}
            emptyForm={{ code: '', name: '', hex: '#000000' }}
            csvSchema={{ headers: ['code','name','hex'], examples: [['NEGRO','Negro','#000000'],['BLANCO','Blanco','#FFFFFF']] }}
            onAdd={d => handle(() => api.createColor(d))}
            onEdit={(id, d) => handle(() => api.updateColor(id, d))}
            onDelete={id => handle(() => api.deleteColor(id))}
            onBulkAdd={row => api.createColor({ code: row.code, name: row.name, hex: row.hex || '#000000' })}
            onBulkDone={load} />
        )}
        {active === 'tallas' && !showNewVar && (
          <CatalogWorkspace icon="📏" title="Tallas"
            desc="Sistema de tallas para variantes del módulo de productos"
            items={tallas} isAdmin={isAdmin} loading={loading}
            columns={[
              { key: 'code',       label: 'Código', type: 'text',   placeholder: 'XL',         required: true, width: 80 },
              { key: 'name',       label: 'Nombre', type: 'text',   placeholder: 'Extra Large', width: 160 },
              { key: 'sort_order', label: 'Orden',  type: 'number', width: 80 },
            ]}
            emptyForm={{ code: '', name: '', sort_order: 0 }}
            csvSchema={{ headers: ['code','name','sort_order'], examples: [['XS','Extra Small','1'],['S','Small','2'],['M','Medium','3']] }}
            onAdd={d => handle(() => api.createTalla(d))}
            onEdit={(id, d) => handle(() => api.updateTalla(id, d))}
            onDelete={id => handle(() => api.deleteTalla(id))}
            onBulkAdd={row => api.createTalla({ code: row.code, name: row.name, sort_order: Number(row.sort_order) || 0 })}
            onBulkDone={load} />
        )}
        {active === 'unidades' && !showNewVar && (
          <CatalogWorkspace icon="⚖️" title="Unidades de medida"
            desc="Kilogramos, unidades, litros, metros cuadrados y más"
            items={unidades} isAdmin={isAdmin} loading={loading}
            columns={[
              { key: 'code', label: 'Código',      type: 'text', placeholder: 'KG',        required: true, width: 90 },
              { key: 'name', label: 'Descripción', type: 'text', placeholder: 'Kilogramo', required: true, width: 220 },
            ]}
            emptyForm={{ code: '', name: '' }}
            csvSchema={{ headers: ['code','name'], examples: [['KG','Kilogramo'],['UND','Unidad'],['LT','Litro']] }}
            onAdd={d => handle(() => api.createUnidad(d))}
            onEdit={(id, d) => handle(() => api.updateUnidad(id, d))}
            onDelete={id => handle(() => api.deleteUnidad(id))}
            onBulkAdd={row => api.createUnidad({ code: row.code, name: row.name })}
            onBulkDone={load} />
        )}
        {active === 'marcas' && !showNewVar && (
          <CatalogWorkspace icon="🏷️" title="Marcas"
            desc="Fabricantes y marcas comerciales de los productos"
            items={marcas} isAdmin={isAdmin} loading={loading}
            columns={[
              { key: 'name',        label: 'Nombre',    type: 'text',   placeholder: 'Ej. Nike', required: true, width: 220 },
              { key: 'supplier_id', label: 'Proveedor', type: 'select', placeholder: '— Sin proveedor —', optionsKey: 'suppliers', width: 200 },
            ]}
            emptyForm={{ name: '', supplier_id: null }}
            extraData={{ suppliers: suppliers.filter(s => s.is_active !== false).map(s => ({ id: s.id, name: s.name })) }}
            csvSchema={{ headers: ['name'], examples: [['Nike'],['Adidas'],['Puma']] }}
            onAdd={d => handle(() => api.createMarca(d))}
            onEdit={(id, d) => handle(() => api.updateMarca(id, d))}
            onDelete={id => handle(() => api.deleteMarca(id))}
            onBulkAdd={row => api.createMarca({ name: row.name })}
            onBulkDone={load} />
        )}

        {/* Workspace de variable personalizada */}
        {activeCustom && !showNewVar && (
          <CustomCatalogWorkspace
            catalog={activeCustom}
            isAdmin={isAdmin}
            loading={loading}
            onRefresh={load}
            notify={notify}
          />
        )}

        {/* Estado vacío cuando solo se muestra el form de nueva variable y nada más */}
        {showNewVar && !editVarId && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'var(--muted)', gap: 8 }}>
            <span style={{ fontSize: 40, opacity: .3 }}>✨</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)' }}>Configura y crea tu nueva variable</span>
            <span style={{ fontSize: 12 }}>Aparecerá en el menú izquierdo y podrás agregar opciones</span>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmDelVar}
        title={`Eliminar variable "${confirmDelVar?.name}"`}
        message="Se eliminarán también todos los ítems de esta variable. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={doDeleteVar}
        onCancel={() => setConfirmDelVar(null)}
      />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   CustomCatalogWorkspace — workspace para una variable personalizada
───────────────────────────────────────────────────────────────────────────── */
function CustomCatalogWorkspace({ catalog, isAdmin, loading: parentLoading, onRefresh, notify }) {
  const [items,       setItems]       = useState([])
  const [loading,     setLoading]     = useState(false)
  const [showAdd,     setShowAdd]     = useState(false)
  const [form,        setForm]        = useState({ code: '', name: '', sort_order: 0 })
  const [editId,      setEditId]      = useState(null)
  const [editForm,    setEditForm]    = useState({})
  const [page,        setPage]        = useState(1)
  const [pageSize]                    = useState(15)
  const [confirmItem, setConfirmItem] = useState(null)

  const catId = catalog.id

  async function loadItems() {
    setLoading(true)
    try { setItems(await api.getCustomCatalogItems(catId)) }
    catch (e) { notify(e.message, 'error') }
    setLoading(false)
  }

  useEffect(() => { loadItems() }, [catId])
  useEffect(() => { setPage(1) }, [items.length])

  async function handleItem(fn) {
    setLoading(true)
    try { await fn(); await loadItems(); await onRefresh() }
    catch (e) { notify(e.message, 'error') }
    setLoading(false)
  }

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const pageItems  = items.slice((safePage - 1) * pageSize, safePage * pageSize)

  function startEdit(item) {
    setEditId(item.id)
    setEditForm({ code: item.code || '', name: item.name, sort_order: item.sort_order || 0 })
  }

  async function submitAdd(e) {
    e.preventDefault()
    await handleItem(() => api.createCustomCatalogItem(catId, form))
    setForm({ code: '', name: '', sort_order: 0 }); setShowAdd(false)
  }

  async function submitEdit(id) {
    await handleItem(() => api.updateCustomCatalogItem(catId, id, editForm))
    setEditId(null); setEditForm({})
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 28, lineHeight: 1 }}>{catalog.icon}</span>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{catalog.name}</h3>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted)' }}>
            {catalog.description ? `${catalog.description} · ` : ''}{items.length} opción{items.length !== 1 ? 'es' : ''}
            {catalog.has_code ? ' · Con código' : ' · Solo nombre'}
          </p>
        </div>
        {isAdmin && (
          <Ab icon={showAdd ? 'close' : 'add'}
            label={showAdd ? 'Cancelar' : 'Nueva opción'}
            variant={showAdd ? 'ghost' : 'primary'}
            onClick={() => { setShowAdd(v => !v); setForm({ code: '', name: '', sort_order: 0 }) }} />
        )}
      </div>

      {/* Formulario agregar */}
      {showAdd && isAdmin && (
        <div style={{ padding: '12px 20px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <form onSubmit={submitAdd} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {catalog.has_code && (
              <div className="form-field" style={{ margin: 0 }}>
                <label>Código</label>
                <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  placeholder="Ej. OPT-1" style={{ width: 100 }} />
              </div>
            )}
            <div className="form-field" style={{ margin: 0, flex: 1, minWidth: 160 }}>
              <label>Nombre *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nombre de la opción" required />
            </div>
            <div className="form-field" style={{ margin: 0 }}>
              <label>Orden</label>
              <input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                style={{ width: 70 }} />
            </div>
            <Ab icon="check" label="Agregar" variant="primary" type="submit" disabled={loading} />
          </form>
        </div>
      )}

      {/* Tabla */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 16px' }}>
        {items.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', color: 'var(--muted)', gap: 8 }}>
            <span style={{ fontSize: 36, opacity: .4 }}>{catalog.icon}</span>
            <span style={{ fontWeight: 600, color: 'var(--text-2)' }}>Sin opciones aún</span>
            <span style={{ fontSize: 12 }}>Haz clic en "Nueva opción" para agregar la primera</span>
          </div>
        ) : (
          <>
            <table style={{ width: '100%', marginTop: 16 }}>
              <thead>
                <tr>
                  <th style={{ width: 50 }}>ID</th>
                  {catalog.has_code && <th style={{ width: 110 }}>Código</th>}
                  <th>Nombre</th>
                  <th style={{ width: 80, textAlign: 'center' }}>Orden</th>
                  {isAdmin && <th style={{ width: 80 }}></th>}
                </tr>
              </thead>
              <tbody>
                {pageItems.map(item => {
                  const isEditing = editId === item.id
                  return (
                    <tr key={item.id} style={{ background: isEditing ? 'var(--brand-soft)' : undefined }}>
                      <td><code style={{ fontSize: 11, color: 'var(--muted)' }}>#{item.id}</code></td>
                      {catalog.has_code && (
                        <td>
                          {isEditing
                            ? <input value={editForm.code} onChange={e => setEditForm(f => ({ ...f, code: e.target.value }))} style={{ margin: 0, width: 90, fontSize: 12 }} />
                            : <code style={{ fontSize: 12, background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>{item.code || '—'}</code>}
                        </td>
                      )}
                      <td>
                        {isEditing
                          ? <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={{ margin: 0, width: 220, fontSize: 12 }} autoFocus />
                          : <span style={{ fontWeight: 500 }}>{item.name}</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {isEditing
                          ? <input type="number" value={editForm.sort_order} onChange={e => setEditForm(f => ({ ...f, sort_order: Number(e.target.value) }))} style={{ margin: 0, width: 60, fontSize: 12, textAlign: 'center' }} />
                          : <span style={{ fontSize: 12, color: 'var(--muted)' }}>{item.sort_order}</span>}
                      </td>
                      {isAdmin && (
                        <td>
                          {isEditing ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <Ib icon="check" tip="Guardar" variant="success" onClick={() => submitEdit(item.id)} />
                              <Ib icon="close" tip="Cancelar" variant="ghost" onClick={() => { setEditId(null); setEditForm({}) }} />
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <Ib icon="edit"   tip="Editar"   variant="ghost"  onClick={() => startEdit(item)} />
                              <Ib icon="delete" tip="Eliminar" variant="danger" onClick={() => setConfirmItem(item)} />
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Paginación */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>
                <span>{items.length} registros</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                  <button disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}
                    style={{ padding: '3px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', cursor: safePage <= 1 ? 'default' : 'pointer', opacity: safePage <= 1 ? .4 : 1, color: 'var(--text)' }}>‹</button>
                  <span style={{ padding: '0 8px', lineHeight: '26px' }}>{safePage} / {totalPages}</span>
                  <button disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}
                    style={{ padding: '3px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', cursor: safePage >= totalPages ? 'default' : 'pointer', opacity: safePage >= totalPages ? .4 : 1, color: 'var(--text)' }}>›</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmItem}
        title="Eliminar opción"
        message={`¿Eliminar "${confirmItem?.name}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={() => { handleItem(() => api.deleteCustomCatalogItem(catId, confirmItem.id)); setConfirmItem(null) }}
        onCancel={() => setConfirmItem(null)}
      />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   CatalogWorkspace — workspace genérico para una variable de catálogo
───────────────────────────────────────────────────────────────────────────── */
function CatalogWorkspace({ icon, title, desc, items, columns, emptyForm, csvSchema,
                            isAdmin, loading, onAdd, onEdit, onDelete, onBulkAdd, onBulkDone,
                            extraData = {} }) {
  const [form,        setForm]        = useState(emptyForm)
  const [showAdd,     setShowAdd]     = useState(false)
  const [editId,      setEditId]      = useState(null)
  const [editForm,    setEditForm]    = useState({})
  const [page,        setPage]        = useState(1)
  const [pageSize,    setPageSize]    = useState(15)
  const [bulkProgress, setBulkProgress] = useState(null)
  const [confirmItem, setConfirmItem] = useState(null)
  const fileRef = useRef(null)

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const pageItems  = items.slice((safePage - 1) * pageSize, safePage * pageSize)

  useEffect(() => { setPage(1) }, [items.length, pageSize])
  useEffect(() => { setForm(emptyForm); setShowAdd(false); setEditId(null) }, [title])

  function startEdit(item) {
    setEditId(item.id)
    const seed = {}
    columns.forEach(c => { seed[c.key] = item[c.key] ?? (c.type === 'checkbox' ? false : c.type === 'number' ? 0 : c.type === 'select' ? null : '') })
    setEditForm(seed)
  }
  function cancelEdit() { setEditId(null); setEditForm({}) }

  async function submitEdit(id) {
    await onEdit(id, editForm)
    setEditId(null); setEditForm({})
  }

  async function submitAdd(e) {
    e.preventDefault()
    await onAdd(form)
    setForm(emptyForm)
    setShowAdd(false)
  }

  function downloadCSV() {
    if (!csvSchema) return
    const header = csvSchema.headers.join(',')
    const examples = (csvSchema.examples || []).map(row => row.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + header + '\n' + examples], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `layout_${title.toLowerCase().replace(/\s+/g,'_')}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  async function uploadCSV(e) {
    const file = e.target.files?.[0]; if (!file || !onBulkAdd) return
    e.target.value = ''
    const text  = await file.text()
    const lines = text.split(/\r?\n/).filter(Boolean)
    const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/^"|"$/g, ''))
    const dataRows = lines.slice(1)
    setBulkProgress({ done: 0, total: dataRows.length })
    let done = 0
    for (const line of dataRows) {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      const obj  = Object.fromEntries(header.map((h, i) => [h, vals[i] ?? '']))
      try { await onBulkAdd(obj) } catch { /* skip */ }
      done++; setBulkProgress({ done, total: dataRows.length })
    }
    setBulkProgress(null)
    onBulkDone?.()
  }

  function renderCell(col, item) {
    if (col.type === 'color') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, border: '1px solid var(--border)', background: item.hex || '#ccc' }} />
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.hex || '—'}</span>
        </span>
      )
    }
    if (col.type === 'checkbox')
      return <span style={{ color: item[col.key] ? '#059669' : 'var(--muted)', fontWeight: 600 }}>{item[col.key] ? '✓ Sí' : '—'}</span>
    if (col.type === 'select') {
      const opts = extraData[col.optionsKey] || []
      const found = opts.find(o => o.id === item[col.key])
      return found
        ? <span style={{ fontSize: 12, background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 10, border: '1px solid var(--border)' }}>{found.name}</span>
        : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
    }
    return <span>{item[col.key] ?? '—'}</span>
  }

  function renderEditCell(col) {
    if (col.type === 'color') return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input value={editForm[col.key] || ''} onChange={e => setEditForm(f => ({ ...f, [col.key]: e.target.value }))}
          style={{ margin: 0, width: 80, fontSize: 12 }} placeholder="#000000" />
        <input type="color" value={editForm[col.key] || '#000000'}
          onChange={e => setEditForm(f => ({ ...f, [col.key]: e.target.value }))}
          style={{ margin: 0, width: 32, height: 30, padding: 2, cursor: 'pointer', border: '1px solid var(--border)', borderRadius: 5 }} />
      </div>
    )
    if (col.type === 'number') return (
      <input type="number" value={editForm[col.key] ?? 0}
        onChange={e => setEditForm(f => ({ ...f, [col.key]: Number(e.target.value) }))}
        style={{ margin: 0, width: col.width || 70, fontSize: 12 }} />
    )
    if (col.type === 'checkbox') return (
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!editForm[col.key]}
          onChange={e => setEditForm(f => ({ ...f, [col.key]: e.target.checked }))}
          style={{ width: 'auto', margin: 0 }} />
        {col.checkLabel}
      </label>
    )
    if (col.type === 'select') {
      const opts = extraData[col.optionsKey] || []
      return (
        <select value={editForm[col.key] ?? ''} onChange={e => setEditForm(f => ({ ...f, [col.key]: e.target.value ? Number(e.target.value) : null }))}
          style={{ margin: 0, fontSize: 12, width: col.width || 180 }}>
          <option value="">{col.placeholder || '— Sin selección —'}</option>
          {opts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      )
    }
    return (
      <input value={editForm[col.key] || ''}
        onChange={e => setEditForm(f => ({ ...f, [col.key]: e.target.value }))}
        style={{ margin: 0, width: col.width || 130, fontSize: 12 }} />
    )
  }

  function renderAddField(col) {
    if (col.type === 'color') return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input value={form[col.key] || ''} onChange={e => setForm(f => ({ ...f, [col.key]: e.target.value }))}
          placeholder="#000000" style={{ margin: 0, width: 90, fontSize: 13 }} />
        <input type="color" value={form.hex || '#000000'}
          onChange={e => setForm(f => ({ ...f, hex: e.target.value }))}
          style={{ margin: 0, width: 40, height: 36, padding: 2, cursor: 'pointer', border: '1px solid var(--border)', borderRadius: 6 }} />
      </div>
    )
    if (col.type === 'number') return (
      <input type="number" value={form[col.key] ?? ''} onChange={e => setForm(f => ({ ...f, [col.key]: Number(e.target.value) }))}
        placeholder={col.placeholder} style={{ margin: 0, width: col.width || 80, fontSize: 13 }} />
    )
    if (col.type === 'checkbox') return (
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!form[col.key]} onChange={e => setForm(f => ({ ...f, [col.key]: e.target.checked }))}
          style={{ width: 'auto', margin: 0 }} />
        {col.checkLabel}
      </label>
    )
    if (col.type === 'select') {
      const opts = extraData[col.optionsKey] || []
      return (
        <select value={form[col.key] ?? ''} onChange={e => setForm(f => ({ ...f, [col.key]: e.target.value ? Number(e.target.value) : null }))}
          style={{ margin: 0, fontSize: 13, width: col.width || 200 }}>
          <option value="">{col.placeholder || '— Sin selección —'}</option>
          {opts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      )
    }
    return (
      <input value={form[col.key] || ''} onChange={e => setForm(f => ({ ...f, [col.key]: e.target.value }))}
        placeholder={col.placeholder} style={{ margin: 0, width: col.width || 150, fontSize: 13 }}
        required={col.required} />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Header del workspace ── */}
      <div style={{
        padding: '16px 20px 14px', borderBottom: '1px solid var(--border)',
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <span style={{ fontSize: 30, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: '-.3px' }}>{title}</h3>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted)' }}>
            {desc} · <strong>{items.length}</strong> registro{items.length !== 1 ? 's' : ''}
          </p>
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            {csvSchema && (
              <>
                <Ib icon="download"
                  tip="Descargar layout CSV"
                  variant="ghost"
                  onClick={downloadCSV} />
                <Ib icon="upload"
                  tip={bulkProgress ? `Cargando ${bulkProgress.done}/${bulkProgress.total}…` : 'Carga masiva CSV'}
                  variant="ghost"
                  disabled={!!bulkProgress}
                  onClick={() => fileRef.current?.click()} />
                <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={uploadCSV} />
              </>
            )}
            <Ab
              icon={showAdd ? 'close' : 'add'}
              label={showAdd ? 'Cancelar' : 'Nuevo'}
              variant={showAdd ? 'ghost' : 'primary'}
              onClick={() => { setShowAdd(v => !v); setForm(emptyForm) }}
            />
          </div>
        )}
      </div>

      {/* ── Formulario de alta ── */}
      {showAdd && isAdmin && (
        <div style={{
          padding: '14px 20px 16px', background: 'var(--surface-2)',
          borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 10 }}>
            Nuevo registro
          </div>
          <form onSubmit={submitAdd} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {columns.map(col => (
              <div key={col.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  {col.label}{col.required ? ' *' : ''}
                </label>
                {renderAddField(col)}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6 }}>
              <Ab icon="check" label="Agregar" variant="primary" type="submit" disabled={loading} />
              <Ab icon="close" label="Cancelar" variant="ghost" onClick={() => { setShowAdd(false); setForm(emptyForm) }} />
            </div>
          </form>
        </div>
      )}

      {/* ── Tabla / lista ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 16px' }}>
        {items.length === 0 ? (
          <div style={{ padding: '56px 20px', textAlign: 'center', color: 'var(--muted)' }}>
            <div style={{ fontSize: 36, marginBottom: 10, opacity: .4 }}>{icon}</div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-2)', marginBottom: 4 }}>Sin registros</div>
            <div style={{ fontSize: 12 }}>
              {isAdmin ? 'Haz clic en "Nuevo" para agregar el primero.' : 'No hay registros disponibles.'}
            </div>
          </div>
        ) : (
          <>
            <div className="table-wrap" style={{ margin: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 48 }}>ID</th>
                    {columns.map(col => <th key={col.key}>{col.label}</th>)}
                    {isAdmin && <th style={{ width: 80 }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map(item => (
                    <tr key={item.id} style={{ background: editId === item.id ? 'var(--brand-soft)' : undefined }}>
                      <td><code style={{ fontSize: 11, color: 'var(--muted)' }}>#{item.id}</code></td>
                      {columns.map(col => (
                        <td key={col.key}>
                          {editId === item.id ? renderEditCell(col) : renderCell(col, item)}
                        </td>
                      ))}
                      {isAdmin && (
                        <td>
                          {editId === item.id ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <Ib icon="check" tip="Guardar" variant="success" onClick={() => submitEdit(item.id)} />
                              <Ib icon="close" tip="Cancelar" variant="ghost" onClick={cancelEdit} />
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <Ib icon="edit"   tip="Editar"   variant="ghost"  onClick={() => startEdit(item)} />
                              <Ib icon="delete" tip="Eliminar" variant="danger" onClick={() => setConfirmItem(item)} />
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px 0', flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
              <span>{items.length} registros</span>
              <span>·</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                Mostrar
                <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                  style={{ margin: '0 4px', fontSize: 12, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)' }}>
                  {[10, 15, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                por página
              </label>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
                <button type="button" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}
                  style={{ padding: '3px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', cursor: safePage <= 1 ? 'default' : 'pointer', opacity: safePage <= 1 ? .4 : 1, color: 'var(--text)' }}>
                  ‹ Ant
                </button>
                <span style={{ padding: '0 6px', fontWeight: 600, color: 'var(--text)' }}>{safePage}/{totalPages}</span>
                <button type="button" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}
                  style={{ padding: '3px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', cursor: safePage >= totalPages ? 'default' : 'pointer', opacity: safePage >= totalPages ? .4 : 1, color: 'var(--text)' }}>
                  Sig ›
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmItem}
        title="Eliminar registro"
        message={`¿Eliminar "${confirmItem?.name ?? `#${confirmItem?.id}`}"? Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        variant="danger"
        onConfirm={() => { onDelete(confirmItem.id); setConfirmItem(null) }}
        onCancel={() => setConfirmItem(null)}
      />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   CategoriasWorkspace — workspace de árbol padre/hijo para categorías
───────────────────────────────────────────────────────────────────────────── */
function CategoriasWorkspace({ items: categorias, isAdmin, loading, onAdd, onEdit, onDelete, onBulkDone }) {
  const [form,        setForm]        = useState({ name: '', parent_id: '' })
  const [mode,        setMode]        = useState('root')
  const [showAdd,     setShowAdd]     = useState(false)
  const [page,        setPage]        = useState(1)
  const [pageSize,    setPageSize]    = useState(15)
  const [editId,      setEditId]      = useState(null)
  const [editForm,    setEditForm]    = useState({ name: '', parent_id: '' })
  const [confirmItem, setConfirmItem] = useState(null)
  const [bulkProgress, setBulkProgress] = useState(null)
  const fileRef = useRef(null)

  const roots    = categorias.filter(c => !c.parent_id)
  const children = categorias.filter(c =>  c.parent_id)

  const tree = []
  roots.forEach(r => {
    tree.push({ ...r, _level: 0 })
    children.filter(c => c.parent_id === r.id).sort((a, b) => a.name.localeCompare(b.name))
      .forEach(c => tree.push({ ...c, _level: 1 }))
  })
  children.filter(c => !roots.find(r => r.id === c.parent_id))
    .forEach(c => tree.push({ ...c, _level: 1 }))

  const totalPages = Math.max(1, Math.ceil(tree.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const pageItems  = tree.slice((safePage - 1) * pageSize, safePage * pageSize)

  useEffect(() => { setPage(1) }, [categorias.length, pageSize])

  async function handleAdd(e) {
    e.preventDefault()
    await onAdd({ name: form.name, parent_id: mode === 'sub' && form.parent_id ? Number(form.parent_id) : null })
    setForm({ name: '', parent_id: '' }); setShowAdd(false)
  }

  function startEdit(item) {
    setEditId(item.id)
    setEditForm({ name: item.name, parent_id: item.parent_id ? String(item.parent_id) : '' })
  }
  function cancelEdit() { setEditId(null); setEditForm({ name: '', parent_id: '' }) }
  async function submitEdit(id) {
    await onEdit(id, { name: editForm.name, parent_id: editForm.parent_id ? Number(editForm.parent_id) : null })
    setEditId(null)
  }

  function downloadCSV() {
    const blob = new Blob(['﻿name,parent_name\n"Calzado",""\n"Deportivo","Calzado"\n"Casual","Calzado"'], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'layout_categorias.csv'; a.click(); URL.revokeObjectURL(url)
  }

  async function uploadCSV(e) {
    const file = e.target.files?.[0]; if (!file) return
    e.target.value = ''
    const text = await file.text()
    const lines = text.split(/\r?\n/).filter(Boolean)
    const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/^"|"$/g, ''))
    const rows = lines.slice(1)
    setBulkProgress({ done: 0, total: rows.length })
    let done = 0
    for (const line of rows) {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      const obj  = Object.fromEntries(header.map((h, i) => [h, vals[i] ?? '']))
      const parent = categorias.find(c => !c.parent_id && c.name.toLowerCase() === (obj.parent_name || '').toLowerCase())
      try { await api.createCategoria({ name: obj.name, parent_id: parent?.id || null }) } catch {}
      done++; setBulkProgress({ done, total: rows.length })
    }
    setBulkProgress(null); onBulkDone?.()
  }

  const modeBtn = (m, label) => ({
    padding: '5px 14px', fontSize: 12, borderRadius: 6, cursor: 'pointer', fontWeight: mode === m ? 700 : 400,
    background: mode === m ? 'var(--brand)' : 'var(--surface)',
    color: mode === m ? '#fff' : 'var(--text)',
    border: `1px solid ${mode === m ? 'var(--brand)' : 'var(--border)'}`,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        padding: '16px 20px 14px', borderBottom: '1px solid var(--border)',
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <span style={{ fontSize: 30, lineHeight: 1, flexShrink: 0 }}>🗂️</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: '-.3px' }}>Categorías</h3>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted)' }}>
            Grupos y subgrupos de productos · <strong>{roots.length}</strong> raíz · <strong>{children.length}</strong> sub
          </p>
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <Ib icon="download"
              tip="Descargar layout CSV"
              variant="ghost"
              onClick={downloadCSV} />
            <Ib icon="upload"
              tip={bulkProgress ? `Cargando ${bulkProgress.done}/${bulkProgress.total}…` : 'Carga masiva CSV'}
              variant="ghost"
              disabled={!!bulkProgress}
              onClick={() => fileRef.current?.click()} />
            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={uploadCSV} />
            <Ab
              icon={showAdd ? 'close' : 'add'}
              label={showAdd ? 'Cancelar' : 'Nueva'}
              variant={showAdd ? 'ghost' : 'primary'}
              onClick={() => setShowAdd(v => !v)}
            />
          </div>
        )}
      </div>

      {/* Formulario */}
      {showAdd && isAdmin && (
        <div style={{
          padding: '14px 20px 16px', background: 'var(--surface-2)',
          borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 10 }}>
            Nueva categoría
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <button type="button" style={modeBtn('root')} onClick={() => { setMode('root'); setForm(f => ({ ...f, parent_id: '' })) }}>
              📁 Categoría raíz
            </button>
            <button type="button" style={modeBtn('sub')} onClick={() => setMode('sub')} disabled={roots.length === 0}
              title={roots.length === 0 ? 'Crea una categoría raíz primero' : ''}>
              ↳ Subcategoría
            </button>
          </div>
          <form onSubmit={handleAdd} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {mode === 'sub' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  Categoría padre *
                </label>
                <select value={form.parent_id} onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))}
                  required style={{ margin: 0, minWidth: 180, fontSize: 13 }}>
                  <option value="">— seleccionar —</option>
                  {roots.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                {mode === 'root' ? 'Nombre de categoría' : 'Nombre de subcategoría'} *
              </label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={mode === 'root' ? 'Ej. Calzado' : 'Ej. Deportivo'}
                required style={{ margin: 0, width: 220, fontSize: 13 }} />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Ab icon="check" label={mode === 'root' ? 'Agregar categoría' : 'Agregar subcategoría'} variant="primary" type="submit" disabled={loading} />
              <Ab icon="close" label="Cancelar" variant="ghost" onClick={() => setShowAdd(false)} />
            </div>
          </form>
        </div>
      )}

      {/* Tabla árbol */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 16px' }}>
        {tree.length === 0 ? (
          <div style={{ padding: '56px 20px', textAlign: 'center', color: 'var(--muted)' }}>
            <div style={{ fontSize: 36, marginBottom: 10, opacity: .4 }}>🗂️</div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-2)', marginBottom: 4 }}>Sin categorías</div>
            <div style={{ fontSize: 12 }}>{isAdmin ? 'Haz clic en "Nueva" para agregar la primera.' : 'No hay categorías disponibles.'}</div>
          </div>
        ) : (
          <>
            <div className="table-wrap" style={{ margin: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 48 }}>ID</th>
                    <th>Nombre</th>
                    <th style={{ width: 80 }}>Tipo</th>
                    <th>Categoría padre</th>
                    {isAdmin && <th style={{ width: 90 }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map(item => {
                    const hasKids = children.some(c => c.parent_id === item.id)
                    const isEditing = editId === item.id
                    return (
                      <tr key={item.id} style={{
                        background: isEditing ? 'var(--brand-soft)' : item._level === 0 ? 'var(--surface-2)' : 'transparent',
                      }}>
                        <td><code style={{ fontSize: 11, color: 'var(--muted)' }}>#{item.id}</code></td>
                        <td>
                          {isEditing ? (
                            <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                              style={{ margin: 0, width: 180, fontSize: 12 }} autoFocus />
                          ) : (
                            <>
                              {item._level === 1 && <span style={{ color: 'var(--muted)', marginRight: 6, fontSize: 13 }}>↳</span>}
                              <span style={{ fontWeight: item._level === 0 ? 600 : 400 }}>{item.name}</span>
                            </>
                          )}
                        </td>
                        <td>
                          {item._level === 0
                            ? <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--brand)', color: '#fff', fontWeight: 600 }}>Raíz</span>
                            : <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>Sub</span>
                          }
                        </td>
                        <td>
                          {isEditing && item._level === 1 ? (
                            <select value={editForm.parent_id} onChange={e => setEditForm(f => ({ ...f, parent_id: e.target.value }))}
                              style={{ fontSize: 12, margin: 0 }}>
                              <option value="">— sin padre —</option>
                              {roots.filter(r => r.id !== item.id).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                          ) : (
                            <span style={{ color: 'var(--muted)', fontSize: 13 }}>{item.parent_name || '—'}</span>
                          )}
                        </td>
                        {isAdmin && (
                          <td>
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <Ib icon="check" tip="Guardar" variant="success" onClick={() => submitEdit(item.id)} />
                                <Ib icon="close" tip="Cancelar" variant="ghost" onClick={cancelEdit} />
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <Ib icon="edit"   tip="Editar categoría" variant="ghost"  onClick={() => startEdit(item)} />
                                <Ib icon="delete" tip={hasKids ? 'Tiene subcategorías' : 'Eliminar'} variant="danger" disabled={hasKids} onClick={() => setConfirmItem(item)} />
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px 0', flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
              <span>{tree.length} registros</span>
              <span>·</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                Mostrar
                <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                  style={{ margin: '0 4px', fontSize: 12, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)' }}>
                  {[10, 15, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                por página
              </label>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                <button type="button" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}
                  style={{ padding: '3px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', cursor: safePage <= 1 ? 'default' : 'pointer', opacity: safePage <= 1 ? .4 : 1, color: 'var(--text)' }}>
                  ‹ Ant
                </button>
                <span style={{ padding: '0 6px', fontWeight: 600, color: 'var(--text)' }}>{safePage}/{totalPages}</span>
                <button type="button" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}
                  style={{ padding: '3px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', cursor: safePage >= totalPages ? 'default' : 'pointer', opacity: safePage >= totalPages ? .4 : 1, color: 'var(--text)' }}>
                  Sig ›
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmItem}
        title="Eliminar categoría"
        message={`¿Eliminar "${confirmItem?.name}"? Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        variant="danger"
        onConfirm={() => { onDelete(confirmItem.id); setConfirmItem(null) }}
        onCancel={() => setConfirmItem(null)}
      />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   [LEGACY PLACEHOLDER — no longer used; kept so nothing below breaks]
───────────────────────────────────────────────────────────────────────────── */
function CatalogSection({ title, icon, items, columns, form, setForm, onAdd, onDelete, onEdit,
                          isAdmin, loading, csvSchema, onBulkAdd, onBulkDone }) {
  const [pageSize,  setPageSize]  = useState(10)
  const [page,      setPage]      = useState(1)
  const [collapsed, setCollapsed] = useState(false)
  const [editId,    setEditId]    = useState(null)
  const [editForm,  setEditForm]  = useState({})
  const [bulkProgress, setBulkProgress] = useState(null)
  const [confirmItem, setConfirmItem] = useState(null)   // item pendiente de eliminar
  const fileRef = useRef(null)

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const pageItems  = items.slice((safePage - 1) * pageSize, safePage * pageSize)

  function startEdit(item) {
    setEditId(item.id)
    // seed editForm with all column keys from the item
    const seed = {}
    columns.forEach(c => { seed[c.key] = item[c.key] ?? (c.type === 'checkbox' ? false : c.type === 'number' ? 0 : '') })
    setEditForm(seed)
  }
  function cancelEdit() { setEditId(null); setEditForm({}) }

  async function submitEdit(itemId) {
    if (!onEdit) return
    await onEdit(itemId, editForm)
    setEditId(null); setEditForm({})
  }

  function downloadCSV() {
    if (!csvSchema) return
    const header = csvSchema.headers.join(',')
    const examples = (csvSchema.examples || []).map(row => row.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + header + '\n' + examples], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url
    a.download = `layout_${title.toLowerCase().replace(/\s+/g,'_')}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  async function uploadCSV(e) {
    const file = e.target.files?.[0]; if (!file || !onBulkAdd) return
    e.target.value = ''
    const text  = await file.text()
    const lines = text.split(/\r?\n/).filter(Boolean)
    const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/^"|"$/g, ''))
    const dataRows = lines.slice(1)
    setBulkProgress({ done: 0, total: dataRows.length })
    let done = 0
    for (const line of dataRows) {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      const obj  = Object.fromEntries(header.map((h, i) => [h, vals[i] ?? '']))
      try { await onBulkAdd(obj) } catch { /* skip */ }
      done++; setBulkProgress({ done, total: dataRows.length })
    }
    setBulkProgress(null)
    onBulkDone?.()
  }

  useEffect(() => { setPage(1) }, [items.length, pageSize])

  function renderCell(col, item) {
    if (col.type === 'color' && col.key === 'hex' && item.hex)
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 16, height: 16, borderRadius: 3, background: item.hex, border: '1px solid var(--border)', display: 'inline-block', flexShrink: 0 }} />
        {item.hex}
      </span>
    if (col.type === 'checkbox')
      return <span style={{ color: item[col.key] ? '#059669' : 'var(--muted)' }}>{item[col.key] ? '✓' : '—'}</span>
    return <span>{item[col.key] ?? '—'}</span>
  }

  function renderEditCell(col) {
    if (col.type === 'color')
      return <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input value={editForm[col.key] || ''} onChange={e => setEditForm(f => ({ ...f, [col.key]: e.target.value }))}
          style={{ margin: 0, width: 70, fontSize: 12 }} />
        <input type="color" value={editForm[col.key] || '#000000'}
          onChange={e => setEditForm(f => ({ ...f, [col.key]: e.target.value }))}
          style={{ margin: 0, width: 30, height: 28, padding: 2, cursor: 'pointer', border: '1px solid var(--border)', borderRadius: 4 }} />
      </div>
    if (col.type === 'number')
      return <input type="number" value={editForm[col.key] ?? 0}
        onChange={e => setEditForm(f => ({ ...f, [col.key]: Number(e.target.value) }))}
        style={{ margin: 0, width: col.width || 70, fontSize: 12 }} />
    if (col.type === 'checkbox')
      return <input type="checkbox" checked={!!editForm[col.key]}
        onChange={e => setEditForm(f => ({ ...f, [col.key]: e.target.checked }))}
        style={{ width: 'auto', margin: 0 }} />
    return <input value={editForm[col.key] || ''}
      onChange={e => setEditForm(f => ({ ...f, [col.key]: e.target.value }))}
      style={{ margin: 0, width: col.width || 120, fontSize: 12 }} />
  }

  return (
    <div className="section-card" style={{ minHeight: collapsed ? 0 : 200 }}>
      {/* Header — clic para colapsar */}
      <div className="section-card-header" style={{ flexWrap: 'wrap', gap: 8, cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setCollapsed(v => !v)}>
        <h3 className="section-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', transition: 'transform .2s', display: 'inline-block', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▾</span>
          {icon} {title}
          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>({items.length})</span>
        </h3>
        {csvSchema && isAdmin && !collapsed && (
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }} onClick={e => e.stopPropagation()}>
            <button type="button" onClick={downloadCSV}
              style={{ fontSize: 11, padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text)' }}>
              ↓ Layout CSV
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={!!bulkProgress}
              style={{ fontSize: 11, padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text)' }}>
              {bulkProgress ? `Cargando ${bulkProgress.done}/${bulkProgress.total}…` : '↑ Carga masiva'}
            </button>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={uploadCSV} />
          </div>
        )}
      </div>

      {!collapsed && (
        <>
          {/* Add form */}
          {isAdmin && (
            <form onSubmit={onAdd} style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {columns.map(col => (
                <div key={col.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{col.label}</label>
                  {col.type === 'color' ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input value={form[col.key] || ''} onChange={e => setForm(f => ({ ...f, [col.key]: e.target.value }))}
                        placeholder={col.placeholder} style={{ margin: 0, width: col.width || 120 }} required={col.required} />
                      <input type="color" value={form.hex || '#000000'}
                        onChange={e => setForm(f => ({ ...f, hex: e.target.value }))}
                        style={{ margin: 0, width: 40, height: 36, padding: 2, cursor: 'pointer', border: '1px solid var(--border)', borderRadius: 6 }} />
                    </div>
                  ) : col.type === 'number' ? (
                    <input type="number" value={form[col.key] ?? ''} onChange={e => setForm(f => ({ ...f, [col.key]: Number(e.target.value) }))}
                      placeholder={col.placeholder} style={{ margin: 0, width: col.width || 80 }} />
                  ) : col.type === 'checkbox' ? (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!form[col.key]} onChange={e => setForm(f => ({ ...f, [col.key]: e.target.checked }))}
                        style={{ width: 'auto', margin: 0 }} />
                      {col.checkLabel}
                    </label>
                  ) : (
                    <input value={form[col.key] || ''} onChange={e => setForm(f => ({ ...f, [col.key]: e.target.value }))}
                      placeholder={col.placeholder} style={{ margin: 0, width: col.width || 140 }} required={col.required} />
                  )}
                </div>
              ))}
              <button type="submit" className="primary-btn" disabled={loading} style={{ height: 36, padding: '0 16px' }}>
                + Agregar
              </button>
            </form>
          )}

          {/* Table */}
          {items.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Sin registros. {isAdmin ? 'Agrega el primero arriba.' : ''}
            </div>
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>ID</th>
                      {columns.map(col => <th key={col.key}>{col.label}</th>)}
                      {isAdmin && <th style={{ width: 80 }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map(item => (
                      <tr key={item.id} style={{ background: editId === item.id ? 'var(--brand-soft)' : undefined }}>
                        <td><code style={{ fontSize: 11, color: 'var(--muted)' }}>#{item.id}</code></td>
                        {columns.map(col => (
                          <td key={col.key}>
                            {editId === item.id ? renderEditCell(col) : renderCell(col, item)}
                          </td>
                        ))}
                        {isAdmin && (
                          <td>
                            {editId === item.id ? (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <Ib icon="check" tip="Guardar" variant="success" onClick={() => submitEdit(item.id)} />
                                <Ib icon="close" tip="Cancelar" variant="ghost" onClick={cancelEdit} />
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: 4 }}>
                                {onEdit && <Ib icon="edit" tip="Editar" variant="ghost" onClick={() => startEdit(item)} />}
                                <Ib icon="delete" tip="Eliminar" variant="danger" onClick={() => setConfirmItem(item)} />
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
                <span>{items.length} registros</span>
                <span>·</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Mostrar
                  <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                    style={{ margin: '0 4px', fontSize: 12, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)' }}>
                    {[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  por página
                </label>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
                  <button type="button" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}
                    style={{ padding: '3px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', cursor: safePage <= 1 ? 'default' : 'pointer', opacity: safePage <= 1 ? .4 : 1, color: 'var(--text)' }}>
                    ‹ Anterior
                  </button>
                  <span style={{ padding: '0 6px' }}>{safePage} / {totalPages}</span>
                  <button type="button" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}
                    style={{ padding: '3px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', cursor: safePage >= totalPages ? 'default' : 'pointer', opacity: safePage >= totalPages ? .4 : 1, color: 'var(--text)' }}>
                    Siguiente ›
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!confirmItem}
        title="Eliminar registro"
        message={`¿Eliminar "${confirmItem?.name ?? `#${confirmItem?.id}`}"? Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        onConfirm={() => { onDelete(confirmItem.id); setConfirmItem(null) }}
        onCancel={() => setConfirmItem(null)}
      />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   CategoriasSection — árbol padre/hijo con collapse + inline-edit
───────────────────────────────────────────────────────────────────────────── */
function CategoriasSection({ categorias, isAdmin, loading, onAdd, onDelete, onEdit, onBulkDone }) {
  const [form,        setForm]        = useState({ name: '', parent_id: '' })
  const [mode,        setMode]        = useState('root')
  const [pageSize,    setPageSize]    = useState(10)
  const [page,        setPage]        = useState(1)
  const [collapsed,   setCollapsed]   = useState(false)
  const [confirmItem, setConfirmItem] = useState(null)
  const [editId,    setEditId]    = useState(null)
  const [editForm,  setEditForm]  = useState({ name: '', parent_id: '' })
  const fileRef = useRef(null)
  const [bulkProgress, setBulkProgress] = useState(null)

  const roots    = categorias.filter(c => !c.parent_id)
  const children = categorias.filter(c =>  c.parent_id)

  const tree = []
  roots.forEach(r => {
    tree.push({ ...r, _level: 0 })
    children.filter(c => c.parent_id === r.id).sort((a, b) => a.name.localeCompare(b.name))
      .forEach(c => tree.push({ ...c, _level: 1 }))
  })
  children.filter(c => !roots.find(r => r.id === c.parent_id))
    .forEach(c => tree.push({ ...c, _level: 1 }))

  const totalPages = Math.max(1, Math.ceil(tree.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const pageItems  = tree.slice((safePage - 1) * pageSize, safePage * pageSize)

  useEffect(() => { setPage(1) }, [categorias.length, pageSize])

  function handleSubmit(e) {
    e.preventDefault()
    onAdd({ name: form.name, parent_id: mode === 'sub' && form.parent_id ? Number(form.parent_id) : null },
      () => setForm({ name: '', parent_id: '' }))
  }

  function startEdit(item) {
    setEditId(item.id)
    setEditForm({ name: item.name, parent_id: item.parent_id ? String(item.parent_id) : '' })
  }
  function cancelEdit() { setEditId(null); setEditForm({ name: '', parent_id: '' }) }
  async function submitEdit(itemId) {
    if (!onEdit) return
    await onEdit(itemId, { name: editForm.name, parent_id: editForm.parent_id ? Number(editForm.parent_id) : null })
    setEditId(null)
  }

  function downloadCSV() {
    const blob = new Blob(['﻿name,parent_name\n"Calzado",""\n"Deportivo","Calzado"\n"Casual","Calzado"'], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'layout_categorias.csv'; a.click(); URL.revokeObjectURL(url)
  }

  async function uploadCSV(e) {
    const file = e.target.files?.[0]; if (!file) return
    e.target.value = ''
    const text = await file.text()
    const lines = text.split(/\r?\n/).filter(Boolean)
    const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/^"|"$/g, ''))
    const rows = lines.slice(1)
    setBulkProgress({ done: 0, total: rows.length })
    let done = 0
    for (const line of rows) {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      const obj = Object.fromEntries(header.map((h, i) => [h, vals[i] ?? '']))
      const parent = categorias.find(c => !c.parent_id && c.name.toLowerCase() === (obj.parent_name || '').toLowerCase())
      try { await api.createCategoria({ name: obj.name, parent_id: parent?.id || null }) } catch {}
      done++; setBulkProgress({ done, total: rows.length })
    }
    setBulkProgress(null); onBulkDone?.()
  }

  const btnStyle = (active) => ({
    padding: '5px 14px', fontSize: 12, borderRadius: 6, cursor: 'pointer', fontWeight: active ? 700 : 400,
    background: active ? 'var(--brand)' : 'var(--surface)', color: active ? '#fff' : 'var(--text)',
    border: `1px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
  })

  return (
    <div className="section-card">
      {/* Header colapsable */}
      <div className="section-card-header" style={{ flexWrap: 'wrap', gap: 8, cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setCollapsed(v => !v)}>
        <h3 className="section-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', transition: 'transform .2s', display: 'inline-block', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▾</span>
          🗂️ Categorías
          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>({roots.length} raíz · {children.length} sub)</span>
        </h3>
        {isAdmin && !collapsed && (
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }} onClick={e => e.stopPropagation()}>
            <Ib icon="download" tip="Descargar layout CSV" variant="ghost" onClick={downloadCSV} />
            <Ib icon="upload" tip={bulkProgress ? `Cargando ${bulkProgress.done}/${bulkProgress.total}…` : 'Carga masiva CSV'} variant="ghost" disabled={!!bulkProgress} onClick={() => fileRef.current?.click()} />
            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={uploadCSV} />
          </div>
        )}
      </div>

      {!collapsed && (
        <>
          {/* Form agregar */}
          {isAdmin && (
            <form onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <button type="button" style={btnStyle(mode === 'root')} onClick={() => { setMode('root'); setForm(f => ({ ...f, parent_id: '' })) }}>📁 Categoría raíz</button>
                <button type="button" style={btnStyle(mode === 'sub')} onClick={() => setMode('sub')}
                  disabled={roots.length === 0} title={roots.length === 0 ? 'Crea una categoría raíz primero' : ''}>↳ Subcategoría</button>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                {mode === 'sub' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Categoría padre *</label>
                    <select value={form.parent_id} onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))} required style={{ margin: 0, minWidth: 180 }}>
                      <option value="">— seleccionar padre —</option>
                      {roots.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{mode === 'root' ? 'Nombre de categoría' : 'Nombre de subcategoría'} *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder={mode === 'root' ? 'Ej. Calzado' : 'Ej. Deportivo'} required style={{ margin: 0, width: 200 }} />
                </div>
                <button type="submit" className="primary-btn" disabled={loading} style={{ height: 36, padding: '0 16px' }}>
                  + {mode === 'root' ? 'Agregar categoría' : 'Agregar subcategoría'}
                </button>
              </div>
            </form>
          )}

          {/* Tabla */}
          {tree.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Sin categorías. {isAdmin ? 'Agrega la primera arriba.' : ''}</div>
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>ID</th>
                      <th>Nombre</th>
                      <th>Tipo</th>
                      <th>Categoría padre</th>
                      {isAdmin && <th style={{ width: 90 }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map(item => {
                      const hasKids = children.some(c => c.parent_id === item.id)
                      const isEditing = editId === item.id
                      return (
                        <tr key={item.id} style={{ background: isEditing ? 'var(--brand-soft)' : item._level === 0 ? 'var(--surface-2)' : 'transparent' }}>
                          <td><code style={{ fontSize: 11, color: 'var(--muted)' }}>#{item.id}</code></td>
                          <td>
                            {isEditing ? (
                              <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                                style={{ margin: 0, width: 160, fontSize: 12 }} autoFocus />
                            ) : (
                              <>
                                {item._level === 1 && <span style={{ color: 'var(--muted)', marginRight: 6, fontSize: 13 }}>↳</span>}
                                <span style={{ fontWeight: item._level === 0 ? 600 : 400 }}>{item.name}</span>
                              </>
                            )}
                          </td>
                          <td>
                            {item._level === 0
                              ? <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--brand)', color: '#fff', fontWeight: 600 }}>Raíz</span>
                              : <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>Sub</span>}
                          </td>
                          <td style={{ fontSize: 13 }}>
                            {isEditing && item._level === 1 ? (
                              <select value={editForm.parent_id} onChange={e => setEditForm(f => ({ ...f, parent_id: e.target.value }))} style={{ fontSize: 12, margin: 0 }}>
                                <option value="">— sin padre —</option>
                                {roots.filter(r => r.id !== item.id).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                              </select>
                            ) : (
                              <span style={{ color: 'var(--muted)' }}>{item.parent_name || '—'}</span>
                            )}
                          </td>
                          {isAdmin && (
                            <td>
                              {isEditing ? (
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <Ib icon="check" tip="Guardar" variant="success" onClick={() => submitEdit(item.id)} />
                                  <Ib icon="close" tip="Cancelar" variant="ghost" onClick={cancelEdit} />
                                </div>
                              ) : (
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <Ib icon="edit" tip="Editar categoría" variant="ghost" onClick={() => startEdit(item)} />
                                  <Ib icon="delete" tip={hasKids ? 'Tiene subcategorías' : 'Eliminar'} variant="danger" disabled={hasKids} onClick={() => setConfirmItem(item)} />
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
                <span>{tree.length} registros</span>
                <span>·</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Mostrar
                  <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                    style={{ margin: '0 4px', fontSize: 12, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)' }}>
                    {[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  por página
                </label>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                  <button type="button" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}
                    style={{ padding: '3px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', cursor: safePage <= 1 ? 'default' : 'pointer', opacity: safePage <= 1 ? .4 : 1, color: 'var(--text)' }}>‹ Anterior</button>
                  <span style={{ padding: '0 6px' }}>{safePage} / {totalPages}</span>
                  <button type="button" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}
                    style={{ padding: '3px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', cursor: safePage >= totalPages ? 'default' : 'pointer', opacity: safePage >= totalPages ? .4 : 1, color: 'var(--text)' }}>Siguiente ›</button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!confirmItem}
        title="Eliminar categoría"
        message={`¿Eliminar "${confirmItem?.name}"? Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        onConfirm={() => { onDelete(confirmItem.id); setConfirmItem(null) }}
        onCancel={() => setConfirmItem(null)}
      />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   UsuariosTabContent — tab de usuarios dentro de Configuración
───────────────────────────────────────────────────────────────────────────── */
function EyeIcon({ open }) {
  return open
    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
}

function UsuariosTabContent({ users, roles, branches, refresh, notify, isAdmin }) {
  const empty = { full_name: '', email: '', password: '', role_id: '', branch_id: '' }
  const [form,        setForm]        = useState(empty)
  const [editId,      setEditId]      = useState(null)
  const [showModal,   setShowModal]   = useState(false)
  const [showPwd,     setShowPwd]     = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [confirmUser, setConfirmUser] = useState(null)
  const [deleting,    setDeleting]    = useState(false)

  function openCreate() { setEditId(null); setForm(empty); setShowPwd(false); setShowModal(true) }
  function openEdit(u) {
    setEditId(u.id)
    setForm({ full_name: u.full_name, email: u.email, password: '', role_id: String(u.role_id), branch_id: u.branch_id || '' })
    setShowPwd(false); setShowModal(true)
  }
  function closeModal() { setShowModal(false); setEditId(null) }

  async function saveUser(e) {
    e.preventDefault()
    if (!form.role_id) return notify('Selecciona un rol', 'error')
    setSaving(true)
    try {
      if (editId) {
        const payload = { full_name: form.full_name, email: form.email, role_id: Number(form.role_id), branch_id: form.branch_id || null }
        if (form.password) payload.password = form.password
        await api.updateUser(editId, payload)
        notify('Usuario actualizado correctamente')
      } else {
        await api.createUser({ ...form, role_id: Number(form.role_id), branch_id: form.branch_id || null })
        notify('Usuario creado correctamente')
      }
      closeModal(); refresh()
    } catch (err) { notify(err.message, 'error') }
    setSaving(false)
  }

  async function toggleActive(u) {
    try { await api.updateUser(u.id, { is_active: !u.is_active }); refresh() }
    catch (e) { notify(e.message, 'error') }
  }

  async function doDeleteUser() {
    setDeleting(true)
    try {
      await api.deleteUser(confirmUser.id)
      notify('Usuario eliminado correctamente')
      setConfirmUser(null); refresh()
    } catch (e) { notify(e.message, 'error') }
    setDeleting(false)
  }

  const initials = (name) => (name || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  const avatarColor = (name) => {
    const colors = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6']
    let h = 0; for (const c of name || '') h = (h * 31 + c.charCodeAt(0)) & 0xff
    return colors[h % colors.length]
  }

  return (
    <div className="vtab-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Usuarios del sistema</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {users.length} usuario{users.length !== 1 ? 's' : ''} · {users.filter(u => u.is_active).length} activos
          </div>
        </div>
        {isAdmin && (
          <button onClick={openCreate} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '0 16px', height: 36, borderRadius: 8, border: 'none',
            background: 'var(--brand)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700,
          }}>+ Nuevo usuario</button>
        )}
      </div>

      {users.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👤</div>
          <div style={{ fontWeight: 600 }}>Sin usuarios registrados</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Crea el primer usuario con el botón de arriba</div>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                {['Usuario','Correo','Rol','Sucursal'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                ))}
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', width: 90 }}>Estado</th>
                {isAdmin && <th style={{ width: 80 }} />}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => {
                const bg = avatarColor(u.full_name)
                return (
                  <tr key={u.id} style={{ borderBottom: i < users.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 11, flexShrink: 0 }}>
                          {initials(u.full_name)}
                        </div>
                        <span style={{ fontWeight: 600 }}>{u.full_name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{u.email}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--muted)', fontSize: 12 }}>{roles.find(r => r.id === u.role_id)?.name || '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--muted)', fontSize: 12 }}>{u.branch_name || '—'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <ActiveBadge active={u.is_active} onClick={isAdmin ? () => toggleActive(u) : null} />
                    </td>
                    {isAdmin && (
                      <td style={{ padding: '8px 14px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          <Ib icon="edit" tip="Editar usuario" variant="ghost" onClick={() => openEdit(u)} />
                          <Ib icon="delete" tip="Eliminar usuario" variant="danger" onClick={() => setConfirmUser(u)} />
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmUser}
        title="Eliminar usuario"
        message={`¿Estás seguro de eliminar al usuario "${confirmUser?.full_name}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleting}
        onConfirm={doDeleteUser}
        onCancel={() => setConfirmUser(null)}
      />

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
          onClick={e => e.target === e.currentTarget && closeModal()}>
          <form onSubmit={saveUser} style={{ background: 'var(--surface)', borderRadius: 14, padding: 28, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,.3)', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{editId ? '✏️ Editar usuario' : 'Nuevo usuario'}</h3>
              <Ib icon="close" tip="Cerrar" variant="ghost" onClick={closeModal} />
            </div>
            {[
              { label: 'Nombre completo', key: 'full_name', type: 'text' },
              { label: 'Correo electrónico', key: 'email', type: 'email' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>{f.label}</label>
                <input type={f.type} required value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={{ width: '100%' }} />
              </div>
            ))}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>
                Contraseña {editId && <span style={{ fontWeight: 400, textTransform: 'none' }}>(dejar vacío para no cambiar)</span>}
              </label>
              <div style={{ position: 'relative' }}>
                <input type={showPwd ? 'text' : 'password'} required={!editId} value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  style={{ width: '100%', paddingRight: 44, margin: 0 }} />
                <button type="button" onClick={() => setShowPwd(v => !v)} style={{
                  position: 'absolute', right: 12,
                  top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 0, lineHeight: 0, width: 20, height: 20,
                }} title={showPwd ? 'Ocultar' : 'Mostrar'}>
                  <EyeIcon open={showPwd} />
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>Rol *</label>
                <select required value={form.role_id} onChange={e => setForm(p => ({ ...p, role_id: e.target.value }))} style={{ width: '100%' }}>
                  <option value="">— rol —</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>Sucursal</label>
                <select value={form.branch_id} onChange={e => setForm(p => ({ ...p, branch_id: e.target.value }))} style={{ width: '100%' }}>
                  <option value="">— todas —</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <Ab label="Cancelar" variant="ghost" onClick={closeModal} />
              <Ab
                icon={editId ? 'check' : 'add'}
                label={saving ? (editId ? 'Guardando…' : 'Creando…') : (editId ? 'Guardar cambios' : 'Crear usuario')}
                variant="primary"
                type="submit"
                disabled={saving}
              />
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   MODULE_META / ACTION_META — metadatos para la matriz de permisos
───────────────────────────────────────────────────────────────────────────── */
const MODULE_META = {
  sales:      { label: 'Ventas',        icon: '🛒', color: '#0ea5e9' },
  purchases:  { label: 'Compras',       icon: '🧾', color: '#8b5cf6' },
  inventory:  { label: 'Inventario',    icon: '📦', color: '#10b981' },
  products:   { label: 'Productos',     icon: '🏷️', color: '#f59e0b' },
  users:      { label: 'Usuarios',      icon: '👤', color: '#6366f1' },
  roles:      { label: 'Roles',         icon: '🔑', color: '#ec4899' },
  config:     { label: 'Configuración', icon: '⚙️', color: '#64748b' },
  accounting: { label: 'Contabilidad',  icon: '📊', color: '#14b8a6' },
  reports:    { label: 'Reportes',      icon: '📈', color: '#ef4444' },
}

const ACTION_META = {
  read:   { label: 'Ver',          icon: '👁' },
  write:  { label: 'Crear/Editar', icon: '✏️' },
  delete: { label: 'Eliminar',     icon: '🗑️' },
  admin:  { label: 'Administrar',  icon: '🛡️' },
}

/* ─────────────────────────────────────────────────────────────────────────────
   PermissionMatrix — grid de tarjetas por módulo con toggles de permisos
───────────────────────────────────────────────────────────────────────────── */
function PermissionMatrix({ grouped, editScopes, toggleScope, toggleModule, isAdmin }) {
  const modules = Object.keys(grouped)
  if (modules.length === 0) return <div style={{ color: 'var(--muted)', fontSize: 13, padding: '20px 0' }}>No hay permisos disponibles</div>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
      {modules.map(mod => {
        const meta     = MODULE_META[mod] || { label: mod, icon: '📌', color: '#6366f1' }
        const modScopes = grouped[mod]
        const allOn    = modScopes.every(s => editScopes.includes(s.scope))
        const someOn   = modScopes.some(s => editScopes.includes(s.scope))
        const activeCount = modScopes.filter(s => editScopes.includes(s.scope)).length

        return (
          <div key={mod} style={{
            border: someOn ? `1.5px solid ${meta.color}50` : '1.5px solid var(--border)',
            borderRadius: 12, overflow: 'hidden',
            background: someOn ? `${meta.color}08` : 'var(--surface)',
            transition: 'all .15s',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px',
              background: someOn ? `${meta.color}18` : 'var(--surface-2)',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{
                  width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: someOn ? meta.color : 'var(--surface)', fontSize: 17,
                  boxShadow: '0 1px 4px rgba(0,0,0,.12)',
                }}>{meta.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: someOn ? meta.color : 'var(--text)' }}>{meta.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>
                    {activeCount}/{modScopes.length} permiso{modScopes.length !== 1 ? 's' : ''} activo{activeCount !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
              {isAdmin && (
                <button type="button" onClick={() => toggleModule(mod)}
                  title={allOn ? 'Desactivar todos' : 'Activar todos'}
                  style={{
                    width: 38, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                    background: allOn ? meta.color : 'var(--border)',
                    position: 'relative', transition: 'background .2s', flexShrink: 0,
                  }}>
                  <span style={{
                    position: 'absolute', top: 3, left: allOn ? 19 : 3,
                    width: 16, height: 16, borderRadius: '50%', background: '#fff',
                    transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.25)',
                  }} />
                </button>
              )}
            </div>

            <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {modScopes.map(s => {
                const actionMeta = ACTION_META[s.action] || { label: s.action, icon: '•' }
                const on = editScopes.includes(s.scope)
                return (
                  <label key={s.scope} style={{
                    display: 'flex', alignItems: 'center', gap: 9,
                    padding: '7px 8px', borderRadius: 8,
                    cursor: isAdmin ? 'pointer' : 'default',
                    background: on ? `${meta.color}12` : 'transparent',
                    transition: 'background .1s',
                  }}>
                    <input type="checkbox" checked={on} disabled={!isAdmin}
                      onChange={() => isAdmin && toggleScope(s.scope)}
                      style={{ width: 'auto', margin: 0, accentColor: meta.color, cursor: isAdmin ? 'pointer' : 'default' }} />
                    <span style={{ fontSize: 15, flexShrink: 0 }}>{actionMeta.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: on ? 600 : 400, color: on ? 'var(--text)' : 'var(--muted)' }}>
                        {s.label || actionMeta.label}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace', marginTop: 1 }}>{s.scope}</div>
                    </div>
                    {on && <span style={{ fontSize: 11, color: meta.color, fontWeight: 800, flexShrink: 0 }}>✓</span>}
                  </label>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   RolesTabContent — pantalla completa con lista fija izquierda + editor derecho
───────────────────────────────────────────────────────────────────────────── */
function RolesTabContent({ roles, scopes, refresh, notify, isAdmin }) {
  const [selectedId,   setSelectedId]   = useState(null)
  const [creating,     setCreating]     = useState(false)
  const [newName,      setNewName]      = useState('')
  const [editScopes,   setEditScopes]   = useState([])
  const [saving,       setSaving]       = useState(false)
  const [deleting,     setDeleting]     = useState(false)
  const [confirmRole,  setConfirmRole]  = useState(null)
  const [scopeSearch, setScopeSearch] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [editName,    setEditName]    = useState('')

  useEffect(() => {
    if (roles.length > 0 && selectedId === null && !creating) {
      setSelectedId(roles[0].id); setEditScopes(roles[0].scopes || [])
    }
  }, [roles])

  const selectedRole = roles.find(r => r.id === selectedId)

  function startCreate() { setCreating(true); setSelectedId(null); setNewName(''); setEditScopes([]) }
  function cancelCreate() {
    setCreating(false)
    if (roles.length > 0) { setSelectedId(roles[0].id); setEditScopes(roles[0].scopes || []) }
  }
  function selectRole(r) { setCreating(false); setSelectedId(r.id); setEditScopes(r.scopes || []); setScopeSearch(''); setEditingName(false) }
  function toggleScope(scope) { setEditScopes(p => p.includes(scope) ? p.filter(s => s !== scope) : [...p, scope]) }
  function toggleModule(mod) {
    const ms = scopes.filter(s => s.scope.startsWith(mod + ':')).map(s => s.scope)
    const allOn = ms.every(s => editScopes.includes(s))
    setEditScopes(p => allOn ? p.filter(s => !ms.includes(s)) : [...new Set([...p, ...ms])])
  }
  function selectAll() { setEditScopes(scopes.map(s => s.scope)) }
  function clearAll()  { setEditScopes([]) }

  async function saveCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    try {
      const created = await api.createRole({ name: newName.trim(), scopes: editScopes })
      notify('Rol creado correctamente')
      await refresh()
      setCreating(false); setNewName('')
      setSelectedId(created.id); setEditScopes(created.scopes || [])
    } catch (err) { notify(err.message, 'error') }
    setSaving(false)
  }

  const grouped = {}
  for (const s of scopes) {
    const [mod, action] = s.scope.split(':')
    if (!grouped[mod]) grouped[mod] = []
    grouped[mod].push({ ...s, mod, action })
  }

  const panelDirty = selectedRole &&
    JSON.stringify([...editScopes].sort()) !== JSON.stringify([...(selectedRole.scopes || [])].sort())

  async function saveEdit() {
    if (!selectedRole) return
    setSaving(true)
    try {
      await api.updateRole(selectedRole.id, { name: selectedRole.name, scopes: editScopes })
      notify('Permisos actualizados'); await refresh()
    } catch (err) { notify(err.message, 'error') }
    setSaving(false)
  }

  async function saveRoleName() {
    if (!selectedRole || !editName.trim()) return
    setSaving(true)
    try {
      await api.updateRole(selectedRole.id, { name: editName.trim(), scopes: selectedRole.scopes || [] })
      notify('Nombre actualizado'); setEditingName(false); await refresh()
    } catch (err) { notify(err.message, 'error') }
    setSaving(false)
  }

  async function doDelete(r) {
    setDeleting(true)
    try {
      await api.deleteRole(r.id); notify('Rol eliminado')
      setSelectedId(null); await refresh()
    } catch (err) { notify(err.message, 'error') }
    setDeleting(false)
    setConfirmRole(null)
  }

  // total scopes count for coverage bar
  const totalScopes = scopes.length

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 210px)', minHeight: 480, gap: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>

      {/* ══ Panel izquierdo: lista de roles ══ */}
      <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>Roles</span>
            <span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--surface)', padding: '1px 8px', borderRadius: 10, border: '1px solid var(--border)' }}>{roles.length}</span>
          </div>
        </div>

        {/* Lista scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {creating && (
            <div style={{ padding: '10px 12px', marginBottom: 4, borderRadius: 9, border: '2px solid var(--brand)', background: 'var(--brand-soft)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', marginBottom: 2 }}>Nuevo rol</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Completa el formulario →</div>
            </div>
          )}
          {roles.map(r => {
            const active = selectedId === r.id && !creating
            const cnt    = (r.scopes || []).length
            const pct    = totalScopes > 0 ? (cnt / totalScopes) * 100 : 0
            return (
              <button key={r.id} onClick={() => selectRole(r)} style={{
                display: 'block', width: '100%', textAlign: 'left', marginBottom: 4,
                padding: '10px 12px 8px', borderRadius: 9, cursor: 'pointer',
                border: 'none', borderLeft: `3px solid ${active ? 'var(--brand)' : 'transparent'}`,
                background: active ? 'var(--brand-soft)' : 'transparent',
                transition: 'all .12s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: active ? 'var(--brand)' : 'var(--text)' }}>{r.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: active ? 'var(--brand)' : 'var(--surface-2)', color: active ? '#fff' : 'var(--muted)' }}>{cnt}</span>
                </div>
                {/* Barra de cobertura */}
                <div style={{ height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: active ? 'var(--brand)' : '#94a3b8', transition: 'width .3s', borderRadius: 2 }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>{cnt === 0 ? 'Sin permisos' : `${Math.round(pct)}% de acceso`}</div>
              </button>
            )
          })}
          {roles.length === 0 && !creating && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>🔑</div>
              Sin roles
            </div>
          )}
        </div>

        {/* Footer: botón nuevo */}
        {isAdmin && (
          <div style={{ padding: '10px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <button onClick={startCreate} style={{
              width: '100%', height: 34, borderRadius: 8, border: '1.5px dashed var(--brand)',
              background: 'transparent', color: 'var(--brand)', cursor: 'pointer', fontWeight: 700, fontSize: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M10 4a1 1 0 011 1v4h4a1 1 0 010 2h-4v4a1 1 0 01-2 0v-4H5a1 1 0 010-2h4V5a1 1 0 011-1z"/></svg>
              Nuevo rol
            </button>
          </div>
        )}
      </div>

      {/* ══ Panel derecho: editor de permisos ══ */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {creating ? (
          <form onSubmit={saveCreate} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header crear */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>Nombre del nuevo rol</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} required autoFocus
                  placeholder="Ej. Cajero, Supervisor, Bodega…"
                  style={{ width: '100%', fontWeight: 600, fontSize: 14, border: '2px solid var(--brand)' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'flex-end', paddingBottom: 2 }}>
                <Ab label="Cancelar" variant="ghost" onClick={cancelCreate} style={{ height: 36, padding: '0 14px', fontSize: 12 }} />
                <button type="submit" disabled={saving} style={{ padding: '0 18px', height: 36, borderRadius: 8, border: 'none', background: 'var(--brand)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                  {saving ? 'Creando…' : '✓ Crear rol'}
                </button>
              </div>
            </div>
            <RolePermissionEditor grouped={grouped} editScopes={editScopes} scopes={scopes}
              toggleScope={toggleScope} toggleModule={toggleModule} selectAll={selectAll} clearAll={clearAll}
              scopeSearch={scopeSearch} setScopeSearch={setScopeSearch} isAdmin />
          </form>
        ) : selectedRole ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header rol seleccionado */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: panelDirty ? '#fffbeb' : 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, transition: 'background .2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🔑</div>
                <div>
                  {editingName ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveRoleName(); if (e.key === 'Escape') setEditingName(false) }}
                        style={{ fontWeight: 700, fontSize: 15, padding: '3px 8px', margin: 0, width: 180 }} />
                      <Ib icon="check" tip="Guardar nombre" variant="success" disabled={saving} onClick={saveRoleName} />
                      <Ib icon="close" tip="Cancelar" variant="ghost" onClick={() => setEditingName(false)} />
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{selectedRole.name}</div>
                      {isAdmin && <Ib icon="edit" tip="Renombrar rol" variant="ghost" onClick={() => { setEditName(selectedRole.name); setEditingName(true) }} />}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>
                    {editScopes.length} de {totalScopes} permisos activos
                    {panelDirty && <span style={{ color: '#f59e0b', fontWeight: 700, marginLeft: 10 }}>● Cambios pendientes</span>}
                  </div>
                </div>
              </div>
              {isAdmin && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {panelDirty && (
                    <Ab icon="check" label={saving ? 'Guardando…' : 'Guardar cambios'} variant="primary" disabled={saving} onClick={saveEdit} />
                  )}
                  <Ib icon="delete" tip="Eliminar rol" variant="danger" disabled={deleting} onClick={() => setConfirmRole(selectedRole)} />
                </div>
              )}
            </div>
            <RolePermissionEditor grouped={grouped} editScopes={editScopes} scopes={scopes}
              toggleScope={toggleScope} toggleModule={toggleModule} selectAll={selectAll} clearAll={clearAll}
              scopeSearch={scopeSearch} setScopeSearch={setScopeSearch} isAdmin={isAdmin} />
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', gap: 10 }}>
            <div style={{ fontSize: 48, opacity: .3 }}>🔑</div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Selecciona un rol para editar sus permisos</div>
            <div style={{ fontSize: 13 }}>o crea uno nuevo con el botón de abajo a la izquierda</div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmRole}
        title="Eliminar rol"
        message={`¿Estás seguro de eliminar el rol "${confirmRole?.name}"? Los usuarios con este rol perderán sus permisos.`}
        confirmLabel="Sí, eliminar"
        loading={deleting}
        onConfirm={() => doDelete(confirmRole)}
        onCancel={() => setConfirmRole(null)}
      />
    </div>
  )
}

function RolePermissionEditor({ grouped, editScopes, scopes, toggleScope, toggleModule, selectAll, clearAll, scopeSearch, setScopeSearch, isAdmin }) {
  const totalScopes = scopes.length
  const activeCount = editScopes.length
  const q = scopeSearch.toLowerCase()

  const filteredGrouped = {}
  for (const [mod, items] of Object.entries(grouped)) {
    const filtered = q ? items.filter(s => s.label?.toLowerCase().includes(q) || s.scope.includes(q)) : items
    if (filtered.length > 0) filteredGrouped[mod] = filtered
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Barra de herramientas */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, background: 'var(--surface)' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 260 }}>
          <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--muted)', pointerEvents: 'none' }} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="8.5" cy="8.5" r="5.5"/><path d="M13.5 13.5L18 18"/></svg>
          <input value={scopeSearch} onChange={e => setScopeSearch(e.target.value)}
            placeholder="Buscar permiso…"
            style={{ paddingLeft: 30, height: 30, fontSize: 12, width: '100%' }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          <strong style={{ color: activeCount > 0 ? 'var(--brand)' : 'var(--text)' }}>{activeCount}</strong> / {totalScopes}
        </div>
        {isAdmin && (
          <>
            <Ab label="Todos" icon="check" variant="ghost" onClick={selectAll} />
            <Ab label="Ninguno" icon="close" variant="ghost" onClick={clearAll} />
          </>
        )}
      </div>

      {/* Matriz scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
        <PermissionMatrix grouped={filteredGrouped} editScopes={editScopes}
          toggleScope={toggleScope} toggleModule={toggleModule} isAdmin={isAdmin} />
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   ImpresoraTab — configuración de impresoras, formatos y plantillas
───────────────────────────────────────────────────────────────────────────── */
/* Vista previa de plantilla — simula la apariencia del documento impreso */
function TemplatePreview({ t }) {
  const baseFmt = PRINT_FORMATS.find(f => f.id === t.format_id)
  const isThermal = t.paper?.includes('mm')
  const paperW = isThermal ? 200 : 220

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{
        width: paperW, background: '#fff', border: '1px solid #d1d5db',
        borderRadius: 4, overflow: 'hidden', fontFamily: isThermal ? 'monospace' : 'sans-serif',
        fontSize: isThermal ? 11 : 12, color: '#111', boxShadow: '0 4px 16px rgba(0,0,0,.12)',
      }}>
        {/* Encabezado */}
        <div style={{ padding: isThermal ? '10px 10px 6px' : '14px 14px 8px', textAlign: 'center', borderBottom: '1px dashed #ccc' }}>
          {t.logo && (
            <div style={{ marginBottom: 6, fontSize: isThermal ? 18 : 22 }}>🏢</div>
          )}
          {t.header ? (
            <div style={{ fontWeight: 700, fontSize: isThermal ? 12 : 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{t.header}</div>
          ) : (
            <div style={{ color: '#9ca3af', fontSize: 10, fontStyle: 'italic' }}>Encabezado vacío</div>
          )}
          {baseFmt && (
            <div style={{ marginTop: 4, fontSize: 10, color: '#6b7280' }}>{baseFmt.icon} {baseFmt.label}</div>
          )}
        </div>

        {/* Cuerpo simulado */}
        <div style={{ padding: isThermal ? '8px 10px' : '10px 14px' }}>
          {[
            { label: 'Fecha', value: new Date().toLocaleDateString() },
            { label: 'N° Doc', value: '000001' },
            { label: 'Cliente', value: '——————' },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 10 }}>
              <span style={{ color: '#6b7280' }}>{row.label}</span>
              <span style={{ fontWeight: 600 }}>{row.value}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px dashed #ccc', margin: '6px 0' }} />
          {[['Producto ejemplo', '$10.00'], ['Otro producto', '$5.00']].map(([n, v]) => (
            <div key={n} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, fontSize: 10 }}>
              <span>{n}</span><span style={{ fontWeight: 600 }}>{v}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px solid #111', marginTop: 6, paddingTop: 4, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: isThermal ? 12 : 13 }}>
            <span>TOTAL</span><span>$15.00</span>
          </div>
        </div>

        {/* Pie de página */}
        <div style={{ padding: isThermal ? '6px 10px 10px' : '8px 14px 12px', textAlign: 'center', borderTop: '1px dashed #ccc' }}>
          {t.footer ? (
            <div style={{ fontSize: 10, color: '#374151', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{t.footer}</div>
          ) : (
            <div style={{ color: '#9ca3af', fontSize: 10, fontStyle: 'italic' }}>Pie de página vacío</div>
          )}
          {t.copies > 1 && (
            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center', gap: 4 }}>
              {Array.from({ length: Math.min(t.copies, 4) }).map((_, i) => (
                <div key={i} style={{ width: 14, height: 18, background: '#e5e7eb', borderRadius: 2, border: '1px solid #d1d5db', fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>{i + 1}</div>
              ))}
              {t.copies > 4 && <span style={{ fontSize: 10, color: '#6b7280', alignSelf: 'center' }}>+{t.copies - 4}</span>}
            </div>
          )}
        </div>

        {/* Info técnica */}
        <div style={{ padding: '4px 10px 6px', background: '#f9fafb', borderTop: '1px solid #e5e7eb', textAlign: 'center' }}>
          <span style={{ fontSize: 9, color: '#9ca3af', fontFamily: 'monospace' }}>{t.paper || 'A4'} · {t.name || 'Sin nombre'}</span>
        </div>
      </div>
    </div>
  )
}

const PRINT_FORMATS = [
  { id: 'tiquete_venta',   module: 'Ventas',       label: 'Tiquete de venta',        icon: '🧾', paper: '80mm' },
  { id: 'factura',         module: 'Ventas',       label: 'Factura electrónica',      icon: '📄', paper: 'A4' },
  { id: 'comprobante_pago',module: 'Ventas',       label: 'Comprobante de pago',      icon: '💳', paper: '80mm' },
  { id: 'orden_compra',    module: 'Compras',      label: 'Orden de compra',          icon: '📋', paper: 'A4' },
  { id: 'entrada_mercia',  module: 'Compras',      label: 'Entrada de mercancía',     icon: '📦', paper: 'A4' },
  { id: 'etiqueta_prod',   module: 'Inventario',   label: 'Etiqueta de producto',     icon: '🏷️', paper: '40x30mm' },
  { id: 'ajuste_inv',      module: 'Inventario',   label: 'Ajuste de inventario',     icon: '🔄', paper: 'A4' },
  { id: 'cierre_caja',     module: 'Caja',         label: 'Cierre de caja / Corte Z', icon: '💰', paper: '80mm' },
  { id: 'reporte_ventas',  module: 'Reportes',     label: 'Reporte de ventas',        icon: '📊', paper: 'A4' },
]

const PRINT_METHODS = [
  { value: 'browser', label: 'Navegador (Ctrl+P)', hint: 'Diálogo estándar del navegador' },
  { value: 'pdf',     label: 'Descargar PDF',      hint: 'Genera y descarga un PDF' },
  { value: 'thermal', label: 'Térmica (ESC/POS)',  hint: 'Impresora de tickets por red o USB' },
  { value: 'direct',  label: 'Directa (IP/Puerto)',hint: 'Impresión directa vía IP' },
]

const PAPER_SIZES = ['A4','A5','Letter','80mm','58mm','40x30mm','50x25mm','Personalizado']
const PRINTER_TYPES = ['Térmica','Láser','Inyección de tinta','Matricial','Etiquetadora']
const CONN_TYPES = ['Red (IP/Puerto)','USB','Bluetooth','WiFi']

function ImpresoraTab({ imp, onChange, dirty, saving, onSave, isAdmin }) {
  const [activeSection, setActiveSection] = useState('formatos')

  // imp.printers: [{id, name, type, model, connection, ip, port}]
  // imp.formats:  {[formatId]: {method, printer_id, template_id}}
  // imp.templates:[{id, name, module, format_id, paper, header, footer, logo, copies}]

  const printers  = imp.printers  || []
  const formats   = imp.formats   || {}
  const templates = imp.templates || []

  const [newPrinter,    setNewPrinter]    = useState({ name: '', type: 'Térmica', model: '', connection: 'Red (IP/Puerto)', ip: '', port: '9100' })
  const [newTemplate,   setNewTemplate]   = useState({ name: '', module: 'Ventas', format_id: '', paper: 'A4', header: '', footer: '', logo: false, copies: 1 })
  const [confirmPrint,  setConfirmPrint]  = useState(null)
  const [confirmTpl,    setConfirmTpl]    = useState(null)

  function addPrinter() {
    if (!newPrinter.name.trim()) return
    const list = [...printers, { ...newPrinter, id: Date.now() }]
    onChange('printers', list)
    setNewPrinter({ name: '', type: 'Térmica', model: '', connection: 'Red (IP/Puerto)', ip: '', port: '9100' })
  }

  function removePrinter(id) { onChange('printers', printers.filter(p => p.id !== id)) }

  function setFormatConfig(fid, key, val) {
    onChange('formats', { ...formats, [fid]: { ...(formats[fid] || {}), [key]: val } })
  }

  function addTemplate() {
    if (!newTemplate.name.trim()) return
    const list = [...templates, { ...newTemplate, id: Date.now() }]
    onChange('templates', list)
    setNewTemplate({ name: '', module: 'Ventas', format_id: '', paper: 'A4', header: '', footer: '', logo: false, copies: 1 })
  }

  function removeTemplate(id) { onChange('templates', templates.filter(t => t.id !== id)) }

  const modules = [...new Set(PRINT_FORMATS.map(f => f.module))]

  const sectionBtn = (id, label, icon) => (
    <button onClick={() => setActiveSection(id)} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
      fontWeight: activeSection === id ? 700 : 500, fontSize: 13,
      background: activeSection === id ? 'var(--brand)' : 'var(--surface-2)',
      color: activeSection === id ? '#fff' : 'var(--text)',
    }}>{icon} {label}</button>
  )

  return (
    <div className="vtab-content" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Sección nav */}
      <div style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
        {sectionBtn('formatos',   'Formatos y métodos', '🖨️')}
        {sectionBtn('impresoras', 'Impresoras',         '🖥️')}
        {sectionBtn('plantillas', 'Plantillas',         '📐')}
      </div>

      {/* ── Formatos y métodos ── */}
      {activeSection === 'formatos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Configura el método de impresión y la impresora predeterminada para cada formato de documento.
          </div>
          {modules.map(mod => (
            <div key={mod} className="section-card">
              <div className="section-card-header"><h3 className="section-card-title">{mod}</h3></div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)' }}>
                    {['Formato','Tamaño papel','Método de impresión','Impresora','Plantilla'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PRINT_FORMATS.filter(f => f.module === mod).map((f, i, arr) => {
                    const cfg = formats[f.id] || {}
                    return (
                      <tr key={f.id} style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 18 }}>{f.icon}</span>
                            <span style={{ fontWeight: 600 }}>{f.label}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'var(--surface-2)', fontWeight: 600, fontFamily: 'monospace' }}>{f.paper}</span>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <select disabled={!isAdmin} value={cfg.method || 'browser'}
                            onChange={e => setFormatConfig(f.id, 'method', e.target.value)}
                            style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', width: '100%' }}>
                            {PRINT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <select disabled={!isAdmin} value={cfg.printer_id || ''}
                            onChange={e => setFormatConfig(f.id, 'printer_id', e.target.value)}
                            style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', width: '100%' }}>
                            <option value="">— Por defecto —</option>
                            {printers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <select disabled={!isAdmin} value={cfg.template_id || ''}
                            onChange={e => setFormatConfig(f.id, 'template_id', e.target.value)}
                            style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', width: '100%' }}>
                            <option value="">— Plantilla base —</option>
                            {templates.filter(t => !t.format_id || t.format_id === f.id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* ── Impresoras ── */}
      {activeSection === 'impresoras' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isAdmin && (
            <div className="section-card">
              <div className="section-card-header"><h3 className="section-card-title">Agregar impresora</h3></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
                {[
                  { label: 'Nombre',      key: 'name',       placeholder: 'Ej. Térmica Caja 1' },
                  { label: 'Modelo/Ref.', key: 'model',      placeholder: 'Ej. Epson TM-T20III' },
                  { label: 'IP / Host',   key: 'ip',         placeholder: '192.168.1.100' },
                  { label: 'Puerto',      key: 'port',       placeholder: '9100' },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>{f.label}</label>
                    <input value={newPrinter[f.key]} onChange={e => setNewPrinter(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} style={{ width: '100%' }} />
                  </div>
                ))}
                {[
                  { label: 'Tipo', key: 'type', options: PRINTER_TYPES },
                  { label: 'Conexión', key: 'connection', options: CONN_TYPES },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>{f.label}</label>
                    <select value={newPrinter[f.key]} onChange={e => setNewPrinter(p => ({ ...p, [f.key]: e.target.value }))} style={{ width: '100%' }}>
                      {f.options.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <button onClick={addPrinter} className="primary-btn" style={{ height: 36, padding: '0 18px' }}>+ Agregar impresora</button>
            </div>
          )}

          <div className="section-card">
            <div className="section-card-header"><h3 className="section-card-title">Impresoras configuradas ({printers.length})</h3></div>
            {printers.length === 0 ? (
              <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🖨️</div>
                Sin impresoras configuradas
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {printers.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 9, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🖨️</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        {p.type} · {p.model || 'Modelo no especificado'} · {p.connection}
                        {p.ip && <span style={{ marginLeft: 8, fontFamily: 'monospace', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>{p.ip}:{p.port}</span>}
                      </div>
                    </div>
                    {isAdmin && (
                      <Ib icon="delete" tip="Eliminar impresora" variant="danger" onClick={() => setConfirmPrint(p)} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Plantillas ── */}
      {activeSection === 'plantillas' && (
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          {/* Panel izquierdo: formulario */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {isAdmin && (
              <div className="section-card">
                <div className="section-card-header"><h3 className="section-card-title">Nueva plantilla</h3></div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>Nombre de la plantilla *</label>
                  <input value={newTemplate.name} onChange={e => setNewTemplate(p => ({ ...p, name: e.target.value }))}
                    placeholder="Ej. Tiquete personalizado con logo" style={{ width: '100%' }} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>Módulo</label>
                    <select value={newTemplate.module} onChange={e => setNewTemplate(p => ({ ...p, module: e.target.value, format_id: '' }))} style={{ width: '100%' }}>
                      {modules.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>Formato base</label>
                    <select value={newTemplate.format_id} onChange={e => setNewTemplate(p => ({ ...p, format_id: e.target.value }))} style={{ width: '100%' }}>
                      <option value="">— Ninguno —</option>
                      {PRINT_FORMATS.filter(pf => pf.module === newTemplate.module).map(pf => <option key={pf.id} value={pf.id}>{pf.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>Tamaño de papel</label>
                    <select value={newTemplate.paper} onChange={e => setNewTemplate(p => ({ ...p, paper: e.target.value }))} style={{ width: '100%' }}>
                      {PAPER_SIZES.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>Copias</label>
                    <input type="number" min={1} max={10} value={newTemplate.copies}
                      onChange={e => setNewTemplate(p => ({ ...p, copies: Number(e.target.value) }))} style={{ width: '100%' }} />
                  </div>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>Encabezado</label>
                  <input value={newTemplate.header} onChange={e => setNewTemplate(p => ({ ...p, header: e.target.value }))}
                    placeholder="Texto del encabezado (aparece arriba del documento)" style={{ width: '100%' }} />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>Pie de página</label>
                  <input value={newTemplate.footer} onChange={e => setNewTemplate(p => ({ ...p, footer: e.target.value }))}
                    placeholder="Ej. Gracias por su compra · No acepta devoluciones" style={{ width: '100%' }} />
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, marginBottom: 14 }}>
                  <input type="checkbox" checked={newTemplate.logo} onChange={e => setNewTemplate(p => ({ ...p, logo: e.target.checked }))} style={{ width: 'auto' }} />
                  Mostrar logo de la empresa
                </label>

                <button onClick={addTemplate} disabled={!newTemplate.name.trim()} className="primary-btn" style={{ height: 36, padding: '0 18px' }}>
                  + Agregar plantilla
                </button>
              </div>
            )}

            {/* Lista de plantillas creadas */}
            <div className="section-card">
              <div className="section-card-header"><h3 className="section-card-title">Plantillas creadas ({templates.length})</h3></div>
              {templates.length === 0 ? (
                <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📐</div>
                  Sin plantillas. Crea la primera con el formulario de arriba.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {templates.map(t => {
                    const baseFmt = PRINT_FORMATS.find(f => f.id === t.format_id)
                    return (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)' }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>📐</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{t.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                            {t.module}{baseFmt ? ` · ${baseFmt.label}` : ''} · {t.paper} · {t.copies} copia{t.copies !== 1 ? 's' : ''}
                            {t.logo && <span style={{ marginLeft: 6, padding: '1px 6px', background: '#dcfce7', color: '#15803d', borderRadius: 4, fontWeight: 600 }}>Logo</span>}
                          </div>
                        </div>
                        {isAdmin && (
                          <Ib icon="delete" tip="Eliminar plantilla" variant="danger" onClick={() => setConfirmTpl(t)} />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Panel derecho: vista previa en tiempo real */}
          <div style={{ width: 240, flexShrink: 0, position: 'sticky', top: 80 }}>
            <div className="section-card">
              <div className="section-card-header"><h3 className="section-card-title" style={{ fontSize: 12 }}>Vista previa</h3></div>
              <TemplatePreview t={newTemplate} />
            </div>
          </div>
        </div>
      )}

      {isAdmin && <SaveBar dirty={dirty} saving={saving} onSave={onSave} label="Guardar configuración de impresión" />}

      <ConfirmDialog
        open={!!confirmPrint}
        title="Eliminar impresora"
        message={`¿Eliminar la impresora "${confirmPrint?.name}"?`}
        confirmLabel="Sí, eliminar"
        onConfirm={() => { removePrinter(confirmPrint.id); setConfirmPrint(null) }}
        onCancel={() => setConfirmPrint(null)}
      />
      <ConfirmDialog
        open={!!confirmTpl}
        title="Eliminar plantilla"
        message={`¿Eliminar la plantilla "${confirmTpl?.name}"? Se perderá su configuración.`}
        confirmLabel="Sí, eliminar"
        onConfirm={() => { removeTemplate(confirmTpl.id); setConfirmTpl(null) }}
        onCancel={() => setConfirmTpl(null)}
      />
    </div>
  )
}
