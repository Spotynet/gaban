import { useEffect, useState, useRef, useCallback } from 'react'
import JsBarcode from 'jsbarcode'
import { Paginator, usePaginator } from '../components/Paginator.jsx'
import { api } from '../api/client.js'
import { EmptyState, StatusBadge } from '../components/ui.jsx'
import { useNotify } from '../context/ToastContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { Ib, Ab } from '../components/IconBtn.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

/* ══════════════════════════════════════════════════════════════════════
   Helpers
══════════════════════════════════════════════════════════════════════ */
function generateVariants(d, colorGroups, sizeGroups, colors, sizes) {
  let varColors = []
  let varSizes = []

  if (d.var_mode === 'grupos') {
    const cg = colorGroups.find(g => g.id === Number(d.color_chart_id))
    const sg = sizeGroups.find(g => g.id === Number(d.size_chart_id))
    if (cg && cg.items) varColors = cg.items.map(i => ({ code: i.code || i.name, name: i.name, hex: i.hex }))
    if (sg && sg.items) varSizes  = sg.items.map(i => ({ code: i.code || i.name, name: i.name }))
  } else if (d.var_mode === 'catalogo') {
    varColors = colors.filter(c => d.sel_colors.includes(c.id)).map(c => ({ code: c.code, name: c.name, hex: c.hex }))
    varSizes  = sizes.filter(s => d.sel_sizes.includes(s.id)).map(s => ({ code: s.code, name: s.name }))
  }

  const base = { ean13: '', cost_price: 0, sale_price: 0 }

  if (varColors.length === 0 && varSizes.length === 0) {
    return [{ ...base, variant_sku: d.sku, size: null, color: null }]
  } else if (varColors.length > 0 && varSizes.length === 0) {
    return varColors.map(c => ({ ...base, variant_sku: `${d.sku}-${c.code}`, size: null, color: c.code }))
  } else if (varColors.length === 0 && varSizes.length > 0) {
    return varSizes.map(s => ({ ...base, variant_sku: `${d.sku}-${s.code}`, size: s.code, color: null }))
  } else {
    const result = []
    varColors.forEach(c => varSizes.forEach(s => {
      result.push({ ...base, variant_sku: `${d.sku}-${c.code}-${s.code}`, size: s.code, color: c.code })
    }))
    return result
  }
}

