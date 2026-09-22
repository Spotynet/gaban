import { useEffect, useState } from 'react'
import { api } from '../api/client.js'
import { Toast, EmptyState } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { formatMoney } from '../utils/currency.js'

const fmt = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }

function KpiCard({ label, value, color, icon }) {
  return (
    <div className="kpi">
      <div style={{ display: 'flex', justify: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        {icon && <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>}
        <div style={{ flex: 1 }}>
          <div className="label">{label}</div>
          <div className="value" style={color ? { color } : {}}>{value}</div>
        </div>
      </div>
    </div>
  )
}

function BarChart({ title, rows, labelKey, valueKey, color = 'var(--brand)' }) {
  const max = Math.max(1, ...rows.map(r => r[valueKey]))
  return (
    <div className="section-card">
      <div className="section-card-header"><h3 className="section-card-title">{title}</h3></div>
      {rows.length === 0
        ? <EmptyState icon="📊" text="Sin datos en el período" />
        : rows.map((r, i) => (
          <div className="bar-row" key={i}>
            <span style={{ width: 90, fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>
              {String(r[labelKey]).slice(-5)}
            </span>
            <div style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 4, height: 18, overflow: 'hidden' }}>
              <div style={{ width: `${(r[valueKey] / max) * 100}%`, minWidth: 4, height: '100%', background: color, borderRadius: 4, transition: 'width .4s ease' }} />
            </div>
            <span style={{ width: 80, textAlign: 'right', fontSize: 13, fontWeight: 600 }}>{fmt(r[valueKey])}</span>
          </div>
        ))
      }
    </div>
  )
}

export default function Dashboard() {
  const { currency: tenantCurrency } = useAuth()
  const fmtMoney = (v) => formatMoney(v, tenantCurrency)
  const [branches, setBranches]   = useState([])
  const [branchId, setBranchId]   = useState('')
  const [desde, setDesde]         = useState(daysAgo(30))
  const [hasta, setHasta]         = useState(new Date().toISOString().slice(0, 10))
  const [resumen, setResumen]     = useState(null)
  const [porDia, setPorDia]       = useState([])
  const [top, setTop]             = useState([])
  const [inv, setInv]             = useState(null)
  const [saldos, setSaldos]       = useState(null)
  const [toast, setToast]         = useState(null)
  const [loading, setLoading]     = useState(false)

  const notify = (msg, type = 'ok') => setToast({ msg, type })

  useEffect(() => { api.me().then(m => setBranches(m.branches || [])).catch(() => {}) }, [])
  useEffect(() => { load() }, [branchId, desde, hasta])

  async function load() {
    setLoading(true)
    const qs  = `?desde=${desde}&hasta=${hasta}${branchId ? `&branch_id=${branchId}` : ''}`
    const qsb = branchId ? `?branch_id=${branchId}` : ''
    try {
      const [r, d, t, i, s] = await Promise.all([
        api.repResumen(qs), api.repVentasDia(qs),
        api.repTopProductos(qs + '&limit=8'),
        api.repValorInventario(qsb), api.repSaldos(),
      ])
      setResumen(r); setPorDia(d); setTop(t); setInv(i); setSaldos(s)
    } catch (e) { notify(e.message, 'error') }
    setLoading(false)
  }

  async function exportar(tipo) {
    const qs  = `?desde=${desde}&hasta=${hasta}${branchId ? `&branch_id=${branchId}` : ''}`
    const qsb = branchId ? `?branch_id=${branchId}` : ''
    try {
      if (tipo === 'ventas')     await api.download(`/reportes/export/ventas.xlsx${qs}`, 'ventas.xlsx')
      if (tipo === 'inventario') await api.download(`/reportes/export/inventario.xlsx${qsb}`, 'inventario.xlsx')
      if (tipo === 'pdf')        await api.download(`/reportes/export/resumen.pdf${qs}`, 'resumen.pdf')
    } catch (e) { notify(e.message, 'error') }
  }

  return (
    <div className="module-root">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="module-header">
        <div className="module-header-controls">
          <label className="filter-field">
            <span>Sucursal</span>
            <select value={branchId} onChange={e => setBranchId(e.target.value)}>
              <option value="">Todas</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="filter-field">
            <span>Desde</span>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} />
          </label>
          <label className="filter-field">
            <span>Hasta</span>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
          </label>
          <div className="export-btns">
            <button className="export-btn export-btn-green" onClick={() => exportar('ventas')}>↓ Ventas</button>
            <button className="export-btn export-btn-green" onClick={() => exportar('inventario')}>↓ Inventario</button>
            <button className="export-btn export-btn-red" onClick={() => exportar('pdf')}>↓ PDF</button>
          </div>
        </div>
      </div>

      {loading && <div className="loading-bar" />}

      {/* KPIs */}
      {resumen && (
        <div className="kpi-grid" style={{ marginBottom: 24 }}>
          <KpiCard icon="💰" label="Ventas del período"     value={fmtMoney(resumen.total_ventas)} />
          <KpiCard icon="🧾" label="# Ventas"              value={resumen.num_ventas} />
          <KpiCard icon="📈" label="Ticket promedio"        value={fmtMoney(resumen.ticket_promedio)} />
          <KpiCard icon="📦" label="Pedidos pendientes"     value={resumen.pedidos_pendientes} color={resumen.pedidos_pendientes > 0 ? '#b45309' : undefined} />
          {inv    && <KpiCard icon="🏪" label="Valor inventario"     value={fmtMoney(inv.valor_costo)} />}
          {saldos && <KpiCard icon="🔴" label="Cuentas por pagar"    value={fmtMoney(saldos.cuentas_por_pagar)} color="#dc2626" />}
          {saldos && <KpiCard icon="🟢" label="Cuentas por cobrar"   value={fmtMoney(saldos.cuentas_por_cobrar)} color="#059669" />}
          {inv    && <KpiCard icon="⚠️" label="Bajo mínimo" value={inv.bajo_minimo} color={inv.bajo_minimo > 0 ? '#dc2626' : undefined} />}
        </div>
      )}

      {/* Charts */}
      <div className="dash-charts">
        <BarChart title="Ventas por día" rows={porDia} labelKey="dia" valueKey="total" />
        <BarChart title="Top productos (unidades)" rows={top} labelKey="producto" valueKey="unidades" color="#059669" />
      </div>

      {/* Inventario resumen */}
      {inv && (
        <div className="section-card" style={{ marginTop: 20 }}>
          <div className="section-card-header"><h3 className="section-card-title">📦 Resumen de inventario</h3></div>
          <div className="inv-summary">
            <div className="inv-stat"><span>Valor a costo</span><b>{fmtMoney(inv.valor_costo)}</b></div>
            <div className="inv-stat"><span>Valor a precio venta</span><b>{fmtMoney(inv.valor_venta)}</b></div>
            <div className="inv-stat"><span>Líneas de stock</span><b>{inv.lineas}</b></div>
            <div className="inv-stat"><span>Bajo mínimo</span><b style={{ color: inv.bajo_minimo > 0 ? '#dc2626' : 'inherit' }}>{inv.bajo_minimo}</b></div>
          </div>
        </div>
      )}
    </div>
  )
}
