import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client.js'
import Comprobante from '../components/Comprobante.jsx'
import { cacheVariants, cachedVariants, enqueueSale, getQueue, syncQueue, uuid } from '../api/offline.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useNotify } from '../context/ToastContext.jsx'

const n = (x) => Number(x) || 0
const METHODS = [['efectivo', 'Efectivo'], ['tarjeta_credito', 'T. Crédito'], ['tarjeta_debito', 'T. Débito'], ['transferencia', 'Transfer.']]

// Vista optimizada para pantalla táctil: botones grandes, grid de productos.
export default function Caja() {
  const { currency: tenantCurrency } = useAuth()
  const notify = useNotify()
  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState('')
  const [currency, setCurrency] = useState(() => tenantCurrency || 'USD')
  const [variants, setVariants] = useState([])
  const [q, setQ] = useState('')
  const [cart, setCart] = useState([])
  const [method, setMethod] = useState('efectivo')
  const [receiptId, setReceiptId] = useState(null)
  const [online, setOnline] = useState(navigator.onLine !== false)
  const [pending, setPending] = useState(getQueue().length)
  const eanRef = useRef(null)

  useEffect(() => {
    api.me().then(m => {
      setBranches(m.branches || [])
      const b = m.branch_id || (m.branches[0] && m.branches[0].id) || ''
      setBranchId(b)
      const cur = m.branches.find(x => x.id === b)?.default_currency || m.base_currency || tenantCurrency
      if (cur) setCurrency(cur)
    }).catch(() => {})
    // Catálogo: intenta en línea; si falla, usa la caché local
    api.variants().then(v => { setVariants(v); cacheVariants(v) })
      .catch(() => setVariants(cachedVariants()))

    const up = () => { setOnline(true); trySync() }
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  async function trySync() {
    const q = getQueue()
    if (q.length === 0) return
    const r = await syncQueue()
    setPending(getQueue().length)
    if (r.ok > 0) notify(`${r.ok} venta(s) offline sincronizada(s)`, 'info')
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = s ? variants.filter(v =>
      (v.product_name || '').toLowerCase().includes(s) ||
      (v.variant_sku || '').toLowerCase().includes(s) ||
      (v.ean13 || '').includes(s)) : variants
    return list.slice(0, 60)
  }, [q, variants])

  function addVariant(v) {
    setCart(prev => {
      const i = prev.findIndex(x => x.variant_id === v.id)
      if (i >= 0) { const c = [...prev]; c[i] = { ...c[i], quantity: c[i].quantity + 1 }; return c }
      return [...prev, { variant_id: v.id, sku: v.variant_sku, name: v.product_name, unit_price: n(v.sale_price), quantity: 1 }]
    })
  }

  async function scan(e) {
    e.preventDefault()
    const code = q.trim(); if (!code) return
    const local = variants.find(v => v.ean13 === code)
    if (local) { addVariant(local); setQ(''); return }
    try {
      const r = await api.findByEan(code)
      if (r.found) { addVariant({ id: r.variant_id, variant_sku: r.sku, product_name: r.sku, sale_price: r.sale_price }); setQ('') }
      else notify(`EAN ${code} no encontrado`, 'error')
    } catch (err) { notify(err.message, 'error') }
  }

  const inc = (i, d) => setCart(cart.map((it, j) => j === i ? { ...it, quantity: Math.max(1, it.quantity + d) } : it))
  const removeItem = (i) => setCart(cart.filter((_, j) => j !== i))
  const total = cart.reduce((s, it) => s + n(it.unit_price) * n(it.quantity), 0)

  async function cobrar() {
    if (!branchId) return notify('Selecciona sucursal', 'error')
    if (cart.length === 0) return notify('Carrito vacío', 'warn')
    const payload = {
      branch_id: branchId, kind: 'sale', currency, tax: 0, client_uuid: uuid(),
      items: cart.map(it => ({ variant_id: it.variant_id, quantity: n(it.quantity), unit_price: n(it.unit_price), discount: 0 })),
      payments: [{ method, amount: total }],
    }
    if (navigator.onLine === false) {
      enqueueSale(payload); setPending(getQueue().length)
      notify(`Venta guardada OFFLINE · ${currency} ${total.toFixed(2)} (se sincronizará al reconectar)`, 'warn')
      setCart([]); return
    }
    try {
      const res = await api.createSale(payload)
      notify(`Venta #${res.sale_id} · ${currency} ${res.total.toFixed(2)}`)
      setReceiptId(res.sale_id)
      setCart([])
    } catch (err) {
      enqueueSale(payload); setPending(getQueue().length)
      setOnline(false)
      notify(`Sin conexión: venta guardada OFFLINE · ${currency} ${total.toFixed(2)}`, 'warn')
      setCart([])
    }
  }

  return (
    <div className="caja">
      <div className="caja-top">
        <select style={{ width: 'auto', marginTop: 0 }} value={branchId} onChange={e => setBranchId(e.target.value)}>
          <option value="">— sucursal —</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <span className="badge">{currency}</span>
        <span className="badge" style={{ background: online ? '#dcfce7' : '#fee2e2', color: online ? '#059669' : '#dc2626' }}>
          {online ? '● En línea' : '● Sin conexión'}
        </span>
        {pending > 0 && (
          <button style={{ width: 'auto', marginTop: 0, background: '#f59e0b' }} onClick={trySync}>
            Sincronizar {pending} pendiente(s)
          </button>
        )}
      </div>

      <div className="caja-grid">
        {/* Productos */}
        <div>
          <form onSubmit={scan}>
            <input ref={eanRef} placeholder="Buscar producto o escanear EAN…" value={q} onChange={e => setQ(e.target.value)} style={{ fontSize: 18, padding: 14 }} />
          </form>
          <div className="prod-grid">
            {filtered.map(v => (
              <button key={v.id} className="prod-card" onClick={() => addVariant(v)}>
                <div className="pc-name">{v.product_name}</div>
                <div className="pc-sku">{v.variant_sku}{v.size ? ` · T${v.size}` : ''}{v.color ? ` · ${v.color}` : ''}</div>
                <div className="pc-price">{currency} {n(v.sale_price).toFixed(2)}</div>
              </button>
            ))}
            {filtered.length === 0 && <p className="muted">Sin productos. Da de alta catálogo o ajusta la búsqueda.</p>}
          </div>
        </div>

        {/* Ticket */}
        <div className="caja-ticket">
          <h3 style={{ marginTop: 0 }}>Ticket</h3>
          <div className="ticket-items">
            {cart.map((it, i) => (
              <div key={i} className="ticket-row">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{it.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{it.sku} · {currency} {n(it.unit_price).toFixed(2)}</div>
                </div>
                <button className="qty-btn" onClick={() => inc(i, -1)}>−</button>
                <span style={{ minWidth: 26, textAlign: 'center' }}>{it.quantity}</span>
                <button className="qty-btn" onClick={() => inc(i, 1)}>+</button>
                <span style={{ minWidth: 70, textAlign: 'right' }}>{(n(it.unit_price) * n(it.quantity)).toFixed(2)}</span>
                <button className="qty-btn" style={{ background: '#dc2626', color: '#fff' }} onClick={() => removeItem(i)}>×</button>
              </div>
            ))}
            {cart.length === 0 && <p className="muted">Toca productos para agregarlos.</p>}
          </div>

          <div className="caja-total">TOTAL <b>{currency} {total.toFixed(2)}</b></div>

          <div className="pay-methods">
            {METHODS.map(([v, l]) => (
              <button key={v} className={`pay-btn ${method === v ? 'active' : ''}`} onClick={() => setMethod(v)}>{l}</button>
            ))}
          </div>
          <button className="cobrar-btn" onClick={cobrar} disabled={cart.length === 0}>COBRAR</button>
        </div>
      </div>

      {receiptId && <Comprobante saleId={receiptId} onClose={() => setReceiptId(null)} />}
    </div>
  )
}