/* ══════════════════════════════════════════════════════════════════════
   Main page
══════════════════════════════════════════════════════════════════════ */
export default function Productos() {
  const { currency: tenantCurrency } = useAuth()

  const [types,       setTypes]       = useState([])
  const [cats,        setCats]        = useState([])
  const [brands,      setBrands]      = useState([])
  const [colors,      setColors]      = useState([])
  const [sizes,       setSizes]       = useState([])
  const [units,       setUnits]       = useState([])
  const [currencies,  setCurrencies]  = useState([])
  const [colorGroups, setColorGroups] = useState([])
  const [sizeGroups,  setSizeGroups]  = useState([])

  const [barcodeConfig, setBarcodeConfig] = useState({})

  const [products,    setProducts]    = useState([])
  const [showWizard,  setShowWizard]  = useState(false)
  const [showGrupos,  setShowGrupos]  = useState(false)
  const [editProduct, setEditProduct] = useState(null)
  const [viewProduct, setViewProduct] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [deleting,   setDeleting]   = useState(false)

  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType,   setFilterType]   = useState('')
  const [filterCat,    setFilterCat]    = useState('')
  const [filterBrand,  setFilterBrand]  = useState('')
  const [pageSize,     setPageSize]     = useState(25)
  const [page,         setPage]         = useState(1)

  const notify = useNotify()

  async function loadCatalogs() {
    const [typ, cat, bra, col, tal, uni, cur, cg, sg, cfg] = await Promise.allSettled([
      api.getTipos(), api.getCategorias(), api.getMarcas(),
      api.getColores(), api.getTallas(), api.getUnidades(),
      api.currencies(),
      api.getGruposColores(), api.getGruposTallas(),
      api.getConfig(),
    ])
    if (typ.status === 'fulfilled') setTypes(typ.value)
    if (cat.status === 'fulfilled') setCats(cat.value)
    if (bra.status === 'fulfilled') setBrands(bra.value)
    if (col.status === 'fulfilled') setColors(col.value)
    if (tal.status === 'fulfilled') setSizes(tal.value)
    if (uni.status === 'fulfilled') setUnits(uni.value)
    if (cur.status === 'fulfilled') setCurrencies(cur.value.map(c => c.code))
    if (cg.status  === 'fulfilled') setColorGroups(cg.value)
    if (sg.status  === 'fulfilled') setSizeGroups(sg.value)
    if (cfg.status === 'fulfilled') setBarcodeConfig((cfg.value?.config?.inventario?.barcode) || {})
  }

  async function refresh() {
    try { setProducts(await api.listProducts()) } catch (e) { notify(e.message, 'error') }
  }

  async function refreshGroups() {
    try {
      setColorGroups(await api.getGruposColores())
      setSizeGroups(await api.getGruposTallas())
    } catch (e) { notify(e.message, 'error') }
  }

  useEffect(() => { refresh(); loadCatalogs() }, [])

  async function doDeleteProduct() {
    if (!confirmDel) return
    setDeleting(true)
    try {
      await api.deleteProduct(confirmDel.id)
      notify(`Producto "${confirmDel.name}" eliminado`)
      setConfirmDel(null); refresh()
    } catch (err) { notify(err.message, 'error') }
    setDeleting(false)
  }

  const catLabel = (c) => c.parent_name && c.parent_name !== '—'
    ? `${c.parent_name} › ${c.name}`
    : c.name

  /* Filtering + pagination */
  const match = (p, { q, qt, qc, qb, qs }) => {
    const matchSearch = !q  || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
      || (p.product_code && p.product_code.toLowerCase().includes(q))
    const matchStatus = !qs || (qs === 'activo' || qs === 'activos' ? p.is_active : !p.is_active)
    const matchType   = !qt || (p.type_name     || '').toLowerCase().includes(qt)
    const matchCat    = !qc || (p.category_name || '').toLowerCase().includes(qc)
    const matchBrand  = !qb || (p.brand_name    || '').toLowerCase().includes(qb)
    return matchSearch && matchStatus && matchType && matchCat && matchBrand
  }
  const args = {
    q:  search.toLowerCase(),
    qt: filterType.toLowerCase(),
    qc: filterCat.toLowerCase(),
    qb: filterBrand.toLowerCase(),
    qs: filterStatus.toLowerCase(),
  }
  const filtered = products.filter(p => match(p, args))

  // Opciones de datalist: sólo valores que existen en el subconjunto sin ese filtro
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort()
  const dlSearch  = uniq(products.filter(p => match(p, { ...args, q:  '' })).map(p => p.name))
  const dlTypes   = uniq(products.filter(p => match(p, { ...args, qt: '' })).map(p => p.type_name))
  const dlCats    = uniq(products.filter(p => match(p, { ...args, qc: '' })).map(p => p.category_name))
  const dlBrands  = uniq(products.filter(p => match(p, { ...args, qb: '' })).map(p => p.brand_name))
  const dlStatus  = uniq(products.filter(p => match(p, { ...args, qs: '' })).map(p => p.is_active ? 'Activo' : 'Inactivo'))

  const hasFilters = search || filterStatus || filterType || filterCat || filterBrand
  function clearFilters() { setSearch(''); setFilterStatus(''); setFilterType(''); setFilterCat(''); setFilterBrand(''); setPage(1) }

  const fthSel = (active) => ({
    width: '100%', fontSize: 11, fontWeight: active ? 700 : 600,
    border: active ? '1.5px solid var(--brand)' : '1px solid var(--border)',
    borderRadius: 6, padding: '3px 6px',
    background: active ? 'var(--brand-soft, #eef2ff)' : 'var(--surface-2)',
    color: active ? 'var(--brand)' : 'var(--text)', cursor: 'pointer', outline: 'none',
  })
  const fthInput = (active) => ({
    width: '100%', fontSize: 11, fontWeight: active ? 700 : 400,
    border: active ? '1.5px solid var(--brand)' : '1px solid var(--border)',
    borderRadius: 6, padding: '3px 7px',
    background: active ? 'var(--brand-soft, #eef2ff)' : 'var(--surface-2)',
    color: active ? 'var(--brand)' : 'var(--text)', outline: 'none',
  })

  /* Export helpers */
  function exportCSV() {
    const cols = ['ID Sistema','Referencia','Nombre','Tipo','Categoría','Marca','Unidad','Variantes','Activo','Activo inventariable','Disponible venta','Modo precio','Moneda']
    const rows = filtered.map(p => [
      p.product_code || '', p.sku, p.name,
      p.type_name || '', p.category_name || '', p.brand_name || '', p.unit_code || '',
      p.variant_count ?? 0,
      p.is_active ? 'Sí' : 'No',
      p.is_asset ? 'Sí' : 'No',
      p.available_for_sale ? 'Sí' : 'No',
      p.price_mode || '', p.currency || '',
    ])
    const csv = [cols, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `productos_${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(a.href)
  }
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const pageItems  = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  const totalProducts  = products.length
  const activeProducts = products.filter(p => p.is_active).length
  const totalVariants  = products.reduce((s, p) => s + (p.variant_count ?? 0), 0)

  return (
    <div className="module-root">
      {/* ── Header ── */}
      <div className="module-header">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          <Ab icon="settings" label="Grupos de variables" variant="ghost" onClick={() => setShowGrupos(true)} />
          <Ab icon="add" label="Nuevo producto" variant="primary" onClick={() => setShowWizard(true)} />
          <Ab icon="download" label="Exportar CSV" variant="ghost" onClick={exportCSV} />
        </div>
      </div>

      {/* ── Tabla de productos ── */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div className="table-wrap" style={{ borderRadius: 0, border: 'none' }}>
        {products.length === 0 ? (
          <EmptyState icon="🏷️" text="Sin productos aún"
            sub='Haz clic en "Nuevo producto" para comenzar' />
        ) : filtered.length === 0 ? (
          <EmptyState icon="🔍" text="Sin resultados"
            sub="Intenta con otro término de búsqueda o cambia el filtro de estado" />
        ) : (
          <table>
              <thead>
                <tr>
                  <th style={{ width: 110 }}>ID Sistema</th>
                  <th style={{ width: 120 }}>Referencia</th>
                  <th style={{ padding: '4px 8px' }}>
                    <input list="dl-search" value={search}
                      onChange={e => { setSearch(e.target.value); setPage(1) }}
                      placeholder="🔍 Producto / ref / ID…"
                      style={fthInput(!!search)} />
                    <datalist id="dl-search">
                      {dlSearch.map(v => <option key={v} value={v} />)}
                    </datalist>
                  </th>
                  <th style={{ padding: '4px 8px', width: 120 }}>
                    <input list="dl-tipo" value={filterType}
                      onChange={e => { setFilterType(e.target.value); setPage(1) }}
                      placeholder="Tipo…" style={fthInput(!!filterType)} />
                    <datalist id="dl-tipo">
                      {dlTypes.map(v => <option key={v} value={v} />)}
                    </datalist>
                  </th>
                  <th style={{ padding: '4px 8px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <div style={{ flex: 1 }}>
                        <input list="dl-cat" value={filterCat}
                          onChange={e => { setFilterCat(e.target.value); setPage(1) }}
                          placeholder="Categoría…" style={{ ...fthInput(!!filterCat), width: '100%' }} />
                        <datalist id="dl-cat">
                          {dlCats.map(v => <option key={v} value={v} />)}
                        </datalist>
                      </div>
                      <div style={{ flex: 1 }}>
                        <input list="dl-brand" value={filterBrand}
                          onChange={e => { setFilterBrand(e.target.value); setPage(1) }}
                          placeholder="Marca…" style={{ ...fthInput(!!filterBrand), width: '100%' }} />
                        <datalist id="dl-brand">
                          {dlBrands.map(v => <option key={v} value={v} />)}
                        </datalist>
                      </div>
                    </div>
                  </th>
                  <th style={{ width: 60 }}>Ud.</th>
                  <th style={{ width: 110 }}>Variables</th>
                  <th style={{ width: 75, textAlign: 'center' }}>Variantes</th>
                  <th style={{ width: 75, textAlign: 'center' }}>Finanzas</th>
                  <th style={{ padding: '4px 8px', width: 100 }}>
                    <input list="dl-status" value={filterStatus}
                      onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
                      placeholder="Estado…" style={fthInput(!!filterStatus)} />
                    <datalist id="dl-status">
                      {dlStatus.map(v => <option key={v} value={v} />)}
                    </datalist>
                  </th>
                  <th style={{ width: 72 }}></th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map(p => (
                  <tr key={p.id}>
                    {/* ID Sistema */}
                    <td>
                      {p.product_code
                        ? <code style={{ fontSize: 11, fontWeight: 700, background: '#eff6ff', color: '#1d4ed8', padding: '3px 7px', borderRadius: 5, border: '1px solid #bfdbfe', letterSpacing: '.02em' }}>{p.product_code}</code>
                        : <span className="muted">—</span>}
                    </td>
                    <td>
                      <button onClick={() => setViewProduct(p)} style={{
                        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      }}>
                        <code style={{
                          fontSize: 11, fontWeight: 700,
                          background: 'var(--surface-2)', color: 'var(--brand)',
                          padding: '3px 7px', borderRadius: 5,
                          border: '1px solid var(--brand)', letterSpacing: '.02em',
                          textDecoration: 'underline', textDecorationStyle: 'dotted',
                        }}>{p.sku}</code>
                      </button>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                      {p.description && (
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1, lineHeight: 1.3 }}>
                          {p.description}
                        </div>
                      )}
                    </td>
                    <td>
                      {p.type_name
                        ? <span className="badge">{p.type_name}</span>
                        : <span className="muted">—</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {p.category_name && <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{p.category_name}</span>}
                        {p.brand_name    && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{p.brand_name}</span>}
                        {!p.category_name && !p.brand_name && <span className="muted">—</span>}
                      </div>
                    </td>
                    <td>
                      {p.unit_code
                        ? <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)' }}>{p.unit_code}</span>
                        : <span className="muted">—</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {p.color_chart_name && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--brand)', flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>{p.color_chart_name}</span>
                          </span>
                        )}
                        {p.size_chart_name && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 6, height: 6, borderRadius: 3, background: '#059669', flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>{p.size_chart_name}</span>
                          </span>
                        )}
                        {!p.color_chart_name && !p.size_chart_name && <span className="muted" style={{ fontSize: 11 }}>—</span>}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        minWidth: 28, height: 22, borderRadius: 11,
                        background: (p.variant_count ?? 0) > 0 ? 'var(--brand-soft)' : 'var(--surface-2)',
                        color: (p.variant_count ?? 0) > 0 ? 'var(--brand)' : 'var(--muted)',
                        fontSize: 12, fontWeight: 700,
                      }}>{p.variant_count ?? 0}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        {p.is_asset         && <span title="Activo inventariable" style={{ fontSize: 14 }}>🏭</span>}
                        {p.available_for_sale && <span title="Disponible para ventas" style={{ fontSize: 14 }}>🛒</span>}
                        {!p.is_asset && !p.available_for_sale && <span className="muted">—</span>}
                      </div>
                    </td>
                    <td><StatusBadge status={p.is_active ? 'active' : 'inactive'} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <Ib icon="edit"   tip="Editar producto"   variant="ghost"  onClick={() => setEditProduct(p)} />
                        <Ib icon="delete" tip="Eliminar producto" variant="danger" onClick={() => setConfirmDel(p)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        )}
      </div>
      {filtered.length > 0 && (
        <Paginator page={safePage} pageSize={pageSize} totalPages={totalPages} total={filtered.length}
          setPage={setPage} setPageSize={v => { setPageSize(v); setPage(1) }} label="productos" subset={products.length} />
      )}
      </div>

      {/* ── Modal de detalle ── */}
      {viewProduct && (
        <ProductDetailModal
          product={viewProduct}
          colors={colors}
          barcodeConfig={barcodeConfig}
          onClose={() => setViewProduct(null)}
          onEdit={p => { setViewProduct(null); setEditProduct(p) }}
          onDelete={p => { setViewProduct(null); setConfirmDel(p) }}
        />
      )}

      {/* ── Modal de edición ── */}
      {editProduct && (
        <EditProductModal
          product={editProduct}
          types={types} cats={cats} brands={brands} units={units} currencies={currencies}
          catLabel={catLabel}
          onClose={() => setEditProduct(null)}
          onSaved={() => { setEditProduct(null); refresh(); notify('Producto actualizado') }}
          notify={notify}
        />
      )}

      {/* ── Wizard de creación ── */}
      {showWizard && (
        <ProductWizard
          types={types} cats={cats} brands={brands} units={units}
          colors={colors} sizes={sizes} currencies={currencies}
          colorGroups={colorGroups} sizeGroups={sizeGroups}
          tenantCurrency={tenantCurrency}
          barcodeConfig={barcodeConfig}
          onClose={() => setShowWizard(false)}
          onSaved={() => { setShowWizard(false); refresh() }}
          notify={notify}
          catLabel={catLabel}
        />
      )}

      {/* ── Modal: Grupos de variables ── */}
      {showGrupos && (
        <GruposModal
          colors={colors} sizes={sizes}
          colorGroups={colorGroups} sizeGroups={sizeGroups}
          onClose={() => setShowGrupos(false)}
          onRefresh={refreshGroups}
          notify={notify}
        />
      )}

      <ConfirmDialog
        open={!!confirmDel}
        title={`Eliminar "${confirmDel?.name}"`}
        message="¿Seguro? Esta acción no se puede deshacer. El producto no puede tener ventas, compras ni movimientos de inventario registrados."
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleting}
        onConfirm={doDeleteProduct}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   ProductDetailModal — vista de detalle del producto
══════════════════════════════════════════════════════════════════════ */
function ProductDetailModal({ product: p, colors, barcodeConfig, onClose, onEdit, onDelete }) {
  const [variants,      setVariants]      = useState([])
  const [loading,       setLoading]       = useState(true)
  const [generating,    setGenerating]    = useState(false)
  const [savingRow,     setSavingRow]     = useState(null)
  const [editingRow,    setEditingRow]    = useState(null)  // variant id being edited inline
  const [editVal,       setEditVal]       = useState('')
  const [genToast,      setGenToast]      = useState(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    loadVariants()
  }, [p.sku])

  async function loadVariants() {
    setLoading(true)
    try {
      const all = await api.variants()
      setVariants(all.filter(v => v.product_sku === p.sku))
    } catch {}
    setLoading(false)
  }

  /* ── auto-generate barcodes for variants without one ── */
  async function generateAll() {
    const bc = barcodeConfig || {}
    const bcType = bc.default_type || 'ean13'
    const withoutCode = variants.filter(v => !v.ean13)
    if (!withoutCode.length) {
      setGenToast({ type: 'info', msg: 'Todas las variantes ya tienen código asignado' })
      return
    }
    setGenerating(true)

    let productSeq = 1
    if (bcType === 'ean13') {
      const prefix = (bc.ean13_country || '770') + (bc.ean13_company || '0001')
      try {
        const res = await api.nextBarcodeSeq(prefix)
        productSeq = res.seq
      } catch (_) { productSeq = Date.now() % 10000 }
    }

    let varSeq = 0
    const updates = variants.map((v) => {
      if (v.ean13) return { id: v.id, ean13: v.ean13 }
      varSeq++
      let code = ''
      if (bcType === 'ean13') {
        code = genStructuredEan13(bc, productSeq, varSeq)
      } else if (bcType === 'code128') {
        const base = bc.c128_source === 'product_sku'  ? p.sku
                   : bc.c128_source === 'product_code' ? (p.product_code || p.sku)
                   : v.variant_sku
        const suffix = bc.c128_source !== 'variant_sku' ? String(varSeq).padStart(2, '0') : ''
        code = genCode128(bc.c128_prefix, base + suffix)
      } else {
        code = v.variant_sku
      }
      return { id: v.id, ean13: code }
    })
    try {
      await api.updateVariantBarcodesBulk(p.id, updates)
      await loadVariants()
      setGenToast({ type: 'ok', msg: `${withoutCode.length} código${withoutCode.length !== 1 ? 's' : ''} generado${withoutCode.length !== 1 ? 's' : ''} correctamente` })
    } catch (e) {
      setGenToast({ type: 'error', msg: e.message })
    }
    setGenerating(false)
  }

  /* ── save single barcode inline edit ── */
  async function saveBarcode(v) {
    setSavingRow(v.id)
    try {
      await api.updateVariantBarcode(p.id, v.id, editVal.trim() || null)
      setVariants(prev => prev.map(x => x.id === v.id ? { ...x, ean13: editVal.trim() || null } : x))
      setEditingRow(null)
    } catch (e) {
      setGenToast({ type: 'error', msg: e.message })
    }
    setSavingRow(null)
  }

  const colorHex = code => colors.find(c => c.code === code)?.hex

  const Section = ({ title, children }) => (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
        {title}
      </div>
      {children}
    </div>
  )

  const Field = ({ label, value, mono }) => value != null && value !== '' && value !== false ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text)', fontFamily: mono ? 'monospace' : undefined, fontWeight: mono ? 700 : 500 }}>{value}</span>
    </div>
  ) : null

  const Badge = ({ label, color = 'var(--brand)', bg = 'var(--brand-soft)' }) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: bg, color }}>{label}</span>
  )

  const priceModeLabel = { fixed: 'Precio fijo', at_sale: 'Al momento de la venta', price_list: 'Lista de precios' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, width: 'min(820px, 95vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,.28)' }}>

        {/* ── Header ── */}
        <div style={{ padding: '20px 24px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface-2)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                {p.product_code && (
                  <code style={{ fontSize: 12, fontWeight: 800, background: '#eff6ff', color: '#1d4ed8', padding: '3px 9px', borderRadius: 6, border: '1px solid #bfdbfe', letterSpacing: '.03em' }}>
                    {p.product_code}
                  </code>
                )}
                <code style={{ fontSize: 12, fontWeight: 700, background: 'var(--surface)', color: 'var(--text-2)', padding: '3px 9px', borderRadius: 6, border: '1px solid var(--border)', letterSpacing: '.02em' }}>
                  {p.sku}
                </code>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                  background: p.is_active ? '#dcfce7' : '#fee2e2',
                  color: p.is_active ? '#15803d' : '#dc2626',
                }}>{p.is_active ? 'Activo' : 'Inactivo'}</span>
              </div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>{p.name}</h2>
              {p.description && (
                <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{p.description}</p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <Ab icon="edit"   label="Editar"   variant="ghost"  onClick={() => onEdit(p)} />
              <Ab icon="delete" label="Eliminar" variant="danger" onClick={() => onDelete(p)} />
              <Ib icon="close" tip="Cerrar" variant="ghost" onClick={onClose} />
            </div>
          </div>
        </div>

        {/* ── Cuerpo ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>

            {/* Columna izquierda */}
            <div>
              <Section title="Clasificación">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <Field label="Tipo de producto" value={p.type_name} />
                  <Field label="Unidad de medida" value={p.unit_name ? `${p.unit_name} (${p.unit_code})` : p.unit_code} />
                  <Field label="Categoría" value={p.category_name} />
                  <Field label="Marca" value={p.brand_name} />
                </div>
              </Section>

              <Section title="Variables y grupos">
                {p.color_chart_name || p.size_chart_name ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {p.color_chart_name && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--brand-soft)', borderRadius: 8, border: '1px solid var(--brand)' }}>
                        <span style={{ fontSize: 16 }}>🎨</span>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 700 }}>Grupo de colores</div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{p.color_chart_name}</div>
                        </div>
                      </div>
                    )}
                    {p.size_chart_name && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #86efac' }}>
                        <span style={{ fontSize: 16 }}>📏</span>
                        <div>
                          <div style={{ fontSize: 11, color: '#15803d', fontWeight: 700 }}>Grupo de tallas</div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{p.size_chart_name}</div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>Sin grupos de variables asignados</span>
                )}
              </Section>
            </div>

            {/* Columna derecha */}
            <div>
              <Section title="Configuración financiera">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Activo inventariable</span>
                    <Badge label={p.is_asset ? '✓ Sí' : '✕ No'} color={p.is_asset ? '#15803d' : '#dc2626'} bg={p.is_asset ? '#dcfce7' : '#fee2e2'} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Disponible para compras</span>
                    <Badge label={p.available_for_purchase ? '✓ Sí' : '✕ No'} color={p.available_for_purchase ? '#15803d' : '#dc2626'} bg={p.available_for_purchase ? '#dcfce7' : '#fee2e2'} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Disponible para ventas</span>
                    <Badge label={p.available_for_sale ? '✓ Sí' : '✕ No'} color={p.available_for_sale ? '#15803d' : '#dc2626'} bg={p.available_for_sale ? '#dcfce7' : '#fee2e2'} />
                  </div>
                  {p.available_for_sale && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
                      <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>Modo de precio</div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{priceModeLabel[p.price_mode] || p.price_mode}</div>
                      </div>
                      <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>Moneda</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)' }}>{p.currency}</div>
                      </div>
                    </div>
                  )}
                </div>
              </Section>
            </div>
          </div>

          {/* Variantes — ancho completo */}
          <Section title={`Variantes (${loading ? '…' : variants.length})`}>
            {genToast && (
              <div style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: genToast.type === 'ok' ? '#dcfce7' : genToast.type === 'info' ? '#eff6ff' : '#fee2e2',
                color:      genToast.type === 'ok' ? '#15803d' : genToast.type === 'info' ? '#1d4ed8' : '#dc2626',
                border: `1px solid ${genToast.type === 'ok' ? '#86efac' : genToast.type === 'info' ? '#bfdbfe' : '#fca5a5'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{genToast.msg}</span>
                <button type="button" onClick={() => setGenToast(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'inherit', padding: '0 0 0 12px' }}>✕</button>
              </div>
            )}
            {loading ? (
              <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>Cargando variantes…</div>
            ) : variants.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>Sin variantes registradas</div>
            ) : (
              <>
                {/* acción de generación masiva */}
                {(() => {
                  const bc = barcodeConfig || {}
                  const bcEnabled = !!bc.enabled && bc.module_products !== false
                  const withoutCode = variants.filter(v => !v.ean13)
                  const bcType = bc.default_type || 'ean13'
                  const typeLabel = { ean13: 'EAN-13', code128: 'Code 128', qr: 'QR' }
                  return bcEnabled && withoutCode.length > 0 ? (
                    <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: '#fef3c7', border: '1px solid #f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ fontSize: 12, color: '#92400e' }}>
                        <strong>{withoutCode.length}</strong> variante{withoutCode.length !== 1 ? 's' : ''} sin código de barras ({typeLabel[bcType]})
                      </span>
                      <button type="button" onClick={generateAll} disabled={generating}
                        style={{ padding: '5px 14px', borderRadius: 7, border: '1px solid #f59e0b', background: generating ? '#fde68a' : '#fbbf24', color: '#78350f', fontSize: 12, fontWeight: 700, cursor: generating ? 'wait' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {generating ? '⏳ Generando…' : `⚡ Generar ${withoutCode.length === variants.length ? 'todos' : 'faltantes'} automáticamente`}
                      </button>
                    </div>
                  ) : bcEnabled && withoutCode.length === 0 ? (
                    <div style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 8, background: '#dcfce7', border: '1px solid #86efac', fontSize: 12, color: '#15803d', fontWeight: 600 }}>
                      ✓ Todas las variantes tienen código de barras asignado
                    </div>
                  ) : null
                })()}
                <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 700, fontSize: 11, color: 'var(--muted)', borderBottom: '2px solid var(--border)' }}>SKU Variante</th>
                      <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 700, fontSize: 11, color: 'var(--muted)', borderBottom: '2px solid var(--border)' }}>Color</th>
                      <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 700, fontSize: 11, color: 'var(--muted)', borderBottom: '2px solid var(--border)' }}>Talla</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 700, fontSize: 11, color: 'var(--muted)', borderBottom: '2px solid var(--border)' }}>Costo</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 700, fontSize: 11, color: 'var(--muted)', borderBottom: '2px solid var(--border)' }}>Precio venta</th>
                      <th style={{ textAlign: 'center', padding: '6px 10px', fontWeight: 700, fontSize: 11, color: 'var(--muted)', borderBottom: '2px solid var(--border)' }}>Moneda</th>
                      <th style={{ padding: '6px 10px', fontWeight: 700, fontSize: 11, color: 'var(--muted)', borderBottom: '2px solid var(--border)', minWidth: 220 }}>Código de barras</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.map(v => {
                      const isEditing = editingRow === v.id
                      const isSaving  = savingRow  === v.id
                      return (
                        <tr key={v.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '7px 10px' }}>
                            <code style={{ fontSize: 11, background: 'var(--surface-2)', padding: '2px 7px', borderRadius: 4, border: '1px solid var(--border)' }}>{v.variant_sku}</code>
                          </td>
                          <td style={{ padding: '7px 10px' }}>
                            {v.color
                              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                  {colorHex(v.color) && <span style={{ width: 12, height: 12, borderRadius: 3, background: colorHex(v.color), border: '1px solid var(--border)', flexShrink: 0 }} />}
                                  <span style={{ fontWeight: 600 }}>{v.color}</span>
                                </span>
                              : <span style={{ color: 'var(--muted)' }}>—</span>}
                          </td>
                          <td style={{ padding: '7px 10px' }}>
                            {v.size
                              ? <span style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '1px 8px', fontWeight: 700, fontSize: 11 }}>{v.size}</span>
                              : <span style={{ color: 'var(--muted)' }}>—</span>}
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace' }}>
                            {Number(v.cost_price) > 0 ? Number(v.cost_price).toLocaleString() : <span style={{ color: 'var(--muted)' }}>—</span>}
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--brand)' }}>
                            {Number(v.sale_price) > 0 ? Number(v.sale_price).toLocaleString() : <span style={{ color: 'var(--muted)', fontWeight: 400 }}>—</span>}
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>{v.currency}</span>
                          </td>
                          <td style={{ padding: '6px 10px' }}>
                            {(() => {
                              const bc = barcodeConfig || {}
                              const bcType = bc.default_type || 'ean13'
                              return isEditing ? (
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                  <input
                                    autoFocus
                                    value={editVal}
                                    onChange={e => setEditVal(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') saveBarcode(v); if (e.key === 'Escape') setEditingRow(null) }}
                                    maxLength={48}
                                    style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, padding: '3px 7px', borderRadius: 5, border: '1px solid var(--brand)', outline: 'none', minWidth: 0 }}
                                  />
                                  <button type="button" disabled={isSaving} onClick={() => saveBarcode(v)}
                                    style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid var(--brand)', background: 'var(--brand)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                                    {isSaving ? '…' : '✓'}
                                  </button>
                                  <button type="button" onClick={() => setEditingRow(null)}
                                    style={{ padding: '3px 7px', borderRadius: 5, border: '1px solid var(--border)', background: 'none', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>✕</button>
                                </div>
                              ) : v.ean13 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', display: 'inline-block' }}>
                                    <BarcodePreview code={v.ean13} bcType={bcType} sku={v.variant_sku} />
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <code style={{ fontSize: 11, fontFamily: 'monospace', letterSpacing: '.04em', color: 'var(--muted)' }}>{v.ean13}</code>
                                    <button type="button" title="Editar código" onClick={() => { setEditingRow(v.id); setEditVal(v.ean13) }}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, fontSize: 11, flexShrink: 0 }}>✏️</button>
                                  </div>
                                </div>
                              ) : (
                                <button type="button" onClick={() => { setEditingRow(v.id); setEditVal('') }}
                                  style={{ fontSize: 11, color: 'var(--brand)', background: 'var(--brand-soft)', border: '1px dashed var(--brand)', borderRadius: 6, padding: '2px 10px', cursor: 'pointer', fontWeight: 600 }}>
                                  + Asignar
                                </button>
                              )
                            })()}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </Section>
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {variants.length} variante{variants.length !== 1 ? 's' : ''} registrada{variants.length !== 1 ? 's' : ''}
          </span>
          <Ab icon="close" label="Cerrar" variant="ghost" onClick={onClose} />
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   EditProductModal — modal de edición de producto
══════════════════════════════════════════════════════════════════════ */
function EditProductModal({ product, types, cats, brands, units, currencies, catLabel, onClose, onSaved, notify }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const [form, setForm] = useState({
    sku:                    product.sku || '',
    name:                   product.name || '',
    description:            product.description || '',
    product_type_id:        String(product.product_type_id || ''),
    category_id:            String(product.category_id || ''),
    brand_id:               String(product.brand_id || ''),
    unit_id:                String(product.unit_id || ''),
    is_asset:               product.is_asset ?? true,
    available_for_purchase: product.available_for_purchase ?? true,
    available_for_sale:     product.available_for_sale ?? true,
    price_mode:             product.price_mode || 'fixed',
    currency:               product.currency || 'USD',
    is_active:              product.is_active ?? true,
  })
  const [saving, setSaving] = useState(false)
  const setF = k => v => setForm(f => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.updateProduct(product.id, {
        ...form,
        product_type_id: Number(form.product_type_id),
        category_id:     form.category_id  ? Number(form.category_id)  : null,
        brand_id:        form.brand_id     ? Number(form.brand_id)     : null,
        unit_id:         form.unit_id      ? Number(form.unit_id)      : null,
      })
      onSaved()
    } catch (err) { notify(err.message, 'error') }
    setSaving(false)
  }

  const YNToggle = ({ label, desc, value, onChange }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{desc}</div>}
      </div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {[true, false].map(v => (
          <button key={String(v)} type="button" onClick={() => onChange(v)} style={{
            padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            border: `1px solid ${value === v ? 'var(--brand)' : 'var(--border)'}`,
            background: value === v ? 'var(--brand)' : 'var(--surface)',
            color: value === v ? '#fff' : 'var(--text-2)',
          }}>{v ? 'Sí' : 'No'}</button>
        ))}
      </div>
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, width: 'min(780px, 94vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,.25)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Editar producto</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted)' }}>
              {product.product_code && <><code style={{ fontSize: 11, background: '#eff6ff', color: '#1d4ed8', padding: '1px 6px', borderRadius: 4, border: '1px solid #bfdbfe' }}>{product.product_code}</code> · </>}
              ID Sistema
            </p>
          </div>
          <Ib icon="close" tip="Cerrar" variant="ghost" onClick={onClose} />
        </div>

        {/* Body */}
        <form id="edit-product-form" onSubmit={submit} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div className="form-field" style={{ margin: 0 }}>
              <label>REFERENCIA *</label>
              <input value={form.sku} onChange={e => setF('sku')(e.target.value.toUpperCase())} required
                placeholder="Ej. CAL-001" style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: '.04em' }} />
            </div>
            <div className="form-field" style={{ margin: 0 }}>
              <label>Nombre del producto *</label>
              <input value={form.name} onChange={e => setF('name')(e.target.value)} required />
            </div>
            <div className="form-field" style={{ margin: 0 }}>
              <label>Tipo de producto *</label>
              <select value={form.product_type_id} onChange={e => setF('product_type_id')(e.target.value)} required>
                <option value="">— seleccionar —</option>
                {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="form-field" style={{ margin: 0 }}>
              <label>Categoría</label>
              <select value={form.category_id} onChange={e => setF('category_id')(e.target.value)}>
                <option value="">— sin categoría —</option>
                {cats.map(c => <option key={c.id} value={c.id}>{catLabel(c)}</option>)}
              </select>
            </div>
            <div className="form-field" style={{ margin: 0 }}>
              <label>Marca</label>
              <select value={form.brand_id} onChange={e => setF('brand_id')(e.target.value)}>
                <option value="">— sin marca —</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="form-field" style={{ margin: 0 }}>
              <label>Unidad de medida</label>
              <select value={form.unit_id} onChange={e => setF('unit_id')(e.target.value)}>
                <option value="">— seleccionar —</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.name} ({u.code})</option>)}
              </select>
            </div>
            <div className="form-field" style={{ margin: 0, gridColumn: '1 / -1' }}>
              <label>Descripción</label>
              <textarea value={form.description} onChange={e => setF('description')(e.target.value)}
                rows={2} placeholder="Descripción opcional" style={{ resize: 'vertical' }} />
            </div>
          </div>

          {/* Configuración financiera */}
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 10 }}>Configuración financiera</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            <YNToggle label="¿Es un activo inventariable?" desc="Disponible en órdenes de compra"
              value={form.is_asset} onChange={setF('is_asset')} />
            {form.is_asset && (
              <YNToggle label="¿Disponible para órdenes de compra?"
                value={form.available_for_purchase} onChange={setF('available_for_purchase')} />
            )}
            <YNToggle label="¿Disponible para ventas?" desc="Aparece en el módulo de ventas"
              value={form.available_for_sale} onChange={setF('available_for_sale')} />
            {form.available_for_sale && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div className="form-field" style={{ margin: 0 }}>
                  <label>Modo de precio</label>
                  <select value={form.price_mode} onChange={e => setF('price_mode')(e.target.value)}>
                    <option value="fixed">Precio fijo</option>
                    <option value="at_sale">Al momento de la venta</option>
                    <option value="price_list">Lista de precios</option>
                  </select>
                </div>
                <div className="form-field" style={{ margin: 0 }}>
                  <label>Moneda</label>
                  <select value={form.currency} onChange={e => setF('currency')(e.target.value)}>
                    {(currencies.length ? currencies : ['COP','MXN','USD']).map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Estado */}
          <YNToggle label="¿Producto activo?" desc="Los productos inactivos no aparecen en ventas ni compras"
            value={form.is_active} onChange={setF('is_active')} />
        </form>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 24px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <Ab icon="close" label="Cancelar" variant="ghost" onClick={onClose} />
          <Ab icon={saving ? 'refresh' : 'check'} label={saving ? 'Guardando…' : 'Guardar cambios'}
            variant="primary" type="submit" form="edit-product-form" disabled={saving} />
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   ProductWizard — overlay de 5 pasos
══════════════════════════════════════════════════════════════════════ */
const STEPS = [
  { id: 1, label: 'General' },
  { id: 2, label: 'Variables' },
  { id: 3, label: 'Financiero' },
  { id: 4, label: 'Variantes' },
  { id: 5, label: 'Cód. barras' },
]

/* helpers de generación de códigos de barras */
function calcEan13Check(digits12) {
  const d = String(digits12).padStart(12, '0').split('').map(Number)
  const sum = d.reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 1 : 3), 0)
  return (10 - (sum % 10)) % 10
}

