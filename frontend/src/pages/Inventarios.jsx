import { useEffect, useState, useCallback } from 'react'
import { Paginator, usePaginator } from '../components/Paginator.jsx'
import { api } from '../api/client.js'
import { EmptyState, TabBar } from '../components/ui.jsx'
import { useNotify } from '../context/ToastContext.jsx'
import { Ib, Ab } from '../components/IconBtn.jsx'
import { formatMoney } from '../utils/currency.js'

const n = (x) => Number(x) || 0
const fmt = (x) => n(x).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
const fmtM = (x, dec = 0) => n(x).toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const fmtDate = (s) => s ? s.slice(0, 16).replace('T', ' ') : '—'

const MOVE_META = {
  saldo_inicial:     { bg: '#dcfce7', color: '#15803d', label: 'Saldo inicial',      dir: '+' },
  entrada_compra:    { bg: '#dcfce7', color: '#15803d', label: 'Compra',             dir: '+' },
  ajuste_positivo:   { bg: '#fef9c3', color: '#a16207', label: 'Ajuste +',           dir: '+' },
  ajuste_negativo:   { bg: '#fef9c3', color: '#a16207', label: 'Ajuste -',           dir: '-' },
  traslado_entrada:  { bg: '#dbeafe', color: '#1d4ed8', label: 'Traslado entrada',   dir: '+' },
  traslado_salida:   { bg: '#dbeafe', color: '#1d4ed8', label: 'Traslado salida',    dir: '-' },
  salida_venta:      { bg: '#fef2f2', color: '#dc2626', label: 'Venta',              dir: '-' },
  baja_directa:      { bg: '#fef2f2', color: '#dc2626', label: 'Baja',               dir: '-' },
  inventario_fisico: { bg: '#f5f3ff', color: '#7c3aed', label: 'Inv. físico',        dir: '±' },
}

const STATUS_META = {
  draft:       { bg: '#f1f5f9', color: '#64748b', label: 'Borrador' },
  in_progress: { bg: '#fef9c3', color: '#a16207', label: 'En progreso' },
  closed:      { bg: '#dcfce7', color: '#15803d', label: 'Cerrado' },
}

const TABS = [
  { id: 'dashboard',   label: 'Dashboard',    icon: '📊' },
  { id: 'existencias', label: 'Existencias',  icon: '📦' },
  { id: 'kardex',      label: 'Kardex',       icon: '📋' },
  { id: 'traslados',   label: 'Traslados',    icon: '🔄' },
  { id: 'fisico',      label: 'Inv. Físico',  icon: '📝' },
  { id: 'bodegas',     label: 'Bodegas',      icon: '🏭' },
]

function Badge({ type }) {
  const m = MOVE_META[type] || { bg: '#f1f5f9', color: '#64748b', label: type }
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
      background: m.bg, color: m.color, whiteSpace: 'nowrap' }}>
      {m.label}
    </span>
  )
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { bg: '#f1f5f9', color: '#64748b', label: status }
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 12,
      background: m.bg, color: m.color }}>
      {m.label}
    </span>
  )
}

function Modal({ title, onClose, children, width = 500 }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: width,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
          <Ib icon="close" tip="Cerrar" variant="ghost" onClick={onClose} />
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: '20px' }}>{children}</div>
      </div>
    </div>
  )
}

