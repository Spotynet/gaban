import { useEffect, useState } from 'react'
import { api } from '../api/client.js'
import { Toast, EmptyState, StatusBadge, TabBar } from '../components/ui.jsx'
import { COUNTRY_ADDRESS } from '../data/countryAddress.js'

const CURRENCIES = [
  { code: 'COP', label: 'COP — Peso colombiano' },
  { code: 'MXN', label: 'MXN — Peso mexicano' },
  { code: 'USD', label: 'USD — Dólar estadounidense' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'PEN', label: 'PEN — Sol peruano' },
  { code: 'CLP', label: 'CLP — Peso chileno' },
  { code: 'ARS', label: 'ARS — Peso argentino' },
  { code: 'BOB', label: 'BOB — Boliviano' },
  { code: 'PYG', label: 'PYG — Guaraní paraguayo' },
  { code: 'UYU', label: 'UYU — Peso uruguayo' },
  { code: 'BRL', label: 'BRL — Real brasileño' },
  { code: 'VES', label: 'VES — Bolívar venezolano' },
  { code: 'GTQ', label: 'GTQ — Quetzal guatemalteco' },
  { code: 'HNL', label: 'HNL — Lempira hondureño' },
  { code: 'NIO', label: 'NIO — Córdoba nicaragüense' },
  { code: 'CRC', label: 'CRC — Colón costarricense' },
  { code: 'DOP', label: 'DOP — Peso dominicano' },
  { code: 'GBP', label: 'GBP — Libra esterlina' },
  { code: 'CAD', label: 'CAD — Dólar canadiense' },
]

// Todos los países del catálogo + extras comunes
const ALL_COUNTRIES = [
  ...Object.entries(COUNTRY_ADDRESS).map(([code, cfg]) => ({ code, label: cfg.label, fiscalAuth: cfg.fiscalAuth })),
  { code: 'GT', label: 'Guatemala',          fiscalAuth: 'SAT' },
  { code: 'SV', label: 'El Salvador',        fiscalAuth: 'DGII' },
  { code: 'HN', label: 'Honduras',           fiscalAuth: 'DEI' },
  { code: 'NI', label: 'Nicaragua',          fiscalAuth: 'DGI' },
  { code: 'CR', label: 'Costa Rica',         fiscalAuth: 'DGT' },
  { code: 'PA', label: 'Panamá',             fiscalAuth: 'DGI' },
  { code: 'DO', label: 'Rep. Dominicana',    fiscalAuth: 'DGII' },
  { code: 'CU', label: 'Cuba',               fiscalAuth: 'ONAT' },
  { code: 'BR', label: 'Brasil',             fiscalAuth: 'RFB' },
  { code: 'PT', label: 'Portugal',           fiscalAuth: 'AT' },
].sort((a, b) => a.label.localeCompare(b.label))

// Moneda por defecto según el país
const CURRENCY_BY_COUNTRY = {
  CO:'COP', MX:'MXN', US:'USD', PE:'PEN', CL:'CLP', AR:'ARS',
  BO:'BOB', PY:'PYG', UY:'UYU', ES:'EUR', EC:'USD', VE:'VES',
  GT:'GTQ', SV:'USD', HN:'HNL', NI:'NIO', CR:'CRC', PA:'USD',
  DO:'DOP', CU:'CUP', BR:'BRL', PT:'EUR',
}
const emptyTenant = { name: '', slug: '', base_currency: 'USD', country: '', admin_email: '', admin_password: '', admin_name: 'Administrador' }
const emptyBranch = { tenant_id: '', code: '', name: '', default_currency: 'USD', address: '' }

const TABS = [
  { id: 'gestion', label: 'Tenants y sucursales', icon: '🏢' },
  { id: 'audit',   label: 'Auditoría',            icon: '🔍' },
]

