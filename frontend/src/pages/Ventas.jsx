import { useEffect, useRef, useState, useMemo } from 'react'
import { Paginator, usePaginator } from '../components/Paginator.jsx'
import { api } from '../api/client.js'
import Comprobante from '../components/Comprobante.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useNotify } from '../context/ToastContext.jsx'
import { Ib, Ab } from '../components/IconBtn.jsx'
import { ActiveBadge } from '../components/ui.jsx'
import { formatMoney } from '../utils/currency.js'

const n = (x) => Number(x) || 0

const ALL_PAY_METHODS = [
  { id: 'efectivo',        label: 'Efectivo',   icon: '💵' },
  { id: 'tarjeta_credito', label: 'Crédito',    icon: '💳' },
  { id: 'tarjeta_debito',  label: 'Débito',     icon: '🏧' },
  { id: 'transferencia',   label: 'Transfer.',   icon: '📲' },
  { id: 'cheque',          label: 'Cheque',      icon: '📄' },
]

const TABS = [
  { id: 'pos',       label: 'Punto de venta', icon: '🛒' },
  { id: 'caja',      label: 'Caja',           icon: '🏦' },
  { id: 'pedidos',   label: 'Pedidos',        icon: '📦' },
  { id: 'promos',    label: 'Promociones',    icon: '🎁' },
  { id: 'clientes',  label: 'Clientes',       icon: '👤' },
  { id: 'historial', label: 'Historial',      icon: '📋' },
  { id: 'fiscal',    label: 'Config. fiscal', icon: '⚙️' },
]

function promoDiscount(promo, unit, qty) {
  if (!promo) return 0
  const line = unit * qty
  switch (promo.type) {
    case 'percentage': return +(line * n(promo.value) / 100).toFixed(2)
    case 'fixed':      return Math.min(n(promo.value), line)
    case '2x1':        return Math.floor(qty / 2) * unit
    default:           return 0
  }
}

function StockBadge({ qty }) {
  if (qty === undefined || qty === null) return null
  const q = n(qty)
  if (q <= 0)  return <span className="stock-badge stock-badge-out">Sin stock</span>
  if (q <= 5)  return <span className="stock-badge stock-badge-low">{q} disp.</span>
  return <span className="stock-badge stock-badge-ok">{q} disp.</span>
}

