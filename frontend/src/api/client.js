// Cliente API mínimo con token JWT en memoria + localStorage
const BASE = '/api'

export function getToken() {
  return localStorage.getItem('token')
}

async function request(path, { method = 'GET', body, form } = {}) {
  const headers = {}
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  let payload
  if (form) {
    payload = new URLSearchParams(form)
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
  } else if (body) {
    payload = JSON.stringify(body)
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(detail.detail || `Error ${res.status}`)
  }
  return res.json()
}

// Descarga un archivo protegido por JWT como blob y dispara el "Guardar como"
export async function downloadFile(path, filename) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } })
  if (!res.ok) throw new Error('No se pudo generar el archivo')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

export const api = {
  download: downloadFile,
  login: (email, password) =>
    request('/auth/login', { method: 'POST', form: { username: email, password } }),
  // contexto
  me: () => request('/me'),
  currencies: () => request('/currencies'),
  branches: () => request('/branches'),
  // master
  listTenants: () => request('/admin/tenants'),
  createTenant: (data) => request('/admin/tenants', { method: 'POST', body: data }),
  listAllBranches: (tenantId) =>
    request(`/admin/branches${tenantId ? `?tenant_id=${tenantId}` : ''}`),
  createBranch: (data) => request('/admin/branches', { method: 'POST', body: data }),
  audit: (tenantId) => request(`/admin/audit${tenantId ? `?tenant_id=${tenantId}` : ''}`),
  // productos
  listProducts: () => request('/productos'),
  productTypes: () => request('/productos/tipos'),
  categories: () => request('/productos/categorias'),
  variants: () => request('/productos/variantes'),
  createProduct: (data) => request('/productos', { method: 'POST', body: data }),
  findByEan: (ean) => request(`/productos/buscar-ean/${ean}`),
  // ventas
  listSales: (kind, qs = '') => {
    const parts = []
    if (kind) parts.push(`kind=${kind}`)
    if (qs) parts.push(qs)
    return request(`/ventas${parts.length ? '?' + parts.join('&') : ''}`)
  },
  createSale: (data) => request('/ventas', { method: 'POST', body: data }),
  deliverOrder: (id) => request(`/ventas/${id}/entregar`, { method: 'POST' }),
  comprobante: (id) => request(`/ventas/${id}/comprobante`),
  fiscalConfig: () => request('/fiscal-config'),
  saveFiscalConfig: (data) => request('/fiscal-config', { method: 'PUT', body: data }),
  // reportes
  repResumen: (qs = '') => request(`/reportes/resumen${qs}`),
  repVentasDia: (qs = '') => request(`/reportes/ventas-por-dia${qs}`),
  repTopProductos: (qs = '') => request(`/reportes/top-productos${qs}`),
  repValorInventario: (qs = '') => request(`/reportes/valor-inventario${qs}`),
  repSaldos: () => request('/reportes/saldos'),
  listCustomers: () => request('/ventas/clientes'),
  createCustomer: (data) => request('/ventas/clientes', { method: 'POST', body: data }),
  listPromotions: () => request('/ventas/promociones'),
  createPromotion: (data) => request('/ventas/promociones', { method: 'POST', body: data }),
  togglePromotion: (id) => request(`/ventas/promociones/${id}/toggle`, { method: 'PATCH' }),
  // compras
  listSuppliers: () => request('/compras/proveedores'),
  createSupplier: (data) => request('/compras/proveedores', { method: 'POST', body: data }),
  updateSupplier: (id, data) => request(`/compras/proveedores/${id}`, { method: 'PATCH', body: data }),
  deleteSupplier: (id) => request(`/compras/proveedores/${id}`, { method: 'DELETE' }),
  toggleSupplierEstado: (id) => request(`/compras/proveedores/${id}/estado`, { method: 'PATCH' }),
  listPurchaseOrders: () => request('/compras/ordenes'),
  listVariantsForPO: (supplierId) => request(`/compras/variantes${supplierId ? `?supplier_id=${supplierId}` : ''}`),
  getPurchaseOrder: (id) => request(`/compras/ordenes/${id}`),
  createPurchaseOrder: (data) => request('/compras/ordenes', { method: 'POST', body: data }),
  receivePurchaseOrder: (id) => request(`/compras/ordenes/${id}/recibir`, { method: 'POST' }),
  receivePurchaseOrderPartial: (id, data) => request(`/compras/ordenes/${id}/recibir-parcial`, { method: 'POST', body: data }),
  closePurchaseOrder: (id, reason) => request(`/compras/ordenes/${id}/cerrar${reason ? `?reason=${encodeURIComponent(reason)}` : ''}`, { method: 'POST' }),
  cancelPurchaseOrder: (id, reason) => request(`/compras/ordenes/${id}/cancelar${reason ? `?reason=${encodeURIComponent(reason)}` : ''}`, { method: 'POST' }),
  listPoEntries: (poId) => request(`/compras/ordenes/${poId}/entradas`),
  getPoHistory: (poId) => request(`/compras/ordenes/${poId}/historial`),
  listAllEntries: (qs = '') => request(`/compras/entradas${qs}`),
  getEntryDetail: (id) => request(`/compras/entradas/${id}`),
  updatePo: (id, data) => request(`/compras/ordenes/${id}`, { method: 'PATCH', body: data }),
  deletePo: (id) => request(`/compras/ordenes/${id}`, { method: 'DELETE' }),
  updateEntry: (id, data) => request(`/compras/entradas/${id}`, { method: 'PATCH', body: data }),
  deleteEntry: (id) => request(`/compras/entradas/${id}`, { method: 'DELETE' }),
  updateInvoice: (id, data) => request(`/compras/facturas/${id}`, { method: 'PATCH', body: data }),
  deleteInvoice: (id) => request(`/compras/facturas/${id}`, { method: 'DELETE' }),
  exportPoCsv: (id) => downloadFile(`/compras/ordenes/${id}/export`, `OC_${id}.csv`),
  replenishment: (branchId) => request(`/compras/reabastecimiento/${branchId}`),
  generateReorders: (branchId) => request(`/compras/reabastecimiento/${branchId}/generar`, { method: 'POST' }),
  generateReorders: (branchId) => request(`/compras/reabastecimiento/${branchId}/generar`, { method: 'POST' }),
  listInvoices: (qs = '') => request(`/compras/facturas${qs}`),
  accountStatement: () => request('/compras/estado-cuenta'),
  invoicePayments: (id) => request(`/compras/facturas/${id}/pagos`),
  payInvoice: (id, data) => request(`/compras/facturas/${id}/pagos`, { method: 'POST', body: data }),
  createInvoice: (data) => request('/compras/facturas', { method: 'POST', body: data }),
  getInvoiceDetail: (id) => request(`/compras/facturas/${id}/detalle`),
  getOrdenesSinFactura: () => request('/compras/ordenes-sin-factura'),
  getCxpResumen: () => request('/compras/cxp-resumen'),
  getCartera: () => request('/compras/cartera'),
  getSuppliersWithEntries: () => request('/compras/proveedores-con-entradas'),
  getSupplierPosWithEntries: (supplierId) => request(`/compras/proveedores/${supplierId}/ordenes-con-entradas`),
  getAllPosWithEntries: () => request('/compras/ordenes-con-entradas'),
  getEstadoCuentaProveedores: () => request('/compras/estado-cuenta-proveedores'),
  // inventarios
  stock: (branchId) => request(`/inventarios/stock/${branchId}`),
  stockResumen: (branchId) => request(`/inventarios/stock-resumen/${branchId}`),
  kardex: (variantId, branchId) => request(`/inventarios/kardex/${variantId}/${branchId}`),
  kardexFull: (branchId, limit) => request(`/inventarios/kardex-full/${branchId}${limit ? `?limit=${limit}` : ''}`),
  recalcularCostos: (branchId) => request(`/inventarios/recalcular-costos/${branchId}`, { method: 'POST' }),
  exportStockCsv: (branchId) => downloadFile(`/inventarios/export/stock/${branchId}`, `inventario_${branchId.slice(0,8)}.csv`),
  exportKardexCsv: (branchId) => downloadFile(`/inventarios/export/kardex/${branchId}`, `kardex_${branchId.slice(0,8)}.csv`),
  exportPhysicalInvCsv: (invId) => downloadFile(`/inventarios/export/inventario-fisico/${invId}`, `inv_fisico_${invId}.csv`),
  adjust: (data) => request('/inventarios/ajuste', { method: 'POST', body: data }),
  transfer: (data) => request('/inventarios/traslado', { method: 'POST', body: data }),
  listTransfers: () => request('/inventarios/traslados'),
  listWarehouses: (branchId) => request(`/inventarios/bodegas${branchId ? `?branch_id=${branchId}` : ''}`),
  createWarehouse: (d) => request('/inventarios/bodegas', { method: 'POST', body: d }),
  updateWarehouse: (id, d) => request(`/inventarios/bodegas/${id}`, { method: 'PATCH', body: d }),
  deleteWarehouse: (id) => request(`/inventarios/bodegas/${id}`, { method: 'DELETE' }),
  listPhysicalInvs: (branchId) => request(`/inventarios/inventarios-fisicos${branchId ? `?branch_id=${branchId}` : ''}`),
  createPhysicalInv: (d) => request('/inventarios/inventarios-fisicos', { method: 'POST', body: d }),
  getPhysicalInvLines: (id) => request(`/inventarios/inventarios-fisicos/${id}/lineas`),
  upsertPhysicalInvLines: (id, lines) => request(`/inventarios/inventarios-fisicos/${id}/lineas`, { method: 'PUT', body: lines }),
  closePhysicalInv: (id, apply) => request(`/inventarios/inventarios-fisicos/${id}/cerrar?apply_adjustments=${apply}`, { method: 'POST' }),
  setInitialStock: (d) => request('/inventarios/saldo-inicial', { method: 'POST', body: d }),
  writeOff: (d) => request('/inventarios/baja', { method: 'POST', body: d }),
  // usuarios y roles
  scopes: () => request('/scopes'),
  listRoles: () => request('/roles'),
  createRole: (data) => request('/roles', { method: 'POST', body: data }),
  updateRole: (id, data) => request(`/roles/${id}`, { method: 'PATCH', body: data }),
  deleteRole: (id) => request(`/roles/${id}`, { method: 'DELETE' }),
  listUsers: () => request('/usuarios'),
  createUser: (data) => request('/usuarios', { method: 'POST', body: data }),
  updateUser: (id, data) => request(`/usuarios/${id}`, { method: 'PATCH', body: data }),
  deleteUser: (id) => request(`/usuarios/${id}`, { method: 'DELETE' }),
  // apariencia
  uiConfig: () => request('/ui-config'),
  saveUiConfig: (theme) => request('/ui-config', { method: 'PUT', body: { theme } }),
  prefs: () => request('/preferencias'),
  savePrefs: (mode) => request('/preferencias', { method: 'PUT', body: { mode } }),
  // notificaciones
  notificaciones: () => request('/notificaciones'),
  // configuracion
  getConfig: () => request('/configuracion'),
  saveConfig: (data) => request('/configuracion', { method: 'PUT', body: data }),
  // catalogo productos
  getCategorias:    () => request('/configuracion/productos/categorias'),
  createCategoria:  (d)  => request('/configuracion/productos/categorias', { method: 'POST', body: d }),
  updateCategoria:  (id, d) => request(`/configuracion/productos/categorias/${id}`, { method: 'PATCH', body: d }),
  deleteCategoria:  (id) => request(`/configuracion/productos/categorias/${id}`, { method: 'DELETE' }),
  getTipos:         () => request('/configuracion/productos/tipos'),
  createTipo:       (d)  => request('/configuracion/productos/tipos', { method: 'POST', body: d }),
  updateTipo:       (id, d) => request(`/configuracion/productos/tipos/${id}`, { method: 'PATCH', body: d }),
  deleteTipo:       (id) => request(`/configuracion/productos/tipos/${id}`, { method: 'DELETE' }),
  getColores:       () => request('/configuracion/productos/colores'),
  createColor:      (d)  => request('/configuracion/productos/colores', { method: 'POST', body: d }),
  updateColor:      (id, d) => request(`/configuracion/productos/colores/${id}`, { method: 'PATCH', body: d }),
  deleteColor:      (id) => request(`/configuracion/productos/colores/${id}`, { method: 'DELETE' }),
  getTallas:        () => request('/configuracion/productos/tallas'),
  createTalla:      (d)  => request('/configuracion/productos/tallas', { method: 'POST', body: d }),
  updateTalla:      (id, d) => request(`/configuracion/productos/tallas/${id}`, { method: 'PATCH', body: d }),
  deleteTalla:      (id) => request(`/configuracion/productos/tallas/${id}`, { method: 'DELETE' }),
  getUnidades:      () => request('/configuracion/productos/unidades'),
  createUnidad:     (d)  => request('/configuracion/productos/unidades', { method: 'POST', body: d }),
  updateUnidad:     (id, d) => request(`/configuracion/productos/unidades/${id}`, { method: 'PATCH', body: d }),
  deleteUnidad:     (id) => request(`/configuracion/productos/unidades/${id}`, { method: 'DELETE' }),
  getMarcas:        () => request('/configuracion/productos/marcas'),
  createMarca:      (d)  => request('/configuracion/productos/marcas', { method: 'POST', body: d }),
  updateMarca:      (id, d) => request(`/configuracion/productos/marcas/${id}`, { method: 'PATCH', body: d }),
  deleteMarca:      (id) => request(`/configuracion/productos/marcas/${id}`, { method: 'DELETE' }),
  // catálogos personalizados
  getCustomCatalogs:      ()        => request('/configuracion/productos/catalogos-custom'),
  createCustomCatalog:    (d)       => request('/configuracion/productos/catalogos-custom', { method: 'POST', body: d }),
  updateCustomCatalog:    (id, d)   => request(`/configuracion/productos/catalogos-custom/${id}`, { method: 'PATCH', body: d }),
  deleteCustomCatalog:    (id)      => request(`/configuracion/productos/catalogos-custom/${id}`, { method: 'DELETE' }),
  getCustomCatalogItems:  (id)      => request(`/configuracion/productos/catalogos-custom/${id}/items`),
  createCustomCatalogItem:(id, d)   => request(`/configuracion/productos/catalogos-custom/${id}/items`, { method: 'POST', body: d }),
  updateCustomCatalogItem:(id, iid, d) => request(`/configuracion/productos/catalogos-custom/${id}/items/${iid}`, { method: 'PATCH', body: d }),
  deleteCustomCatalogItem:(id, iid) => request(`/configuracion/productos/catalogos-custom/${id}/items/${iid}`, { method: 'DELETE' }),
  // grupos de variables (colores y tallas)
  getGruposColores:    () => request('/configuracion/productos/grupos-colores'),
  createGrupoColores:  (d)  => request('/configuracion/productos/grupos-colores', { method: 'POST', body: d }),
  updateGrupoColores:  (id, d) => request(`/configuracion/productos/grupos-colores/${id}`, { method: 'PATCH', body: d }),
  deleteGrupoColores:  (id) => request(`/configuracion/productos/grupos-colores/${id}`, { method: 'DELETE' }),
  getGruposTallas:     () => request('/configuracion/productos/grupos-tallas'),
  createGrupoTallas:   (d)  => request('/configuracion/productos/grupos-tallas', { method: 'POST', body: d }),
  updateGrupoTallas:   (id, d) => request(`/configuracion/productos/grupos-tallas/${id}`, { method: 'PATCH', body: d }),
  deleteGrupoTallas:   (id) => request(`/configuracion/productos/grupos-tallas/${id}`, { method: 'DELETE' }),
  updateProduct:       (id, d) => request(`/productos/${id}`, { method: 'PATCH', body: d }),
  deleteProduct:       (id) => request(`/productos/${id}`, { method: 'DELETE' }),
  updateVariantBarcode:(pid, vid, ean13) => request(`/productos/${pid}/variantes/${vid}/barcode`, { method: 'PATCH', body: { ean13 } }),
  updateVariantBarcodesBulk: (pid, items) => request(`/productos/${pid}/variantes/barcodes-bulk`, { method: 'PATCH', body: items }),
  gs1Prefixes: () => request('/gs1/prefixes'),
  nextBarcodeSeq: (prefix) => request(`/gs1/next-barcode-seq?prefix=${encodeURIComponent(prefix)}`),
  // contabilidad
  ctaCuentas: () => request('/contabilidad/cuentas'),
  ctaCrearCuenta: (data) => request('/contabilidad/cuentas', { method: 'POST', body: data }),
  ctaUpdateCuenta: (id, d) => request(`/contabilidad/cuentas/${id}`, { method: 'PATCH', body: d }),
  ctaAsientos: () => request('/contabilidad/asientos'),
  ctaCrearAsiento: (data) => request('/contabilidad/asientos', { method: 'POST', body: data }),
  ctaDeleteAsiento: (id) => request(`/contabilidad/asientos/${id}`, { method: 'DELETE' }),
  ctaDiario: (qs = '') => request(`/contabilidad/diario${qs}`),
  ctaMayorAll: (qs = '') => request(`/contabilidad/mayor${qs}`),
  ctaBalanza: () => request('/contabilidad/balanza'),
  ctaEstadoResultados: () => request('/contabilidad/estado-resultados'),
  ctaBalanceGeneral: () => request('/contabilidad/balance-general'),
  ctaConfig: () => request('/contabilidad/config'),
  ctaSaveConfig: (items) => request('/contabilidad/config', { method: 'PUT', body: items }),
  ctaConciliacion: () => request('/contabilidad/conciliacion'),
  ctaRepostearVentas: () => request('/contabilidad/repostear-ventas', { method: 'POST' }),
  ctaRepostearCompras: () => request('/contabilidad/repostear-compras', { method: 'POST' }),
  ctaBancos: () => request('/contabilidad/bancos'),
  ctaCrearBanco: (data) => request('/contabilidad/bancos', { method: 'POST', body: data }),
  ctaMovimientos: (id) => request(`/contabilidad/bancos/${id}/movimientos`),
  ctaAgregarMovimiento: (id, data) => request(`/contabilidad/bancos/${id}/movimientos`, { method: 'POST', body: data }),
  ctaExportDiario: (qs = '') => downloadFile(`/contabilidad/export/diario${qs}`, 'libro_diario.csv'),
  ctaExportBalanza: () => downloadFile('/contabilidad/export/balanza', 'balanza.csv'),
  // caja
  openCashSession: (data) => request('/ventas/caja/apertura', { method: 'POST', body: data }),
  getActiveCashSession: (branchId) => request(`/ventas/caja/sesion-activa?branch_id=${branchId}`),
  cutCash: (data) => request('/ventas/caja/corte', { method: 'POST', body: data }),
  closeCashSession: (data) => request('/ventas/caja/cierre', { method: 'POST', body: data }),
  listCashSessions: (branchId) => request(`/ventas/caja/sesiones${branchId ? `?branch_id=${branchId}` : ''}`),
  getSessionCuts: (sessionId) => request(`/ventas/caja/sesiones/${sessionId}/cortes`),
  // perfiles POS
  listPosProfiles: () => request('/configuracion/pos/perfiles'),
  createPosProfile: (d) => request('/configuracion/pos/perfiles', { method: 'POST', body: d }),
  updatePosProfile: (id, d) => request(`/configuracion/pos/perfiles/${id}`, { method: 'PATCH', body: d }),
  deletePosProfile: (id) => request(`/configuracion/pos/perfiles/${id}`, { method: 'DELETE' }),
}