export default function Master() {
  const [tab, setTab]       = useState('gestion')
  const [tenants, setTenants] = useState([])
  const [branches, setBranches] = useState([])
  const [tForm, setTForm]   = useState(emptyTenant)
  const [bForm, setBForm]   = useState(emptyBranch)
  const [toast, setToast]   = useState(null)

  const notify = (msg, type = 'ok') => setToast({ msg, type })

  async function refresh() {
    try { setTenants(await api.listTenants()); setBranches(await api.listAllBranches()) }
    catch (e) { notify(e.message, 'error') }
  }
  useEffect(() => { refresh() }, [])

  function slugify(name) {
    return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
  }

  async function submitTenant(e) {
    e.preventDefault()
    try {
      const res = await api.createTenant({ ...tForm, slug: tForm.slug || slugify(tForm.name) })
      notify(`Tenant creado: ${res.schema} · admin ${res.admin_email}`)
      setTForm(emptyTenant); refresh()
    } catch (e) { notify(e.message, 'error') }
  }

  async function submitBranch(e) {
    e.preventDefault()
    try {
      await api.createBranch(bForm)
      notify('Sucursal creada')
      setBForm({ ...emptyBranch, tenant_id: bForm.tenant_id }); refresh()
    } catch (e) { notify(e.message, 'error') }
  }

  const setT = (k) => (e) => setTForm({ ...tForm, [k]: e.target.value })
  const setB = (k) => (e) => setBForm({ ...bForm, [k]: e.target.value })

  return (
    <div className="module-root">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'audit' && <Auditoria tenants={tenants} notify={notify} />}

      {tab === 'gestion' && (
        <div className="vtab-content">
          {/* Formularios */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <form onSubmit={submitTenant} className="form-card">
              <h3 className="form-card-title">🏢 Nuevo tenant (empresa)</h3>
              <div className="form-row">
                <div className="form-field"><label>Nombre de la empresa</label><input placeholder="Mi Empresa S.A." value={tForm.name} onChange={setT('name')} required /></div>
                <div className="form-field"><label>Slug</label><input placeholder="se autogenera" value={tForm.slug} onChange={setT('slug')} /></div>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>País</label>
                  <select value={tForm.country} onChange={e => {
                    const country = e.target.value
                    const currency = CURRENCY_BY_COUNTRY[country] || tForm.base_currency
                    setTForm(f => ({ ...f, country, base_currency: currency }))
                  }} required>
                    <option value="">— seleccionar país —</option>
                    {ALL_COUNTRIES.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.label} ({c.code}){c.fiscalAuth ? ` · ${c.fiscalAuth}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label>Moneda base</label>
                  <select value={tForm.base_currency} onChange={setT('base_currency')} required>
                    {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                <div className="form-hint" style={{ marginBottom: 10 }}>Administrador del tenant</div>
                <div className="form-field"><label>Nombre del admin</label><input value={tForm.admin_name} onChange={setT('admin_name')} /></div>
                <div className="form-row">
                  <div className="form-field"><label>Correo</label><input type="email" value={tForm.admin_email} onChange={setT('admin_email')} required /></div>
                  <div className="form-field"><label>Contraseña</label><input type="password" value={tForm.admin_password} onChange={setT('admin_password')} required /></div>
                </div>
              </div>
              <button type="submit" className="form-submit-btn">Crear tenant</button>
            </form>

            <form onSubmit={submitBranch} className="form-card">
              <h3 className="form-card-title">🏪 Nueva sucursal</h3>
              <div className="form-field">
                <label>Empresa (tenant)</label>
                <select value={bForm.tenant_id} onChange={setB('tenant_id')} required>
                  <option value="">— seleccionar —</option>
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-field"><label>Código</label><input placeholder="SUC01" value={bForm.code} onChange={setB('code')} required /></div>
                <div className="form-field"><label>Nombre</label><input placeholder="Sucursal Centro" value={bForm.name} onChange={setB('name')} required /></div>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Moneda predeterminada</label>
                  <select value={bForm.default_currency} onChange={setB('default_currency')}>
                    {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>
                </div>
                <div className="form-field"><label>Dirección</label><input placeholder="Calle 123…" value={bForm.address} onChange={setB('address')} /></div>
              </div>
              <button type="submit" className="form-submit-btn">Crear sucursal</button>
            </form>
          </div>

          {/* Tabla tenants */}
          <div className="section-card">
            <div className="section-card-header">
              <h3 className="section-card-title">Tenants ({tenants.length})</h3>
            </div>
            {tenants.length === 0
              ? <EmptyState icon="🏢" text="Sin tenants. Crea el primero arriba." />
              : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Empresa</th><th>Slug</th><th>Schema</th><th>Moneda</th><th>País</th><th>Sucursales</th><th>Estado</th></tr></thead>
                    <tbody>
                      {tenants.map(t => (
                        <tr key={t.id}>
                          <td><strong>{t.name}</strong></td>
                          <td className="muted">{t.slug}</td>
                          <td><code style={{ fontSize: 12 }}>{t.schema_name}</code></td>
                          <td>{t.base_currency}</td>
                          <td>
                            {t.country
                              ? <span title={ALL_COUNTRIES.find(c => c.code === t.country)?.label}>
                                  <strong>{t.country}</strong>
                                  <span className="muted" style={{ fontSize: 11, marginLeft: 5 }}>
                                    {ALL_COUNTRIES.find(c => c.code === t.country)?.label || ''}
                                  </span>
                                </span>
                              : '—'}
                          </td>
                          <td><span className="badge">{t.branches}</span></td>
                          <td><StatusBadge status={t.status === 'active' ? 'active' : 'inactive'} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </div>

          {/* Tabla sucursales */}
          <div className="section-card">
            <div className="section-card-header">
              <h3 className="section-card-title">Sucursales ({branches.length})</h3>
            </div>
            {branches.length === 0
              ? <EmptyState icon="🏪" text="Sin sucursales" />
              : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Código</th><th>Nombre</th><th>Moneda</th><th>Estado</th></tr></thead>
                    <tbody>
                      {branches.map(b => (
                        <tr key={b.id}>
                          <td><code style={{ fontSize: 12 }}>{b.code}</code></td>
                          <td><strong>{b.name}</strong></td>
                          <td>{b.default_currency}</td>
                          <td><StatusBadge status={b.is_active ? 'active' : 'inactive'} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </div>
        </div>
      )}
    </div>
  )
}

function Auditoria({ tenants, notify }) {
  const [rows, setRows]       = useState([])
  const [tenantId, setTenantId] = useState('')

  async function refresh() {
    try { setRows(await api.audit(tenantId)) } catch (e) { notify(e.message, 'error') }
  }
  useEffect(() => { refresh() }, [tenantId])

  const tName = (id) => tenants.find(t => t.id === id)?.name

  return (
    <div className="vtab-content">
      <div className="pos-config-bar" style={{ marginBottom: 16 }}>
        <label className="pos-config-field">
          <span>Empresa</span>
          <select value={tenantId} onChange={e => setTenantId(e.target.value)}>
            <option value="">Todas</option>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <button className="action-btn action-btn-ghost" onClick={refresh}>↻ Actualizar</button>
      </div>

      <div className="section-card">
        <div className="section-card-header"><h3 className="section-card-title">Registro de auditoría</h3></div>
        <div className="table-wrap">
          {rows.length === 0
            ? <EmptyState icon="🔍" text="Sin registros de auditoría" />
            : (
              <table>
                <thead><tr><th>Fecha</th><th>Usuario</th><th>Rol</th><th>Empresa</th><th>Acción</th><th>Método</th><th>Estado</th><th>IP</th></tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id}>
                      <td className="muted" style={{ fontSize: 12 }}>{r.created_at?.slice(0, 19).replace('T', ' ')}</td>
                      <td>{r.user_email || '—'}</td>
                      <td><span className="badge" style={{ fontSize: 11 }}>{r.role || '—'}</span></td>
                      <td>{r.tenant_name || tName(r.tenant_id) || (r.tenant_id ? '—' : 'Master')}</td>
                      <td><code style={{ fontSize: 11 }}>{r.action}</code></td>
                      <td><span className="badge" style={{ fontSize: 10 }}>{r.method}</span></td>
                      <td>
                        <span style={{ fontWeight: 700, fontSize: 13, color: r.status_code >= 400 ? '#dc2626' : '#059669' }}>
                          {r.status_code}
                        </span>
                      </td>
                      <td className="muted" style={{ fontSize: 11 }}>{r.ip || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      </div>
    </div>
  )
}