export default function Ventas() {
  const { currency: tenantCurrency } = useAuth()
  const [tab, setTab]         = useState('pos')
  const [ctx, setCtx]         = useState({ branches: [] })
  const [currencies, setCurrencies] = useState([])
  const [customers, setCustomers]   = useState([])
  const [promos, setPromos]         = useState([])
  const [branchId, setBranchId]     = useState('')
  const [currency, setCurrency]     = useState(() => tenantCurrency || 'USD')
  const fmt = (x) => formatMoney(x, currency)
  const [mode, setMode]       = useState('sale')
  const [customerId, setCustomerId] = useState('')
  const [cart, setCart]       = useState([])
  const [tax, setTax]         = useState(0)
  const [payments, setPayments] = useState([{ method: 'efectivo', amount: '', reference: '' }])
  const [sales, setSales]     = useState([])
  const [orders, setOrders]   = useState([])
  const [receiptId, setReceiptId] = useState(null)

  // Catálogo
  const [variants, setVariants]   = useState([])
  const [stockMap, setStockMap]   = useState({})  // variant_id → qty
  const [search, setSearch]       = useState('')
  const [catLoading, setCatLoading] = useState(false)

  // Cliente inline
  const [custSearch, setCustSearch] = useState('')
  const [showCustDrop, setShowCustDrop] = useState(false)
  const [showNewCust, setShowNewCust]   = useState(false)
  const [newCust, setNewCust] = useState({ name: '', phone: '', email: '', identification: '', birthday: '' })

  // Métodos de pago configurables
  const [payMethods, setPayMethods] = useState(ALL_PAY_METHODS)

  // Perfiles POS
  const [posProfiles, setPosProfiles] = useState([])
  const [cashierProfile, setCashierProfile] = useState('')
  const [sellerProfile, setSellerProfile] = useState('')

  // Caja
  const [cashSession, setCashSession] = useState(null)
  const [cashSessions, setCashSessions] = useState([])

  // Historial filtros
  const [histFilter, setHistFilter] = useState({ date_from: '', date_to: '', cashier_name: '', seller_name: '' })

  const salesPag = usePaginator(sales)
  const searchRef = useRef(null)
  const notify = useNotify()

  const activePromos = promos.filter(p => p.is_active)
  const selectedCustomer = customers.find(c => String(c.id) === String(customerId))

  useEffect(() => {
    api.me().then(me => {
      setCtx(me)
      const b = me.branch_id || me.branches[0]?.id || ''
      setBranchId(b)
      const cur = me.branches.find(x => x.id === b)?.default_currency || me.base_currency
      if (cur) setCurrency(cur)
    }).catch(e => notify(e.message, 'error'))
    api.currencies().then(setCurrencies).catch(() => {})
    api.listCustomers().then(setCustomers).catch(() => {})
    api.listPromotions().then(setPromos).catch(() => {})
    api.listPosProfiles().then(setPosProfiles).catch(() => {})
    api.getConfig().then(cfg => {
      const methods = cfg?.config?.pos?.payment_methods
      if (Array.isArray(methods) && methods.length > 0) {
        setPayMethods(ALL_PAY_METHODS.filter(m => methods.includes(m.id)))
      }
    }).catch(() => {})
    // Cargar catálogo
    setCatLoading(true)
    api.variants().then(setVariants).catch(() => {}).finally(() => setCatLoading(false))
  }, [])

  // Recargar stock cuando cambia la sucursal
  useEffect(() => {
    if (!branchId) return
    api.stock(branchId).then(rows => {
      const m = {}
      rows.forEach(r => { m[r.variant_id] = n(r.quantity) })
      setStockMap(m)
    }).catch(() => {})
  }, [branchId])

  /* ── Catálogo filtrado (solo con stock disponible) ── */
  const catalogItems = useMemo(() => {
    // Solo mostrar variantes con stock > 0 (o sin info de stock aún)
    const withStock = variants.filter(v => {
      const qty = stockMap[v.id]
      return qty === undefined || n(qty) > 0
    })
    const s = search.trim().toLowerCase()
    if (!s) return withStock
    return withStock.filter(v =>
      (v.product_name || '').toLowerCase().includes(s) ||
      (v.variant_sku  || '').toLowerCase().includes(s) ||
      (v.ean13        || '').includes(s) ||
      (v.size         || '').toLowerCase().includes(s) ||
      (v.color        || '').toLowerCase().includes(s)
    )
  }, [variants, search, stockMap])

  /* ── Carrito ── */
  function recalcPromo(list, i) {
    const it = list[i]
    const promo = activePromos.find(p => String(p.id) === String(it.promotion_id))
    if (promo) list[i] = { ...it, discount: promoDiscount(promo, n(it.unit_price), n(it.quantity)) }
    return list
  }

  function addToCart(v) {
    setCart(prev => {
      const i = prev.findIndex(x => x.variant_id === v.id)
      if (i >= 0) {
        const c = [...prev]; c[i] = { ...c[i], quantity: c[i].quantity + 1 }
        return recalcPromo(c, i)
      }
      return [...prev, {
        variant_id: v.id,
        sku: v.variant_sku,
        name: v.product_name,
        size: v.size,
        color: v.color,
        unit_price: n(v.sale_price),
        quantity: 1,
        discount: 0,
        promotion_id: '',
      }]
    })
  }

  async function handleSearch(e) {
    e.preventDefault()
    const code = search.trim(); if (!code) return
    // Intenta EAN exacto primero
    const exact = variants.find(v => v.ean13 === code)
    if (exact) { addToCart(exact); setSearch(''); return }
    // Si es numérico, busca en API
    if (/^\d{8,14}$/.test(code)) {
      try {
        const r = await api.findByEan(code)
        if (r.found) {
          addToCart({ id: r.variant_id, variant_sku: r.sku, product_name: r.sku, sale_price: r.sale_price, size: r.size, color: r.color })
          setSearch('')
        } else notify(`EAN ${code} no encontrado`, 'error')
      } catch (err) { notify(err.message, 'error') }
    }
    // Si no es EAN, la búsqueda ya filtra el catálogo visual
  }

  const upd = (i, k, v) => setCart(prev => {
    const c = prev.map((it, j) => j === i ? { ...it, [k]: v } : it)
    return (k === 'promotion_id' || k === 'quantity' || k === 'unit_price') ? recalcPromo(c, i) : c
  })
  const removeItem = (i) => setCart(cart.filter((_, j) => j !== i))
  const incQty = (i, d) => upd(i, 'quantity', Math.max(1, n(cart[i].quantity) + d))

  const subtotal = cart.reduce((s, it) => s + n(it.unit_price) * n(it.quantity), 0)
  const discount = cart.reduce((s, it) => s + n(it.discount), 0)
  const total    = subtotal - discount + n(tax)
  const paid     = payments.reduce((s, p) => s + n(p.amount), 0)
  const change   = paid - total

  const setPay    = (i, k, v) => setPayments(payments.map((p, j) => j === i ? { ...p, [k]: v } : p))
  const addPay    = () => setPayments([...payments, { method: payMethods[1]?.id || payMethods[0]?.id || 'efectivo', amount: '', reference: '' }])
  const removePay = (i) => setPayments(payments.filter((_, j) => j !== i))
  const fillRest  = (i) => setPay(i, 'amount', Math.max(0, total - (paid - n(payments[i].amount))).toFixed(2))

  async function checkout() {
    if (!branchId) return notify('Selecciona una sucursal', 'error')
    if (cart.length === 0) return notify('El carrito está vacío', 'error')
    if (mode === 'sale' && paid + 1e-6 < total)
      return notify(`Pago insuficiente: falta ${fmt(total - paid)}`, 'error')
    try {
      const res = await api.createSale({
        branch_id: branchId, kind: mode, currency, tax: n(tax),
        customer_id: customerId ? Number(customerId) : null,
        cashier_name: cashierProfile || null,
        seller_name: sellerProfile || null,
        items: cart.map(it => ({
          variant_id: it.variant_id,
          quantity: n(it.quantity),
          unit_price: n(it.unit_price),
          discount: n(it.discount),
          promotion_id: it.promotion_id ? Number(it.promotion_id) : null,
        })),
        payments: mode === 'sale'
          ? payments.filter(p => n(p.amount) > 0).map(p => ({ method: p.method, amount: n(p.amount), reference: p.reference || null }))
          : [],
      })
      const saleNo = res.sale_no || 'FV-' + String(res.sale_id).padStart(6, '0')
      notify(mode === 'sale'
        ? `✓ Venta ${saleNo} · ${fmt(res.total)}`
        : `✓ Pedido ${saleNo} creado`)
      if (mode === 'sale') {
        setReceiptId(res.sale_id)
        // Actualizar stock en mapa local
        const newMap = { ...stockMap }
        cart.forEach(it => {
          if (newMap[it.variant_id] !== undefined) newMap[it.variant_id] = Math.max(0, newMap[it.variant_id] - n(it.quantity))
        })
        setStockMap(newMap)
      }
      setCart([]); setTax(0); setCustomerId(''); setCustSearch('')
      setPayments([{ method: 'efectivo', amount: '', reference: '' }])
      searchRef.current?.focus()
    } catch (err) { notify(err.message, 'error') }
  }

  async function quickAddCust(e) {
    e.preventDefault()
    if (!newCust.name.trim()) return
    try {
      const c = await api.createCustomer(newCust)
      const list = await api.listCustomers()
      setCustomers(list)
      setCustomerId(String(c.id))
      setCustSearch(newCust.name)
      setNewCust({ name: '', phone: '', email: '' })
      setShowNewCust(false)
      setShowCustDrop(false)
      notify(`Cliente "${c.name}" registrado`)
    } catch (err) { notify(err.message, 'error') }
  }

  async function goTab(t) {
    setTab(t)
    try {
      if (t === 'historial') setSales(await api.listSales('sale'))
      if (t === 'pedidos')   setOrders(await api.listSales('order'))
      if (t === 'caja' && branchId) {
        const active = await api.getActiveCashSession(branchId)
        setCashSession(active)
        const sessions = await api.listCashSessions(branchId)
        setCashSessions(sessions)
      }
    } catch (e) { notify(e.message, 'error') }
  }

  async function applyHistFilter() {
    try {
      const qs = Object.entries(histFilter).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
      setSales(await api.listSales('sale', qs))
    } catch (e) { notify(e.message, 'error') }
  }

  async function deliver(id) {
    try {
      const r = await api.deliverOrder(id)
      notify(`Pedido #${r.sale_id} entregado`)
      setOrders(await api.listSales('order'))
    } catch (e) { notify(e.message, 'error') }
  }

  // Clientes filtrados para dropdown
  const filteredCusts = useMemo(() => {
    const s = custSearch.trim().toLowerCase()
    if (!s) return customers.slice(0, 8)
    return customers.filter(c =>
      (c.name || '').toLowerCase().includes(s) ||
      (c.tax_id || '').toLowerCase().includes(s) ||
      (c.phone  || '').includes(s)
    ).slice(0, 8)
  }, [customers, custSearch])

  return (
    <div className="ventas-root">
      {/* ── Tab bar ── */}
      <div className="vtab-bar">
        {TABS.map(t => (
          <button key={t.id} className={`vtab-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => goTab(t.id)}>
            <span className="vtab-icon">{t.icon}</span>
            <span className="vtab-label">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── POS ── */}
      {tab === 'pos' && (
        <div className="pos3-layout">

          {/* ── COLUMNA 1: Catálogo ── */}
          <div className="pos-catalog-col">
            {/* Config bar */}
            <div className="pos-topbar">
              <select className="pos-branch-sel" value={branchId} onChange={e => {
                setBranchId(e.target.value)
                const cur = ctx.branches.find(x => x.id === e.target.value)?.default_currency || ctx.base_currency || tenantCurrency
                if (cur) setCurrency(cur)
              }}>
                <option value="">— sucursal —</option>
                {ctx.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <select className="pos-cur-sel" value={currency} onChange={e => setCurrency(e.target.value)}>
                {(currencies.length ? currencies.map(c => c.code) : ['USD', 'COP', 'MXN']).map(c => <option key={c}>{c}</option>)}
              </select>
              <div className="mode-pill" style={{ marginLeft: 'auto' }}>
                <button className={mode === 'sale'  ? 'active' : ''} onClick={() => setMode('sale')}>Venta</button>
                <button className={mode === 'order' ? 'active' : ''} onClick={() => setMode('order')}>Pedido</button>
              </div>
            </div>

            {/* Buscador */}
            <form onSubmit={handleSearch} className="pos-search-form">
              <div className="pos-search-wrap">
                <span className="pos-search-icon">⌕</span>
                <input
                  ref={searchRef} autoFocus
                  className="pos-search-input"
                  placeholder="Buscar por nombre, SKU o EAN…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button type="button" className="pos-search-clear" onClick={() => { setSearch(''); searchRef.current?.focus() }}>✕</button>
                )}
              </div>
            </form>

            {/* Conteo */}
            <div className="pos-cat-meta">
              {catLoading
                ? <span className="muted">Cargando catálogo…</span>
                : <span className="muted">{catalogItems.length} producto{catalogItems.length !== 1 ? 's' : ''}{search ? ` · "${search}"` : ''}</span>
              }
            </div>

            {/* Grid de productos */}
            <div className="pos-prod-grid">
              {catalogItems.length === 0 && !catLoading && (
                search
                  ? <div className="pos-cat-empty">Sin resultados para "{search}"</div>
                  : <div className="pos-cat-empty" style={{ padding: '2rem', textAlign: 'center', gridColumn: '1/-1' }}>
                      <div style={{ fontSize: 40, marginBottom: 10 }}>📦</div>
                      <p style={{ fontWeight: 700, fontSize: 15 }}>No hay productos con existencia disponible</p>
                      <p style={{ color: 'var(--muted)', fontSize: 13 }}>Para vender, primero registra entradas en el módulo de <strong>Inventarios</strong>.</p>
                    </div>
              )}
              {catalogItems.map(v => {
                const stock = stockMap[v.id]
                const outOfStock = stock !== undefined && n(stock) <= 0
                const inCart = cart.find(c => c.variant_id === v.id)
                return (
                  <button
                    key={v.id}
                    className={`pos-prod-card ${outOfStock ? 'pos-prod-card-out' : ''} ${inCart ? 'pos-prod-card-in-cart' : ''}`}
                    onClick={() => addToCart(v)}
                    disabled={outOfStock}
                  >
                    {inCart && <span className="pos-cart-badge">{inCart.quantity}</span>}
                    <div className="pos-prod-name">{v.product_name}</div>
                    <div className="pos-prod-sku">{v.variant_sku}{v.size ? ` · T${v.size}` : ''}{v.color ? ` · ${v.color}` : ''}</div>
                    <div className="pos-prod-footer">
                      <span className="pos-prod-price">{fmt(n(v.sale_price))}</span>
                      <StockBadge qty={stock} />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── COLUMNA 2: Carrito ── */}
          <div className="pos-cart-col">
            <div className="pos-cart-header">
              <span className="pos-cart-title">Carrito</span>
              {cart.length > 0 && (
                <button className="pos-cart-clear" onClick={() => setCart([])}>Limpiar</button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="pos-cart-empty">
                <div style={{ fontSize: 36, opacity: .3 }}>🛒</div>
                <p>Selecciona productos del catálogo</p>
              </div>
            ) : (
              <div className="pos-cart-items">
                {cart.map((it, i) => (
                  <div key={i} className="pos-cart-row">
                    <div className="pos-cart-info">
                      <div className="pos-cart-prod-name">{it.name}</div>
                      <div className="pos-cart-prod-meta">
                        {it.sku}{it.size ? ` · T${it.size}` : ''}{it.color ? ` · ${it.color}` : ''}
                      </div>
                      {/* Precio editable */}
                      <div className="pos-cart-price-row">
                        <span className="muted" style={{ fontSize: 11 }}>Precio</span>
                        <input
                          className="pos-cart-price-input"
                          type="number" step="0.01" min="0"
                          value={it.unit_price}
                          onChange={e => upd(i, 'unit_price', e.target.value)}
                        />
                        {activePromos.length > 0 && (
                          <select className="pos-cart-promo-sel"
                            value={it.promotion_id}
                            onChange={e => upd(i, 'promotion_id', e.target.value)}>
                            <option value="">Sin promo</option>
                            {activePromos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        )}
                      </div>
                    </div>
                    <div className="pos-cart-right">
                      <div className="pos-qty-ctrl">
                        <button className="pos-qty-btn" onClick={() => incQty(i, -1)}>−</button>
                        <input
                          className="pos-qty-input"
                          type="number" min="1"
                          value={it.quantity}
                          onChange={e => upd(i, 'quantity', e.target.value)}
                        />
                        <button className="pos-qty-btn" onClick={() => incQty(i, 1)}>+</button>
                      </div>
                      <div className="pos-cart-line-total">
                        {fmt(n(it.unit_price) * n(it.quantity) - n(it.discount))}
                      </div>
                      {n(it.discount) > 0 && (
                        <div style={{ fontSize: 11, color: '#16a34a', textAlign: 'right' }}>
                          −{fmt(n(it.discount))}
                        </div>
                      )}
                      <button className="pos-cart-remove" onClick={() => removeItem(i)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Totales en carrito */}
            {cart.length > 0 && (
              <div className="pos-cart-totals">
                <div className="pos-total-row"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
                {discount > 0 && <div className="pos-total-row" style={{ color: '#16a34a' }}><span>Descuentos</span><span>−{fmt(discount)}</span></div>}
                <div className="pos-total-row">
                  <span>Impuesto</span>
                  <input className="pos-tax-input" type="number" step="0.01" placeholder="0.00"
                    value={tax} onChange={e => setTax(e.target.value)} />
                </div>
                <div className="pos-total-grand"><span>TOTAL</span><span>{fmt(total)}</span></div>
              </div>
            )}
          </div>

          {/* ── COLUMNA 3: Cliente + Cobro ── */}
          <div className="pos-checkout-col">

            {/* Cliente */}
            <div className="pos-section">
              <div className="pos-section-label">Cliente</div>
              {customerId && selectedCustomer ? (
                <div className="pos-cust-selected">
                  <div className="pos-cust-name">{selectedCustomer.name}</div>
                  {selectedCustomer.phone && <div className="pos-cust-meta">{selectedCustomer.phone}</div>}
                  <button className="pos-cust-clear" onClick={() => { setCustomerId(''); setCustSearch(''); }}>✕ Quitar</button>
                </div>
              ) : (
                <div className="pos-cust-search-wrap">
                  <input
                    className="pos-cust-input"
                    placeholder="Buscar cliente o consumidor final…"
                    value={custSearch}
                    onChange={e => { setCustSearch(e.target.value); setShowCustDrop(true) }}
                    onFocus={() => setShowCustDrop(true)}
                    onBlur={() => setTimeout(() => setShowCustDrop(false), 180)}
                  />
                  {showCustDrop && (
                    <div className="pos-cust-drop">
                      {filteredCusts.length === 0 && custSearch && (
                        <div className="pos-cust-no-match">Sin resultados</div>
                      )}
                      {filteredCusts.map(c => (
                        <button key={c.id} className="pos-cust-opt"
                          onMouseDown={() => { setCustomerId(String(c.id)); setCustSearch(c.name); setShowCustDrop(false) }}>
                          <span>{c.name}</span>
                          {c.phone && <span className="pos-cust-opt-meta">{c.phone}</span>}
                        </button>
                      ))}
                      <button className="pos-cust-new-btn"
                        onMouseDown={() => { setShowNewCust(true); setShowCustDrop(false) }}>
                        + Nuevo cliente
                      </button>
                    </div>
                  )}
                </div>
              )}
              {showNewCust && (
                <form className="pos-new-cust-form" onSubmit={quickAddCust}>
                  <input placeholder="Nombre *" value={newCust.name}
                    onChange={e => setNewCust({ ...newCust, name: e.target.value })} required autoFocus />
                  <input placeholder="Teléfono" value={newCust.phone}
                    onChange={e => setNewCust({ ...newCust, phone: e.target.value })} />
                  <input placeholder="Correo" type="email" value={newCust.email}
                    onChange={e => setNewCust({ ...newCust, email: e.target.value })} />
                  <input placeholder="Identificación (CC/NIT/Pasaporte)" value={newCust.identification}
                    onChange={e => setNewCust({ ...newCust, identification: e.target.value })} />
                  <input placeholder="Cumpleaños (DD/MM o DD/MM/AAAA)" value={newCust.birthday}
                    onChange={e => setNewCust({ ...newCust, birthday: e.target.value })} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="submit" className="pos-new-cust-save">Guardar</button>
                    <button type="button" className="pos-new-cust-cancel"
                      onClick={() => setShowNewCust(false)}>Cancelar</button>
                  </div>
                </form>
              )}
            </div>

            {/* Cajero / Vendedor */}
            {posProfiles.filter(p => p.is_active).length > 0 && (
              <div className="pos-section">
                {posProfiles.some(p => p.is_active && (p.role === 'cajero' || p.role === 'supervisor')) && (
                  <>
                    <div className="pos-section-label">Cajero</div>
                    <select style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, marginBottom: 8 }}
                      value={cashierProfile} onChange={e => setCashierProfile(e.target.value)}>
                      <option value="">— seleccionar cajero —</option>
                      {posProfiles.filter(p => p.is_active && (p.role === 'cajero' || p.role === 'supervisor')).map(p => (
                        <option key={p.id} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </>
                )}
                {posProfiles.some(p => p.is_active && (p.role === 'vendedor' || p.role === 'supervisor')) && (
                  <>
                    <div className="pos-section-label">Vendedor</div>
                    <select style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}
                      value={sellerProfile} onChange={e => setSellerProfile(e.target.value)}>
                      <option value="">— seleccionar vendedor —</option>
                      {posProfiles.filter(p => p.is_active && (p.role === 'vendedor' || p.role === 'supervisor')).map(p => (
                        <option key={p.id} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            )}

            {/* Método de pago */}
            {mode === 'sale' && (
              <div className="pos-section">
                <div className="pos-section-label">Método de pago</div>
                <div className="pos-method-grid">
                  {payMethods.map(m => (
                    <button
                      key={m.id}
                      className={`pos-method-btn ${payments[0]?.method === m.id && payments.length === 1 ? 'active' : ''}`}
                      onClick={() => setPayments([{ method: m.id, amount: total > 0 ? total.toFixed(2) : '', reference: '' }])}
                    >
                      <span>{m.icon}</span>
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>

                {/* Pagos múltiples */}
                <div className="pos-payments-list">
                  {payments.map((p, i) => (
                    <div key={i} className="pos-pay-row">
                      <select className="pos-pay-method"
                        value={p.method} onChange={e => setPay(i, 'method', e.target.value)}>
                        {payMethods.map(m => <option key={m.id} value={m.id}>{m.icon} {m.label}</option>)}
                      </select>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <input className="pos-pay-amount" type="number" step="0.01" placeholder="Monto"
                          value={p.amount} onChange={e => setPay(i, 'amount', e.target.value)} />
                        <button className="pos-pay-fill" onClick={() => fillRest(i)} title="Completar saldo">⇥</button>
                      </div>
                      {payments.length > 1 && (
                        <button className="pos-pay-remove" onClick={() => removePay(i)}>✕</button>
                      )}
                    </div>
                  ))}
                  <button className="pos-add-pay" onClick={addPay}>+ Dividir pago</button>
                </div>

                {/* Cambio / Falta */}
                {cart.length > 0 && (
                  <div className="pos-change-box">
                    <div className="pos-change-row"><span>Pagado</span><span>{fmt(paid)}</span></div>
                    <div className={`pos-change-row ${change < 0 ? 'pos-falta' : 'pos-cambio'}`}>
                      <span>{change < 0 ? '⚠ Falta' : '✓ Cambio'}</span>
                      <span>{fmt(Math.abs(change))}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Botón cobrar */}
            <button
              className={`pos-cobrar-btn ${cart.length === 0 ? 'pos-cobrar-disabled' : ''}`}
              onClick={checkout}
              disabled={cart.length === 0}
            >
              {mode === 'sale'
                ? <>{cart.length === 0 ? 'COBRAR' : `COBRAR ${fmt(total)}`}</>
                : 'REGISTRAR PEDIDO'
              }
            </button>

            {cart.length > 0 && (
              <div className="pos-items-count">
                {cart.reduce((s, it) => s + n(it.quantity), 0)} ítem(s) en carrito
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Pedidos ── */}
      {tab === 'pedidos' && (
        <div className="vtab-content">
          <div className="section-header">
            <h2 className="section-title">Pedidos pendientes</h2>
          </div>
          {orders.length === 0
            ? <EmptyState icon="📦" text="No hay pedidos activos" />
            : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>N°</th><th>Total</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr></thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.id}>
                        <td><span className="row-id">{o.sale_no || 'FV-' + String(o.id).padStart(6, '0')}</span></td>
                        <td><strong>{formatMoney(o.total, o.currency)}</strong></td>
                        <td><StatusBadge status={o.status} /></td>
                        <td className="muted">{o.created_at?.slice(0, 16).replace('T', ' ')}</td>
                        <td>
                          <div className="action-btns">
                            {o.status !== 'delivered' && (
                              <Ib icon="deliver" tip="Entregar" variant="primary" onClick={() => deliver(o.id)} />
                            )}
                            <Ib icon="print" tip="Comprobante" variant="ghost" onClick={() => setReceiptId(o.id)} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}

      {tab === 'caja' && (
        <CajaTab
          branchId={branchId}
          cashSession={cashSession} setCashSession={setCashSession}
          cashSessions={cashSessions} setCashSessions={setCashSessions}
          notify={notify} fmt={fmt}
        />
      )}

      {tab === 'promos'   && <Promociones promos={promos} setPromos={setPromos} notify={notify} />}
      {tab === 'clientes' && <Clientes customers={customers} setCustomers={setCustomers} notify={notify} />}

      {/* ── Historial ── */}
      {tab === 'historial' && (
        <div className="vtab-content">
          <div className="section-header">
            <h2 className="section-title">Historial de ventas</h2>
          </div>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 150 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>Desde</label>
              <input type="date" value={histFilter.date_from}
                onChange={e => setHistFilter(f => ({ ...f, date_from: e.target.value }))}
                style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 150 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>Hasta</label>
              <input type="date" value={histFilter.date_to}
                onChange={e => setHistFilter(f => ({ ...f, date_to: e.target.value }))}
                style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 140 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>Cajero</label>
              <select value={histFilter.cashier_name}
                onChange={e => setHistFilter(f => ({ ...f, cashier_name: e.target.value }))}
                style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
                <option value="">Todos</option>
                {posProfiles.filter(p => p.role === 'cajero' || p.role === 'supervisor').map(p => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 140 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>Vendedor</label>
              <select value={histFilter.seller_name}
                onChange={e => setHistFilter(f => ({ ...f, seller_name: e.target.value }))}
                style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
                <option value="">Todos</option>
                {posProfiles.filter(p => p.role === 'vendedor' || p.role === 'supervisor').map(p => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <button className="form-submit-btn" style={{ padding: '8px 18px', fontSize: 13 }} onClick={applyHistFilter}>🔍 Filtrar</button>
              <button className="pos-new-cust-cancel" style={{ padding: '8px 14px', fontSize: 13 }} onClick={() => {
                setHistFilter({ date_from: '', date_to: '', cashier_name: '', seller_name: '' })
                api.listSales('sale').then(setSales).catch(() => {})
              }}>✕</button>
            </div>
          </div>
          {sales.length === 0
            ? <EmptyState icon="📋" text="No hay ventas registradas aún" />
            : (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <div className="table-wrap" style={{ borderRadius: 0, border: 'none' }}>
                  <table>
                    <thead><tr><th>N°</th><th>Cliente</th><th>Cajero</th><th>Vendedor</th><th>Total</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
                    <tbody>
                      {salesPag.paginated.map(s => (
                        <tr key={s.id}>
                          <td><span className="row-id">{s.sale_no || 'FV-' + String(s.id).padStart(6, '0')}</span></td>
                          <td className="muted">{s.customer_name || '—'}</td>
                          <td className="muted" style={{ fontSize: 12 }}>{s.cashier_name || '—'}</td>
                          <td className="muted" style={{ fontSize: 12 }}>{s.seller_name || '—'}</td>
                          <td><strong>{formatMoney(s.total, s.currency)}</strong></td>
                          <td><StatusBadge status={s.status} /></td>
                          <td className="muted">{s.created_at?.slice(0, 16).replace('T', ' ')}</td>
                          <td>
                            <Ib icon="print" tip="Ver / imprimir" variant="ghost" onClick={() => setReceiptId(s.id)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Paginator {...salesPag} label="ventas" />
              </div>
            )}
        </div>
      )}

      {tab === 'fiscal' && <FiscalConfig notify={notify} />}

      {receiptId && <Comprobante saleId={receiptId} onClose={() => setReceiptId(null)} />}
    </div>
  )
}

/* ── Helpers UI ── */
function EmptyState({ icon, text }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <p>{text}</p>
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    pending:   { label: 'Pendiente',  color: '#f59e0b', bg: '#fffbeb' },
    delivered: { label: 'Entregado',  color: '#059669', bg: '#ecfdf5' },
    paid:      { label: 'Pagado',     color: '#2563eb', bg: '#eff6ff' },
    cancelled: { label: 'Cancelado',  color: '#dc2626', bg: '#fef2f2' },
    completed: { label: 'Completado', color: '#059669', bg: '#ecfdf5' },
  }
  const s = map[status] || { label: status, color: 'var(--muted)', bg: 'var(--surface-2)' }
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 20,
      fontSize: 12, fontWeight: 600, background: s.bg, color: s.color,
    }}>{s.label}</span>
  )
}

/* ── Promociones ── */
function Promociones({ promos, setPromos, notify }) {
  const [f, setF] = useState({ name: '', type: 'percentage', value: '', scope: 'all', starts_at: '', ends_at: '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function save(e) {
    e.preventDefault()
    try {
      await api.createPromotion({ ...f, value: f.value ? Number(f.value) : null, starts_at: f.starts_at || null, ends_at: f.ends_at || null })
      notify('Promoción creada')
      setF({ name: '', type: 'percentage', value: '', scope: 'all', starts_at: '', ends_at: '' })
      setPromos(await api.listPromotions())
    } catch (err) { notify(err.message, 'error') }
  }

  async function toggle(id) {
    try { await api.togglePromotion(id); setPromos(await api.listPromotions()) }
    catch (e) { notify(e.message, 'error') }
  }

  return (
    <div className="vtab-content">
      <div className="section-header"><h2 className="section-title">Promociones</h2></div>
      <div className="two-col-layout">
        <form onSubmit={save} className="form-card">
          <h3 className="form-card-title">Nueva promoción</h3>
          <div className="form-field"><label>Nombre</label>
            <input placeholder="ej. Descuento 10%" value={f.name} onChange={set('name')} required />
          </div>
          <div className="form-row">
            <div className="form-field"><label>Tipo</label>
              <select value={f.type} onChange={set('type')}>
                <option value="percentage">% descuento</option>
                <option value="fixed">Monto fijo</option>
                <option value="2x1">2×1</option>
                <option value="bundle">Combo (manual)</option>
              </select>
            </div>
            <div className="form-field"><label>Valor</label>
              <input type="number" step="0.01" placeholder="0" value={f.value} onChange={set('value')}
                disabled={f.type === '2x1' || f.type === 'bundle'} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field"><label>Desde</label><input type="date" value={f.starts_at} onChange={set('starts_at')} /></div>
            <div className="form-field"><label>Hasta</label><input type="date" value={f.ends_at} onChange={set('ends_at')} /></div>
          </div>
          <button type="submit" className="form-submit-btn">Guardar promoción</button>
        </form>
        <div>
          {promos.length === 0 ? <EmptyState icon="🎁" text="Sin promociones aún" /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Nombre</th><th>Tipo</th><th>Valor</th><th>Vigencia</th><th>Activa</th><th></th></tr></thead>
                <tbody>
                  {promos.map(p => (
                    <tr key={p.id}>
                      <td><strong>{p.name}</strong></td>
                      <td><span className="badge">{p.type}</span></td>
                      <td>{p.value ?? '—'}</td>
                      <td className="muted" style={{ fontSize: 12 }}>
                        {(p.starts_at || '').slice(0, 10) || '—'} → {(p.ends_at || '').slice(0, 10) || '—'}
                      </td>
                      <td><ActiveBadge active={p.is_active} onClick={() => toggle(p.id)} /></td>
                      <td />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Clientes ── */
function Clientes({ customers, setCustomers, notify }) {
  const [f, setF] = useState({ name: '', tax_id: '', email: '', phone: '', address: '', identification: '', birthday: '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function save(e) {
    e.preventDefault()
    try {
      await api.createCustomer(f)
      notify('Cliente creado')
      setF({ name: '', tax_id: '', email: '', phone: '', address: '', identification: '', birthday: '' })
      setCustomers(await api.listCustomers())
    } catch (err) { notify(err.message, 'error') }
  }

  return (
    <div className="vtab-content">
      <div className="section-header"><h2 className="section-title">Clientes</h2></div>
      <div className="two-col-layout">
        <form onSubmit={save} className="form-card">
          <h3 className="form-card-title">Nuevo cliente</h3>
          <div className="form-field"><label>Nombre</label>
            <input placeholder="Nombre completo" value={f.name} onChange={set('name')} required />
          </div>
          <div className="form-row">
            <div className="form-field"><label>Identificación (CC/NIT/Pasaporte)</label>
              <input placeholder="Número de identificación" value={f.identification} onChange={set('identification')} />
            </div>
            <div className="form-field"><label>Identificación fiscal</label>
              <input placeholder="NIT / RFC / RUC" value={f.tax_id} onChange={set('tax_id')} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field"><label>Correo</label>
              <input type="email" placeholder="correo@ejemplo.com" value={f.email} onChange={set('email')} />
            </div>
            <div className="form-field"><label>Teléfono</label>
              <input placeholder="+57 300…" value={f.phone} onChange={set('phone')} />
            </div>
          </div>
          <div className="form-field"><label>Fecha de cumpleaños</label>
            <input placeholder="DD/MM o DD/MM/AAAA (año opcional)" value={f.birthday} onChange={set('birthday')} />
          </div>
          <div className="form-field"><label>Dirección</label>
            <input placeholder="Calle, ciudad" value={f.address} onChange={set('address')} />
          </div>
          <button type="submit" className="form-submit-btn">Guardar cliente</button>
        </form>
        <div>
          {customers.length === 0 ? <EmptyState icon="👤" text="Sin clientes registrados" /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>#</th><th>Nombre</th><th>Identificación</th><th>Fiscal</th><th>Cumpleaños</th><th>Teléfono</th></tr></thead>
                <tbody>
                  {customers.map(c => (
                    <tr key={c.id}>
                      <td><span className="row-id">#{c.id}</span></td>
                      <td><strong>{c.name}</strong></td>
                      <td className="muted">{c.identification || '—'}</td>
                      <td className="muted">{c.tax_id || '—'}</td>
                      <td className="muted">{c.birthday || '—'}</td>
                      <td className="muted">{c.phone || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Caja ── */
function CajaTab({ branchId, cashSession, setCashSession, cashSessions, setCashSessions, notify, fmt }) {
  const [openForm, setOpenForm] = useState({ opening_amount: '', profile_name: '', notes: '' })
  const [cutForm, setCutForm]   = useState({ cash_counted: '', notes: '' })
  const [closeForm, setCloseForm] = useState({ closing_amount: '', notes: '' })
  const [showCut, setShowCut]   = useState(false)
  const [showClose, setShowClose] = useState(false)
  const [expandedSession, setExpandedSession] = useState(null)
  const [sessionCuts, setSessionCuts] = useState([])

  async function openSession(e) {
    e.preventDefault()
    try {
      const res = await api.openCashSession({
        branch_id: branchId,
        opening_amount: Number(openForm.opening_amount) || 0,
        profile_name: openForm.profile_name || null,
        notes: openForm.notes || null,
      })
      notify('✓ Caja abierta')
      setCashSession(res)
      setOpenForm({ opening_amount: '', profile_name: '', notes: '' })
      setCashSessions(await api.listCashSessions(branchId))
    } catch (err) { notify(err.message, 'error') }
  }

  async function doCut(e) {
    e.preventDefault()
    try {
      const res = await api.cutCash({
        session_id: cashSession.session_id || cashSession.id,
        branch_id: branchId,
        cash_counted: cutForm.cash_counted ? Number(cutForm.cash_counted) : null,
        notes: cutForm.notes || null,
      })
      notify(`✓ Corte realizado · ${res.sales_count} venta(s) · ${fmt(res.sales_total)}`)
      setShowCut(false); setCutForm({ cash_counted: '', notes: '' })
      setCashSessions(await api.listCashSessions(branchId))
    } catch (err) { notify(err.message, 'error') }
  }

  async function doClose(e) {
    e.preventDefault()
    try {
      const res = await api.closeCashSession({
        session_id: cashSession.session_id || cashSession.id,
        branch_id: branchId,
        closing_amount: closeForm.closing_amount ? Number(closeForm.closing_amount) : null,
        notes: closeForm.notes || null,
      })
      notify(`✓ Caja cerrada · ${res.sales_count} venta(s) · ${fmt(res.sales_total)}`)
      setCashSession(null); setShowClose(false); setCloseForm({ closing_amount: '', notes: '' })
      setCashSessions(await api.listCashSessions(branchId))
    } catch (err) { notify(err.message, 'error') }
  }

  async function viewCuts(sessionId) {
    if (expandedSession === sessionId) { setExpandedSession(null); return }
    try {
      const cuts = await api.getSessionCuts(sessionId)
      setSessionCuts(cuts); setExpandedSession(sessionId)
    } catch (e) { notify(e.message, 'error') }
  }

  const inp = (style = {}) => ({ ...style, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, width: '100%' })

  return (
    <div className="vtab-content">
      <div className="section-header"><h2 className="section-title">💰 Control de Caja</h2></div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Estado actual */}
        <div style={{ flex: 1, minWidth: 280, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Estado de Caja</div>
          {cashSession ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
                <span style={{ color: '#16a34a', fontWeight: 700 }}>ABIERTA</span>
              </div>
              {cashSession.profile_name && <div className="muted" style={{ fontSize: 13 }}>Perfil: {cashSession.profile_name}</div>}
              <div className="muted" style={{ fontSize: 13 }}>Apertura: {fmt(cashSession.opening_amount || 0)}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Desde: {cashSession.opened_at ? String(cashSession.opened_at).slice(0, 16).replace('T', ' ') : ''}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="form-submit-btn" style={{ flex: 1 }} onClick={() => { setShowCut(!showCut); setShowClose(false) }}>
                  📊 Corte
                </button>
                <button className="form-submit-btn" style={{ flex: 1, background: '#dc2626' }}
                  onClick={() => { setShowClose(!showClose); setShowCut(false) }}>
                  🔒 Cierre
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#dc2626', display: 'inline-block' }} />
                <span style={{ color: '#dc2626', fontWeight: 700 }}>CERRADA</span>
              </div>
              <form onSubmit={openSession}>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Monto de apertura</label>
                  <input type="number" step="0.01" placeholder="0.00" value={openForm.opening_amount}
                    onChange={e => setOpenForm({ ...openForm, opening_amount: e.target.value })} style={inp()} />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Cajero / Perfil</label>
                  <input placeholder="Nombre del cajero" value={openForm.profile_name}
                    onChange={e => setOpenForm({ ...openForm, profile_name: e.target.value })} style={inp()} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Notas</label>
                  <input placeholder="Observaciones..." value={openForm.notes}
                    onChange={e => setOpenForm({ ...openForm, notes: e.target.value })} style={inp()} />
                </div>
                <button type="submit" className="form-submit-btn" style={{ width: '100%' }}>✓ Abrir Caja</button>
              </form>
            </div>
          )}
        </div>

        {/* Formulario corte */}
        {showCut && cashSession && (
          <div style={{ flex: 1, minWidth: 260, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>📊 Corte de Caja</div>
            <form onSubmit={doCut}>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#1d4ed8', display: 'block', marginBottom: 4 }}>Efectivo contado (opcional)</label>
                <input type="number" step="0.01" placeholder="Monto en caja" value={cutForm.cash_counted}
                  onChange={e => setCutForm({ ...cutForm, cash_counted: e.target.value })}
                  style={inp({ border: '1px solid #bfdbfe' })} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#1d4ed8', display: 'block', marginBottom: 4 }}>Notas</label>
                <input placeholder="Observaciones..." value={cutForm.notes}
                  onChange={e => setCutForm({ ...cutForm, notes: e.target.value })}
                  style={inp({ border: '1px solid #bfdbfe' })} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="form-submit-btn" style={{ flex: 1 }}>Registrar Corte</button>
                <button type="button" className="pos-new-cust-cancel" onClick={() => setShowCut(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        )}

        {/* Formulario cierre */}
        {showClose && cashSession && (
          <div style={{ flex: 1, minWidth: 260, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, color: '#dc2626' }}>🔒 Cierre de Caja</div>
            <form onSubmit={doClose}>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', display: 'block', marginBottom: 4 }}>Monto de cierre (efectivo en caja)</label>
                <input type="number" step="0.01" placeholder="0.00" value={closeForm.closing_amount}
                  onChange={e => setCloseForm({ ...closeForm, closing_amount: e.target.value })}
                  style={inp({ border: '1px solid #fecaca' })} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', display: 'block', marginBottom: 4 }}>Notas de cierre</label>
                <input placeholder="Observaciones del turno..." value={closeForm.notes}
                  onChange={e => setCloseForm({ ...closeForm, notes: e.target.value })}
                  style={inp({ border: '1px solid #fecaca' })} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="form-submit-btn" style={{ flex: 1, background: '#dc2626' }}>Cerrar Caja</button>
                <button type="button" className="pos-new-cust-cancel" onClick={() => setShowClose(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Historial de sesiones */}
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>📋 Historial de Sesiones</div>
      {cashSessions.length === 0
        ? <EmptyState icon="🏦" text="No hay sesiones de caja registradas" />
        : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div className="table-wrap" style={{ borderRadius: 0, border: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th>Apertura</th><th>Cajero / Perfil</th><th>Apertura $</th>
                    <th>Cierre $</th><th>Ventas</th><th>Estado</th><th>Cierre</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {cashSessions.map(s => (
                    <>
                      <tr key={s.id}>
                        <td className="muted" style={{ fontSize: 12 }}>{String(s.opened_at).slice(0, 16).replace('T', ' ')}</td>
                        <td>{s.profile_name || '—'}</td>
                        <td>{fmt(s.opening_amount || 0)}</td>
                        <td>{s.closing_amount != null ? fmt(s.closing_amount) : '—'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{s.cut_count} corte{s.cut_count !== 1 ? 's' : ''}</span>
                        </td>
                        <td>
                          <span style={{
                            padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                            background: s.status === 'open' ? '#dcfce7' : '#f1f5f9',
                            color: s.status === 'open' ? '#16a34a' : '#64748b',
                          }}>
                            {s.status === 'open' ? '● Abierta' : '✓ Cerrada'}
                          </span>
                        </td>
                        <td className="muted" style={{ fontSize: 12 }}>
                          {s.closed_at ? String(s.closed_at).slice(0, 16).replace('T', ' ') : '—'}
                        </td>
                        <td>
                          {Number(s.cut_count) > 0 && (
                            <button onClick={() => viewCuts(s.id)}
                              style={{ fontSize: 12, padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface-2)', cursor: 'pointer' }}>
                              {expandedSession === s.id ? '▲ Ocultar' : '▼ Cortes'}
                            </button>
                          )}
                        </td>
                      </tr>
                      {expandedSession === s.id && sessionCuts.map(c => (
                        <tr key={`cut-${c.id}`} style={{ background: 'var(--surface-2)', fontSize: 12 }}>
                          <td colSpan={2} style={{ paddingLeft: 28, color: 'var(--muted)' }}>
                            └ Corte · {String(c.created_at).slice(0, 16).replace('T', ' ')}
                          </td>
                          <td colSpan={2}>
                            {c.sales_count} ventas · {fmt(c.sales_total)}
                            {c.cash_counted != null && ` · Contado: ${fmt(c.cash_counted)}`}
                          </td>
                          <td colSpan={4} style={{ color: 'var(--muted)' }}>
                            {c.notes || ''}
                            {c.details && Object.entries(c.details).map(([k, v]) => (
                              <span key={k} style={{ marginLeft: 8, padding: '1px 6px', background: 'var(--surface)', borderRadius: 4, border: '1px solid var(--border)' }}>
                                {k}: {fmt(v)}
                              </span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
    </div>
  )
}


/* ── Config. fiscal ── */
function FiscalConfig({ notify }) {
  const [country, setCountry] = useState('')
  const [cfg, setCfg] = useState({})
  const set = (k) => (e) => setCfg({ ...cfg, [k]: e.target.value })

  useEffect(() => {
    api.fiscalConfig()
      .then(r => { setCountry((r.country || '').toUpperCase()); setCfg(r.fiscal_config || {}) })
      .catch(e => notify(e.message, 'error'))
  }, [])

  async function save(e) {
    e.preventDefault()
    try { await api.saveFiscalConfig(cfg); notify('Configuración fiscal guardada') }
    catch (err) { notify(err.message, 'error') }
  }

  const CO = country === 'CO', MX = country === 'MX'

  return (
    <div className="vtab-content">
      <div className="section-header">
        <h2 className="section-title">Configuración fiscal {country && <span className="badge" style={{ marginLeft: 8 }}>{country}</span>}</h2>
      </div>
      <form onSubmit={save} className="form-card" style={{ maxWidth: 540 }}>
        <p className="form-hint">Estos datos aparecen en el comprobante. El timbrado legal (DIAN/SAT) requiere conectar un PAC.</p>
        <div className="form-field"><label>Razón social</label>
          <input placeholder="Nombre legal de la empresa" value={cfg.razon_social || ''} onChange={set('razon_social')} />
        </div>
        <div className="form-field"><label>Dirección fiscal</label>
          <input placeholder="Dirección registrada" value={cfg.direccion || ''} onChange={set('direccion')} />
        </div>
        <div className="form-field"><label>Serie / prefijo</label>
          <input placeholder="ej. FE, A" value={cfg.serie || ''} onChange={set('serie')} />
        </div>
        {CO && (<>
          <div className="form-row">
            <div className="form-field"><label>NIT</label>
              <input placeholder="900.000.000-0" value={cfg.nit || ''} onChange={set('nit')} />
            </div>
            <div className="form-field"><label>Régimen</label>
              <input placeholder="Responsable de IVA" value={cfg.regimen || ''} onChange={set('regimen')} />
            </div>
          </div>
          <div className="form-field"><label>Resolución DIAN</label>
            <input placeholder="Número y vigencia" value={cfg.resolucion || ''} onChange={set('resolucion')} />
          </div>
        </>)}
        {MX && (<>
          <div className="form-row">
            <div className="form-field"><label>RFC</label>
              <input placeholder="XAXX010101000" value={cfg.rfc || ''} onChange={set('rfc')} />
            </div>
            <div className="form-field"><label>Régimen fiscal</label>
              <input placeholder="601" value={cfg.regimen_fiscal || ''} onChange={set('regimen_fiscal')} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field"><label>Uso CFDI</label>
              <input placeholder="G03" value={cfg.uso_cfdi || ''} onChange={set('uso_cfdi')} />
            </div>
            <div className="form-field"><label>Método de pago</label>
              <input placeholder="PUE / PPD" value={cfg.metodo_pago || ''} onChange={set('metodo_pago')} />
            </div>
          </div>
        </>)}
        {!CO && !MX && <p className="form-hint" style={{ color: 'var(--muted)' }}>País no es CO ni MX — se usará ticket simple.</p>}
        <button type="submit" className="form-submit-btn">Guardar configuración</button>
      </form>
    </div>
  )
}
