import { useEffect, useState, useCallback } from 'react'
import { Paginator, usePaginator } from '../components/Paginator.jsx'
import { api } from '../api/client.js'
import { EmptyState, TabBar } from '../components/ui.jsx'
import { useNotify } from '../context/ToastContext.jsx'
import { Ib, Ab } from '../components/IconBtn.jsx'
import { formatMoney } from '../utils/currency.js'
import { useAuth } from '../context/AuthContext.jsx'

const n   = (x) => Number(x) || 0
const fmt = (v) => formatMoney(v, localStorage.getItem('currency') || 'USD')

const TABS = [
  { id: 'dashboard',  label: 'Dashboard',     icon: '📊' },
  { id: 'diario',     label: 'Libro Diario',  icon: '📖' },
  { id: 'cuentas',    label: 'Plan Cuentas',  icon: '📋' },
  { id: 'balanza',    label: 'Balanza',        icon: '⚖️' },
  { id: 'resultados', label: 'Resultados',    icon: '📈' },
  { id: 'balance',    label: 'Balance Gral.', icon: '🏦' },
  { id: 'bancos',     label: 'Bancos',         icon: '🏧' },
  { id: 'config',     label: 'Config. Cont.', icon: '⚙️' },
]

const SOURCE_META = {
  sale:      { label: 'Venta',   bg: '#dbeafe', color: '#1d4ed8' },
  purchase:  { label: 'Compra',  bg: '#fed7aa', color: '#c2410c' },
  payment:   { label: 'Pago',    bg: '#f3e8ff', color: '#7c3aed' },
  inventory: { label: 'Inv.',    bg: '#dcfce7', color: '#15803d' },
  manual:    { label: 'Manual',  bg: '#f1f5f9', color: '#64748b' },
}

const ACCOUNT_TYPE_ORDER = ['activo','pasivo','patrimonio','ingreso','gasto']
const TYPE_LABELS = { activo: 'Activo', pasivo: 'Pasivo', patrimonio: 'Patrimonio', ingreso: 'Ingreso', gasto: 'Gasto' }
const TYPE_COLORS = { activo: '#1d4ed8', pasivo: '#dc2626', patrimonio: '#15803d', ingreso: '#059669', gasto: '#d97706' }

const CONFIG_KEYS = [
  { key: 'cuenta_caja',        label: 'Cobros en efectivo' },
  { key: 'cuenta_banco',       label: 'Cobros en transferencia/cheque' },
  { key: 'cuenta_tarjetas',    label: 'Cobros con tarjeta' },
  { key: 'cuenta_clientes',    label: 'Ventas a crédito (CxC)' },
  { key: 'cuenta_ventas',      label: 'Ingresos por ventas' },
  { key: 'cuenta_iva_ventas',  label: 'IVA por pagar' },
  { key: 'cuenta_cmv',         label: 'Costo de mercancía vendida' },
  { key: 'cuenta_inventario',  label: 'Inventario de mercancías' },
  { key: 'cuenta_proveedores', label: 'Proveedores (CxP)' },
]

export default function Contabilidad() {
  const [tab, setTab]         = useState('dashboard')
  const [accounts, setAccounts] = useState([])
  const notify = useNotify()

  const loadAccounts = useCallback(() => {
    api.ctaCuentas().then(setAccounts).catch(e => notify(e.message, 'error'))
  }, [])

  useEffect(() => { loadAccounts() }, [loadAccounts])

  return (
    <div className="module-root">
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'dashboard'  && <Dashboard  accounts={accounts} notify={notify} />}
      {tab === 'diario'     && <LibroDiario accounts={accounts} notify={notify} />}
      {tab === 'cuentas'    && <Cuentas accounts={accounts} setAccounts={setAccounts} loadAccounts={loadAccounts} notify={notify} />}
      {tab === 'balanza'    && <Balanza notify={notify} />}
      {tab === 'resultados' && <EstadoResultados notify={notify} />}
      {tab === 'balance'    && <BalanceGeneral notify={notify} />}
      {tab === 'bancos'     && <Bancos accounts={accounts} notify={notify} />}
      {tab === 'config'     && <ConfigContable accounts={accounts} notify={notify} />}
    </div>
  )
}

