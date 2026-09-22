import { useEffect, useState } from 'react'
import { api } from '../api/client.js'
import { Toast, EmptyState, StatusBadge, TabBar } from '../components/ui.jsx'

const TABS = [
  { id: 'usuarios', label: 'Usuarios', icon: '👤' },
  { id: 'roles',    label: 'Roles y permisos', icon: '🔑' },
]

export default function Usuarios() {
  const [tab, setTab]       = useState('usuarios')
  const [users, setUsers]   = useState([])
  const [roles, setRoles]   = useState([])
  const [branches, setBranches] = useState([])
  const [scopes, setScopes] = useState([])
  const [toast, setToast]   = useState(null)

  const notify = (msg, type = 'ok') => setToast({ msg, type })

  const emptyUser = { full_name: '', email: '', password: '', role_id: '', branch_id: '' }
  const [uForm, setUForm]   = useState(emptyUser)
  const [rForm, setRForm]   = useState({ name: '', scopes: [] })

  async function refresh() {
    try { setUsers(await api.listUsers()); setRoles(await api.listRoles()) }
    catch (e) { notify(e.message, 'error') }
  }

  useEffect(() => {
    refresh()
    api.me().then(m => setBranches(m.branches || [])).catch(() => {})
    api.scopes().then(setScopes).catch(() => {})
  }, [])

  async function saveUser(e) {
    e.preventDefault()
    if (!uForm.role_id) return notify('Selecciona un rol', 'error')
    try {
      await api.createUser({ ...uForm, role_id: Number(uForm.role_id), branch_id: uForm.branch_id || null })
      notify('Usuario creado'); setUForm(emptyUser); refresh()
    } catch (err) { notify(err.message, 'error') }
  }

  async function toggleActive(u) {
    try { await api.updateUser(u.id, { is_active: !u.is_active }); refresh() }
    catch (e) { notify(e.message, 'error') }
  }

  async function changeRole(u, role_id) {
    try { await api.updateUser(u.id, { role_id: Number(role_id) }); refresh() }
    catch (e) { notify(e.message, 'error') }
  }

  function toggleScope(s) {
    setRForm(f => ({ ...f, scopes: f.scopes.includes(s) ? f.scopes.filter(x => x !== s) : [...f.scopes, s] }))
  }

  async function saveRole(e) {
    e.preventDefault()
    try { await api.createRole(rForm); notify('Rol creado'); setRForm({ name: '', scopes: [] }); refresh() }
    catch (err) { notify(err.message, 'error') }
  }

  return (
    <div className="module-root">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {/* ── Usuarios ── */}
      {tab === 'usuarios' && (
        <div className="vtab-content">
          <div className="two-col-layout">
            <form onSubmit={saveUser} className="form-card">
              <h3 className="form-card-title">Nuevo usuario</h3>
              <div className="form-field"><label>Nombre completo</label><input value={uForm.full_name} onChange={e => setUForm({ ...uForm, full_name: e.target.value })} required /></div>
              <div className="form-field"><label>Correo electrónico</label><input type="email" value={uForm.email} onChange={e => setUForm({ ...uForm, email: e.target.value })} required /></div>
              <div className="form-field"><label>Contraseña</label><input type="password" value={uForm.password} onChange={e => setUForm({ ...uForm, password: e.target.value })} required /></div>
              <div className="form-row">
                <div className="form-field">
                  <label>Rol</label>
                  <select value={uForm.role_id} onChange={e => setUForm({ ...uForm, role_id: e.target.value })} required>
                    <option value="">— rol —</option>
                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label>Sucursal</label>
                  <select value={uForm.branch_id} onChange={e => setUForm({ ...uForm, branch_id: e.target.value })}>
                    <option value="">— todas / ninguna —</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>
              <button type="submit" className="form-submit-btn">Crear usuario</button>
            </form>

            <div className="table-wrap">
              {users.length === 0
                ? <EmptyState icon="👤" text="Sin usuarios registrados" />
                : (
                  <table>
                    <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Sucursal</th><th>Estado</th><th>Acción</th></tr></thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.id}>
                          <td><strong>{u.full_name}</strong></td>
                          <td className="muted">{u.email}</td>
                          <td>
                            <select className="cart-select" style={{ width: 140 }} value={u.role_id} onChange={e => changeRole(u, e.target.value)}>
                              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                          </td>
                          <td className="muted">{u.branch_name || '—'}</td>
                          <td><StatusBadge status={u.is_active ? 'active' : 'inactive'} /></td>
                          <td>
                            <button className={`action-btn ${u.is_active ? 'action-btn-danger' : 'action-btn-primary'}`}
                              onClick={() => toggleActive(u)}>
                              {u.is_active ? 'Desactivar' : 'Activar'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }
            </div>
          </div>
        </div>
      )}

      {/* ── Roles ── */}
      {tab === 'roles' && (
        <div className="vtab-content">
          <div className="two-col-layout">
            <form onSubmit={saveRole} className="form-card">
              <h3 className="form-card-title">Nuevo rol</h3>
              <div className="form-field">
                <label>Nombre del rol</label>
                <input placeholder="ej. Cajero, Bodega, Supervisor" value={rForm.name} onChange={e => setRForm({ ...rForm, name: e.target.value })} required />
              </div>
              <div className="form-field">
                <label>Permisos</label>
                <div className="scopes-grid">
                  {scopes.map(s => (
                    <label key={s.scope} className="scope-item">
                      <input type="checkbox" style={{ width: 'auto', margin: 0 }}
                        checked={rForm.scopes.includes(s.scope)}
                        onChange={() => toggleScope(s.scope)} />
                      <span>{s.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <button type="submit" className="form-submit-btn">Crear rol</button>
            </form>

            <div className="table-wrap">
              {roles.length === 0
                ? <EmptyState icon="🔑" text="Sin roles definidos" />
                : (
                  <table>
                    <thead><tr><th>Rol</th><th>Permisos</th></tr></thead>
                    <tbody>
                      {roles.map(r => (
                        <tr key={r.id}>
                          <td><strong>{r.name}</strong></td>
                          <td>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {(r.scopes || []).length === 0
                                ? <span className="muted">—</span>
                                : (r.scopes || []).map(s => <span key={s} className="badge" style={{ fontSize: 10 }}>{s}</span>)
                              }
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