function genEan13(prefix, seq) {
  const p = String(prefix || '200').replace(/\D/g, '').slice(0, 9)
  const body = (p + String(seq).padStart(12 - p.length, '0')).slice(0, 12)
  return body + calcEan13Check(body)
}

// Generación EAN-13 con estructura internacional GS1
function genStructuredEan13(bc, productSeq, variantSeq) {
  const country = (bc.ean13_country || '770').replace(/\D/g, '').slice(0, 3).padEnd(3, '0')
  const company = (bc.ean13_company || '0001').replace(/\D/g, '').padStart(4, '0').slice(0, 4)
  const varDig  = bc.ean13_variant_digits || 2
  const prodDig = 12 - country.length - company.length - varDig
  const prodPart = String(productSeq).padStart(prodDig, '0').slice(-prodDig)
  const varPart  = String(variantSeq).padStart(varDig, '0').slice(-varDig)
  const body = (country + company + prodPart + varPart).slice(0, 12)
  return body + calcEan13Check(body)
}

function genCode128(prefix, source) {
  return prefix ? `${prefix}${source}` : source
}

function BarcodePreview({ code, bcType, sku }) {
  const svgRef = useRef(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!svgRef.current || !code) return
    setError(false)
    try {
      const format = bcType === 'ean13' ? 'EAN13'
                   : bcType === 'code128' ? 'CODE128'
                   : 'CODE128'
      JsBarcode(svgRef.current, code, {
        format,
        width: 1.5,
        height: 48,
        displayValue: true,
        fontSize: 10,
        margin: 6,
        background: '#ffffff',
        lineColor: '#111111',
      })
    } catch (_) {
      setError(true)
    }
  }, [code, bcType])

  if (!code) return <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
  if (error)  return <span style={{ fontSize: 11, color: '#dc2626' }}>código inválido</span>
  return (
    <div style={{ display: 'inline-block', textAlign: 'center' }}>
      {sku && <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#555', marginBottom: 2, letterSpacing: '.03em' }}>{sku}</div>}
      <svg ref={svgRef} style={{ display: 'block', maxWidth: '100%' }} />
    </div>
  )
}