function KpiCard({ icon, label, value, sub, color = 'var(--brand)', bg = 'var(--brand-soft)' }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 38, height: 38, borderRadius: 9, background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginTop: 1 }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  )
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ rows, tenantCfg }) {
  const cur = tenantCfg?.currency || 'USD'
  const costLabel = tenantCfg?.cost_method === 'fifo' ? 'FIFO' : 'Prom. pond.'
  const total = rows.reduce((a, r) => a + n(r.quantity), 0)
  const value = rows.reduce((a, r) => a + n(r.stock_value), 0)
  const belowMin = rows.filter(r => r.below_min).length
  const noStock = rows.filter(r => n(r.quantity) === 0).length
  const products = [...new Set(rows.map(r => r.product_id))].length

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginBottom: 12 }}>
        <KpiCard icon="📦" label="Total unidades en stock" value={fmt(total)} color="#1d4ed8" bg="#eff6ff" />
        <KpiCard icon="💰" label={`Valor inventario (${costLabel})`} value={formatMoney(value, cur)} color="#15803d" bg="#f0fdf4" />
        <KpiCard icon="🏷️" label="Referencias activas" value={products} color="#7c3aed" bg="#f5f3ff" />
        <KpiCard icon="⚠️" label="Bajo stock mínimo" value={belowMin}
          color={belowMin > 0 ? '#dc2626' : '#15803d'} bg={belowMin > 0 ? '#fef2f2' : '#f0fdf4'} />
        <KpiCard icon="🚫" label="Sin existencias" value={noStock}
          color={noStock > 0 ? '#dc2626' : '#15803d'} bg={noStock > 0 ? '#fef2f2' : '#f0fdf4'} />
      </div>

      {belowMin > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px' }}>
          <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 8, fontSize: 13 }}>⚠️ Variantes bajo stock mínimo</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Producto</th><th>Variante</th><th>Talla</th><th>Color</th><th>Cantidad</th><th>Mínimo</th></tr></thead>
              <tbody>
                {rows.filter(r => r.below_min).slice(0, 20).map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{r.product_name}</td>
                    <td><code style={{ fontSize: 11 }}>{r.variant_sku}</code></td>
                    <td>{r.size || '—'}</td>
                    <td>{r.color || '—'}</td>
                    <td><span style={{ color: '#dc2626', fontWeight: 700 }}>{fmt(r.quantity)}</span></td>
                    <td className="muted">{fmt(r.min_stock)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── EXISTENCIAS ───────────────────────────────────────────────────────────────
function Existencias({ rows, variants, branchId, notify, onRefresh, tenantCfg }) {
  const cur = tenantCfg?.currency || 'USD'
  const costLabel = tenantCfg?.cost_method === 'fifo' ? 'Costo FIFO' : 'Costo prom.'
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [adjustModal, setAdjustModal] = useState(null)
  const [writeOffModal, setWriteOffModal] = useState(null)
  const [initialModal, setInitialModal] = useState(null)
  const [kardexModal, setKardexModal] = useState(null)
  const [recalculating, setRecalculating] = useState(false)

  async function recalcularCostos() {
    if (!branchId) return notify('Selecciona una sucursal primero', 'error')
    setRecalculating(true)
    try {
      const r = await api.recalcularCostos(branchId)
      notify(`Costos recalculados: ${r.updated} variante${r.updated !== 1 ? 's' : ''} actualizadas con costo promedio ponderado`)
      onRefresh()
    } catch (e) {
      notify(e.message, 'error')
    }
    setRecalculating(false)
  }

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    const match = !q || r.product_name?.toLowerCase().includes(q) || r.variant_sku?.toLowerCase().includes(q) || r.ean13?.toLowerCase().includes(q)
    if (!match) return false
    if (filter === 'below_min') return r.below_min
    if (filter === 'no_stock') return n(r.quantity) === 0
    return true
  })
  const stockPag = usePaginator(filtered)

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input placeholder="🔍 Buscar producto, SKU, EAN…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 180, margin: 0 }} />
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ margin: 0, width: 160 }}>
          <option value="all">Todos ({rows.length})</option>
          <option value="below_min">Bajo mínimo ({rows.filter(r => r.below_min).length})</option>
          <option value="no_stock">Sin stock ({rows.filter(r => n(r.quantity) === 0).length})</option>
        </select>
        <Ab icon="add" label="Ingreso manual" variant="primary"
          onClick={() => setAdjustModal({ mode: 'in' })} />
        <Ab icon="refresh" label={recalculating ? 'Recalculando…' : 'Recalcular costos'} variant="ghost"
          disabled={recalculating} onClick={recalcularCostos}
          title="Recalcula el costo promedio ponderado de cada variante basándose en todos los movimientos de entrada del kardex" />
        <Ab icon="download" label="Exportar CSV" variant="ghost"
          onClick={async () => { try { await api.exportStockCsv(branchId) } catch (e) { notify(e.message, 'error') } }} />
      </div>

      {filtered.length === 0
        ? <EmptyState icon="📦" text="Sin existencias que coincidan" />
        : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div className="table-wrap" style={{ borderRadius: 0, border: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Variante / SKU</th>
                    <th>EAN</th>
                    <th>Talla</th>
                    <th>Color</th>
                    <th>Cantidad</th>
                    <th>Mín</th>
                    <th>Máx</th>
                    <th>{costLabel}</th>
                    <th>Valor stock</th>
                    <th style={{ width: 110 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {stockPag.paginated.map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600, maxWidth: 180 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.product_name}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.product_sku}</div>
                      </td>
                      <td><code style={{ fontSize: 11 }}>{r.variant_sku}</code></td>
                      <td className="muted" style={{ fontSize: 11 }}>{r.ean13 || '—'}</td>
                      <td>{r.size || '—'}</td>
                      <td>{r.color || '—'}</td>
                      <td>
                        <span style={{
                          fontWeight: 700, fontSize: 13, padding: '2px 10px', borderRadius: 12,
                          background: n(r.quantity) === 0 ? '#fef2f2' : r.below_min ? '#fef9c3' : '#dcfce7',
                          color: n(r.quantity) === 0 ? '#dc2626' : r.below_min ? '#a16207' : '#15803d',
                        }}>{fmt(r.quantity)}</span>
                      </td>
                      <td className="muted">{fmt(r.min_stock)}</td>
                      <td className="muted">{r.max_stock ? fmt(r.max_stock) : '—'}</td>
                      <td style={{ fontWeight: 600, color: 'var(--text-2)' }}>{r.cost_price ? formatMoney(r.cost_price, cur) : '—'}</td>
                      <td style={{ fontWeight: 600, color: 'var(--text-2)' }}>{formatMoney(n(r.quantity) * n(r.cost_price), cur)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 2 }}>
                          <Ib icon="kardex" tip="Ver kardex" variant="ghost"
                            onClick={async () => {
                              try {
                                const moves = await api.kardex(r.variant_id, branchId)
                                setKardexModal({ sku: r.variant_sku, moves })
                              } catch (e) { notify(e.message, 'error') }
                            }} />
                          <Ib icon="add" tip="Ajuste / ingreso" variant="ghost"
                            onClick={() => setAdjustModal({ variant_id: r.variant_id, variant_sku: r.variant_sku, mode: 'in' })} />
                          <Ib icon="delete" tip="Baja directa" variant="ghost"
                            onClick={() => setWriteOffModal({ variant_id: r.variant_id, variant_sku: r.variant_sku })} />
                          {n(r.quantity) === 0 && (
                            <Ib icon="star" tip="Saldo inicial" variant="ghost"
                              onClick={() => setInitialModal({ variant_id: r.variant_id, variant_sku: r.variant_sku })} />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginator {...stockPag} label="variantes" />
          </div>
        )
      }

      {adjustModal && (
        <AdjustModal
          variants={variants}
          branchId={branchId}
          initial={adjustModal}
          notify={notify}
          onClose={() => setAdjustModal(null)}
          onDone={() => { setAdjustModal(null); onRefresh() }}
        />
      )}
      {writeOffModal && (
        <WriteOffModal
          row={writeOffModal}
          branchId={branchId}
          notify={notify}
          onClose={() => setWriteOffModal(null)}
          onDone={() => { setWriteOffModal(null); onRefresh() }}
        />
      )}
      {initialModal && (
        <InitialStockModal
          row={initialModal}
          branchId={branchId}
          notify={notify}
          onClose={() => setInitialModal(null)}
          onDone={() => { setInitialModal(null); onRefresh() }}
        />
      )}
      {kardexModal && (
        <Modal title={`📋 Kardex · ${kardexModal.sku}`} onClose={() => setKardexModal(null)} width={800}>
          <KardexTable moves={kardexModal.moves} />
        </Modal>
      )}
    </div>
  )
}

function AdjustModal({ variants, branchId, initial, notify, onClose, onDone }) {
  const [form, setForm] = useState({
    variant_id: initial?.variant_id || '',
    quantity: '',
    note: '',
    mode: initial?.mode || 'in',
  })
  const [saving, setSaving] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!form.variant_id) return notify('Selecciona una variante', 'error')
    const qty = (form.mode === 'out' ? -1 : 1) * Math.abs(n(form.quantity))
    if (qty === 0) return notify('Cantidad inválida', 'error')
    setSaving(true)
    try {
      const r = await api.adjust({ variant_id: Number(form.variant_id), branch_id: branchId, quantity: qty, note: form.note || null })
      notify(`Ajuste aplicado. Nuevo saldo: ${fmt(r.balance)}`)
      onDone()
    } catch (err) { notify(err.message, 'error') }
    setSaving(false)
  }

  const vlabel = (v) => `${v.product_name || ''} · ${v.variant_sku}${v.size ? ' T' + v.size : ''}${v.color ? ' ' + v.color : ''}${v.ean13 ? ' [' + v.ean13 + ']' : ''}`

  return (
    <Modal title="⚖️ Ajuste de inventario" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-field">
          <label>Variante</label>
          <select value={form.variant_id} onChange={e => setForm({ ...form, variant_id: e.target.value })} required>
            <option value="">— seleccionar —</option>
            {variants.map(v => <option key={v.id} value={v.id}>{vlabel(v)}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-field">
            <label>Tipo</label>
            <select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })}>
              <option value="in">➕ Ingreso</option>
              <option value="out">➖ Salida</option>
            </select>
          </div>
          <div className="form-field">
            <label>Cantidad</label>
            <input type="number" min="0.001" step="0.001" value={form.quantity}
              onChange={e => setForm({ ...form, quantity: e.target.value })} required />
          </div>
        </div>
        <div className="form-field">
          <label>Nota / motivo</label>
          <input placeholder="ej. Ingreso por compra, merma, ajuste físico…"
            value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="form-submit-btn" disabled={saving}>
            {saving ? 'Aplicando…' : 'Aplicar ajuste'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function WriteOffModal({ row, branchId, notify, onClose, onDone }) {
  const [form, setForm] = useState({ quantity: '', reason: 'merma', note: '' })
  const [saving, setSaving] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (n(form.quantity) <= 0) return notify('Cantidad inválida', 'error')
    setSaving(true)
    try {
      const r = await api.writeOff({ variant_id: row.variant_id, branch_id: branchId,
        quantity: n(form.quantity), reason: form.reason, note: form.note || null })
      notify(`Baja aplicada. Nuevo saldo: ${fmt(r.balance)}`)
      onDone()
    } catch (err) { notify(err.message, 'error') }
    setSaving(false)
  }

  return (
    <Modal title={`🗑️ Baja directa · ${row.variant_sku}`} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-field">
            <label>Cantidad a dar de baja</label>
            <input type="number" min="0.001" step="0.001" value={form.quantity}
              onChange={e => setForm({ ...form, quantity: e.target.value })} required />
          </div>
          <div className="form-field">
            <label>Razón</label>
            <select value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}>
              <option value="merma">Merma</option>
              <option value="daño">Daño / deterioro</option>
              <option value="vencimiento">Vencimiento</option>
              <option value="robo">Robo / pérdida</option>
              <option value="otro">Otro</option>
            </select>
          </div>
        </div>
        <div className="form-field">
          <label>Nota adicional</label>
          <input placeholder="Descripción del motivo…" value={form.note}
            onChange={e => setForm({ ...form, note: e.target.value })} />
        </div>
        <div style={{ padding: '10px 14px', background: '#fef2f2', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>
          ⚠️ Esta operación reduce el stock permanentemente y queda registrada en el kardex.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="form-submit-btn" style={{ background: '#dc2626' }} disabled={saving}>
            {saving ? 'Aplicando…' : 'Confirmar baja'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function InitialStockModal({ row, branchId, notify, onClose, onDone }) {
  const [form, setForm] = useState({ quantity: '', unit_cost: '', note: 'Saldo inicial' })
  const [saving, setSaving] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (n(form.quantity) <= 0) return notify('Cantidad inválida', 'error')
    setSaving(true)
    try {
      await api.setInitialStock({ branch_id: branchId, items: [{
        variant_id: row.variant_id,
        quantity: n(form.quantity),
        unit_cost: n(form.unit_cost) || null,
        note: form.note || 'Saldo inicial',
      }]})
      notify('Saldo inicial registrado correctamente')
      onDone()
    } catch (err) { notify(err.message, 'error') }
    setSaving(false)
  }

  return (
    <Modal title={`🌱 Saldo inicial · ${row.variant_sku}`} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ padding: '10px 14px', background: '#eff6ff', borderRadius: 8, fontSize: 13, color: '#1d4ed8' }}>
          Solo se puede aplicar si la variante no tiene movimientos previos en esta sucursal.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-field">
            <label>Cantidad inicial</label>
            <input type="number" min="0.001" step="0.001" value={form.quantity}
              onChange={e => setForm({ ...form, quantity: e.target.value })} required />
          </div>
          <div className="form-field">
            <label>Costo unitario (opcional)</label>
            <input type="number" min="0" step="0.01" value={form.unit_cost}
              onChange={e => setForm({ ...form, unit_cost: e.target.value })}
              placeholder="0.00" />
          </div>
        </div>
        <div className="form-field">
          <label>Nota</label>
          <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="form-submit-btn" disabled={saving}>
            {saving ? 'Guardando…' : 'Registrar saldo inicial'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── KARDEX TABLE ──────────────────────────────────────────────────────────────
function KardexTable({ moves, tenantCfg }) {
  const cur = tenantCfg?.currency || 'USD'
  if (!moves.length) return <EmptyState icon="📋" text="Sin movimientos registrados" />
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Producto</th>
            <th>Variante / EAN</th>
            <th>Tipo</th>
            <th>Cantidad</th>
            <th>Costo</th>
            <th>Saldo</th>
            <th>Origen</th>
            <th>Nota</th>
          </tr>
        </thead>
        <tbody>
          {moves.map((m, i) => {
            const meta = MOVE_META[m.movement_type] || {}
            const isPos = n(m.quantity) >= 0
            return (
              <tr key={m.id || i}>
                <td className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(m.created_at)}</td>
                <td style={{ fontSize: 12, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.product_name}
                </td>
                <td>
                  <code style={{ fontSize: 11 }}>{m.variant_sku}</code>
                  {m.ean13 && <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace', marginTop: 1 }}>{m.ean13}</div>}
                </td>
                <td><Badge type={m.movement_type} /></td>
                <td style={{ fontWeight: 700, color: isPos ? '#15803d' : '#dc2626', whiteSpace: 'nowrap' }}>
                  {isPos ? '+' : ''}{fmt(m.quantity)}
                </td>
                <td className="muted">{m.unit_cost ? formatMoney(m.unit_cost, cur) : '—'}</td>
                <td style={{ fontWeight: 700 }}>{fmt(m.balance_after)}</td>
                <td className="muted" style={{ fontSize: 11 }}>
                  {m.ref_type ? `${m.ref_type}${m.ref_id ? ' #' + m.ref_id : ''}` : '—'}
                </td>
                <td className="muted" style={{ fontSize: 11, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.note || '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function KardexTab({ branchId, notify, tenantCfg }) {
  const [moves, setMoves] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    if (!branchId) return
    setLoading(true)
    try { setMoves(await api.kardexFull(branchId, 500)) }
    catch (e) { notify(e.message, 'error') }
    setLoading(false)
  }, [branchId])

  useEffect(() => { load() }, [load])

  const moveTypes = [...new Set(moves.map(m => m.movement_type))]
  const filtered = moves.filter(m => {
    const q = search.toLowerCase()
    const matchSearch = !q || m.product_name?.toLowerCase().includes(q) || m.variant_sku?.toLowerCase().includes(q) || m.ean13?.toLowerCase().includes(q)
    const matchFilter = !filter || m.movement_type === filter
    return matchSearch && matchFilter
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input placeholder="🔍 Buscar producto, SKU o EAN…" value={search}
          onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 180, margin: 0 }} />
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ margin: 0, minWidth: 150 }}>
          <option value="">Todos los tipos</option>
          {moveTypes.map(t => <option key={t} value={t}>{MOVE_META[t]?.label || t}</option>)}
        </select>
        <Ib icon="refresh" tip="Recargar" variant="ghost" onClick={load} />
        <Ab icon="download" label="Exportar CSV" variant="ghost"
          onClick={async () => { try { await api.exportKardexCsv(branchId) } catch (e) { notify(e.message, 'error') } }} />
      </div>
      {loading
        ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Cargando…</div>
        : (
          <div className="section-card" style={{ padding: 0 }}>
            <KardexTable moves={filtered} tenantCfg={tenantCfg} />
          </div>
        )
      }
    </div>
  )
}

// ─── TRASLADOS ─────────────────────────────────────────────────────────────────
function Traslados({ branches, variants, branchId, notify }) {
  const [form, setForm] = useState({ variant_id: '', from_branch: branchId || '', to_branch: '', quantity: '', note: '' })
  const [rows, setRows] = useState([])

  useEffect(() => {
    setForm(f => ({ ...f, from_branch: branchId || '' }))
  }, [branchId])

  async function refresh() {
    try { setRows(await api.listTransfers()) } catch (e) { notify(e.message, 'error') }
  }
  useEffect(() => { refresh() }, [])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    if (form.from_branch === form.to_branch) return notify('Origen y destino deben ser distintos', 'error')
    try {
      await api.transfer({
        variant_id: Number(form.variant_id), from_branch: form.from_branch,
        to_branch: form.to_branch, quantity: Number(form.quantity), note: form.note || null,
      })
      notify('Traslado realizado: stock actualizado en ambas sucursales')
      setForm(f => ({ ...f, variant_id: '', quantity: '', note: '' }))
      refresh()
    } catch (err) { notify(err.message, 'error') }
  }

  const bname = (id) => branches.find(b => b.id === id)?.name || id?.slice(0, 8)
  const vlabel = (v) => `${v.product_name || ''} · ${v.variant_sku}${v.size ? ' T' + v.size : ''}${v.color ? ' ' + v.color : ''}${v.ean13 ? ' [' + v.ean13 + ']' : ''}`

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 14, alignItems: 'start' }}>
      <form onSubmit={submit} className="form-card" style={{ padding: '14px 16px', gap: 10 }}>
        <h3 className="form-card-title" style={{ fontSize: 13, marginBottom: 2 }}>🔄 Nuevo traslado</h3>
        <div className="form-field">
          <label>Variante</label>
          <select value={form.variant_id} onChange={set('variant_id')} required>
            <option value="">— seleccionar —</option>
            {variants.map(v => <option key={v.id} value={v.id}>{vlabel(v)}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="form-field">
            <label>Sucursal origen</label>
            <select value={form.from_branch} onChange={set('from_branch')} required>
              <option value="">— origen —</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label>Sucursal destino</label>
            <select value={form.to_branch} onChange={set('to_branch')} required>
              <option value="">— destino —</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="form-field">
            <label>Cantidad</label>
            <input type="number" min="0.001" step="0.001" value={form.quantity} onChange={set('quantity')} required />
          </div>
          <div className="form-field">
            <label>Nota</label>
            <input placeholder="opcional" value={form.note} onChange={set('note')} />
          </div>
        </div>
        <button type="submit" className="form-submit-btn">Realizar traslado</button>
      </form>

      <div className="section-card" style={{ padding: 0 }}>
        <div className="section-card-header" style={{ padding: '14px 18px' }}>
          <h3 className="section-card-title">Traslados recientes</h3>
          <Ib icon="refresh" tip="Recargar" variant="ghost" onClick={refresh} />
        </div>
        {rows.length === 0
          ? <EmptyState icon="🔄" text="Sin traslados aún" />
          : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>#</th><th>Variante / EAN</th><th>Origen</th><th>Destino</th><th>Cant.</th><th>Fecha</th></tr></thead>
                <tbody>
                  {rows.map(t => (
                    <tr key={t.id}>
                      <td><span className="row-id">#{t.id}</span></td>
                      <td>
                        <code style={{ fontSize: 11 }}>{t.variant_sku}</code>
                        {t.ean13 && <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace', marginTop: 1 }}>{t.ean13}</div>}
                      </td>
                      <td>{bname(t.from_branch)}</td>
                      <td>{bname(t.to_branch)}</td>
                      <td><strong>{fmt(t.quantity)}</strong></td>
                      <td className="muted">{fmtDate(t.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </div>
    </div>
  )
}

// ─── INVENTARIO FÍSICO ────────────────────────────────────────────────────────
function FisicoTab({ branchId, variants, warehouses, notify }) {
  const [sessions, setSessions] = useState([])
  const [openSession, setOpenSession] = useState(null)
  const [lines, setLines] = useState([])
  const [counts, setCounts] = useState({})
  const [search, setSearch] = useState('')
  const [newForm, setNewForm] = useState(null)
  const [saving, setSaving] = useState(false)

  const loadSessions = useCallback(async () => {
    if (!branchId) return
    try { setSessions(await api.listPhysicalInvs(branchId)) }
    catch (e) { notify(e.message, 'error') }
  }, [branchId])

  useEffect(() => { loadSessions() }, [loadSessions])

  async function openInv(session) {
    setOpenSession(session)
    setSearch('')
    setCounts({})
    try {
      const ls = await api.getPhysicalInvLines(session.id)
      setLines(ls)
      const c = {}
      ls.forEach(l => { if (l.counted_qty !== null) c[l.variant_id] = l.counted_qty })
      setCounts(c)
    } catch (e) {
      notify(e.message, 'error')
      // Si es borrador sin líneas, mostrar todas las variantes del stock
      setLines([])
    }
  }

  async function createSession(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const s = await api.createPhysicalInv({ ...newForm, branch_id: branchId })
      setNewForm(null)
      await loadSessions()
      await openInv(s)
      notify('Sesión de inventario físico creada')
    } catch (err) { notify(err.message, 'error') }
    setSaving(false)
  }

  async function saveCounts() {
    if (!openSession) return
    setSaving(true)
    try {
      const toSave = variants
        .filter(v => counts[v.id] !== undefined)
        .map(v => ({ variant_id: v.id, counted_qty: n(counts[v.id]), note: null }))
      if (!toSave.length) { notify('No hay conteos ingresados', 'error'); setSaving(false); return }
      await api.upsertPhysicalInvLines(openSession.id, toSave)
      const ls = await api.getPhysicalInvLines(openSession.id)
      setLines(ls)
      await loadSessions()
      notify(`${toSave.length} conteo(s) guardado(s)`)
    } catch (err) { notify(err.message, 'error') }
    setSaving(false)
  }

  async function closeInv() {
    if (!openSession) return
    if (!window.confirm('¿Cerrar el inventario y aplicar ajustes automáticamente al kardex?')) return
    setSaving(true)
    try {
      const r = await api.closePhysicalInv(openSession.id, true)
      notify(`Inventario cerrado. ${r.adjusted_lines} ajuste(s) aplicado(s) al kardex.`)
      setOpenSession(null)
      setLines([])
      setCounts({})
      await loadSessions()
    } catch (err) { notify(err.message, 'error') }
    setSaving(false)
  }

  // Merge variants with existing lines for display
  const displayRows = openSession ? (() => {
    const lineMap = {}
    lines.forEach(l => { lineMap[l.variant_id] = l })
    const base = lines.length > 0
      ? lines.map(l => ({ ...l, variant_sku: l.variant_sku, product_name: l.product_name }))
      : variants.map(v => ({
          variant_id: v.id, variant_sku: v.variant_sku, product_name: v.product_name || '',
          size: v.size, color: v.color, system_qty: 0, counted_qty: null, difference: null,
        }))
    return base.filter(r => {
      const q = search.toLowerCase()
      return !q || r.product_name?.toLowerCase().includes(q) || r.variant_sku?.toLowerCase().includes(q) || r.ean13?.toLowerCase().includes(q)
    })
  })() : []

  if (openSession) {
    const isClosed = openSession.status === 'closed'
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <button className="btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => { setOpenSession(null); setLines([]) }}>
            ← Volver
          </button>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{openSession.name}</div>
          <StatusBadge status={openSession.status} />
          <div style={{ flex: 1 }} />
          {!isClosed && (
            <>
              <Ab icon="save" label="Guardar conteos" variant="ghost" onClick={saveCounts} disabled={saving} />
              <Ab icon="check" label="Cerrar y aplicar ajustes" variant="primary" onClick={closeInv} disabled={saving} />
            </>
          )}
        </div>

        <input placeholder="🔍 Buscar producto, SKU o EAN…" value={search}
          onChange={e => setSearch(e.target.value)} style={{ marginBottom: 8, width: '100%' }} />

        <div className="section-card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Variante / EAN</th>
                  <th>Talla</th>
                  <th>Color</th>
                  <th>Saldo sistema</th>
                  <th>Contado</th>
                  <th>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r, i) => {
                  const counted = counts[r.variant_id]
                  const diff = counted !== undefined ? n(counted) - n(r.system_qty) : (r.difference ?? null)
                  const diffColor = diff === null ? 'var(--muted)' : diff > 0 ? '#1d4ed8' : diff < 0 ? '#dc2626' : '#15803d'
                  return (
                    <tr key={r.variant_id || i}>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>{r.product_name}</td>
                      <td>
                        <code style={{ fontSize: 11 }}>{r.variant_sku}</code>
                        {r.ean13 && <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace', marginTop: 1 }}>{r.ean13}</div>}
                      </td>
                      <td>{r.size || '—'}</td>
                      <td>{r.color || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{fmt(r.system_qty)}</td>
                      <td style={{ width: 120 }}>
                        {isClosed
                          ? <span style={{ fontWeight: 700 }}>{r.counted_qty !== null ? fmt(r.counted_qty) : '—'}</span>
                          : (
                            <input
                              type="number" min="0" step="0.001"
                              value={counts[r.variant_id] ?? ''}
                              onChange={e => setCounts(c => ({ ...c, [r.variant_id]: e.target.value }))}
                              style={{ margin: 0, width: 100, padding: '4px 8px', fontSize: 13 }}
                              placeholder={r.counted_qty !== null ? fmt(r.counted_qty) : '0'}
                            />
                          )
                        }
                      </td>
                      <td style={{ fontWeight: 700, color: diffColor }}>
                        {diff === null ? '—' : (diff > 0 ? '+' : '') + fmt(diff)}
                      </td>
                    </tr>
                  )
                })}
                {displayRows.length === 0 && (
                  <tr><td colSpan="7"><EmptyState icon="📋" text="Sin variantes para contar" /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <Ab icon="add" label="Nueva sesión de conteo" variant="primary" onClick={() => setNewForm({ name: '', warehouse_id: '', note: '' })} />
      </div>

      {newForm && (
        <Modal title="📝 Nueva sesión de inventario físico" onClose={() => setNewForm(null)}>
          <form onSubmit={createSession} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-field">
              <label>Nombre de la sesión</label>
              <input placeholder="ej. Conteo mensual julio 2026" required
                value={newForm.name} onChange={e => setNewForm({ ...newForm, name: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Bodega (opcional)</label>
              <select value={newForm.warehouse_id}
                onChange={e => setNewForm({ ...newForm, warehouse_id: e.target.value || null })}>
                <option value="">— Toda la sucursal —</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Nota</label>
              <input placeholder="Descripción adicional…" value={newForm.note}
                onChange={e => setNewForm({ ...newForm, note: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={() => setNewForm(null)}>Cancelar</button>
              <button type="submit" className="form-submit-btn" disabled={saving}>
                {saving ? 'Creando…' : 'Crear sesión'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {sessions.length === 0
        ? <EmptyState icon="📝" text="Sin sesiones de inventario físico. Crea una para empezar el conteo." />
        : (
          <div className="section-card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>#</th><th>Nombre</th><th>Bodega</th><th>Estado</th><th>Líneas</th><th>Creado</th><th>Cerrado</th><th></th></tr>
                </thead>
                <tbody>
                  {sessions.map(s => (
                    <tr key={s.id}>
                      <td><span className="row-id">#{s.id}</span></td>
                      <td style={{ fontWeight: 600 }}>{s.name}</td>
                      <td className="muted">{s.warehouse_name || '— Toda la sucursal —'}</td>
                      <td><StatusBadge status={s.status} /></td>
                      <td>{n(s.line_count)}</td>
                      <td className="muted">{fmtDate(s.created_at)}</td>
                      <td className="muted">{s.closed_at ? fmtDate(s.closed_at) : '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <Ib icon="edit" tip="Abrir sesión" variant="ghost" onClick={() => openInv(s)} />
                          {s.status === 'closed' && (
                            <Ib icon="download" tip="Exportar CSV" variant="ghost"
                              onClick={async () => { try { await api.exportPhysicalInvCsv(s.id) } catch (e) { notify(e.message, 'error') } }} />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      }
    </div>
  )
}

// ─── BODEGAS ───────────────────────────────────────────────────────────────────
function BodegasTab({ branchId, notify, onWarehousesChange }) {
  const [bodegas, setBodegas] = useState([])
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!branchId) return
    try {
      const ws = await api.listWarehouses(branchId)
      setBodegas(ws)
      onWarehousesChange?.(ws)
    } catch (e) { notify(e.message, 'error') }
  }, [branchId])

  useEffect(() => { load() }, [load])

  async function saveForm(e) {
    e.preventDefault()
    setSaving(true)
    try {
      if (form.id) {
        await api.updateWarehouse(form.id, { branch_id: branchId, code: form.code, name: form.name, description: form.description })
        notify('Bodega actualizada')
      } else {
        await api.createWarehouse({ branch_id: branchId, code: form.code, name: form.name, description: form.description })
        notify('Bodega creada')
      }
      setForm(null)
      await load()
    } catch (err) { notify(err.message, 'error') }
    setSaving(false)
  }

  async function remove(id) {
    if (!window.confirm('¿Desactivar esta bodega?')) return
    try {
      await api.deleteWarehouse(id)
      notify('Bodega desactivada')
      await load()
    } catch (err) { notify(err.message, 'error') }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20, alignItems: 'start' }}>
      <div className="form-card">
        <h3 className="form-card-title">{form?.id ? '✏️ Editar bodega' : '🏭 Nueva bodega'}</h3>
        {form ? (
          <form onSubmit={saveForm} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-field">
              <label>Código</label>
              <input placeholder="ej. BDG-01" maxLength={30} required
                value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            </div>
            <div className="form-field">
              <label>Nombre</label>
              <input placeholder="ej. Bodega principal" required
                value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Descripción</label>
              <input placeholder="Ubicación o notas adicionales…"
                value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn-secondary" onClick={() => setForm(null)}>Cancelar</button>
              <button type="submit" className="form-submit-btn" disabled={saving}>
                {saving ? 'Guardando…' : form.id ? 'Guardar cambios' : 'Crear bodega'}
              </button>
            </div>
          </form>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 0 }}>
              Las bodegas permiten agrupar el inventario por ubicación física dentro de una sucursal.
            </p>
            <Ab icon="add" label="Nueva bodega" variant="primary"
              onClick={() => setForm({ code: '', name: '', description: '' })} />
          </div>
        )}
      </div>

      <div className="section-card" style={{ padding: 0 }}>
        <div className="section-card-header" style={{ padding: '14px 18px' }}>
          <h3 className="section-card-title">Bodegas activas</h3>
          <Ib icon="refresh" tip="Recargar" variant="ghost" onClick={load} />
        </div>
        {bodegas.length === 0
          ? <EmptyState icon="🏭" text="Sin bodegas registradas para esta sucursal" />
          : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Código</th><th>Nombre</th><th>Descripción</th><th></th></tr></thead>
                <tbody>
                  {bodegas.map(w => (
                    <tr key={w.id}>
                      <td><code style={{ fontSize: 12, fontWeight: 700 }}>{w.code}</code></td>
                      <td style={{ fontWeight: 600 }}>{w.name}</td>
                      <td className="muted">{w.description || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <Ib icon="edit" tip="Editar" variant="ghost"
                            onClick={() => setForm({ ...w })} />
                          <Ib icon="delete" tip="Desactivar" variant="ghost"
                            onClick={() => remove(w.id)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </div>
    </div>
  )
}

// ─── ROOT ──────────────────────────────────────────────────────────────────────
export default function Inventarios() {
  const [tab, setTab]             = useState('dashboard')
  const [branches, setBranches]   = useState([])
  const [branchId, setBranchId]   = useState('')
  const [variants, setVariants]   = useState([])
  const [rows, setRows]           = useState([])
  const [warehouses, setWarehouses] = useState([])
  const notify = useNotify()
  const [loading, setLoading]     = useState(false)
  const [tenantCfg, setTenantCfg] = useState({ currency: 'USD', cost_method: 'promedio' })

  useEffect(() => {
    api.getConfig().then(cfg => {
      setTenantCfg({
        currency: cfg.base_currency || 'USD',
        cost_method: cfg.inventario?.cost_method || 'promedio',
      })
    }).catch(() => {})
  }, [])

  useEffect(() => {
    api.me().then(m => {
      setBranches(m.branches || [])
      const b = m.branch_id || m.branches?.[0]?.id || ''
      setBranchId(b)
    }).catch(e => notify(e.message, 'error'))
    api.variants().then(setVariants).catch(() => {})
  }, [])

  const loadStock = useCallback(async () => {
    if (!branchId) return
    setLoading(true)
    try { setRows(await api.stockResumen(branchId)) }
    catch (e) { notify(e.message, 'error') }
    setLoading(false)
  }, [branchId])

  useEffect(() => { loadStock() }, [loadStock])

  return (
    <div className="module-root">
      <div className="module-header" style={{ marginBottom: 0, paddingBottom: 8 }}>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Sucursal</label>
          <select value={branchId} onChange={e => setBranchId(e.target.value)}
            style={{ margin: 0, minWidth: 160 }}>
            <option value="">— seleccionar —</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
          </select>
          <Ib icon="refresh" tip="Recargar stock" variant="ghost" onClick={loadStock} />
        </div>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      <div style={{ padding: '10px 0' }}>
        {loading && tab === 'dashboard'
          ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Cargando…</div>
          : null
        }

        {tab === 'dashboard' && !loading && (
          <Dashboard rows={rows} tenantCfg={tenantCfg} />
        )}

        {tab === 'existencias' && (
          <Existencias
            rows={rows}
            variants={variants}
            branchId={branchId}
            notify={notify}
            onRefresh={loadStock}
            tenantCfg={tenantCfg}
          />
        )}

        {tab === 'kardex' && (
          <KardexTab branchId={branchId} notify={notify} tenantCfg={tenantCfg} />
        )}

        {tab === 'traslados' && (
          <Traslados branches={branches} variants={variants} branchId={branchId} notify={notify} />
        )}

        {tab === 'fisico' && (
          <FisicoTab
            branchId={branchId}
            variants={variants}
            warehouses={warehouses}
            notify={notify}
          />
        )}

        {tab === 'bodegas' && (
          <BodegasTab
            branchId={branchId}
            notify={notify}
            onWarehousesChange={setWarehouses}
          />
        )}
      </div>
    </div>
  )
}