/* ── Dashboard ── */
function Dashboard({ accounts, notify }) {
  const [er, setEr]     = useState(null)
  const [conc, setConc] = useState(null)
  const [diario, setDiario] = useState([])
  const [reposting, setReposting] = useState(null)

  useEffect(() => {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const df = `${y}-${m}-01`
    const dt = `${y}-${m}-${String(today.getDate()).padStart(2,'0')}`
    api.ctaEstadoResultados().then(setEr).catch(() => {})
    api.ctaConciliacion().then(setConc).catch(() => {})
    api.ctaDiario(`?limit=8`).then(setDiario).catch(() => {})
  }, [])

  async function repostear(type) {
    setReposting(type)
    try {
      const fn = type === 'ventas' ? api.ctaRepostearVentas : api.ctaRepostearCompras
      const res = await fn()
      notify(`${res.reposteadas} asientos generados`)
      api.ctaConciliacion().then(setConc).catch(() => {})
      api.ctaDiario(`?limit=8`).then(setDiario).catch(() => {})
    } catch (e) { notify(e.message, 'error') }
    finally { setReposting(null) }
  }

  const kpiStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 22px', flex: 1, minWidth: 160 }
  const kpiLabel = { fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }
  const kpiVal   = (color) => ({ fontSize: 22, fontWeight: 800, color: color || 'var(--text)' })

  return (
    <div className="vtab-content">
      {/* KPI row */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={kpiStyle}>
          <div style={kpiLabel}>Ingresos acumulados</div>
          <div style={kpiVal('#059669')}>{er ? fmt(er.total_ingresos) : '—'}</div>
        </div>
        <div style={kpiStyle}>
          <div style={kpiLabel}>Gastos acumulados</div>
          <div style={kpiVal('#dc2626')}>{er ? fmt(er.total_gastos) : '—'}</div>
        </div>
        <div style={kpiStyle}>
          <div style={kpiLabel}>Utilidad neta</div>
          <div style={kpiVal(er && er.utilidad_neta >= 0 ? '#059669' : '#dc2626')}>
            {er ? fmt(er.utilidad_neta) : '—'}
          </div>
        </div>
        <div style={kpiStyle}>
          <div style={kpiLabel}>Cuentas activas</div>
          <div style={kpiVal()}>{accounts.length}</div>
        </div>
      </div>

      {/* Alertas conciliación */}
      {conc && (conc.ventas_sin_asiento > 0 || conc.oc_sin_asiento > 0) && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 10 }}>⚠️ Transacciones sin asiento contable</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {conc.ventas_sin_asiento > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: '#92400e' }}>{conc.ventas_sin_asiento} ventas sin asiento</span>
                <button className="action-btn action-btn-primary" style={{ padding: '4px 12px', fontSize: 12 }}
                  onClick={() => repostear('ventas')} disabled={reposting === 'ventas'}>
                  {reposting === 'ventas' ? 'Procesando…' : 'Registrar ahora'}
                </button>
              </div>
            )}
            {conc.oc_sin_asiento > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: '#92400e' }}>{conc.oc_sin_asiento} compras sin asiento</span>
                <button className="action-btn action-btn-primary" style={{ padding: '4px 12px', fontSize: 12 }}
                  onClick={() => repostear('compras')} disabled={reposting === 'compras'}>
                  {reposting === 'compras' ? 'Procesando…' : 'Registrar ahora'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Distribución por fuente */}
      {conc && conc.por_fuente.length > 0 && (
        <div className="section-card" style={{ marginBottom: 20 }}>
          <div className="section-card-header"><h3 className="section-card-title">Asientos por origen</h3></div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '14px 16px' }}>
            {conc.por_fuente.map(f => {
              const meta = SOURCE_META[f.fuente] || SOURCE_META.manual
              return (
                <div key={f.fuente} style={{ background: meta.bg, borderRadius: 8, padding: '10px 16px', minWidth: 130 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: meta.color, textTransform: 'uppercase' }}>{meta.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: meta.color }}>{f.asientos}</div>
                  <div style={{ fontSize: 11, color: meta.color }}>{fmt(f.total_debito)}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Últimos asientos */}
      <div className="section-card">
        <div className="section-card-header"><h3 className="section-card-title">Últimos asientos</h3></div>
        {diario.length === 0
          ? <EmptyState icon="📖" text="Sin asientos registrados" />
          : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>#</th><th>Fecha</th><th>Descripción</th><th>Fuente</th><th style={{ textAlign: 'right' }}>Importe</th></tr></thead>
                <tbody>
                  {diario.map(e => {
                    const src = e.source_type || 'manual'
                    const meta = SOURCE_META[src] || SOURCE_META.manual
                    return (
                      <tr key={e.id}>
                        <td><span className="row-id">#{e.id}</span></td>
                        <td className="muted">{e.entry_date}</td>
                        <td>{e.description || '—'}</td>
                        <td><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: meta.bg, color: meta.color }}>{meta.label}</span></td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(e.total_debit)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </div>
    </div>
  )
}

/* ── Libro Diario ── */
function LibroDiario({ accounts, notify }) {
  const [entries, setEntries] = useState([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [srcFilter, setSrcFilter] = useState('all')
  const entriesPag = usePaginator(entries)
  const [loading, setLoading]   = useState(false)
  const [detail, setDetail]     = useState(null)
  const [detailLines, setDetailLines] = useState([])
  const [showForm, setShowForm] = useState(false)

  const emptyLine = () => ({ account_id: '', debit: '', credit: '', memo: '' })
  const [form, setForm] = useState({ entry_date: '', description: '', reference: '', lines: [emptyLine(), emptyLine()] })

  async function load() {
    setLoading(true)
    try {
      let qs = '?limit=300'
      if (dateFrom) qs += `&date_from=${dateFrom}`
      if (dateTo)   qs += `&date_to=${dateTo}`
      if (srcFilter !== 'all') qs += `&source_type=${srcFilter}`
      setEntries(await api.ctaDiario(qs))
    } catch (e) { notify(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [dateFrom, dateTo, srcFilter])

  async function openDetail(entry) {
    setDetail(entry)
    try {
      const d = await api.ctaAsientos()
      const res = await fetch(`/api/contabilidad/asientos/${entry.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      const data = await res.json()
      setDetailLines(data.lines || [])
    } catch (e) { notify(e.message, 'error') }
  }

  async function deleteEntry(id) {
    if (!confirm('¿Eliminar este asiento manual?')) return
    try {
      await api.ctaDeleteAsiento(id)
      notify('Asiento eliminado')
      load()
    } catch (e) { notify(e.message, 'error') }
  }

  const setLine = (i, k, v) => setForm({ ...form, lines: form.lines.map((l, j) => j === i ? { ...l, [k]: v } : l) })
  const addLine = () => setForm({ ...form, lines: [...form.lines, emptyLine()] })
  const rmLine  = (i) => setForm({ ...form, lines: form.lines.filter((_, j) => j !== i) })
  const totD = form.lines.reduce((s, l) => s + n(l.debit), 0)
  const totC = form.lines.reduce((s, l) => s + n(l.credit), 0)
  const cuadra = Math.abs(totD - totC) < 0.001 && totD > 0

  async function saveAsiento(e) {
    e.preventDefault()
    try {
      await api.ctaCrearAsiento({
        entry_date: form.entry_date || null,
        description: form.description,
        reference: form.reference,
        lines: form.lines.filter(l => l.account_id).map(l => ({
          account_id: Number(l.account_id), debit: n(l.debit), credit: n(l.credit), memo: l.memo || null
        })),
      })
      notify('Asiento registrado')
      setForm({ entry_date: '', description: '', reference: '', lines: [emptyLine(), emptyLine()] })
      setShowForm(false)
      load()
    } catch (err) { notify(err.message, 'error') }
  }

  return (
    <div className="vtab-content">
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <label className="pos-config-field" style={{ minWidth: 140 }}>
          <span>Desde</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ margin: 0 }} />
        </label>
        <label className="pos-config-field" style={{ minWidth: 140 }}>
          <span>Hasta</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ margin: 0 }} />
        </label>
        <label className="pos-config-field" style={{ minWidth: 140 }}>
          <span>Fuente</span>
          <select value={srcFilter} onChange={e => setSrcFilter(e.target.value)} style={{ margin: 0 }}>
            <option value="all">Todas</option>
            <option value="sale">Ventas</option>
            <option value="purchase">Compras</option>
            <option value="payment">Pagos</option>
            <option value="manual">Manual</option>
          </select>
        </label>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Ab icon="download" label="Exportar CSV" variant="ghost"
            onClick={() => {
              let qs = '?x=1'
              if (dateFrom) qs += `&date_from=${dateFrom}`
              if (dateTo)   qs += `&date_to=${dateTo}`
              api.ctaExportDiario(qs)
            }} />
          <Ab icon="add" label="Nuevo asiento" variant="primary" onClick={() => setShowForm(v => !v)} />
        </div>
      </div>

      {/* New entry form */}
      {showForm && (
        <div className="form-card" style={{ marginBottom: 20 }}>
          <h3 className="form-card-title">Nuevo asiento manual (partida doble)</h3>
          <form onSubmit={saveAsiento}>
            <div className="form-grid-3">
              <div className="form-field"><label>Fecha</label><input type="date" value={form.entry_date} onChange={e => setForm({ ...form, entry_date: e.target.value })} /></div>
              <div className="form-field"><label>Descripción</label><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div className="form-field"><label>Referencia</label><input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} /></div>
            </div>
            <div className="variants-section">
              <div className="variants-header">
                <h4 className="variants-title">Líneas</h4>
                <button type="button" className="action-btn action-btn-ghost" onClick={addLine}>+ Línea</button>
              </div>
              <div className="table-wrap">
                <table className="cart-table">
                  <thead><tr><th>Cuenta</th><th style={{ width: 110 }}>Debe</th><th style={{ width: 110 }}>Haber</th><th>Concepto</th><th style={{ width: 40 }}></th></tr></thead>
                  <tbody>
                    {form.lines.map((l, i) => (
                      <tr key={i}>
                        <td>
                          <select className="cart-select" value={l.account_id} onChange={e => setLine(i, 'account_id', e.target.value)}>
                            <option value="">— cuenta —</option>
                            {accounts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                          </select>
                        </td>
                        <td><input className="cart-input" type="number" step="0.01" value={l.debit} onChange={e => setLine(i, 'debit', e.target.value)} /></td>
                        <td><input className="cart-input" type="number" step="0.01" value={l.credit} onChange={e => setLine(i, 'credit', e.target.value)} /></td>
                        <td><input className="cart-input" value={l.memo} onChange={e => setLine(i, 'memo', e.target.value)} /></td>
                        <td>{form.lines.length > 2 && <button type="button" className="cart-remove-btn" onClick={() => rmLine(i)}>✕</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="asiento-totals">
                <span>Debe: <strong>{fmt(totD)}</strong></span>
                <span>Haber: <strong>{fmt(totC)}</strong></span>
                <span style={{ fontWeight: 700, color: cuadra ? '#059669' : '#dc2626' }}>
                  {cuadra ? '✓ Cuadra' : '✗ No cuadra'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button type="submit" className="form-submit-btn" disabled={!cuadra} style={{ opacity: cuadra ? 1 : .5 }}>Registrar asiento</button>
                <button type="button" className="action-btn action-btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="section-card">
        <div className="section-card-header">
          <h3 className="section-card-title">Libro diario {loading && <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>cargando…</span>}</h3>
          <span className="muted" style={{ fontSize: 13 }}>{entries.length} asientos</span>
        </div>
        {entries.length === 0
          ? <EmptyState icon="📖" text="Sin asientos en el período" />
          : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div className="table-wrap" style={{ borderRadius: 0, border: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>Fecha</th><th>Descripción</th><th>Referencia</th>
                    <th>Fuente</th><th>Tipo</th>
                    <th style={{ textAlign: 'right' }}>Importe</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {entriesPag.paginated.map(e => {
                    const src = e.source_type || 'manual'
                    const meta = SOURCE_META[src] || SOURCE_META.manual
                    return (
                      <tr key={e.id}>
                        <td><span className="row-id">#{e.id}</span></td>
                        <td className="muted">{e.entry_date}</td>
                        <td>{e.description || '—'}</td>
                        <td className="muted" style={{ fontSize: 12 }}>{e.reference || '—'}</td>
                        <td>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: meta.bg, color: meta.color }}>
                            {meta.label}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                            background: e.is_auto ? '#dcfce7' : '#f1f5f9', color: e.is_auto ? '#15803d' : '#64748b' }}>
                            {e.is_auto ? 'AUTO' : 'MANUAL'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(e.total_debit)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <Ib icon="view" tip="Ver detalle" variant="ghost" onClick={() => openDetail(e)} />
                            {!e.is_auto && <Ib icon="delete" tip="Eliminar" variant="ghost" onClick={() => deleteEntry(e.id)} />}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Paginator {...entriesPag} label="asientos" />
            </div>
          )
        }
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal-box" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Asiento #{detail.id} — {detail.description}</h3>
              <Ib icon="close" tip="Cerrar" variant="ghost" onClick={() => setDetail(null)} />
            </div>
            <div style={{ padding: '0 4px 4px' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                {detail.entry_date} · {detail.reference || 'Sin referencia'}
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Código</th><th>Cuenta</th><th style={{ textAlign: 'right' }}>Debe</th><th style={{ textAlign: 'right' }}>Haber</th><th>Concepto</th></tr></thead>
                  <tbody>
                    {detailLines.map((l, i) => (
                      <tr key={i}>
                        <td><code style={{ fontSize: 11 }}>{l.code}</code></td>
                        <td>{l.name}</td>
                        <td style={{ textAlign: 'right' }}>{l.debit ? fmt(l.debit) : '—'}</td>
                        <td style={{ textAlign: 'right' }}>{l.credit ? fmt(l.credit) : '—'}</td>
                        <td className="muted" style={{ fontSize: 12 }}>{l.memo || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                      <td colSpan="2">Totales</td>
                      <td style={{ textAlign: 'right' }}>{fmt(detailLines.reduce((s,l) => s+n(l.debit),0))}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(detailLines.reduce((s,l) => s+n(l.credit),0))}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Plan de Cuentas ── */
function Cuentas({ accounts, setAccounts, loadAccounts, notify }) {
  const [f, setF] = useState({ code: '', name: '', type: 'activo', nature: 'D' })
  const [editing, setEditing] = useState(null)
  const [ef, setEf] = useState(null)

  async function save(e) {
    e.preventDefault()
    try {
      await api.ctaCrearCuenta(f)
      notify('Cuenta creada')
      setF({ code: '', name: '', type: 'activo', nature: 'D' })
      loadAccounts()
    } catch (err) { notify(err.message, 'error') }
  }

  async function update(e) {
    e.preventDefault()
    try {
      await api.ctaUpdateCuenta(editing, ef)
      notify('Cuenta actualizada')
      setEditing(null); setEf(null)
      loadAccounts()
    } catch (err) { notify(err.message, 'error') }
  }

  const grouped = ACCOUNT_TYPE_ORDER.reduce((acc, t) => {
    acc[t] = accounts.filter(a => a.type === t)
    return acc
  }, {})

  return (
    <div className="vtab-content">
      <div className="two-col-layout">
        <form onSubmit={save} className="form-card">
          <h3 className="form-card-title">Nueva cuenta contable</h3>
          <div className="form-row">
            <div className="form-field"><label>Código</label><input value={f.code} onChange={e => setF({ ...f, code: e.target.value })} required placeholder="ej. 1105" /></div>
            <div className="form-field"><label>Nombre</label><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required placeholder="ej. Caja general" /></div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Tipo</label>
              <select value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>
                {ACCOUNT_TYPE_ORDER.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Naturaleza</label>
              <select value={f.nature} onChange={e => setF({ ...f, nature: e.target.value })}>
                <option value="D">Deudora (D)</option><option value="C">Acreedora (C)</option>
              </select>
            </div>
          </div>
          <button type="submit" className="form-submit-btn">Crear cuenta</button>
        </form>

        <div>
          {ACCOUNT_TYPE_ORDER.map(type => {
            const rows = grouped[type] || []
            if (!rows.length) return null
            return (
              <div key={type} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: TYPE_COLORS[type], textTransform: 'uppercase', letterSpacing: '.05em', padding: '6px 0', borderBottom: `2px solid ${TYPE_COLORS[type]}`, marginBottom: 6 }}>
                  {TYPE_LABELS[type]} ({rows.length})
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Código</th><th>Nombre</th><th>Nat.</th><th></th></tr></thead>
                    <tbody>
                      {rows.map(a => (
                        <tr key={a.id}>
                          {editing === a.id && ef ? (
                            <>
                              <td><input style={{ width: 70 }} value={ef.code} onChange={e => setEf({ ...ef, code: e.target.value })} /></td>
                              <td><input style={{ width: '100%' }} value={ef.name} onChange={e => setEf({ ...ef, name: e.target.value })} /></td>
                              <td>
                                <select value={ef.nature} onChange={e => setEf({ ...ef, nature: e.target.value })}>
                                  <option value="D">D</option><option value="C">C</option>
                                </select>
                              </td>
                              <td style={{ display: 'flex', gap: 4 }}>
                                <button className="action-btn action-btn-primary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={update}>✓</button>
                                <button className="action-btn action-btn-ghost" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => { setEditing(null); setEf(null) }}>✕</button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td><code style={{ fontSize: 12 }}>{a.code}</code></td>
                              <td>{a.name}</td>
                              <td className="muted">{a.nature}</td>
                              <td><Ib icon="edit" tip="Editar" variant="ghost" onClick={() => { setEditing(a.id); setEf({ code: a.code, name: a.name, type: a.type, nature: a.nature }) }} /></td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ── Balanza ── */
function Balanza({ notify }) {
  const [rows, setRows]     = useState([])
  const [dateFrom, setDf]   = useState('')
  const [dateTo, setDt]     = useState('')

  async function load() {
    try {
      let qs = ''
      if (dateFrom) qs += `?date_from=${dateFrom}`
      if (dateTo)   qs += `${qs ? '&' : '?'}date_to=${dateTo}`
      // Use mayor endpoint for date-filtered balanza
      if (dateFrom || dateTo) {
        const mayor = await api.ctaMayorAll(qs)
        setRows(mayor.filter(r => r.total_debit || r.total_credit).map(r => ({
          code: r.code, name: r.name, type: r.type, nature: r.nature,
          debitos: r.total_debit, creditos: r.total_credit, saldo: r.saldo
        })))
      } else {
        setRows(await api.ctaBalanza())
      }
    } catch (e) { notify(e.message, 'error') }
  }

  useEffect(() => { load() }, [dateFrom, dateTo])

  const tD = rows.reduce((s, r) => s + n(r.debitos), 0)
  const tC = rows.reduce((s, r) => s + n(r.creditos), 0)
  const cuadra = Math.abs(tD - tC) < 0.01

  return (
    <div className="vtab-content">
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <label className="pos-config-field">
          <span>Desde</span><input type="date" value={dateFrom} onChange={e => setDf(e.target.value)} style={{ margin: 0 }} />
        </label>
        <label className="pos-config-field">
          <span>Hasta</span><input type="date" value={dateTo} onChange={e => setDt(e.target.value)} style={{ margin: 0 }} />
        </label>
        <Ab icon="download" label="Exportar CSV" variant="ghost" onClick={() => api.ctaExportBalanza()} />
      </div>
      <div className="section-card">
        <div className="section-card-header">
          <h3 className="section-card-title">Balanza de comprobación</h3>
          <span style={{ fontWeight: 700, color: cuadra ? '#059669' : '#dc2626', fontSize: 14 }}>
            {cuadra ? '✓ Cuadra' : '≠ No cuadra'}
          </span>
        </div>
        {rows.length === 0
          ? <EmptyState icon="⚖️" text="Sin movimientos" />
          : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Código</th><th>Cuenta</th><th>Tipo</th><th style={{ textAlign: 'right' }}>Débitos</th><th style={{ textAlign: 'right' }}>Créditos</th><th style={{ textAlign: 'right' }}>Saldo</th></tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td><code style={{ fontSize: 12 }}>{r.code}</code></td>
                      <td>{r.name}</td>
                      <td><span style={{ fontSize: 11, color: TYPE_COLORS[r.type] || 'var(--muted)', fontWeight: 600 }}>{TYPE_LABELS[r.type] || r.type}</span></td>
                      <td style={{ textAlign: 'right' }}>{fmt(r.debitos)}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(r.creditos)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: n(r.saldo) >= 0 ? 'var(--text)' : '#dc2626' }}>{fmt(r.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                    <td colSpan="3">Totales</td>
                    <td style={{ textAlign: 'right' }}>{fmt(tD)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(tC)}</td>
                    <td style={{ textAlign: 'right', color: cuadra ? '#059669' : '#dc2626' }}>{cuadra ? '✓' : '≠'}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        }
      </div>
    </div>
  )
}

/* ── Estado de resultados ── */
function EstadoResultados({ notify }) {
  const [d, setD] = useState(null)
  useEffect(() => { api.ctaEstadoResultados().then(setD).catch(e => notify(e.message, 'error')) }, [])
  if (!d) return <EmptyState icon="📈" text="Cargando…" />

  const maxVal = Math.max(d.total_ingresos, d.total_gastos) || 1
  const margin = d.total_ingresos > 0 ? ((d.utilidad_neta / d.total_ingresos) * 100).toFixed(1) : 0

  const Section = ({ title, rows, total, color }) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>{title}</div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
          <span><code style={{ fontSize: 11, color: 'var(--muted)' }}>{r.code}</code> {r.name}</span>
          <span style={{ fontWeight: 600 }}>{fmt(r.monto)}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, padding: '8px 0 0', fontSize: 14 }}>
        <span>Total {title.toLowerCase()}</span><span style={{ color }}>{fmt(total)}</span>
      </div>
    </div>
  )

  return (
    <div className="vtab-content">
      {/* Visual bar */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 12, color: '#059669', fontWeight: 700, marginBottom: 4 }}>Ingresos</div>
          <div style={{ height: 10, background: '#dcfce7', borderRadius: 6 }}>
            <div style={{ width: `${(d.total_ingresos/maxVal*100).toFixed(1)}%`, height: '100%', background: '#059669', borderRadius: 6 }} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#059669', marginTop: 6 }}>{fmt(d.total_ingresos)}</div>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 700, marginBottom: 4 }}>Gastos</div>
          <div style={{ height: 10, background: '#fee2e2', borderRadius: 6 }}>
            <div style={{ width: `${(d.total_gastos/maxVal*100).toFixed(1)}%`, height: '100%', background: '#dc2626', borderRadius: 6 }} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#dc2626', marginTop: 6 }}>{fmt(d.total_gastos)}</div>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>Margen neto</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: Number(margin) >= 0 ? '#059669' : '#dc2626' }}>{margin}%</div>
        </div>
      </div>

      <div className="section-card" style={{ maxWidth: 600 }}>
        <div className="section-card-header"><h3 className="section-card-title">Estado de resultados</h3></div>
        <div style={{ padding: '12px 16px' }}>
          <Section title="Ingresos" rows={d.ingresos} total={d.total_ingresos} color="#059669" />
          <Section title="Gastos"   rows={d.gastos}   total={d.total_gastos}   color="#dc2626" />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 800, marginTop: 12, padding: '12px 0', borderTop: '2px solid var(--border)', color: d.utilidad_neta >= 0 ? '#059669' : '#dc2626' }}>
            <span>Utilidad neta</span><span>{fmt(d.utilidad_neta)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Balance general ── */
function BalanceGeneral({ notify }) {
  const [d, setD] = useState(null)
  useEffect(() => { api.ctaBalanceGeneral().then(setD).catch(e => notify(e.message, 'error')) }, [])
  if (!d) return <EmptyState icon="🏦" text="Cargando…" />

  const Col = ({ title, rows, total, color }) => (
    <div className="section-card" style={{ flex: 1, minWidth: 260 }}>
      <div className="section-card-header"><h3 className="section-card-title" style={{ color }}>{title}</h3></div>
      <div style={{ padding: '6px 16px 16px' }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
            <span><code style={{ fontSize: 11, color: 'var(--muted)' }}>{r.code}</code> {r.name}</span>
            <span style={{ fontWeight: 600 }}>{fmt(r.monto)}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, paddingTop: 10, fontSize: 15, color }}>
          <span>Total {title}</span><span>{fmt(total)}</span>
        </div>
      </div>
    </div>
  )

  return (
    <div className="vtab-content">
      <div style={{ marginBottom: 16, padding: '12px 18px', borderRadius: 10, fontWeight: 700, fontSize: 15,
        background: d.cuadra ? '#ecfdf5' : '#fef2f2', color: d.cuadra ? '#059669' : '#dc2626' }}>
        {d.cuadra ? '✅ La ecuación contable cuadra — Activo = Pasivo + Patrimonio' : '❌ El balance NO cuadra'}
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Col title="Activos" rows={d.activos} total={d.total_activos} color={TYPE_COLORS.activo} />
        <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Col title="Pasivos"    rows={d.pasivos}    total={d.total_pasivos}    color={TYPE_COLORS.pasivo} />
          <Col title="Patrimonio" rows={d.patrimonio} total={d.total_patrimonio} color={TYPE_COLORS.patrimonio} />
        </div>
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 20px' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>TOTAL ACTIVOS</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: TYPE_COLORS.activo }}>{fmt(d.total_activos)}</div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 20px' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>PASIVO + PATRIMONIO</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: TYPE_COLORS.pasivo }}>{fmt(d.total_pasivos + d.total_patrimonio)}</div>
        </div>
      </div>
    </div>
  )
}

/* ── Bancos ── */
function Bancos({ accounts, notify }) {
  const { currency: tenantCurrency } = useAuth()
  const defCur = tenantCurrency || 'USD'
  const [banks, setBanks] = useState([])
  const [f, setF]         = useState(() => ({ name: '', bank: '', account_number: '', currency: defCur, opening_balance: '', account_id: '' }))
  const [sel, setSel]     = useState(null)
  const [movs, setMovs]   = useState([])
  const [mf, setMf]       = useState({ type: 'ingreso', amount: '', description: '', reference: '', movement_date: '' })

  async function refresh() { try { setBanks(await api.ctaBancos()) } catch (e) { notify(e.message, 'error') } }
  useEffect(() => { refresh() }, [])

  async function saveBank(e) {
    e.preventDefault()
    try {
      await api.ctaCrearBanco({ ...f, opening_balance: n(f.opening_balance), account_id: f.account_id ? Number(f.account_id) : null })
      notify('Cuenta bancaria creada')
      setF({ name: '', bank: '', account_number: '', currency: defCur, opening_balance: '', account_id: '' })
      refresh()
    } catch (err) { notify(err.message, 'error') }
  }

  async function openMovs(b) { setSel(b); try { setMovs(await api.ctaMovimientos(b.id)) } catch (e) { notify(e.message, 'error') } }

  async function addMov(e) {
    e.preventDefault()
    try {
      await api.ctaAgregarMovimiento(sel.id, { ...mf, amount: n(mf.amount), movement_date: mf.movement_date || null })
      notify('Movimiento registrado')
      setMf({ type: 'ingreso', amount: '', description: '', reference: '', movement_date: '' })
      setMovs(await api.ctaMovimientos(sel.id)); refresh()
    } catch (err) { notify(err.message, 'error') }
  }

  return (
    <div className="vtab-content">
      <div className="two-col-layout" style={{ marginBottom: 20 }}>
        <form onSubmit={saveBank} className="form-card">
          <h3 className="form-card-title">Nueva cuenta bancaria</h3>
          <div className="form-row">
            <div className="form-field"><label>Nombre</label><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /></div>
            <div className="form-field"><label>Banco</label><input value={f.bank} onChange={e => setF({ ...f, bank: e.target.value })} /></div>
          </div>
          <div className="form-row">
            <div className="form-field"><label># Cuenta</label><input value={f.account_number} onChange={e => setF({ ...f, account_number: e.target.value })} /></div>
            <div className="form-field">
              <label>Moneda</label>
              <select value={f.currency} onChange={e => setF({ ...f, currency: e.target.value })}>
                {['COP','MXN','USD','EUR'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="form-field"><label>Saldo inicial</label><input type="number" step="0.01" value={f.opening_balance} onChange={e => setF({ ...f, opening_balance: e.target.value })} /></div>
          <button type="submit" className="form-submit-btn">Crear cuenta bancaria</button>
        </form>

        <div className="table-wrap">
          {banks.length === 0
            ? <EmptyState icon="🏧" text="Sin cuentas bancarias" />
            : (
              <table>
                <thead><tr><th>Cuenta</th><th>Banco</th><th># Cuenta</th><th>Moneda</th><th style={{ textAlign: 'right' }}>Saldo</th><th></th></tr></thead>
                <tbody>
                  {banks.map(b => (
                    <tr key={b.id}>
                      <td><strong>{b.name}</strong></td>
                      <td>{b.bank || '—'}</td>
                      <td className="muted">{b.account_number || '—'}</td>
                      <td>{b.currency}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: n(b.saldo) >= 0 ? '#059669' : '#dc2626' }}>{fmt(b.saldo)}</td>
                      <td><Ib icon="statement" tip="Movimientos" variant="ghost" onClick={() => openMovs(b)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      </div>

      {sel && (
        <div className="section-card">
          <div className="section-card-header">
            <h3 className="section-card-title">🏧 {sel.name} — Estado de cuenta</h3>
            <Ib icon="close" tip="Cerrar" variant="ghost" onClick={() => setSel(null)} />
          </div>
          <form onSubmit={addMov} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <label className="pos-config-field" style={{ minWidth: 100 }}>
              <span>Fecha</span><input type="date" value={mf.movement_date} onChange={e => setMf({ ...mf, movement_date: e.target.value })} style={{ margin: 0 }} />
            </label>
            <label className="pos-config-field" style={{ minWidth: 100 }}>
              <span>Tipo</span>
              <select value={mf.type} onChange={e => setMf({ ...mf, type: e.target.value })} style={{ margin: 0 }}>
                <option value="ingreso">Ingreso</option><option value="egreso">Egreso</option>
              </select>
            </label>
            <label className="pos-config-field" style={{ minWidth: 100 }}>
              <span>Monto</span><input type="number" step="0.01" value={mf.amount} onChange={e => setMf({ ...mf, amount: e.target.value })} required style={{ margin: 0 }} />
            </label>
            <label className="pos-config-field" style={{ flex: 1, minWidth: 160 }}>
              <span>Descripción</span><input value={mf.description} onChange={e => setMf({ ...mf, description: e.target.value })} style={{ margin: 0 }} />
            </label>
            <Ab icon="add" label="Agregar" variant="primary" type="submit" style={{ marginBottom: 0 }} />
          </form>
          <div className="table-wrap">
            {movs.length === 0
              ? <EmptyState icon="💳" text="Sin movimientos en esta cuenta" />
              : (
                <table>
                  <thead><tr><th>Fecha</th><th>Tipo</th><th style={{ textAlign: 'right' }}>Monto</th><th>Descripción</th><th>Ref.</th></tr></thead>
                  <tbody>
                    {movs.map(m => (
                      <tr key={m.id}>
                        <td className="muted">{m.fecha}</td>
                        <td><span style={{ fontWeight: 600, color: m.type === 'ingreso' ? '#059669' : '#dc2626' }}>{m.type === 'ingreso' ? '↑' : '↓'} {m.type}</span></td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: m.type === 'ingreso' ? '#059669' : '#dc2626' }}>
                          {m.type === 'ingreso' ? '+' : '−'}{fmt(m.amount)}
                        </td>
                        <td>{m.description || '—'}</td>
                        <td className="muted">{m.reference || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Config Contable ── */
function ConfigContable({ accounts, notify }) {
  const [config, setConfig]   = useState([])
  const [conc, setConc]       = useState(null)
  const [localCfg, setLocal]  = useState({})
  const [saving, setSaving]   = useState(false)
  const [reposting, setReposting] = useState(null)

  async function load() {
    try {
      const [cfg, c] = await Promise.all([api.ctaConfig(), api.ctaConciliacion()])
      setConfig(cfg)
      setConc(c)
      const map = {}
      cfg.forEach(r => { map[r.key] = r.account_id })
      setLocal(map)
    } catch (e) { notify(e.message, 'error') }
  }

  useEffect(() => { load() }, [])

  async function save() {
    setSaving(true)
    try {
      const items = Object.entries(localCfg).map(([key, account_id]) => ({ key, account_id: Number(account_id) }))
      await api.ctaSaveConfig(items)
      notify('Configuración guardada')
      load()
    } catch (e) { notify(e.message, 'error') }
    finally { setSaving(false) }
  }

  async function repostear(type) {
    setReposting(type)
    try {
      const fn = type === 'ventas' ? api.ctaRepostearVentas : api.ctaRepostearCompras
      const res = await fn()
      notify(`${res.reposteadas} asientos generados exitosamente`)
      load()
    } catch (e) { notify(e.message, 'error') }
    finally { setReposting(null) }
  }

  return (
    <div className="vtab-content">
      {/* Conciliación status */}
      {conc && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
          <div style={{ background: conc.ventas_sin_asiento > 0 ? '#fffbeb' : '#ecfdf5', border: `1px solid ${conc.ventas_sin_asiento > 0 ? '#fcd34d' : '#bbf7d0'}`, borderRadius: 10, padding: '14px 20px', flex: 1 }}>
            <div style={{ fontWeight: 700, marginBottom: 8, color: conc.ventas_sin_asiento > 0 ? '#92400e' : '#15803d' }}>
              {conc.ventas_sin_asiento > 0 ? `⚠️ ${conc.ventas_sin_asiento} ventas sin asiento` : '✅ Ventas al día'}
            </div>
            <button className="action-btn action-btn-primary" disabled={reposting === 'ventas' || conc.ventas_sin_asiento === 0}
              onClick={() => repostear('ventas')}>
              {reposting === 'ventas' ? 'Procesando…' : 'Repostear ventas pendientes'}
            </button>
          </div>
          <div style={{ background: conc.oc_sin_asiento > 0 ? '#fffbeb' : '#ecfdf5', border: `1px solid ${conc.oc_sin_asiento > 0 ? '#fcd34d' : '#bbf7d0'}`, borderRadius: 10, padding: '14px 20px', flex: 1 }}>
            <div style={{ fontWeight: 700, marginBottom: 8, color: conc.oc_sin_asiento > 0 ? '#92400e' : '#15803d' }}>
              {conc.oc_sin_asiento > 0 ? `⚠️ ${conc.oc_sin_asiento} compras sin asiento` : '✅ Compras al día'}
            </div>
            <button className="action-btn action-btn-primary" disabled={reposting === 'compras' || conc.oc_sin_asiento === 0}
              onClick={() => repostear('compras')}>
              {reposting === 'compras' ? 'Procesando…' : 'Repostear compras pendientes'}
            </button>
          </div>
        </div>
      )}

      {/* Config table */}
      <div className="section-card">
        <div className="section-card-header">
          <h3 className="section-card-title">Mapeo de cuentas contables</h3>
          <Ab icon="save" label={saving ? 'Guardando…' : 'Guardar cambios'} variant="primary" onClick={save} disabled={saving} />
        </div>
        <div style={{ padding: '8px 0' }}>
          <p style={{ padding: '0 16px 12px', color: 'var(--muted)', fontSize: 13 }}>
            Configure qué cuenta del plan de cuentas se usa para cada tipo de transacción del sistema.
          </p>
          {CONFIG_KEYS.map(({ key, label }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{key}</div>
              </div>
              <select value={localCfg[key] || ''} onChange={e => setLocal({ ...localCfg, [key]: e.target.value })}
                style={{ minWidth: 260, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
                <option value="">— sin asignar —</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Distribución por fuente */}
      {conc && conc.por_fuente.length > 0 && (
        <div className="section-card" style={{ marginTop: 20 }}>
          <div className="section-card-header"><h3 className="section-card-title">Distribución de asientos por origen</h3></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fuente</th><th style={{ textAlign: 'right' }}>Asientos</th><th style={{ textAlign: 'right' }}>Total debitado</th></tr></thead>
              <tbody>
                {conc.por_fuente.map(f => {
                  const meta = SOURCE_META[f.fuente] || SOURCE_META.manual
                  return (
                    <tr key={f.fuente}>
                      <td><span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: meta.bg, color: meta.color }}>{meta.label}</span></td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{f.asientos}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(f.total_debito)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