function ProductWizard({ types, cats, brands, units, colors, sizes, currencies,
                         colorGroups, sizeGroups, tenantCurrency, barcodeConfig,
                         onClose, onSaved, notify, catLabel }) {
  const defaultCurrency = tenantCurrency || (currencies.length ? currencies[0] : 'USD')

  const emptyD = () => ({
    sku: '', name: '', description: '',
    product_type_id: '', category_id: '', brand_id: '', unit_id: '',
    var_mode: 'none',
    color_chart_id: null, size_chart_id: null,
    sel_colors: [], sel_sizes: [],
    is_asset: true, available_for_purchase: true, available_for_sale: true,
    price_mode: 'fixed',
    currency: defaultCurrency,
    variants: [],
  })

  const [step,    setStep]    = useState(1)
  const [d,       setD]       = useState(emptyD)
  const [saving,  setSaving]  = useState(false)
  const [regenWarning, setRegenWarning] = useState(false)
  const bodyRef = useRef(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const set = (k, v) => setD(prev => ({ ...prev, [k]: v }))

  function step1Valid() {
    return d.sku.trim() && d.name.trim() && d.product_type_id && d.category_id && d.brand_id && d.unit_id
  }

  async function assignBarcodes(variants) {
    const bc = barcodeConfig || {}
    if (!bc.enabled || bc.module_products === false) return variants
    if (bc.ean_auto === false) return variants   // manual mode: user enters codes
    const bcType = bc.default_type || 'ean13'

    let productSeq = 1
    if (bcType === 'ean13') {
      const prefix = (bc.ean13_country || '770') + (bc.ean13_company || '0001')
      try {
        const res = await api.nextBarcodeSeq(prefix)
        productSeq = res.seq
      } catch (_) { productSeq = Date.now() % 10000 }
    }

    let varSeq = 0
    return variants.map(v => {
      if (v.ean13) return v
      varSeq++
      let code = ''
      if (bcType === 'ean13') {
        code = genStructuredEan13(bc, productSeq, varSeq)
      } else if (bcType === 'code128') {
        const base = bc.c128_source === 'product_sku'  ? d.sku
                   : bc.c128_source === 'product_code' ? (d.product_code || d.sku)
                   : v.variant_sku
        const suffix = bc.c128_source !== 'variant_sku' ? String(varSeq).padStart(2, '0') : ''
        code = genCode128(bc.c128_prefix, base + suffix)
      } else {
        code = v.variant_sku
      }
      return { ...v, ean13: code }
    })
  }

  async function goNext() {
    if (step === 3) {
      const vars = generateVariants(d, colorGroups, sizeGroups, colors, sizes)
      setD(prev => ({ ...prev, variants: vars }))
    }
    if (step === 4) {
      const withCodes = await assignBarcodes(d.variants)
      setD(prev => ({ ...prev, variants: withCodes }))
    }
    setStep(s => s + 1)
    if (bodyRef.current) bodyRef.current.scrollTop = 0
  }

  function goPrev() {
    setStep(s => s - 1)
    if (bodyRef.current) bodyRef.current.scrollTop = 0
  }

  function regenVariants() {
    const vars = generateVariants(d, colorGroups, sizeGroups, colors, sizes)
    setD(prev => ({ ...prev, variants: vars }))
    setRegenWarning(false)
  }

  const setVariant = (i, k, v) =>
    setD(prev => ({ ...prev, variants: prev.variants.map((x, j) => j === i ? { ...x, [k]: v } : x) }))
  const addVariant = () =>
    setD(prev => ({ ...prev, variants: [...prev.variants, { variant_sku: '', ean13: '', size: null, color: null, cost_price: 0, sale_price: 0 }] }))
  const rmVariant = (i) =>
    setD(prev => ({ ...prev, variants: prev.variants.filter((_, j) => j !== i) }))

  async function save() {
    setSaving(true)
    try {
      // Crear producto SIN barcodes para evitar conflictos de unicidad
      const payload = {
        sku:                   d.sku.trim(),
        name:                  d.name.trim(),
        description:           d.description || null,
        product_type_id:       Number(d.product_type_id),
        category_id:           d.category_id ? Number(d.category_id) : null,
        brand_id:              d.brand_id     ? Number(d.brand_id)    : null,
        unit_id:               d.unit_id      ? Number(d.unit_id)     : null,
        color_chart_id:        d.var_mode === 'grupos' && d.color_chart_id ? Number(d.color_chart_id) : null,
        size_chart_id:         d.var_mode === 'grupos' && d.size_chart_id  ? Number(d.size_chart_id)  : null,
        is_asset:              d.is_asset,
        available_for_purchase: d.available_for_purchase,
        available_for_sale:    d.available_for_sale,
        price_mode:            d.price_mode,
        currency:              d.currency,
        variants: d.variants.map((v, i) => ({
          variant_sku: (v.variant_sku || `${d.sku.trim()}-V${i + 1}`).slice(0, 70),
          ean13:       null,   // siempre null en creación; se asigna por separado
          size:        v.size  || null,
          color:       v.color || null,
          cost_price:  Number(v.cost_price) || 0,
          sale_price:  Number(v.sale_price) || 0,
          currency:    d.currency,
        })),
      }
      const res = await api.createProduct(payload)

      // Asignar barcodes en un paso separado, usando los IDs reales de variantes
      const variantCodes = d.variants.filter(v => v.ean13)
      if (variantCodes.length > 0 && res.variant_ids?.length > 0) {
        // Mapear SKU → ID (el backend devuelve variant_ids:[{variant_sku, id}])
        const skuToId = Object.fromEntries((res.variant_ids || []).map(x => [x.variant_sku, x.id]))
        const barcodeUpdates = variantCodes
          .map(v => ({ id: skuToId[v.variant_sku], ean13: v.ean13 }))
          .filter(x => x.id)
        if (barcodeUpdates.length > 0) {
          try {
            await api.updateVariantBarcodesBulk(res.id, barcodeUpdates)
          } catch (_) {
            // Barcodes duplicados no bloquean la creación; el usuario puede asignarlos manualmente
          }
        }
      }

      notify(`Producto ${res.sku} creado con ${res.variants} variante(s)`)
      onSaved()
    } catch (err) { notify(err.message, 'error') }
    setSaving(false)
  }

  /* ─ colors/sizes helpers ─ */
  const colorHex = (code) => colors.find(c => c.code === code)?.hex

  const activeColorGroup = colorGroups.find(g => g.id === Number(d.color_chart_id))
  const activeSizeGroup  = sizeGroups.find(g => g.id === Number(d.size_chart_id))

  /* ─ Toggle Yes/No helper ─ */
  function YesNo({ value, onChange }) {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        {[true, false].map(v => (
          <button key={String(v)} type="button" onClick={() => onChange(v)} style={{
            padding: '8px 24px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
            border: `2px solid ${value === v ? 'var(--brand)' : 'var(--border)'}`,
            background: value === v ? 'var(--brand)' : 'var(--surface)',
            color: value === v ? '#fff' : 'var(--text-2)',
            transition: 'all .12s',
          }}>{v ? 'Sí' : 'No'}</button>
        ))}
      </div>
    )
  }

  /* ─ Choice card helper ─ */
  function ChoiceCard({ id, icon, title, desc, selected, onClick }) {
    return (
      <button type="button" onClick={onClick} style={{
        flex: 1, padding: '20px 16px', borderRadius: 12, cursor: 'pointer', textAlign: 'center',
        border: `2px solid ${selected ? 'var(--brand)' : 'var(--border)'}`,
        background: selected ? 'var(--brand-soft)' : 'var(--surface)',
        transition: 'all .12s',
      }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>{icon}</div>
        <div style={{ fontWeight: 700, fontSize: 14, color: selected ? 'var(--brand)' : 'var(--text)', marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 12, color: selected ? 'var(--brand)' : 'var(--muted)', lineHeight: 1.4 }}>{desc}</div>
        {selected && (
          <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 20, height: 20, borderRadius: 10, background: 'var(--brand)', color: '#fff', fontSize: 11, fontWeight: 900 }}>✓</div>
        )}
      </button>
    )
  }

  /* ─ Section card helper ─ */
  function SectionCard({ title, desc, children }) {
    return (
      <div style={{ marginBottom: 20, padding: '20px 22px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{title}</div>
          {desc && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{desc}</div>}
        </div>
        {children}
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        width: 'min(960px, 94vw)', height: '92vh',
        background: 'var(--surface)', borderRadius: 16,
        boxShadow: '0 24px 80px rgba(0,0,0,.3)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* ── Barra superior con stepper ── */}
        <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)', padding: '18px 28px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-.3px' }}>Nuevo producto</h3>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                Completa los {STEPS.length} pasos para crear el producto en el sistema
              </p>
            </div>
            <Ib icon="close" tip="Cerrar" variant="ghost" onClick={onClose} />
          </div>

          {/* Step indicators */}
          <div style={{ display: 'flex', gap: 0 }}>
            {STEPS.map((s, idx) => {
              const done    = step > s.id
              const active  = step === s.id
              const isLast  = idx === STEPS.length - 1
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: isLast ? 'none' : 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 14, cursor: done ? 'pointer' : 'default' }}
                    onClick={() => done && setStep(s.id)}>
                    {/* Circle */}
                    <div style={{
                      width: 28, height: 28, borderRadius: 14, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: done ? 13 : 12, fontWeight: 800,
                      background: done ? 'var(--brand)' : active ? 'var(--brand)' : 'var(--surface-2)',
                      color: done || active ? '#fff' : 'var(--muted)',
                      border: `2px solid ${done || active ? 'var(--brand)' : 'var(--border)'}`,
                      transition: 'all .2s',
                    }}>
                      {done ? '✓' : s.id}
                    </div>
                    <div>
                      <div style={{
                        fontSize: 12, fontWeight: active ? 700 : 500,
                        color: active ? 'var(--brand)' : done ? 'var(--text-2)' : 'var(--muted)',
                        lineHeight: 1.2, whiteSpace: 'nowrap',
                      }}>{s.label}</div>
                    </div>
                  </div>
                  {/* connector line */}
                  {!isLast && (
                    <div style={{
                      flex: 1, height: 2, marginBottom: 14, marginLeft: 8, marginRight: 12,
                      background: done ? 'var(--brand)' : 'var(--border)',
                      transition: 'background .2s',
                    }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Cuerpo del step ── */}
        <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto', padding: '28px' }}>

          {/* ── PASO 1: General ── */}
          {step === 1 && (
            <div>
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800 }}>Información general del producto</h4>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Complete los campos básicos para identificar el producto en el sistema.</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-field" style={{ margin: 0 }}>
                  <label>REFERENCIA *</label>
                  <input value={d.sku} onChange={e => set('sku', e.target.value)}
                    placeholder="Ej. CAL-001" autoFocus required />
                </div>
                <div className="form-field" style={{ margin: 0 }}>
                  <label>NOMBRE DEL PRODUCTO *</label>
                  <input value={d.name} onChange={e => set('name', e.target.value)}
                    placeholder="Ej. Tenis Clásico" required />
                </div>
                <div className="form-field" style={{ margin: 0 }}>
                  <label>TIPO DE PRODUCTO *</label>
                  <select value={d.product_type_id} onChange={e => set('product_type_id', e.target.value)} required>
                    <option value="">— seleccionar —</option>
                    {types.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}{t.has_sizes ? ' 📏' : ''}{t.has_expiry ? ' ⏱' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field" style={{ margin: 0 }}>
                  <label>CATEGORÍA *</label>
                  <select value={d.category_id} onChange={e => set('category_id', e.target.value)} required>
                    <option value="">— seleccionar —</option>
                    {cats.map(c => <option key={c.id} value={c.id}>{catLabel(c)}</option>)}
                  </select>
                </div>
                <div className="form-field" style={{ margin: 0 }}>
                  <label>MARCA *</label>
                  <select value={d.brand_id} onChange={e => set('brand_id', e.target.value)} required>
                    <option value="">— seleccionar —</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div className="form-field" style={{ margin: 0 }}>
                  <label>UNIDAD DE MEDIDA *</label>
                  <select value={d.unit_id} onChange={e => set('unit_id', e.target.value)} required>
                    <option value="">— seleccionar —</option>
                    {units.map(u => <option key={u.id} value={u.id}>{u.name} ({u.code})</option>)}
                  </select>
                </div>
                <div className="form-field" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label>DESCRIPCIÓN</label>
                  <textarea value={d.description} onChange={e => set('description', e.target.value)}
                    placeholder="Descripción opcional del producto"
                    rows={3} style={{ resize: 'vertical', minHeight: 72 }} />
                </div>
              </div>
            </div>
          )}

          {/* ── PASO 2: Variables ── */}
          {step === 2 && (
            <div>
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800 }}>Configuración de variables</h4>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Define si el producto maneja variables como colores o tallas.</p>
              </div>

              <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
                <ChoiceCard id="none" icon="📦" title="Sin variables"
                  desc="Producto simple, sin variantes por color o talla"
                  selected={d.var_mode === 'none'} onClick={() => set('var_mode', 'none')} />
                <ChoiceCard id="grupos" icon="🎨" title="Grupos de variables"
                  desc="Usa grupos preconfigurados de colores y tallas"
                  selected={d.var_mode === 'grupos'} onClick={() => set('var_mode', 'grupos')} />
                <ChoiceCard id="catalogo" icon="🔧" title="Selección del catálogo"
                  desc="Elige colores y tallas individualmente"
                  selected={d.var_mode === 'catalogo'} onClick={() => set('var_mode', 'catalogo')} />
              </div>

              {/* Grupos de variables */}
              {d.var_mode === 'grupos' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  {/* Grupo de colores */}
                  <div style={{ padding: '18px 18px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: 'var(--text)' }}>🎨 Grupo de colores</div>
                    <select value={d.color_chart_id || ''} onChange={e => set('color_chart_id', e.target.value || null)}
                      style={{ width: '100%', marginBottom: 12 }}>
                      <option value="">— sin grupo de colores —</option>
                      {colorGroups.filter(g => g.is_active).map(g => (
                        <option key={g.id} value={g.id}>{g.name} ({g.items?.length ?? 0} colores)</option>
                      ))}
                    </select>
                    {activeColorGroup && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {activeColorGroup.items.map((item, i) => (
                          <span key={i} title={item.name} style={{
                            width: 22, height: 22, borderRadius: 5, flexShrink: 0,
                            background: item.hex || '#ccc', border: '1.5px solid var(--border)',
                          }} />
                        ))}
                        {activeColorGroup.items.length === 0 && (
                          <span style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Sin colores en este grupo</span>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Grupo de tallas */}
                  <div style={{ padding: '18px 18px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: 'var(--text)' }}>📏 Grupo de tallas</div>
                    <select value={d.size_chart_id || ''} onChange={e => set('size_chart_id', e.target.value || null)}
                      style={{ width: '100%', marginBottom: 12 }}>
                      <option value="">— sin grupo de tallas —</option>
                      {sizeGroups.filter(g => g.is_active).map(g => (
                        <option key={g.id} value={g.id}>{g.name} ({g.items?.length ?? 0} tallas)</option>
                      ))}
                    </select>
                    {activeSizeGroup && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {activeSizeGroup.items.map((item, i) => (
                          <span key={i} style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 6,
                            background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)',
                          }}>{item.name}</span>
                        ))}
                        {activeSizeGroup.items.length === 0 && (
                          <span style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Sin tallas en este grupo</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Selección individual del catálogo */}
              {d.var_mode === 'catalogo' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  {/* Colores */}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      🎨 Colores
                      {d.sel_colors.length > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 10, background: 'var(--brand)', color: '#fff' }}>
                          {d.sel_colors.length} seleccionado{d.sel_colors.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {colors.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                        No hay colores configurados. Ve a Configuración → Productos → Colores.
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 8 }}>
                        {colors.map(c => {
                          const sel = d.sel_colors.includes(c.id)
                          return (
                            <button key={c.id} type="button" onClick={() => set('sel_colors', sel ? d.sel_colors.filter(x => x !== c.id) : [...d.sel_colors, c.id])}
                              style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                                padding: '10px 6px 8px', borderRadius: 10, cursor: 'pointer',
                                border: `2px solid ${sel ? 'var(--brand)' : 'var(--border)'}`,
                                background: sel ? 'var(--brand-soft)' : 'var(--surface)',
                                transition: 'all .12s', position: 'relative',
                              }}>
                              <span style={{ width: 32, height: 32, borderRadius: 8, background: c.hex || '#ccc', border: '1.5px solid rgba(0,0,0,.1)' }} />
                              <span style={{ fontSize: 10, fontWeight: sel ? 700 : 500, textAlign: 'center', color: sel ? 'var(--brand)' : 'var(--text-2)', lineHeight: 1.2, wordBreak: 'break-word' }}>{c.name}</span>
                              {sel && (
                                <span style={{ position: 'absolute', top: 4, right: 4, width: 14, height: 14, borderRadius: 7, background: 'var(--brand)', color: '#fff', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>✓</span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  {/* Tallas */}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      📏 Tallas
                      {d.sel_sizes.length > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 10, background: '#059669', color: '#fff' }}>
                          {d.sel_sizes.length} seleccionada{d.sel_sizes.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {sizes.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                        No hay tallas configuradas. Ve a Configuración → Productos → Tallas.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {sizes.map(s => {
                          const sel = d.sel_sizes.includes(s.id)
                          return (
                            <button key={s.id} type="button" onClick={() => set('sel_sizes', sel ? d.sel_sizes.filter(x => x !== s.id) : [...d.sel_sizes, s.id])}
                              style={{
                                padding: '8px 18px', borderRadius: 8, cursor: 'pointer',
                                border: `2px solid ${sel ? 'var(--brand)' : 'var(--border)'}`,
                                background: sel ? 'var(--brand)' : 'var(--surface)',
                                color: sel ? '#fff' : 'var(--text)',
                                fontWeight: 700, fontSize: 13, transition: 'all .12s',
                                minWidth: 48, textAlign: 'center',
                              }}>{s.name}</button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PASO 3: Financiero ── */}
          {step === 3 && (
            <div>
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800 }}>Configuración financiera</h4>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Define el comportamiento del producto en compras y ventas.</p>
              </div>

              <SectionCard title="¿Es un activo inventariable?" desc="Si es activo, el producto aparecerá disponible en las órdenes de compra.">
                <YesNo value={d.is_asset} onChange={v => setD(prev => ({ ...prev, is_asset: v, available_for_purchase: v ? prev.available_for_purchase : false }))} />
              </SectionCard>

              {d.is_asset && (
                <SectionCard title="¿Disponible para órdenes de compra?" desc="El producto podrá ser seleccionado en el módulo de compras cuando esté disponible.">
                  <YesNo value={d.available_for_purchase} onChange={v => set('available_for_purchase', v)} />
                </SectionCard>
              )}

              <SectionCard title="¿Disponible para ventas?" desc="El producto aparecerá como opción en el módulo de ventas.">
                <YesNo value={d.available_for_sale} onChange={v => set('available_for_sale', v)} />
              </SectionCard>

              {d.available_for_sale && (
                <SectionCard title="¿Cómo se maneja el precio de venta?">
                  <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                    {[
                      { id: 'fixed',      label: 'Precio fijo',              icon: '💲', desc: 'Cada variante tiene un precio fijo predefinido' },
                      { id: 'at_sale',    label: 'Al momento de la venta',  icon: '⚡', desc: 'El precio se asigna directamente en la venta' },
                      { id: 'price_list', label: 'Lista de precios',         icon: '📋', desc: 'El precio proviene de una lista de precios configurada' },
                    ].map(opt => (
                      <button key={opt.id} type="button" onClick={() => set('price_mode', opt.id)} style={{
                        flex: 1, padding: '14px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                        border: `2px solid ${d.price_mode === opt.id ? 'var(--brand)' : 'var(--border)'}`,
                        background: d.price_mode === opt.id ? 'var(--brand-soft)' : 'var(--surface)',
                        transition: 'all .12s',
                      }}>
                        <div style={{ fontSize: 22, marginBottom: 8 }}>{opt.icon}</div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: d.price_mode === opt.id ? 'var(--brand)' : 'var(--text)', marginBottom: 4 }}>{opt.label}</div>
                        <div style={{ fontSize: 11, color: d.price_mode === opt.id ? 'var(--brand)' : 'var(--muted)', lineHeight: 1.4 }}>{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                  <div className="form-field" style={{ margin: 0, maxWidth: 200 }}>
                    <label>Moneda del producto</label>
                    <select value={d.currency} onChange={e => set('currency', e.target.value)}>
                      {(currencies.length ? currencies : ['COP', 'MXN', 'USD']).map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </SectionCard>
              )}
            </div>
          )}

          {/* ── PASO 4: Variantes ── */}
          {step === 4 && (
            <div>
              <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <h4 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800 }}>Variantes del producto</h4>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
                    {d.variants.length} variante{d.variants.length !== 1 ? 's' : ''} generada{d.variants.length !== 1 ? 's' : ''} automáticamente según las variables configuradas.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {regenWarning ? (
                    <>
                      <Ab icon="close" label="Cancelar" variant="ghost" onClick={() => setRegenWarning(false)} />
                      <Ab icon="refresh" label="Confirmar regeneración" variant="danger" onClick={regenVariants} />
                    </>
                  ) : (
                    <Ab icon="refresh" label="Regenerar variantes" variant="ghost" onClick={() => setRegenWarning(true)} />
                  )}
                </div>
              </div>
              {regenWarning && (
                <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: '#fef3c7', border: '1px solid #f59e0b', fontSize: 12, color: '#92400e' }}>
                  ⚠️ Esto reemplazará todas las variantes actuales (incluidas las que hayas editado manualmente). ¿Confirmar?
                </div>
              )}

              <div className="table-wrap" style={{ marginBottom: 16 }}>
                <table className="cart-table">
                  <thead>
                    <tr>
                      <th>SKU variante *</th>
                      <th style={{ width: 120 }}>Color</th>
                      <th style={{ width: 100 }}>Talla</th>
                      <th style={{ width: 110 }}>Costo</th>
                      {d.price_mode === 'fixed' && <th style={{ width: 110 }}>Precio venta</th>}
                      <th style={{ width: 36 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.variants.map((v, i) => (
                      <tr key={i}>
                        <td>
                          <input className="cart-input" value={v.variant_sku}
                            onChange={e => setVariant(i, 'variant_sku', e.target.value)}
                            required style={{ minWidth: 140 }} />
                        </td>
                        <td>
                          {v.color ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              {colorHex(v.color) && (
                                <span style={{ width: 12, height: 12, borderRadius: 3, background: colorHex(v.color), border: '1px solid var(--border)', flexShrink: 0 }} />
                              )}
                              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{v.color}</span>
                            </span>
                          ) : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}
                        </td>
                        <td>
                          {v.size
                            ? <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>{v.size}</span>
                            : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}
                        </td>
                        <td>
                          <input className="cart-input" type="number" step="0.01" min="0"
                            value={v.cost_price} onChange={e => setVariant(i, 'cost_price', e.target.value)}
                            style={{ width: 90 }} />
                        </td>
                        {d.price_mode === 'fixed' && (
                          <td>
                            <input className="cart-input" type="number" step="0.01" min="0"
                              value={v.sale_price} onChange={e => setVariant(i, 'sale_price', e.target.value)}
                              style={{ width: 90 }} />
                          </td>
                        )}
                        <td>
                          {d.variants.length > 1 && (
                            <Ib icon="delete" tip="Quitar variante" variant="danger" onClick={() => rmVariant(i)} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Ab icon="add" label="Agregar variante" variant="ghost" onClick={addVariant} />
            </div>
          )}

          {/* ── PASO 5: Código de barras ── */}
          {step === 5 && (() => {
            const bc = barcodeConfig || {}
            const bcEnabled = !!bc.enabled && bc.module_products !== false
            const bcType = bc.default_type || 'ean13'
            const typeLabel = { ean13: 'EAN-13', code128: 'Code 128', qr: 'QR Code' }
            const typeColor  = { ean13: '#1d4ed8', code128: '#7c3aed', qr: '#15803d' }
            const typeBg     = { ean13: '#eff6ff',  code128: '#f5f3ff', qr: '#f0fdf4' }
            const typeBorder = { ean13: '#bfdbfe',  code128: '#ddd6fe', qr: '#86efac' }
            const typeIcon   = { ean13: '🌐', code128: '🏭', qr: '📱' }
            const withCode   = d.variants.filter(v => v.ean13)
            const withoutCode = d.variants.filter(v => !v.ean13)

            return (
              <div>
                {!bcEnabled ? (
                  /* ── módulo desactivado ── */
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320, textAlign: 'center', gap: 16 }}>
                    <div style={{ fontSize: 56, opacity: .3 }}>🔖</div>
                    <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--text)' }}>Códigos de barras no activados</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 400, lineHeight: 1.6 }}>
                      Ve a <strong>Configuración → Inventario</strong> y activa la gestión de
                      códigos de barras para usar esta funcionalidad.
                    </div>
                    <div style={{ padding: '12px 20px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)', maxWidth: 360 }}>
                      El producto se guardará sin códigos de barras.
                      Podrás asignarlos después desde el detalle del producto.
                    </div>
                  </div>
                ) : d.variants.length === 0 ? (
                  /* ── sin variantes ── */
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320, textAlign: 'center', gap: 16 }}>
                    <div style={{ fontSize: 56, opacity: .3 }}>📦</div>
                    <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--text)' }}>Sin variantes</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 400, lineHeight: 1.6 }}>
                      Regresa al paso 4 para agregar variantes antes de asignar códigos de barras.
                    </div>
                  </div>
                ) : (
                  /* ── códigos asignados ── */
                  <div>
                    {/* cabecera */}
                    <div style={{ marginBottom: 18 }}>
                      <h4 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800 }}>Códigos de barras</h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                          background: typeBg[bcType], color: typeColor[bcType], border: `1px solid ${typeBorder[bcType]}` }}>
                          {typeIcon[bcType]} {typeLabel[bcType]}
                        </span>
                        {withCode.length === d.variants.length ? (
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#15803d' }}>
                            ✓ {withCode.length} código{withCode.length !== 1 ? 's' : ''} generado{withCode.length !== 1 ? 's' : ''} automáticamente
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: '#92400e' }}>
                            {withCode.length} de {d.variants.length} con código
                          </span>
                        )}
                      </div>
                    </div>

                    {/* info del tipo */}
                    <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8,
                      background: typeBg[bcType], border: `1px solid ${typeBorder[bcType]}`, fontSize: 12, color: typeColor[bcType] }}>
                      {bcType === 'ean13' && <>🌐 <strong>EAN-13 GS1</strong> · País <code style={{ background: typeBorder.ean13, padding: '1px 5px', borderRadius: 3 }}>{bc.ean13_country || '770'}</code> · Empresa <code style={{ background: typeBorder.ean13, padding: '1px 5px', borderRadius: 3 }}>{bc.ean13_company || '0001'}</code> · Dígito verificador calculado automáticamente</>}
                      {bcType === 'code128' && <>🏭 <strong>Code 128</strong> · Fuente: <strong>{bc.c128_source === 'product_sku' ? 'referencia del producto' : 'SKU variante'}</strong>{bc.c128_prefix ? <> · Prefijo <code style={{ background: typeBorder.code128, padding: '1px 5px', borderRadius: 3 }}>{bc.c128_prefix}</code></> : null}</>}
                      {bcType === 'qr' && <>📱 <strong>QR Code</strong> · Generado a partir del SKU de cada variante</>}
                    </div>

                    {/* tabla */}
                    <div className="table-wrap" style={{ marginBottom: 14 }}>
                      <table className="cart-table">
                        <thead>
                          <tr>
                            <th>SKU variante</th>
                            {d.variants.some(v => v.color) && <th style={{ width: 80 }}>Color</th>}
                            {d.variants.some(v => v.size)  && <th style={{ width: 70 }}>Talla</th>}
                            <th style={{ minWidth: 160 }}>Código</th>
                            <th style={{ minWidth: 200 }}>Vista previa</th>
                            <th style={{ width: 30 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.variants.map((v, i) => (
                            <tr key={i}>
                              <td><code style={{ fontSize: 11, background: 'var(--surface-2)', padding: '2px 7px', borderRadius: 4, border: '1px solid var(--border)' }}>{v.variant_sku}</code></td>
                              {d.variants.some(x => x.color) && <td style={{ fontSize: 12 }}>{v.color || <span style={{ color: 'var(--muted)' }}>—</span>}</td>}
                              {d.variants.some(x => x.size)  && <td style={{ fontSize: 12 }}>{v.size  || <span style={{ color: 'var(--muted)' }}>—</span>}</td>}
                              <td>
                                <input className="cart-input"
                                  value={v.ean13 || ''}
                                  onChange={e => setVariant(i, 'ean13', e.target.value)}
                                  placeholder={bcType === 'ean13' ? '0000000000000' : 'código...'}
                                  maxLength={bcType === 'ean13' ? 13 : 48}
                                  style={{ fontFamily: 'monospace', fontSize: 12, letterSpacing: '.05em', width: '100%' }}
                                />
                              </td>
                              <td style={{ padding: '4px 8px', background: '#fff' }}>
                                <BarcodePreview code={v.ean13} bcType={bcType} sku={v.variant_sku} />
                              </td>
                              <td>
                                {v.ean13 && (
                                  <button type="button" title="Limpiar" onClick={() => setVariant(i, 'ean13', '')}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, padding: 4 }}>✕</button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* aviso si quedan sin código */}
                    {withoutCode.length > 0 && (
                      <div style={{ padding: '8px 14px', borderRadius: 8, background: '#fef3c7', border: '1px solid #f59e0b', fontSize: 12, color: '#92400e' }}>
                        ⚠️ {withoutCode.length} variante{withoutCode.length !== 1 ? 's' : ''} sin código. Puedes editarlos en la tabla o asignarlos después desde el detalle del producto.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {/* ── Footer fijo ── */}
        <div style={{
          flexShrink: 0, padding: '14px 28px', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--surface)',
        }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Paso {step} de {STEPS.length}</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <Ab icon="close" label="Anterior" variant="ghost"
              disabled={step === 1} onClick={goPrev} />
            {step < STEPS.length ? (
              <Ab icon="check" label="Siguiente →" variant="primary"
                disabled={step === 1 && !step1Valid()}
                onClick={goNext} />
            ) : (
              <Ab icon={saving ? 'refresh' : 'check'}
                label={saving ? 'Creando…' : 'Crear producto'}
                variant="primary"
                disabled={saving}
                onClick={save} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   GruposModal — diseño de dos paneles: lista izquierda · formulario derecho
══════════════════════════════════════════════════════════════════════ */
function GruposModal({ colors, sizes, colorGroups, sizeGroups, onClose, onRefresh, notify }) {
  const [tab, setTab] = useState('colores')

  const tabs = [
    { id: 'colores', icon: '🎨', label: 'Colores', groups: colorGroups,
      catalog: colors, catalogId: c => c.id, catalogLabel: c => c.name, catalogHex: c => c.hex,
      apiCreate: d => api.createGrupoColores(d),
      apiUpdate: (id, d) => api.updateGrupoColores(id, d),
      apiDelete: id => api.deleteGrupoColores(id) },
    { id: 'tallas', icon: '📏', label: 'Tallas', groups: sizeGroups,
      catalog: sizes, catalogId: s => s.id, catalogLabel: s => s.name, catalogHex: () => null,
      apiCreate: d => api.createGrupoTallas(d),
      apiUpdate: (id, d) => api.updateGrupoTallas(id, d),
      apiDelete: id => api.deleteGrupoTallas(id) },
  ]
  const active = tabs.find(t => t.id === tab)

  return (
    <div className="modal-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--surface)', borderRadius: 16,
        boxShadow: '0 24px 64px rgba(0,0,0,.22)',
        width: '100%', maxWidth: 860,
        maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: '-.3px' }}>Grupos de variables</h3>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--muted)' }}>Agrupa colores y tallas para asignarlos a productos</p>
          </div>
          <Ib icon="close" tip="Cerrar" variant="ghost" onClick={onClose} />
        </div>
        <div style={{ display: 'flex', padding: '0 24px', borderBottom: '1px solid var(--border)', flexShrink: 0, gap: 2 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '11px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? 'var(--brand)' : 'var(--muted)',
              borderBottom: `2px solid ${tab === t.id ? 'var(--brand)' : 'transparent'}`,
              marginBottom: -1, transition: 'color .15s',
            }}>
              <span>{t.icon}</span>{t.label}
              <span style={{
                fontSize: 10, fontWeight: 700, minWidth: 18, height: 18,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9,
                background: tab === t.id ? 'var(--brand)' : 'var(--surface-2)',
                color: tab === t.id ? '#fff' : 'var(--muted)',
              }}>{t.groups.length}</span>
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          <GrupoEditor
            key={tab} kind={active.id} kindLabel={active.label}
            groups={active.groups} catalog={active.catalog}
            catalogId={active.catalogId} catalogLabel={active.catalogLabel} catalogHex={active.catalogHex}
            onRefresh={onRefresh} notify={notify}
            apiCreate={active.apiCreate} apiUpdate={active.apiUpdate} apiDelete={active.apiDelete}
          />
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
   GrupoEditor — panel izquierdo (lista) + panel derecho (formulario)
────────────────────────────────────────────────────────────────── */
function GrupoEditor({ kind, kindLabel, groups, catalog, catalogId, catalogLabel, catalogHex, onRefresh, notify, apiCreate, apiUpdate, apiDelete }) {
  const emptyForm = () => ({ name: '', description: '', is_active: true, item_ids: [] })
  const [form,       setForm]       = useState(emptyForm)
  const [editId,     setEditId]     = useState(null)
  const [panelOpen,  setPanelOpen]  = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [deleting,   setDeleting]   = useState(false)

  function openCreate() { setForm(emptyForm()); setEditId(null); setPanelOpen(true) }
  function openEdit(g) {
    setForm({
      name: g.name, description: g.description || '', is_active: g.is_active,
      item_ids: g.items.map(i => kind === 'colores' ? i.color_id : i.size_id),
    })
    setEditId(g.id); setPanelOpen(true)
  }
  function closePanel() { setPanelOpen(false); setEditId(null); setForm(emptyForm()) }

  function toggleItem(id) {
    setForm(f => ({
      ...f,
      item_ids: f.item_ids.includes(id) ? f.item_ids.filter(x => x !== id) : [...f.item_ids, id],
    }))
  }

  async function save(e) {
    e.preventDefault()
    if (!form.name.trim()) return notify('El nombre es requerido', 'error')
    if (form.item_ids.length === 0) return notify(`Selecciona al menos ${kind === 'colores' ? 'un color' : 'una talla'}`, 'error')
    setSaving(true)
    try {
      editId ? await apiUpdate(editId, form) : await apiCreate(form)
      notify(editId ? 'Grupo actualizado' : 'Grupo creado')
      closePanel(); onRefresh()
    } catch (err) { notify(err.message, 'error') }
    setSaving(false)
  }

  async function doDelete() {
    setDeleting(true)
    try {
      await apiDelete(confirmDel.id)
      notify(`Grupo "${confirmDel.name}" eliminado`)
      if (editId === confirmDel.id) closePanel()
      setConfirmDel(null); onRefresh()
    } catch (err) { notify(err.message, 'error') }
    setDeleting(false)
  }

  const selCount = form.item_ids.length

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Panel izquierdo */}
      <div style={{
        width: panelOpen ? 260 : '100%', flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        borderRight: panelOpen ? '1px solid var(--border)' : 'none',
        overflow: 'hidden', transition: 'width .2s ease',
      }}>
        <div style={{
          padding: '14px 16px 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>
            {groups.length} grupo{groups.length !== 1 ? 's' : ''}
          </span>
          <Ab icon="add" label="Nuevo grupo" variant="primary" onClick={openCreate} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {groups.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '52px 24px', textAlign: 'center', color: 'var(--muted)' }}>
              <span style={{ fontSize: 36, marginBottom: 12, opacity: .5 }}>{kind === 'colores' ? '🎨' : '📏'}</span>
              <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-2)', marginBottom: 4 }}>Sin grupos aún</span>
              <span style={{ fontSize: 12 }}>Crea un grupo para organizar {kind === 'colores' ? 'colores' : 'tallas'} y asignarlo a productos</span>
            </div>
          ) : groups.map(g => (
            <div key={g.id} onClick={() => openEdit(g)} style={{
              padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
              background: editId === g.id ? 'var(--brand-soft)' : 'transparent',
              border: `1px solid ${editId === g.id ? 'var(--brand)' : 'transparent'}`,
              marginBottom: 4, transition: 'all .12s', opacity: g.is_active ? 1 : .55,
            }}
              onMouseEnter={e => { if (editId !== g.id) e.currentTarget.style.background = 'var(--surface-2)' }}
              onMouseLeave={e => { if (editId !== g.id) e.currentTarget.style.background = 'transparent' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: editId === g.id ? 'var(--brand)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                {!g.is_active && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 6, background: 'var(--surface-2)', color: 'var(--muted)', flexShrink: 0 }}>INACTIVO</span>}
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <Ib icon="edit"   tip="Editar"   variant="ghost"  onClick={() => openEdit(g)} />
                  <Ib icon="delete" tip="Eliminar" variant="danger" onClick={() => setConfirmDel(g)} />
                </div>
              </div>
              {g.description && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, lineHeight: 1.35, paddingRight: 4 }}>{g.description}</div>
              )}
              {kind === 'colores' ? (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {g.items.slice(0, 12).map((item, i) => (
                    <span key={i} title={item.name} style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, background: item.hex || 'var(--surface-2)', border: '1.5px solid var(--border)' }} />
                  ))}
                  {g.items.length > 12 && <span style={{ fontSize: 10, color: 'var(--muted)', alignSelf: 'center' }}>+{g.items.length - 12}</span>}
                  {g.items.length === 0 && <span style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>Sin colores</span>}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {g.items.slice(0, 8).map((item, i) => (
                    <span key={i} style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>{item.name}</span>
                  ))}
                  {g.items.length > 8 && <span style={{ fontSize: 10, color: 'var(--muted)', alignSelf: 'center' }}>+{g.items.length - 8}</span>}
                  {g.items.length === 0 && <span style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>Sin tallas</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Panel derecho: formulario */}
      {panelOpen && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
              {editId ? 'Editando grupo' : `Nuevo grupo de ${kindLabel.toLowerCase()}`}
            </span>
            <Ib icon="close" tip="Cerrar panel" variant="ghost" onClick={closePanel} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            <form onSubmit={save} id="grupo-form">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div className="form-field" style={{ margin: 0 }}>
                  <label>Nombre *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder={kind === 'colores' ? 'Ej. Colección Verano' : 'Ej. Tallas Mujer'} required autoFocus />
                </div>
                <div className="form-field" style={{ margin: 0 }}>
                  <label>Descripción</label>
                  <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Opcional" />
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
                    {kind === 'colores' ? 'Selecciona los colores' : 'Selecciona las tallas'}
                  </span>
                  {selCount > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: 'var(--brand)', color: '#fff' }}>
                      {selCount} seleccionado{selCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {catalog.length === 0 ? (
                  <div style={{ padding: '24px', borderRadius: 10, textAlign: 'center', background: 'var(--surface-2)', border: '1px dashed var(--border)', color: 'var(--muted)', fontSize: 13 }}>
                    No hay {kind} configurados. Ve a <strong>Configuración → Productos</strong> para agregarlos.
                  </div>
                ) : kind === 'colores' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 8 }}>
                    {catalog.map(item => {
                      const id  = catalogId(item)
                      const sel = form.item_ids.includes(id)
                      const hex = catalogHex(item)
                      return (
                        <button key={id} type="button" onClick={() => toggleItem(id)} style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                          padding: '10px 6px 8px', borderRadius: 10, cursor: 'pointer',
                          border: `2px solid ${sel ? 'var(--brand)' : 'var(--border)'}`,
                          background: sel ? 'var(--brand-soft)' : 'var(--surface)',
                          transition: 'all .12s', position: 'relative',
                        }}>
                          <span style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0, background: hex || '#e2e8f0', border: '1.5px solid rgba(0,0,0,.1)', boxShadow: sel ? '0 0 0 3px var(--brand-glow)' : 'none' }} />
                          <span style={{ fontSize: 10, fontWeight: sel ? 700 : 500, textAlign: 'center', color: sel ? 'var(--brand)' : 'var(--text-2)', lineHeight: 1.2, wordBreak: 'break-word' }}>{catalogLabel(item)}</span>
                          {sel && (
                            <span style={{ position: 'absolute', top: 4, right: 4, width: 14, height: 14, borderRadius: 7, background: 'var(--brand)', color: '#fff', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, lineHeight: 1 }}>✓</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {catalog.map(item => {
                      const id  = catalogId(item)
                      const sel = form.item_ids.includes(id)
                      return (
                        <button key={id} type="button" onClick={() => toggleItem(id)} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '7px 16px', borderRadius: 8, cursor: 'pointer',
                          border: `2px solid ${sel ? 'var(--brand)' : 'var(--border)'}`,
                          background: sel ? 'var(--brand)' : 'var(--surface)',
                          color: sel ? '#fff' : 'var(--text)',
                          fontWeight: 700, fontSize: 13, transition: 'all .12s', minWidth: 48, justifyContent: 'center',
                        }}>{catalogLabel(item)}</button>
                      )
                    })}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', marginBottom: 4 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Grupo activo</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>Visible al crear o editar productos</div>
                </div>
                <label style={{ position: 'relative', width: 40, height: 22, cursor: 'pointer', flexShrink: 0 }}>
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
                  <span style={{ position: 'absolute', inset: 0, borderRadius: 11, background: form.is_active ? 'var(--brand)' : 'var(--border)', transition: 'background .2s' }} />
                  <span style={{ position: 'absolute', top: 3, left: form.is_active ? 21 : 3, width: 16, height: 16, borderRadius: 8, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.2)', transition: 'left .2s' }} />
                </label>
              </div>
            </form>
          </div>
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexShrink: 0, background: 'var(--surface)' }}>
            <Ab icon="close" label="Cancelar" variant="ghost" onClick={closePanel} />
            <Ab icon={saving ? 'refresh' : 'check'} label={saving ? 'Guardando…' : editId ? 'Guardar cambios' : 'Crear grupo'} variant="primary" type="submit" form="grupo-form" disabled={saving} />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDel}
        title={`Eliminar "${confirmDel?.name}"`}
        message={`¿Seguro que quieres eliminar este grupo de ${kind}? Los productos que lo tenían asignado quedarán sin grupo.`}
        confirmLabel="Eliminar" variant="danger" loading={deleting}
        onConfirm={doDelete} onCancel={() => setConfirmDel(null)}
      />
    </div>
  )
}
