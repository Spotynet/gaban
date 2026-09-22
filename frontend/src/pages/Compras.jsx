import { useEffect, useState, useRef, Fragment } from 'react'
import { api } from '../api/client.js'
import { EmptyState, StatusBadge, TabBar, ActiveBadge } from '../components/ui.jsx'
import { useNotify } from '../context/ToastContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { Ib, Ab } from '../components/IconBtn.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { formatMoney } from '../utils/currency.js'
import { Paginator } from '../components/Paginator.jsx'

const CURRENCIES = ['COP', 'MXN', 'USD', 'EUR', 'PEN', 'CLP', 'ARS', 'BOB', 'PYG', 'UYU']

/* Tipos de persona fiscal por país */
const FISCAL_TYPES = {
  CO: [
    { value: 'persona_natural',   label: 'Persona Natural',   hint: 'CC / CE — responsabilidad propia' },
    { value: 'persona_juridica',  label: 'Persona Jurídica',  hint: 'NIT — empresa o sociedad (SAS, SA, Ltda.)' },
  ],
  MX: [
    { value: 'persona_fisica',    label: 'Persona Física',    hint: 'RFC 13 dígitos — individuo o negocio unipersonal' },
    { value: 'persona_moral',     label: 'Persona Moral',     hint: 'RFC 12 dígitos — sociedad (SA, SRL, SC, AC…)' },
  ],
  PE: [
    { value: 'persona_natural',   label: 'Persona Natural',   hint: 'DNI / CE — RUC tipo 10' },
    { value: 'persona_juridica',  label: 'Persona Jurídica',  hint: 'RUC tipo 20 — empresa, asociación' },
  ],
  CL: [
    { value: 'persona_natural',   label: 'Persona Natural',   hint: 'RUT persona, incluye EIRL' },
    { value: 'persona_juridica',  label: 'Persona Jurídica',  hint: 'RUT empresa — SA, SpA, SRL, Coop.' },
  ],
  AR: [
    { value: 'monotributista',    label: 'Monotributista',    hint: 'Monotributo — CUIT persona humana pequeña' },
    { value: 'resp_inscripto',    label: 'Responsable Inscripto', hint: 'IVA — profesional o empresa mediana/grande' },
    { value: 'persona_juridica',  label: 'Persona Jurídica',  hint: 'CUIT empresa — SA, SRL, SAS, Coop.' },
  ],
  BO: [
    { value: 'persona_natural',   label: 'Persona Natural',   hint: 'CI — NIT persona' },
    { value: 'persona_juridica',  label: 'Persona Jurídica',  hint: 'NIT empresa — SRL, SA, Coop.' },
  ],
  PY: [
    { value: 'persona_fisica',    label: 'Persona Física',    hint: 'RUC unipersonal' },
    { value: 'persona_juridica',  label: 'Persona Jurídica',  hint: 'RUC empresa — SA, SRL, Coop.' },
  ],
  UY: [
    { value: 'persona_fisica',    label: 'Persona Física',    hint: 'RUT unipersonal / IRAE' },
    { value: 'persona_juridica',  label: 'Persona Jurídica',  hint: 'RUT empresa — SA, SRL, Coop.' },
  ],
  EC: [
    { value: 'persona_natural',   label: 'Persona Natural',   hint: 'RUC 10 dígitos — persona' },
    { value: 'sociedad',          label: 'Sociedad',          hint: 'RUC 13 dígitos — empresa o institución' },
  ],
  VE: [
    { value: 'persona_natural',   label: 'Persona Natural (V-)', hint: 'RIF tipo V — venezolano' },
    { value: 'persona_juridica',  label: 'Persona Jurídica (J-)', hint: 'RIF tipo J — empresa' },
    { value: 'gobierno',          label: 'Ente Gubernamental (G-)', hint: 'RIF tipo G — organismo público' },
  ],
  ES: [
    { value: 'autonomo',          label: 'Autónomo',          hint: 'NIF persona física — trabajador por cuenta propia' },
    { value: 'persona_juridica',  label: 'Persona Jurídica',  hint: 'CIF empresa — SA, SL, Coop., Asoc.' },
  ],
  US: [
    { value: 'individual',        label: 'Individual / Sole Proprietor', hint: 'SSN o ITIN — sin entidad separada' },
    { value: 'llc',               label: 'LLC',               hint: 'EIN — sociedad de responsabilidad limitada' },
    { value: 'corporation',       label: 'Corporation (C-Corp / S-Corp)', hint: 'EIN — sociedad anónima' },
    { value: 'partnership',       label: 'Partnership',       hint: 'EIN — sociedad colectiva o en comandita' },
  ],
  BR: [
    { value: 'pessoa_fisica',     label: 'Pessoa Física',     hint: 'CPF — individuo' },
    { value: 'pessoa_juridica',   label: 'Pessoa Jurídica',   hint: 'CNPJ — empresa, MEI, Ltda., SA' },
  ],
  GT: [
    { value: 'persona_individual', label: 'Persona Individual', hint: 'NIT persona' },
    { value: 'persona_juridica',  label: 'Persona Jurídica',  hint: 'NIT empresa — SA, SRL, Coop.' },
  ],
  // Fallback genérico para cualquier otro país
  _default: [
    { value: 'persona_natural',   label: 'Persona Natural / Física', hint: 'Individuo o negocio unipersonal' },
    { value: 'persona_juridica',  label: 'Persona Jurídica / Moral',  hint: 'Empresa, sociedad o corporación' },
  ],
}

const getFiscalTypes = (country) => FISCAL_TYPES[country] || FISCAL_TYPES._default

/* Tipos de documento de identificación fiscal por país
   forPersonType: qué tipos de persona pueden usar este documento (vacío = todos) */
/* hasDV   → tiene Dígito de Verificación separado
   dvLabel  → etiqueta del campo DV (default "D.V.")
   idPlaceholder → placeholder solo del número base (sin el DV)
   format   → función de preview del ID completo: (id, dv) => string */
const FISCAL_ID_TYPES = {
  CO: [
    { value: 'NIT',  label: 'NIT',       fullName: 'Número de Identificación Tributaria',
      forPersonType: ['persona_juridica'],
      hint: 'Empresas, SAS, SA, Ltda. — emitido por la DIAN',
      placeholder: '900.123.456', hasDV: true, dvLabel: 'D.V.',
      format: (id, dv) => dv ? `${id}-${dv}` : id },
    { value: 'CC',   label: 'C.C.',      fullName: 'Cédula de Ciudadanía',
      forPersonType: ['persona_natural'],
      hint: 'Persona natural colombiana — emitida por la Registraduría',
      placeholder: '1.234.567.890' },
    { value: 'CE',   label: 'C.E.',      fullName: 'Cédula de Extranjería',
      forPersonType: ['persona_natural'],
      hint: 'Extranjero residente con actividad económica — emitida por Migración Colombia',
      placeholder: '123456789' },
    { value: 'PA',   label: 'Pasaporte', fullName: 'Pasaporte',
      forPersonType: ['persona_natural'],
      hint: 'Extranjero no residente — documento de viaje internacional',
      placeholder: 'AB123456' },
  ],
  MX: [
    { value: 'RFC',  label: 'RFC',  fullName: 'Registro Federal de Contribuyentes',
      forPersonType: ['persona_fisica', 'persona_moral'],
      hint: '13 caracteres para persona física / 12 para moral — emitido por el SAT',
      placeholder: 'XAXX010101000' },
    { value: 'CURP', label: 'CURP', fullName: 'Clave Única de Registro de Población',
      forPersonType: ['persona_fisica'],
      hint: '18 caracteres alfanuméricos — solo personas físicas, emitida por RENAPO',
      placeholder: 'XEXX010101HNEXXXA4' },
  ],
  PE: [
    { value: 'RUC', label: 'RUC', fullName: 'Registro Único de Contribuyentes',
      forPersonType: ['persona_juridica', 'persona_natural'],
      hint: '11 dígitos — tipo 20 empresas / tipo 10 persona natural, emitido por SUNAT',
      placeholder: '20123456789' },
    { value: 'DNI', label: 'DNI', fullName: 'Documento Nacional de Identidad',
      forPersonType: ['persona_natural'],
      hint: '8 dígitos — emitido por el RENIEC',
      placeholder: '12345678' },
    { value: 'CE',  label: 'C.E.', fullName: 'Carné de Extranjería',
      forPersonType: ['persona_natural'],
      hint: 'Extranjero residente — emitido por Migraciones Perú',
      placeholder: '000123456' },
    { value: 'PA',  label: 'Pasaporte', fullName: 'Pasaporte',
      forPersonType: ['persona_natural'],
      hint: 'Extranjero no residente',
      placeholder: 'AB123456' },
  ],
  CL: [
    { value: 'RUT', label: 'RUT', fullName: 'Rol Único Tributario',
      forPersonType: ['persona_natural', 'persona_juridica'],
      hint: 'Personas y empresas — emitido por el SII',
      placeholder: '12.345.678', hasDV: true, dvLabel: 'Dígito',
      format: (id, dv) => dv ? `${id}-${dv}` : id },
    { value: 'PA',  label: 'Pasaporte', fullName: 'Pasaporte',
      forPersonType: ['persona_natural'],
      hint: 'Extranjero sin RUT asignado',
      placeholder: 'AB123456' },
  ],
  AR: [
    { value: 'CUIT', label: 'CUIT', fullName: 'Clave Única de Identificación Tributaria',
      forPersonType: ['monotributista', 'resp_inscripto', 'persona_juridica'],
      hint: '11 dígitos (XX-XXXXXXXX-X) — obligatorio para facturar, emitido por AFIP',
      placeholder: '20-12345678-3' },
    { value: 'CUIL', label: 'CUIL', fullName: 'Clave Única de Identificación Laboral',
      forPersonType: ['monotributista', 'resp_inscripto'],
      hint: 'Misma estructura que el CUIT — para empleados en relación de dependencia',
      placeholder: '20-12345678-3' },
    { value: 'DNI',  label: 'DNI',  fullName: 'Documento Nacional de Identidad',
      forPersonType: ['monotributista', 'resp_inscripto'],
      hint: 'Sin actividad comercial registrada ante AFIP',
      placeholder: '12345678' },
  ],
  BO: [
    { value: 'NIT', label: 'NIT', fullName: 'Número de Identificación Tributaria',
      forPersonType: ['persona_juridica', 'persona_natural'],
      hint: 'Requerido para emitir facturas — emitido por el SIN',
      placeholder: '1234567' },
    { value: 'CI',  label: 'C.I.', fullName: 'Cédula de Identidad',
      forPersonType: ['persona_natural'],
      hint: 'Personas naturales sin actividad comercial registrada',
      placeholder: '1234567 LP' },
  ],
  PY: [
    { value: 'RUC', label: 'RUC', fullName: 'Registro Único de Contribuyentes',
      forPersonType: ['persona_juridica', 'persona_fisica'],
      hint: 'Obligatorio para facturar — emitido por la SET',
      placeholder: '80012345', hasDV: true, dvLabel: 'D.V.',
      format: (id, dv) => dv ? `${id}-${dv}` : id },
    { value: 'CI',  label: 'C.I.', fullName: 'Cédula de Identidad',
      forPersonType: ['persona_fisica'],
      hint: 'Sin actividad comercial registrada ante la SET',
      placeholder: '1234567' },
  ],
  UY: [
    { value: 'RUT', label: 'RUT', fullName: 'Registro Único Tributario',
      forPersonType: ['persona_juridica', 'persona_fisica'],
      hint: 'Obligatorio para facturar — emitido por la DGI',
      placeholder: '210012345678' },
    { value: 'CI',  label: 'C.I.', fullName: 'Cédula de Identidad',
      forPersonType: ['persona_fisica'],
      hint: 'Personas físicas sin actividad económica registrada',
      placeholder: '12345678' },
  ],
  EC: [
    { value: 'RUC', label: 'RUC', fullName: 'Registro Único de Contribuyentes',
      forPersonType: ['sociedad', 'persona_natural'],
      hint: '13 dígitos — sociedades o naturales con actividad, emitido por el SRI',
      placeholder: '1234567890001' },
    { value: 'CI',  label: 'C.I.', fullName: 'Cédula de Identidad',
      forPersonType: ['persona_natural'],
      hint: '10 dígitos — personas naturales sin actividad comercial',
      placeholder: '1234567890' },
    { value: 'PA',  label: 'Pasaporte', fullName: 'Pasaporte',
      forPersonType: ['persona_natural'],
      hint: 'Extranjero sin cédula ecuatoriana',
      placeholder: 'AB123456' },
  ],
  VE: [
    { value: 'RIF-V', label: 'RIF-V', fullName: 'Registro de Información Fiscal — Natural',
      forPersonType: ['persona_natural'],
      hint: 'Tipo V — persona natural venezolana, emitido por el SENIAT',
      placeholder: 'V-12345678' },
    { value: 'RIF-E', label: 'RIF-E', fullName: 'Registro de Información Fiscal — Extranjero',
      forPersonType: ['persona_natural'],
      hint: 'Tipo E — extranjero residente, emitido por el SENIAT',
      placeholder: 'E-12345678' },
    { value: 'RIF-J', label: 'RIF-J', fullName: 'Registro de Información Fiscal — Jurídico',
      forPersonType: ['persona_juridica'],
      hint: 'Tipo J — persona jurídica (empresa), emitido por el SENIAT',
      placeholder: 'J-123456789' },
    { value: 'RIF-G', label: 'RIF-G', fullName: 'Registro de Información Fiscal — Gubernamental',
      forPersonType: ['gobierno'],
      hint: 'Tipo G — ente gubernamental, emitido por el SENIAT',
      placeholder: 'G-12345678' },
  ],
  ES: [
    { value: 'NIF', label: 'NIF / DNI', fullName: 'Número de Identificación Fiscal',
      forPersonType: ['autonomo'],
      hint: 'Personas físicas — 8 dígitos + letra de control, emitido por la AEAT',
      placeholder: '12345678A' },
    { value: 'NIE', label: 'NIE', fullName: 'Número de Identidad de Extranjero',
      forPersonType: ['autonomo'],
      hint: 'Autónomos no nacionales — letra + 7 dígitos + letra',
      placeholder: 'X1234567A' },
    { value: 'CIF', label: 'CIF', fullName: 'Código de Identificación Fiscal',
      forPersonType: ['persona_juridica'],
      hint: 'Empresas — letra identificadora + 7 dígitos + control',
      placeholder: 'B12345678' },
  ],
  US: [
    { value: 'EIN',  label: 'EIN',  fullName: 'Employer Identification Number',
      forPersonType: ['llc', 'corporation', 'partnership'],
      hint: 'XX-XXXXXXX — entidades con empleados o multi-miembro, emitido por el IRS',
      placeholder: '12-3456789' },
    { value: 'SSN',  label: 'SSN',  fullName: 'Social Security Number',
      forPersonType: ['individual'],
      hint: 'XXX-XX-XXXX — propietarios únicos sin EIN, emitido por la SSA',
      placeholder: '123-45-6789' },
    { value: 'ITIN', label: 'ITIN', fullName: 'Individual Taxpayer Identification Number',
      forPersonType: ['individual'],
      hint: '9XX-XX-XXXX — extranjeros sin SSN, emitido por el IRS',
      placeholder: '912-34-5678' },
  ],
  BR: [
    { value: 'CNPJ', label: 'CNPJ', fullName: 'Cadastro Nacional da Pessoa Jurídica',
      forPersonType: ['pessoa_juridica'],
      hint: 'XX.XXX.XXX/XXXX-XX — empresas, emitido por la Receita Federal',
      placeholder: '00.000.000/0001-00' },
    { value: 'CPF',  label: 'CPF',  fullName: 'Cadastro de Pessoas Físicas',
      forPersonType: ['pessoa_fisica'],
      hint: 'XXX.XXX.XXX-XX — personas físicas, emitido por la Receita Federal',
      placeholder: '000.000.000-00' },
  ],
  GT: [
    { value: 'NIT', label: 'NIT', fullName: 'Número de Identificación Tributaria',
      forPersonType: ['persona_juridica', 'persona_individual'],
      hint: 'Requerido para facturar — emitido por la SAT',
      placeholder: '12345678', hasDV: true, dvLabel: 'D.V.',
      format: (id, dv) => dv ? `${id}-${dv}` : id },
    { value: 'DPI', label: 'DPI', fullName: 'Documento Personal de Identificación',
      forPersonType: ['persona_individual'],
      hint: '13 dígitos — emitido por el RENAP',
      placeholder: '1234567890101' },
  ],
  _default: [
    { value: 'TAX_ID', label: 'Tax ID', fullName: 'Identificación Tributaria',
      forPersonType: [],
      hint: 'Número de identificación tributaria o fiscal',
      placeholder: 'Ej. 123456789' },
  ],
}

const getFiscalIdTypes = (country) => FISCAL_ID_TYPES[country] || FISCAL_ID_TYPES._default

const getAvailableIdTypes = (country, personType) => {
  const all = getFiscalIdTypes(country)
  if (!personType) return all
  return all.filter(t => !t.forPersonType?.length || t.forPersonType.includes(personType))
}

const SUPPLIER_CSV_HEADERS = [
  'name', 'fiscal_person_type', 'fiscal_id_type', 'tax_id', 'tax_dv',
  'email', 'phone', 'mobile', 'city', 'address', 'currency',
]
const SUPPLIER_CSV_EXAMPLES = [
  ['Distribuidora ABC S.A.', 'persona_juridica', 'NIT',  '900.123.456', '1', 'compras@abc.com', '+57 1 234 5678', '+57 300 000 0000', 'Bogotá',   'Calle 10 # 5-20',     'COP'],
  ['Juan Pérez',             'persona_natural',  'CC',   '12.345.678',  '',  'juan@correo.com', '',               '+57 315 000 0000', 'Medellín', 'Carrera 45 # 12-30', 'COP'],
  ['Global Supplies Inc.',   'corporation',      'EIN',  '12-3456789',  '',  'orders@global.io','',               '',                 'New York', '123 Main St',         'USD'],
]
const n = (x) => Number(x) || 0
const PAY_METHODS = [['efectivo','Efectivo'],['transferencia','Transferencia'],['cheque','Cheque'],['tarjeta','Tarjeta']]

const TABS = [
  { id: 'proveedores',  label: 'Proveedores',           icon: '🏭' },
  { id: 'ordenes',      label: 'Órdenes de compra',    icon: '🧾' },
  { id: 'facturacion',  label: 'Facturación / CxP',    icon: '💳' },
]

export default function Compras() {
  const { currency: tenantCurrency, country: tenantCountry, role } = useAuth()
  const isAdmin = role === 'ADMINISTRADOR'
  const defCur = tenantCurrency || 'USD'
  const [tab, setTab]           = useState('proveedores')
  const [suppliers, setSuppliers] = useState([])
  const [orders, setOrders]     = useState([])
  const [allVariants, setAllVariants] = useState([])  // todas las variantes (para fallback)
  const [poVariants, setPoVariants]   = useState([])  // variantes del proveedor seleccionado
  const [loadingVariants, setLoadingVariants] = useState(false)
  const [branches, setBranches] = useState([])
  const notify = useNotify()
  const emptySup = () => ({ name: '', fiscal_person_type: '', fiscal_id_type: '', tax_id: '', tax_dv: '', email: '', phone: '', mobile: '', city: '', address: '', currency: defCur })
  const emptyPO = { supplier_id: '', branch_id: '', currency: defCur, note: '', expected_at: '', items: [] }
  const [po, setPo]             = useState(() => ({ supplier_id: '', branch_id: '', currency: defCur, note: '', expected_at: '', items: [] }))
  const [showPO, setShowPO]     = useState(false)
  const [editingPoId, setEditingPoId] = useState(null)  // ID de la solicitud en edición
  const [detailModal, setDetailModal] = useState(null)
  // Admin: edit/delete modals
  const [editPoModal, setEditPoModal]     = useState(null)  // { id, po_no, note, expected_at }
  const [deletePoModal, setDeletePoModal] = useState(null)  // { id, po_no }
  const [editEntryModal, setEditEntryModal]     = useState(null)  // { id, entry_no, notes }
  const [deleteEntryModal, setDeleteEntryModal] = useState(null)  // { id, entry_no }
  const [confirmBusy, setConfirmBusy] = useState(false)

  async function refresh() {
    try { setSuppliers(await api.listSuppliers()); setOrders(await api.listPurchaseOrders()) }
    catch (e) { notify(e.message, 'error') }
  }

  // ── Abrir wizard para editar solicitud de compra (borrador) ──
  async function openDraftEdit(order) {
    try {
      const poDetail = await api.getPurchaseOrder(order.id)
      const vs = await api.listVariantsForPO(String(order.supplier_id))
      setPoVariants(vs)
      // Reconstruir items con metadata de variante
      const items = (poDetail.items || []).map(it => {
        const v = vs.find(pv => String(pv.id) === String(it.variant_id))
        return {
          variant_id: it.variant_id,
          qty_ordered: it.qty_ordered,
          unit_cost: it.unit_cost,
          _brand: v?.brand_name || '',
          _name: v?.product_name || it.product_name || '',
          _sku: v?.variant_sku || it.variant_sku || '',
          _size: v?.size || it.size || '',
          _color: v?.color || it.color || '',
        }
      })
      setPo({
        supplier_id: String(order.supplier_id),
        branch_id: order.branch_id || '',
        currency: order.currency || defCur,
        note: order.note || '',
        expected_at: order.expected_at?.slice(0, 10) || '',
        items,
        _step: 0,
        _suppQ: '',
        _catQ: '',
        _catBrand: '',
      })
      setEditingPoId(order.id)
      setShowPO(true)
    } catch (e) { notify(e.message, 'error') }
  }

  // ── Admin: OC edit/delete ──
  async function savePoEdit() {
    setConfirmBusy(true)
    try {
      await api.updatePo(editPoModal.id, { note: editPoModal.note || null, expected_at: editPoModal.expected_at || null })
      notify('OC actualizada'); setEditPoModal(null); refresh()
    } catch (e) { notify(e.message, 'error') }
    finally { setConfirmBusy(false) }
  }
  async function confirmDeletePo() {
    setConfirmBusy(true)
    try {
      await api.deletePo(deletePoModal.id)
      notify(`${deletePoModal.po_no} eliminada`); setDeletePoModal(null); refresh()
    } catch (e) { notify(e.message, 'error') }
    finally { setConfirmBusy(false) }
  }
  // ── Admin: Entry edit/delete ──
  async function saveEntryEdit() {
    setConfirmBusy(true)
    try {
      await api.updateEntry(editEntryModal.id, { notes: editEntryModal.notes || null })
      notify('Entrada actualizada'); setEditEntryModal(null); refresh()
    } catch (e) { notify(e.message, 'error') }
    finally { setConfirmBusy(false) }
  }
  async function confirmDeleteEntry() {
    setConfirmBusy(true)
    try {
      await api.deleteEntry(deleteEntryModal.id)
      notify(`${deleteEntryModal.entry_no} eliminada`); setDeleteEntryModal(null); refresh()
    } catch (e) { notify(e.message, 'error') }
    finally { setConfirmBusy(false) }
  }

  useEffect(() => {
    refresh()
    // Cargar todas las variantes una sola vez para uso general
    api.listVariantsForPO().then(vs => { setAllVariants(vs); setPoVariants(vs) }).catch(() => {})
    api.me().then(m => setBranches(m.branches || [])).catch(() => {})
  }, [])

  // Cuando cambia el proveedor en el form de OC, recargar variantes filtradas
  async function onSupplierChange(supplierId) {
    const sup = suppliers.find(s => String(s.id) === supplierId)
    setPo(prev => ({ ...prev, supplier_id: supplierId, currency: sup?.currency || prev.currency, items: [] }))
    if (!supplierId) { setPoVariants(allVariants); return }
    setLoadingVariants(true)
    try {
      const vs = await api.listVariantsForPO(supplierId)
      setPoVariants(vs)
    } catch { setPoVariants([]) }
    finally { setLoadingVariants(false) }
  }

  const addItem = () => setPo({ ...po, items: [...po.items, { variant_id: '', qty_ordered: 1, unit_cost: 0 }] })

  // Al seleccionar variante: auto-completar costo desde last_cost o cost_price
  const setItem = (i, k, v) => {
    const updates = { [k]: v }
    if (k === 'variant_id' && v) {
      const vdata = poVariants.find(pv => String(pv.id) === String(v))
      if (vdata) {
        updates.unit_cost = n(vdata.last_cost || vdata.cost_price || 0)
        updates._brand    = vdata.brand_name || ''
        updates._supplier = vdata.supplier_name || ''
      }
    }
    setPo({ ...po, items: po.items.map((x, j) => j === i ? { ...x, ...updates } : x) })
  }
  const rmItem  = (i) => setPo({ ...po, items: po.items.filter((_, j) => j !== i) })
  const poTotal = po.items.reduce((s, it) => s + n(it.qty_ordered) * n(it.unit_cost), 0)

  async function savePO() {
    if (!po.supplier_id || !po.branch_id) return notify('Selecciona proveedor y sucursal', 'error')
    if (po.items.length === 0) return notify('Agrega al menos un ítem', 'error')
    if (po.items.some(it => !it.variant_id)) return notify('Selecciona el producto para todos los ítems', 'error')
    if (po.items.some(it => n(it.unit_cost) <= 0)) return notify('El costo de compra es obligatorio en todos los ítems (debe ser mayor a 0)', 'error')
    try {
      const res = await api.createPurchaseOrder({
        supplier_id: Number(po.supplier_id), branch_id: po.branch_id, currency: po.currency,
        note: po.note || null, expected_at: po.expected_at || null,
        items: po.items.map(it => ({ variant_id: Number(it.variant_id), qty_ordered: n(it.qty_ordered), unit_cost: n(it.unit_cost) })),
      })
      notify(`Orden ${res.po_no || res.po_id} creada · ${formatMoney(res.total, po.currency)}`)
      setPo(emptyPO); setShowPO(false); refresh()
      setPoVariants(allVariants)
    } catch (err) { notify(err.message, 'error') }
  }

  async function receive(id) {
    try { const r = await api.receivePurchaseOrder(id); notify(`Orden #${r.po_id} recibida`); refresh() }
    catch (err) { notify(err.message, 'error') }
  }

  const [receiveModal, setReceiveModal] = useState(null) // po_id
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Agrupar variantes por marca para el select del form OC
  const variantsByBrand = poVariants.reduce((acc, v) => {
    const brand = v.brand_name || 'Sin marca'
    if (!acc[brand]) acc[brand] = []
    acc[brand].push(v)
    return acc
  }, {})

  const vlabel = (v) => `${v.product_name} · ${v.variant_sku}${v.size ? ' T' + v.size : ''}${v.color ? ' ' + v.color : ''}`

  return (
    <div className="module-root">
      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {/* ── Órdenes ── */}
      {tab === 'ordenes' && (
        <div className="vtab-content">

          {/* Modals */}
          {detailModal && (
            <PODetailModal poId={detailModal} onClose={() => setDetailModal(null)}
              onOpenReceive={(id) => { setDetailModal(null); setReceiveModal(id) }}
              notify={notify} onRefresh={refresh}
              isAdmin={isAdmin}
              onEditDraft={(o) => { setDetailModal(null); openDraftEdit(o) }}
              onEditPo={(po) => setEditPoModal({ id: po.id, po_no: po.po_no || 'OC-'+String(po.id).padStart(6,'0'), note: po.note || '', expected_at: po.expected_at?.slice(0,10) || '' })}
              onDeletePo={(po) => setDeletePoModal({ id: po.id, po_no: po.po_no || 'OC-'+String(po.id).padStart(6,'0') })}
              onEditEntry={(e) => setEditEntryModal({ id: e.id, entry_no: e.entry_no, notes: e.notes || '' })}
              onDeleteEntry={(e) => setDeleteEntryModal({ id: e.id, entry_no: e.entry_no })} />
          )}
          {receiveModal && (
            <ReceiveModal poId={receiveModal} onClose={() => setReceiveModal(null)}
              onDone={() => { setReceiveModal(null); refresh() }} notify={notify} />
          )}

          {/* ── Modal nueva OC (wizard) ── */}
          {showPO && (() => {
            const WIZ = ['Encabezado', 'Selección de ítems', 'Cantidades y costos', 'Confirmar']
            const ocStep = po._step ?? 0
            const setOcStep = (s) => setPo(p => ({ ...p, _step: s }))

            // Buscador de proveedor
            const [suppQ, setSuppQ] = [po._suppQ ?? '', (v) => setPo(p => ({ ...p, _suppQ: v }))]
            const filteredSupps = suppliers.filter(s =>
              !suppQ || s.name.toLowerCase().includes(suppQ.toLowerCase())
            )
            const selSupp = suppliers.find(s => String(s.id) === String(po.supplier_id))

            // Búsqueda/filtrado catálogo variantes (paso 1)
            const [catQ, setCatQ] = [po._catQ ?? '', (v) => setPo(p => ({ ...p, _catQ: v }))]
            const [catBrand, setCatBrand] = [po._catBrand ?? '', (v) => setPo(p => ({ ...p, _catBrand: v }))]
            const catBrands = [...new Set(poVariants.map(v => v.brand_name).filter(Boolean))]

            // Agrupar variantes por (producto + color) para el catálogo
            // Cada "grupo" representa una tarjeta en el catálogo
            const colorGroups = (() => {
              const map = {}
              poVariants.forEach(v => {
                const key = `${v.product_name}||${v.color || ''}`
                if (!map[key]) map[key] = {
                  key,
                  product_name: v.product_name,
                  color: v.color || '',
                  brand_name: v.brand_name || '',
                  last_cost: v.last_cost || v.cost_price || 0,
                  variants: [],  // todas las tallas de este color
                }
                map[key].variants.push(v)
              })
              return Object.values(map)
            })()

            // Filtrar grupos por búsqueda y marca
            const filteredGroups = colorGroups.filter(g => {
              const q = catQ.toLowerCase()
              const matchQ = !q || g.product_name?.toLowerCase().includes(q) ||
                g.color?.toLowerCase().includes(q) || g.brand_name?.toLowerCase().includes(q) ||
                g.variants.some(v => v.variant_sku?.toLowerCase().includes(q))
              const matchBrand = !catBrand || g.brand_name === catBrand
              return matchQ && matchBrand
            })

            // IDs de variantes ya en el carrito
            const cartIds = new Set(po.items.map(it => String(it.variant_id)))

            // Estado de selección de un grupo: 'none' | 'partial' | 'all'
            const groupSel = (g) => {
              const total = g.variants.length
              const inCart = g.variants.filter(v => cartIds.has(String(v.id))).length
              return inCart === 0 ? 'none' : inCart === total ? 'all' : 'partial'
            }

            // Toggle grupo en catálogo → agrega/quita TODAS las tallas del color
            const toggleGroup = (g) => {
              const sel = groupSel(g)
              if (sel === 'all') {
                // Quitar todas las variantes del grupo
                const groupIds = new Set(g.variants.map(v => String(v.id)))
                setPo(p => ({ ...p, items: p.items.filter(it => !groupIds.has(String(it.variant_id))) }))
              } else {
                // Agregar las que faltan
                const missing = g.variants.filter(v => !cartIds.has(String(v.id)))
                setPo(p => ({ ...p, items: [...p.items, ...missing.map(v => ({
                  variant_id: v.id,
                  qty_ordered: 1,
                  unit_cost: n(v.last_cost || v.cost_price || 0),
                  _brand: v.brand_name || '',
                  _name: v.product_name || '',
                  _sku: v.variant_sku || '',
                  _size: v.size || '',
                  _color: v.color || '',
                }))] }))
              }
            }

            // Replicar solo el COSTO UNITARIO a los demás ítems del mismo grupo (producto+color)
            const replicateItem = (srcIdx) => {
              const src = po.items[srcIdx]
              const srcV = poVariants.find(pv => String(pv.id) === String(src.variant_id))
              const srcGroup = `${srcV?.product_name || src._name}||${srcV?.color || src._color}`
              setPo(p => ({
                ...p,
                items: p.items.map((it, i) => {
                  if (i === srcIdx) return it
                  const v = poVariants.find(pv => String(pv.id) === String(it.variant_id))
                  const itGroup = `${v?.product_name || it._name}||${v?.color || it._color}`
                  return itGroup === srcGroup ? { ...it, unit_cost: src.unit_cost } : it
                })
              }))
            }

            const goStep = (s) => {
              if (s === 1) {
                if (!po.supplier_id) return notify('Selecciona un proveedor', 'error')
                if (!po.branch_id)   return notify('Selecciona la sucursal destino', 'error')
              }
              if (s === 2) {
                if (po.items.length === 0) return notify('Selecciona al menos un producto del catálogo', 'error')
              }
              if (s === 3) {
                if (po.items.some(it => n(it.unit_cost) <= 0)) return notify('El costo unitario es obligatorio en todos los ítems', 'error')
                if (po.items.some(it => n(it.qty_ordered) <= 0)) return notify('La cantidad debe ser mayor a cero en todos los ítems', 'error')
              }
              setOcStep(s)
            }

            const isEditMode = !!editingPoId
            const closePO = () => { setPo(emptyPO); setShowPO(false); setPoVariants(allVariants); setEditingPoId(null) }

            const doSave = async (asDraft) => {
              const itemsPayload = po.items.map(it => ({ variant_id: Number(it.variant_id), qty_ordered: n(it.qty_ordered), unit_cost: n(it.unit_cost) }))
              try {
                if (isEditMode) {
                  // Modo edición: actualizar solicitud existente
                  const patchData = {
                    supplier_id: Number(po.supplier_id),
                    branch_id: po.branch_id,
                    currency: po.currency,
                    note: po.note || null,
                    expected_at: po.expected_at || null,
                    items: itemsPayload,
                    status: asDraft ? undefined : 'sent',
                  }
                  const res = await api.updatePo(editingPoId, patchData)
                  if (!asDraft && res.po_no) {
                    notify(`Solicitud confirmada como ${res.po_no}`)
                  } else {
                    notify('Solicitud de compra actualizada')
                  }
                } else {
                  // Modo creación
                  const res = await api.createPurchaseOrder({
                    supplier_id: Number(po.supplier_id), branch_id: po.branch_id, currency: po.currency,
                    note: po.note || null, expected_at: po.expected_at || null,
                    status: asDraft ? 'draft' : 'sent',
                    items: itemsPayload,
                  })
                  notify(asDraft
                    ? `Solicitud ${res.po_no || ''} guardada como borrador`
                    : `Orden ${res.po_no || ''} creada · ${formatMoney(res.total, po.currency)}`)
                }
                setPo(emptyPO); setShowPO(false); setEditingPoId(null); refresh(); setPoVariants(allVariants)
              } catch (err) { notify(err.message, 'error') }
            }

            const BTN = { base: { height: 40, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '0 20px', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' } }

            return (
              <div className="modal-bg" onClick={e => e.target === e.currentTarget && closePO()}>
                <div style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 860,
                  maxHeight: '94vh', display: 'flex', flexDirection: 'column',
                  boxShadow: '0 24px 80px rgba(0,0,0,.35)', overflow: 'hidden' }}>

                  {/* ── Header con stepper ── */}
                  <div style={{ padding: '16px 22px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)', marginBottom: 10 }}>
                        {isEditMode ? '✏️ Editar solicitud de compra' : '🧾 Nueva orden de compra'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                        {WIZ.map((label, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{
                                width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 10, fontWeight: 800, flexShrink: 0,
                                background: i < ocStep ? '#15803d' : i === ocStep ? 'var(--brand)' : 'var(--surface-2)',
                                color: i <= ocStep ? '#fff' : 'var(--muted)',
                                border: i > ocStep ? '1.5px solid var(--border)' : 'none',
                              }}>{i < ocStep ? '✓' : i + 1}</div>
                              <span style={{ fontSize: 11, fontWeight: 600,
                                color: i === ocStep ? 'var(--brand)' : i < ocStep ? '#15803d' : 'var(--muted)' }}>{label}</span>
                            </div>
                            {i < WIZ.length - 1 && (
                              <div style={{ width: 24, height: 2, background: i < ocStep ? '#15803d' : 'var(--border)', margin: '0 6px', flexShrink: 0 }} />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <Ib icon="close" tip="Cancelar" variant="ghost" onClick={closePO} />
                  </div>

                  {/* ── Paso 0: Encabezado ── */}
                  {ocStep === 0 && (
                    <div style={{ flex: 1, overflowY: 'auto', padding: '22px 26px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>

                        {/* Proveedor — buscador typeahead */}
                        <div style={{ gridColumn: 'span 2' }}>
                          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>PROVEEDOR *</label>
                          {selSupp ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8,
                              border: '2px solid var(--brand)' }}>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 14 }}>{selSupp.name}</div>
                                {poVariants.length > 0 && (
                                  <div style={{ fontSize: 11, color: 'var(--brand)', marginTop: 2 }}>
                                    🏷️ {[...new Set(poVariants.map(v => v.brand_name).filter(Boolean))].join(', ')} · {poVariants.length} variante(s)
                                  </div>
                                )}
                                {poVariants.length === 0 && !loadingVariants && (
                                  <div style={{ fontSize: 11, color: '#d97706', marginTop: 2 }}>⚠️ Sin productos asociados</div>
                                )}
                                {loadingVariants && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Cargando productos…</div>}
                              </div>
                              <button type="button" onClick={() => { onSupplierChange(''); setSuppQ('') }}
                                style={{ ...BTN.base, height: 30, padding: '0 12px', fontSize: 12, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--muted)' }}>
                                Cambiar
                              </button>
                            </div>
                          ) : (
                            <div style={{ border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                                <input
                                  autoFocus
                                  placeholder="🔍 Buscar proveedor por nombre…"
                                  value={suppQ}
                                  onChange={e => setSuppQ(e.target.value)}
                                  style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 13, outline: 'none', color: 'var(--text)' }}
                                />
                              </div>
                              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                                {filteredSupps.length === 0
                                  ? <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--muted)' }}>Sin resultados para "{suppQ}"</div>
                                  : filteredSupps.map(s => (
                                    <div key={s.id}
                                      onClick={() => { onSupplierChange(String(s.id)); setSuppQ('') }}
                                      style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                                        borderBottom: '1px solid var(--border)', color: 'var(--text)',
                                        transition: 'background .1s' }}
                                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                      {s.name}
                                    </div>
                                  ))
                                }
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Sucursal */}
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>SUCURSAL DESTINO *</label>
                          <select value={po.branch_id} onChange={e => setPo({ ...po, branch_id: e.target.value })}
                            style={{ width: '100%', height: 40, fontSize: 13, borderRadius: 8, border: '1.5px solid var(--border)', padding: '0 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                            <option value="">— seleccionar —</option>
                            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                          </select>
                        </div>

                        {/* Moneda */}
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>MONEDA</label>
                          <select value={po.currency} onChange={e => setPo({ ...po, currency: e.target.value })}
                            style={{ width: '100%', height: 40, fontSize: 13, borderRadius: 8, border: '1.5px solid var(--border)', padding: '0 12px', background: 'var(--surface)', color: 'var(--text)' }}>
                            {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                          </select>
                        </div>

                        {/* Entrega esperada */}
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>ENTREGA ESPERADA</label>
                          <input type="date" value={po.expected_at}
                            onChange={e => setPo({ ...po, expected_at: e.target.value })}
                            style={{ width: '100%', height: 40, fontSize: 13, borderRadius: 8, border: '1.5px solid var(--border)', padding: '0 12px', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }} />
                        </div>

                        {/* Notas */}
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>NOTAS / CONDICIONES</label>
                          <input placeholder="Condiciones de pago, instrucciones especiales…"
                            value={po.note} onChange={e => setPo({ ...po, note: e.target.value })}
                            style={{ width: '100%', height: 40, fontSize: 13, borderRadius: 8, border: '1.5px solid var(--border)', padding: '0 12px', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }} />
                        </div>

                      </div>
                    </div>
                  )}

                  {/* ── Paso 1: Catálogo por color ── */}
                  {ocStep === 1 && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                      {/* Barra filtros */}
                      <div style={{ padding: '10px 22px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)',
                        display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                        <input
                          placeholder="🔍 Buscar producto, color, SKU…"
                          value={catQ} onChange={e => setCatQ(e.target.value)}
                          style={{ flex: 1, minWidth: 180, height: 34, borderRadius: 7, border: '1.5px solid var(--border)',
                            padding: '0 12px', background: 'var(--surface)', fontSize: 13, color: 'var(--text)' }} />
                        <select value={catBrand} onChange={e => setCatBrand(e.target.value)}
                          style={{ height: 34, borderRadius: 7, border: '1.5px solid var(--border)', padding: '0 10px', background: 'var(--surface)', fontSize: 12, color: 'var(--text)' }}>
                          <option value="">Todas las marcas</option>
                          {catBrands.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                        <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {filteredGroups.length} producto(s) · <strong style={{ color: 'var(--brand)' }}>{cartIds.size} talla(s) en pedido</strong>
                        </span>
                      </div>

                      {/* Catálogo en grid — una tarjeta por producto+color */}
                      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 22px' }}>
                        {poVariants.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
                            <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
                            <div style={{ fontWeight: 600 }}>Sin productos para este proveedor</div>
                            <div style={{ fontSize: 12, marginTop: 4 }}>Asocia marcas en <strong>Configuración → Marcas</strong></div>
                          </div>
                        ) : filteredGroups.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)', fontSize: 13 }}>Sin resultados para "{catQ}"</div>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
                            {filteredGroups.map(g => {
                              const sel = groupSel(g)
                              const isAll = sel === 'all'
                              const isPartial = sel === 'partial'
                              const nSizes = g.variants.length
                              const nIn = g.variants.filter(v => cartIds.has(String(v.id))).length
                              return (
                                <div key={g.key}
                                  onClick={() => toggleGroup(g)}
                                  style={{
                                    padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                                    border: isAll ? '2px solid var(--brand)' : isPartial ? '2px solid #f59e0b' : '1.5px solid var(--border)',
                                    background: isAll ? 'var(--surface-2)' : 'var(--surface)',
                                    transition: 'all .12s', position: 'relative',
                                  }}>
                                  {/* Indicador selección */}
                                  <div style={{ position: 'absolute', top: 8, right: 8, width: 20, height: 20,
                                    borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 10, fontWeight: 800,
                                    background: isAll ? 'var(--brand)' : isPartial ? '#f59e0b' : 'var(--surface-2)',
                                    color: (isAll || isPartial) ? '#fff' : 'var(--muted)',
                                    border: (!isAll && !isPartial) ? '1.5px solid var(--border)' : 'none',
                                  }}>
                                    {isAll ? '✓' : isPartial ? nIn : ''}
                                  </div>
                                  <div style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 700, marginBottom: 4 }}>{g.brand_name || '—'}</div>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3, marginBottom: 6, paddingRight: 24 }}>{g.product_name}</div>
                                  {g.color && (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)',
                                        background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 12, border: '1px solid var(--border)' }}>
                                        {g.color}
                                      </span>
                                    </div>
                                  )}
                                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: g.last_cost > 0 ? 4 : 0 }}>
                                    {nSizes} talla(s): {g.variants.map(v => v.size || '—').join(', ')}
                                  </div>
                                  {g.last_cost > 0 && (
                                    <div style={{ fontSize: 11, color: '#15803d', fontWeight: 600 }}>
                                      Último costo: {formatMoney(g.last_cost, po.currency)}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {/* Footer selección */}
                      {cartIds.size > 0 && (
                        <div style={{ padding: '10px 22px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand)' }}>
                            ✓ {cartIds.size} talla(s) seleccionada(s) en {[...new Set(po.items.map(it => it._name || ''))].filter(Boolean).length || po.items.length} producto(s)
                          </span>
                          <button type="button" onClick={() => goStep(2)}
                            style={{ ...BTN.base, background: 'var(--brand)', color: '#fff', border: 'none', height: 36 }}>
                            Continuar → Ajustar cantidades
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Paso 2: Cantidades y costos ── */}
                  {ocStep === 2 && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                      {/* Sub-header con hint replicar */}
                      <div style={{ padding: '8px 22px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {po.items.length} ítem(s) · {po.items.reduce((s, it) => s + n(it.qty_ordered), 0)} uds. ·{' '}
                          <strong style={{ color: 'var(--brand)' }}>{formatMoney(poTotal, po.currency)}</strong>
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                          💡 <strong>Replicar costo</strong> copia el precio a todas las tallas del mismo color
                        </span>
                      </div>
                      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 22px' }}>
                        <div className="table-wrap" style={{ margin: 0 }}>
                          <table>
                            <thead>
                              <tr>
                                <th style={{ minWidth: 180 }}>Producto</th>
                                <th style={{ width: 60, textAlign: 'center', fontSize: 11 }}>Talla</th>
                                <th style={{ width: 60, textAlign: 'center', fontSize: 11 }}>Color</th>
                                <th style={{ width: 90, textAlign: 'center' }}>Cantidad *</th>
                                <th style={{ width: 130, textAlign: 'right' }}>Costo unit. *</th>
                                <th style={{ width: 110, textAlign: 'right' }}>Total</th>
                                <th style={{ width: 110, textAlign: 'center' }}>Replicar</th>
                                <th style={{ width: 36 }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {po.items.map((it, i) => {
                                const v = poVariants.find(pv => String(pv.id) === String(it.variant_id))
                                const lineTotal = n(it.qty_ordered) * n(it.unit_cost)
                                const costErr = n(it.unit_cost) <= 0
                                const qtyErr  = n(it.qty_ordered) <= 0
                                // Separador visual entre grupos de color
                                const prevIt = po.items[i - 1]
                                const prevV  = prevIt ? poVariants.find(pv => String(pv.id) === String(prevIt.variant_id)) : null
                                const curGroup  = `${v?.product_name || it._name}||${v?.color || it._color}`
                                const prevGroup = prevIt ? `${prevV?.product_name || prevIt._name}||${prevV?.color || prevIt._color}` : null
                                const isNewGroup = i === 0 || curGroup !== prevGroup
                                return (
                                  <Fragment key={i}>
                                    {isNewGroup && i > 0 && (
                                      <tr>
                                        <td colSpan="8" style={{ padding: '4px 0', background: 'transparent', border: 'none' }}>
                                          <div style={{ height: 1, background: 'var(--border)' }} />
                                        </td>
                                      </tr>
                                    )}
                                    <tr style={{ background: isNewGroup ? 'var(--surface-2)' : undefined }}>
                                      <td style={{ padding: '6px 8px' }}>
                                        {isNewGroup && (
                                          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                                            {v?.product_name || it._name || '—'}
                                          </div>
                                        )}
                                        {!isNewGroup && (
                                          <div style={{ width: 16, height: 16, borderLeft: '2px solid var(--border)', marginLeft: 8 }} />
                                        )}
                                        {isNewGroup && (v?.brand_name || it._brand) && (
                                          <div style={{ fontSize: 10, color: 'var(--brand)', fontWeight: 600, marginTop: 1 }}>
                                            🏷️ {v?.brand_name || it._brand}
                                          </div>
                                        )}
                                      </td>
                                      <td style={{ textAlign: 'center', padding: '6px 4px', fontSize: 12, fontWeight: 700 }}>
                                        {v?.size || it._size || '—'}
                                      </td>
                                      <td style={{ textAlign: 'center', padding: '6px 4px', fontSize: 12 }}>
                                        {v?.color || it._color
                                          ? <span style={{ padding: '2px 6px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 11 }}>{v?.color || it._color}</span>
                                          : '—'}
                                      </td>
                                      <td style={{ textAlign: 'center', padding: '6px 4px' }}>
                                        <input type="number" min="1" step="1" value={it.qty_ordered}
                                          onChange={e => setItem(i, 'qty_ordered', e.target.value)}
                                          style={{ width: '100%', height: 34, textAlign: 'center', borderRadius: 7,
                                            border: `1.5px solid ${qtyErr ? '#dc2626' : 'var(--border)'}`,
                                            background: 'var(--surface)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
                                      </td>
                                      <td style={{ padding: '6px 4px' }}>
                                        <input type="number" step="0.01" min="0.01" value={it.unit_cost}
                                          onChange={e => setItem(i, 'unit_cost', e.target.value)}
                                          style={{ width: '100%', height: 34, textAlign: 'right', borderRadius: 7,
                                            border: `1.5px solid ${costErr ? '#dc2626' : 'var(--border)'}`,
                                            background: 'var(--surface)', color: 'var(--text)', fontSize: 13,
                                            padding: '0 8px', boxSizing: 'border-box' }}
                                          placeholder="0.00" />
                                        {costErr && <div style={{ fontSize: 10, color: '#dc2626', textAlign: 'right', marginTop: 1 }}>Requerido</div>}
                                      </td>
                                      <td style={{ textAlign: 'right', fontWeight: 700, color: lineTotal > 0 ? 'var(--brand)' : 'var(--muted)', fontSize: 13, padding: '6px 8px' }}>
                                        {lineTotal > 0 ? formatMoney(lineTotal, po.currency) : '—'}
                                      </td>
                                      <td style={{ textAlign: 'center', padding: '6px 4px' }}>
                                        {po.items.length > 1 && (
                                          <button type="button" onClick={() => replicateItem(i)}
                                            title="Copiar este costo unitario a todas las tallas del mismo color"
                                            style={{ height: 28, padding: '0 8px', borderRadius: 6, border: '1.5px solid var(--border)',
                                              background: 'var(--surface-2)', color: 'var(--text)', cursor: 'pointer',
                                              fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                            ⊙ Replicar costo
                                          </button>
                                        )}
                                      </td>
                                      <td style={{ padding: '6px 4px' }}>
                                        <Ib icon="delete" tip="Quitar ítem" variant="danger" onClick={() => rmItem(i)} />
                                      </td>
                                    </tr>
                                  </Fragment>
                                )
                              })}
                            </tbody>
                            <tfoot>
                              <tr>
                                <td colSpan="3" style={{ padding: '10px 8px', fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                                  {po.items.length} ítem(s) · {po.items.reduce((s, it) => s + n(it.qty_ordered), 0)} uds.
                                </td>
                                <td colSpan="2" style={{ textAlign: 'right', fontSize: 12, color: 'var(--muted)', padding: '10px 8px', fontWeight: 600 }}>Total orden:</td>
                                <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 15, color: 'var(--brand)', padding: '10px 8px' }}>
                                  {formatMoney(poTotal, po.currency)}
                                </td>
                                <td colSpan="2" />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Paso 3: Confirmar ── */}
                  {ocStep === 3 && (
                    <div style={{ flex: 1, overflowY: 'auto', padding: '22px 26px' }}>
                      {/* Ficha encabezado */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                        {[
                          { label: 'Proveedor', val: selSupp?.name },
                          { label: 'Sucursal', val: branches.find(b => b.id === po.branch_id)?.name },
                          { label: 'Moneda', val: po.currency },
                          { label: 'Entrega esperada', val: po.expected_at || '—' },
                          po.note ? { label: 'Notas', val: po.note, span: 2 } : null,
                        ].filter(Boolean).map(({ label, val, span }) => (
                          <div key={label} style={{ gridColumn: span ? `span ${span}` : undefined,
                            background: 'var(--surface-2)', borderRadius: 8, padding: '10px 14px' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.06em', marginBottom: 3 }}>{label.toUpperCase()}</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{val}</div>
                          </div>
                        ))}
                      </div>

                      {/* Tabla resumen ítems */}
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.05em', marginBottom: 8 }}>
                        ÍTEMS DE LA ORDEN ({po.items.length})
                      </div>
                      <div className="table-wrap" style={{ margin: 0, marginBottom: 18 }}>
                        <table>
                          <thead>
                            <tr>
                              <th>Producto / Variante</th>
                              <th style={{ textAlign: 'center', width: 80 }}>Cant.</th>
                              <th style={{ textAlign: 'right', width: 120 }}>Costo unit.</th>
                              <th style={{ textAlign: 'right', width: 130 }}>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {po.items.map((it, i) => {
                              const v = poVariants.find(pv => String(pv.id) === String(it.variant_id))
                              return (
                                <tr key={i}>
                                  <td>
                                    <div style={{ fontWeight: 600, fontSize: 13 }}>{v?.product_name || it._name || '—'}</div>
                                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>
                                      <code>{v?.variant_sku || it._sku}</code>
                                      {(v?.size || it._size) ? ` · T${v?.size || it._size}` : ''}
                                      {(v?.color || it._color) ? ` · ${v?.color || it._color}` : ''}
                                    </div>
                                  </td>
                                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{n(it.qty_ordered)}</td>
                                  <td style={{ textAlign: 'right', color: 'var(--muted)', fontSize: 12 }}>{formatMoney(it.unit_cost, po.currency)}</td>
                                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--brand)' }}>
                                    {formatMoney(n(it.qty_ordered) * n(it.unit_cost), po.currency)}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td colSpan="2" style={{ padding: '10px 8px', fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                                {po.items.length} ítem(s) · {po.items.reduce((s, it) => s + n(it.qty_ordered), 0)} uds.
                              </td>
                              <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--muted)', padding: '10px 8px', fontWeight: 600 }}>Total OC:</td>
                              <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 16, color: 'var(--brand)', padding: '10px 8px' }}>
                                {formatMoney(poTotal, po.currency)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {/* Nota informativa */}
                      <div style={{ padding: '12px 16px', background: '#fef9c3', borderRadius: 10,
                        border: '1.5px solid #fde68a', fontSize: 13, color: '#854d0e', lineHeight: 1.5 }}>
                        💡 Al guardar se crea una <strong>Solicitud de compra</strong> (borrador) con número <strong>SC-</strong>.<br/>
                        Para convertirla en Orden de Compra, usa el botón <strong>✓ Confirmar como OC</strong> desde la lista o el detalle.
                      </div>
                    </div>
                  )}

                  {/* ── Footer navegación ── */}
                  <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', flexShrink: 0,
                    display: 'flex', gap: 10, alignItems: 'center', background: 'var(--surface)' }}>
                    {ocStep > 0 && (
                      <button type="button" onClick={() => setOcStep(ocStep - 1)}
                        style={{ ...BTN.base, border: '1.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }}>
                        ← Atrás
                      </button>
                    )}
                    <button type="button" onClick={closePO}
                      style={{ ...BTN.base, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--muted)', marginRight: 'auto' }}>
                      Cancelar
                    </button>
                    {ocStep < 3 ? (
                      <button type="button" onClick={() => goStep(ocStep + 1)}
                        style={{ ...BTN.base, background: 'var(--brand)', color: '#fff', border: 'none', minWidth: 140 }}>
                        Siguiente →
                      </button>
                    ) : (
                      <button type="button" onClick={() => doSave(true)}
                        style={{ ...BTN.base, background: 'var(--brand)', color: '#fff', border: 'none', minWidth: 200 }}>
                        📋 {isEditMode ? 'Guardar cambios' : 'Guardar solicitud de compra'}
                      </button>
                    )}
                  </div>

                </div>
              </div>
            )
          })()}

          {/* ── Header ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
            <div>
              <h3 style={{ margin: 0, fontWeight: 800, fontSize: 15 }}>Órdenes de compra</h3>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--muted)' }}>Abre una orden para registrar entradas de almacén y recepciones</p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button onClick={() => setShowSuggestions(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px',
                  borderRadius: 8, border: '1.5px solid var(--border)', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', background: 'var(--surface-2)', color: 'var(--text)' }}>
                🔄 Reabastecimiento
              </button>
              <button onClick={() => { setPo(emptyPO); setShowPO(true) }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 18px',
                  borderRadius: 8, border: 'none', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  background: 'var(--brand)', color: '#fff' }}>
                ＋ Nueva orden
              </button>
            </div>
          </div>

          {/* ── KPIs ── */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Total órdenes',  val: orders.length,                                                              icon: '🧾', color: null },
              { label: 'Pendientes',      val: orders.filter(o => ['draft','sent','partial'].includes(o.status)).length,  icon: '⏳', color: '#d97706' },
              { label: 'Completadas',     val: orders.filter(o => ['received','closed'].includes(o.status)).length,       icon: '✅', color: '#16a34a' },
              { label: 'Valor comprado',  val: formatMoney(orders.reduce((s,o) => s + n(o.total), 0), defCur),            icon: '💰', color: null },
            ].map(({ label, val, icon, color }) => (
              <div key={label} style={{ flex: '1 0 130px', background: 'var(--surface-2)', borderRadius: 12, padding: '12px 16px', minWidth: 120 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500, marginBottom: 6 }}>{icon} {label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: color && val > 0 ? color : 'var(--text)' }}>{val}</div>
              </div>
            ))}
          </div>

          {/* ── Modal reabastecimiento ── */}
          {showSuggestions && (
            <div className="modal-bg" onClick={e => e.target === e.currentTarget && setShowSuggestions(false)}
              style={{ zIndex: 1300 }}>
              <div style={{ background: 'var(--surface)', borderRadius: 14, width: '92vw', maxWidth: 900,
                maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
                boxShadow: '0 20px 60px rgba(0,0,0,.18)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>🔄 Sugerencias de reabastecimiento</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Variantes bajo stock mínimo — genera órdenes automáticamente</div>
                  </div>
                  <Ib icon="close" tip="Cerrar" variant="ghost" onClick={() => setShowSuggestions(false)} />
                </div>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  <Reabastecimiento branches={branches} notify={notify} onGenerated={() => { refresh(); setShowSuggestions(false) }} />
                </div>
              </div>
            </div>
          )}


          {/* ── Hint cuando hay órdenes activas ── */}
          {!showPO && orders.some(o => ['draft','sent','partial'].includes(o.status)) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              background: 'rgba(79,70,229,.06)', border: '1px solid rgba(79,70,229,.2)',
              borderRadius: 8, marginBottom: 14, fontSize: 13, color: 'var(--text-1)' }}>
              <span style={{ fontSize: 18 }}>📦</span>
              <span>Tienes <strong>{orders.filter(o => ['draft','sent','partial'].includes(o.status)).length} orden(es) activa(s)</strong>. Ábrelas para registrar recepciones y entradas de almacén.</span>
            </div>
          )}

          {/* ── Filtros + tabla de órdenes ── */}
          {(() => {
            // ── Estados de filtro/orden/paginación ──
            const [poFilterSupp,   setPoFilterSupp]   = [po._fSupp   ?? '', v => setPo(p => ({...p, _fSupp:   v, _pg: 1}))]
            const [poFilterBranch, setPoFilterBranch] = [po._fBranch ?? '', v => setPo(p => ({...p, _fBranch: v, _pg: 1}))]
            const [poFilterStatus, setPoFilterStatus] = [po._fStatus ?? '', v => setPo(p => ({...p, _fStatus: v, _pg: 1}))]
            const [poSort,         setPoSort]         = [po._sort    ?? 'id_desc', v => setPo(p => ({...p, _sort: v, _pg: 1}))]
            const poPgSz = po._pgSz ?? 25
            const poPg   = po._pg   ?? 1
            const setPoPg   = v => setPo(p => ({...p, _pg:   v}))
            const setPoPgSz = v => setPo(p => ({...p, _pgSz: v, _pg: 1}))

            const uniqSupps    = [...new Set(orders.map(o => o.supplier_name).filter(Boolean))].sort()
            const uniqBranches = [...new Set(orders.map(o => o.branch_name).filter(Boolean))].sort()

            const filtered = orders.filter(o =>
              (!poFilterSupp   || o.supplier_name === poFilterSupp) &&
              (!poFilterBranch || o.branch_name   === poFilterBranch) &&
              (!poFilterStatus || o.status        === poFilterStatus)
            ).sort((a, b) => {
              if (poSort === 'id_desc')       return b.id - a.id
              if (poSort === 'id_asc')        return a.id - b.id
              if (poSort === 'total_desc')    return n(b.total) - n(a.total)
              if (poSort === 'total_asc')     return n(a.total) - n(b.total)
              if (poSort === 'expected_asc')  return (a.expected_at||'9') < (b.expected_at||'9') ? -1 : 1
              if (poSort === 'expected_desc') return (a.expected_at||'0') > (b.expected_at||'0') ? -1 : 1
              return 0
            })

            const hasFilters  = poFilterSupp || poFilterBranch || poFilterStatus
            const totalPages  = Math.max(1, Math.ceil(filtered.length / poPgSz))
            const safePg      = Math.min(poPg, totalPages)
            const pageRows    = filtered.slice((safePg - 1) * poPgSz, safePg * poPgSz)

            // Componente de cabecera ordenable
            const SortTh = ({ label, sortAsc, sortDesc, style: s, children }) => {
              const isAsc  = poSort === sortAsc
              const isDesc = poSort === sortDesc
              const active = isAsc || isDesc
              return (
                <th style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...s }}
                  onClick={() => setPoSort(isDesc ? sortAsc : sortDesc)}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {children || label}
                    <span style={{ fontSize: 10, color: active ? 'var(--brand)' : 'var(--border)', fontWeight: 400, lineHeight: 1 }}>
                      {isAsc ? '▲' : isDesc ? '▼' : '⇅'}
                    </span>
                  </span>
                </th>
              )
            }

            // Cabecera con dropdown de filtro
            const FilterTh = ({ label, value, onChange, options, style: s }) => {
              const active = !!value
              return (
                <th style={{ padding: '6px 8px', ...s }}>
                  <select value={value} onChange={e => onChange(e.target.value)}
                    style={{ width: '100%', fontSize: 11, fontWeight: active ? 700 : 600,
                      border: active ? '1.5px solid var(--brand)' : '1px solid var(--border)',
                      borderRadius: 6, padding: '3px 6px', background: active ? 'var(--brand-soft, #eef2ff)' : 'var(--surface-2)',
                      color: active ? 'var(--brand)' : 'var(--text)', cursor: 'pointer', outline: 'none' }}>
                    <option value="">{label}</option>
                    {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </th>
              )
            }

            return (
              <>
                {/* Barra de filtros activos */}
                {hasFilters && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Filtros:</span>
                    {poFilterSupp   && <span style={{ fontSize: 12, background: '#eef2ff', color: 'var(--brand)', borderRadius: 6, padding: '2px 10px', fontWeight: 600 }}>Proveedor: {poFilterSupp}</span>}
                    {poFilterBranch && <span style={{ fontSize: 12, background: '#eef2ff', color: 'var(--brand)', borderRadius: 6, padding: '2px 10px', fontWeight: 600 }}>Sucursal: {poFilterBranch}</span>}
                    {poFilterStatus && <span style={{ fontSize: 12, background: '#eef2ff', color: 'var(--brand)', borderRadius: 6, padding: '2px 10px', fontWeight: 600 }}>Estado: {poFilterStatus}</span>}
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>· {filtered.length} de {orders.length} orden(es)</span>
                    <button onClick={() => { setPoFilterSupp(''); setPoFilterBranch(''); setPoFilterStatus('') }}
                      style={{ fontSize: 11, padding: '2px 10px', borderRadius: 6, border: '1px solid var(--border)',
                        background: 'var(--surface)', cursor: 'pointer', color: 'var(--muted)' }}>
                      × Limpiar
                    </button>
                  </div>
                )}

                <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <div className="table-wrap" style={{ borderRadius: 0, border: 'none' }}>
                  {orders.length === 0
                    ? <EmptyState icon="🧾" text="Sin órdenes aún" sub='Crea tu primera orden con el botón "+ Nueva orden"' />
                    : (
                      <table>
                        <thead>
                          <tr>
                            <SortTh sortAsc="id_asc" sortDesc="id_desc" style={{ width: 100 }}>#</SortTh>
                            <FilterTh label="Proveedor" value={poFilterSupp} onChange={setPoFilterSupp}
                              options={uniqSupps.map(s => ({ v: s, l: s }))} />
                            <FilterTh label="Sucursal" value={poFilterBranch} onChange={setPoFilterBranch}
                              options={uniqBranches.map(s => ({ v: s, l: s }))} />
                            <th style={{ textAlign: 'center', width: 60, fontSize: 12 }}>Ítems</th>
                            <th style={{ textAlign: 'center', width: 80, fontSize: 12 }}>Cant. total</th>
                            <SortTh sortAsc="total_asc" sortDesc="total_desc" style={{ textAlign: 'right', width: 120 }}>Total</SortTh>
                            <th style={{ width: 150, fontSize: 12 }}>Recepción</th>
                            <FilterTh label="Estado" value={poFilterStatus} onChange={setPoFilterStatus}
                              options={[
                                { v: 'draft',     l: 'Solicitud' },
                                { v: 'sent',      l: 'Creada' },
                                { v: 'partial',   l: 'Parcial' },
                                { v: 'received',  l: 'Completa' },
                                { v: 'closed',    l: 'Cerrada' },
                                { v: 'cancelled', l: 'Anulada' },
                              ]} />
                            <SortTh sortAsc="expected_asc" sortDesc="expected_desc" style={{ width: 110, fontSize: 12 }}>Entrega esp.</SortTh>
                            <th style={{ width: 110 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.length === 0 ? (
                            <tr><td colSpan="10" style={{ textAlign: 'center', padding: 30, color: 'var(--muted)', fontSize: 13 }}>
                              Sin resultados para los filtros seleccionados
                            </td></tr>
                          ) : pageRows.map(o => {
                      const isActive = !['received','closed','cancelled'].includes(o.status)
                      return (
                        <tr key={o.id}
                          onClick={() => setDetailModal(o.id)}
                          style={{ cursor: 'pointer', background: o.status === 'draft' ? '#fefce8' : undefined }}
                          title="Clic para ver detalle, recepciones y entradas">
                          <td>
                            <span className="row-id"
                              style={o.status === 'draft' ? { background: '#fef9c3', color: '#a16207', borderColor: '#fde68a' } : {}}>
                              {o.po_no || (o.status === 'draft' ? 'SC-' : 'OC-')+String(o.id).padStart(6,'0')}
                            </span>
                          </td>
                          <td><strong>{o.supplier_name}</strong></td>
                          <td>
                            {o.branch_name
                              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
                                  borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)',
                                  fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  🏪 {o.branch_name}
                                </span>
                              : <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>}
                          </td>
                          <td style={{ textAlign: 'center', fontSize: 13, fontWeight: 600 }}>{o.lines}</td>
                          <td style={{ textAlign: 'center', fontSize: 13, fontWeight: 700 }}>
                            {n(o.qty_total || 0).toLocaleString()}
                            <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>uds.</div>
                          </td>
                          <td style={{ textAlign: 'right' }}><strong>{formatMoney(o.total, o.currency)}</strong></td>
                          <td style={{ padding: '6px 10px', minWidth: 140 }}>{(() => {
                            const qtyT = n(o.qty_total || 0), qtyR = n(o.qty_received_total || 0)
                            const totT = n(o.total || 0), totR = n(o.total_received || 0)
                            const pQ = qtyT > 0 ? Math.round(qtyR / qtyT * 100) : 0
                            const pC = totT > 0 ? Math.round(totR / totT * 100) : 0
                            const barColor = (p) => p >= 100 ? '#15803d' : p > 0 ? '#f59e0b' : '#e2e8f0'
                            return (
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>
                                  <span>Uds.</span><span style={{ fontWeight: 600 }}>{qtyR}/{qtyT} · {pQ}%</span>
                                </div>
                                <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', marginBottom: 4 }}>
                                  <div style={{ height: '100%', width: `${pQ}%`, background: barColor(pQ), transition: 'width .3s' }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>
                                  <span>Costo</span><span style={{ fontWeight: 600 }}>{pC}%</span>
                                </div>
                                <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${pC}%`, background: pC >= 100 ? '#15803d' : pC > 0 ? '#3b82f6' : '#e2e8f0', transition: 'width .3s' }} />
                                </div>
                              </div>
                            )
                          })()}</td>
                          <td><PoBadge status={o.status} /></td>
                          <td style={{ fontSize: 12, color: 'var(--muted)' }}>{o.expected_at ? o.expected_at.slice(0, 10) : '—'}</td>
                          <td onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                              {/* Recepciones solo para OC confirmadas */}
                              {isActive && o.status !== 'draft' && (
                                <Ib icon="receive" tip="Registrar recepción" variant="primary" onClick={() => setReceiveModal(o.id)} />
                              )}
                              {/* Confirmar solicitud como OC */}
                              {o.status === 'draft' && isAdmin && (
                                <button type="button"
                                  onClick={async (e) => { e.stopPropagation(); try { const r = await api.updatePo(o.id, { status: 'sent' }); notify(`Confirmada como ${r.po_no}`); refresh() } catch(err) { notify(err.message,'error') } }}
                                  style={{ height: 30, padding: '0 10px', borderRadius: 7, border: '1.5px solid #15803d',
                                    background: '#f0fdf4', color: '#15803d', cursor: 'pointer', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                                  ✓ Confirmar OC
                                </button>
                              )}
                              <Ib icon="download" tip="Exportar CSV" variant="ghost"
                                onClick={async () => { try { await api.exportPoCsv(o.id) } catch (e) { notify(e.message, 'error') } }} />
                              {isAdmin && (
                                <>
                                  {o.status === 'draft' ? (
                                    <Ib icon="edit" tip="Editar solicitud" variant="ghost"
                                      onClick={() => openDraftEdit(o)} />
                                  ) : (
                                    <Ib icon="edit" tip="Editar OC" variant="ghost"
                                      onClick={() => setEditPoModal({ id: o.id, po_no: o.po_no || 'OC-'+String(o.id).padStart(6,'0'), note: o.note || '', expected_at: o.expected_at?.slice(0,10) || '' })} />
                                  )}
                                  {['draft','sent'].includes(o.status) && (
                                    <Ib icon="delete" tip="Eliminar" variant="danger"
                                      onClick={() => setDeletePoModal({ id: o.id, po_no: o.po_no || 'SC-'+String(o.id).padStart(6,'0') })} />
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="3" style={{ textAlign: 'right', fontWeight: 700, fontSize: 12, padding: '10px 8px', color: 'var(--muted)' }}>
                        {orders.length} orden(es) · {orders.reduce((s, o) => s + n(o.lines), 0)} ítems
                      </td>
                      <td style={{ textAlign: 'right', padding: '10px 8px', fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                        {orders.reduce((s, o) => s + n(o.qty_total || 0), 0) > 0
                          ? `${orders.reduce((s, o) => s + n(o.qty_total || 0), 0).toLocaleString()} uds.`
                          : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 14, padding: '10px 8px', color: 'var(--brand)' }}>
                        {formatMoney(orders.reduce((s, o) => s + n(o.total), 0), defCur)}
                      </td>
                      <td colSpan="4" />
                    </tr>
                  </tfoot>
                </table>
              )
            }
          </div>
          {filtered.length > 0 && (
            <Paginator
              page={safePg} pageSize={poPgSz} totalPages={totalPages} total={filtered.length}
              setPage={setPoPg} setPageSize={setPoPgSz} label="órdenes" subset={orders.length}
            />
          )}
          </div>
              </>
            )
          })()}

        </div>
      )}

      {/* ── Proveedores ── */}
      {tab === 'proveedores' && (
        <ProveedoresTab
          defCur={defCur}
          country={tenantCountry}
          notify={notify}
          onSuppliersChange={(list) => setSuppliers(list)}
        />
      )}

      {tab === 'facturacion' && <FacturacionTab notify={notify} suppliers={suppliers} isAdmin={isAdmin}
        onEditPo={(po) => setEditPoModal({ id: po.id, po_no: po.po_no || 'OC-'+String(po.id).padStart(6,'0'), note: po.note || '', expected_at: po.expected_at?.slice(0,10) || '' })}
        onDeletePo={(po) => setDeletePoModal({ id: po.id, po_no: po.po_no || 'OC-'+String(po.id).padStart(6,'0') })}
        onEditEntry={(e) => setEditEntryModal({ id: e.id, entry_no: e.entry_no, notes: e.notes || '' })}
        onDeleteEntry={(e) => setDeleteEntryModal({ id: e.id, entry_no: e.entry_no })} />}

      {/* ── Admin: Modal editar OC ── */}
      {editPoModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => e.target === e.currentTarget && setEditPoModal(null)}>
          <div style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 440,
            padding: 26, boxShadow: '0 24px 80px rgba(0,0,0,.45)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>✏️ Editar OC</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{editPoModal.po_no}</div>
              </div>
              <Ib icon="close" tip="Cerrar" variant="ghost" onClick={() => setEditPoModal(null)} />
            </div>
            <div className="form-field" style={{ marginBottom: 14 }}>
              <label>Nota / referencia interna</label>
              <input value={editPoModal.note || ''} placeholder="Observaciones de la orden…"
                onChange={e => setEditPoModal(m => ({ ...m, note: e.target.value }))} />
            </div>
            <div className="form-field" style={{ marginBottom: 22 }}>
              <label>Fecha de entrega esperada</label>
              <input type="date" value={editPoModal.expected_at || ''}
                onChange={e => setEditPoModal(m => ({ ...m, expected_at: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setEditPoModal(null)}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1.5px solid var(--border)',
                  background: 'var(--surface-2)', color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Cancelar
              </button>
              <button onClick={savePoEdit} disabled={confirmBusy}
                style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none',
                  background: 'var(--brand)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                {confirmBusy ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Admin: Modal eliminar OC ── */}
      {deletePoModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => e.target === e.currentTarget && setDeletePoModal(null)}>
          <div style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 400,
            padding: 26, boxShadow: '0 24px 80px rgba(0,0,0,.45)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <span style={{ fontSize: 28 }}>🗑️</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#dc2626' }}>Eliminar OC</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{deletePoModal.po_no}</div>
              </div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text)', margin: '0 0 6px', lineHeight: 1.5 }}>
              ¿Seguro que deseas eliminar <strong>{deletePoModal.po_no}</strong>? Esta acción es <strong>irreversible</strong>.
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 22px', lineHeight: 1.5,
              background: 'var(--surface-2)', padding: '8px 12px', borderRadius: 8 }}>
              Solo se pueden eliminar OC sin entradas de almacén registradas.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeletePoModal(null)}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1.5px solid var(--border)',
                  background: 'var(--surface-2)', color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Cancelar
              </button>
              <button onClick={confirmDeletePo} disabled={confirmBusy}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none',
                  background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                {confirmBusy ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Admin: Modal editar entrada ── */}
      {editEntryModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => e.target === e.currentTarget && setEditEntryModal(null)}>
          <div style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 440,
            padding: 26, boxShadow: '0 24px 80px rgba(0,0,0,.45)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>✏️ Editar entrada</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{editEntryModal.entry_no}</div>
              </div>
              <Ib icon="close" tip="Cerrar" variant="ghost" onClick={() => setEditEntryModal(null)} />
            </div>
            <div className="form-field" style={{ marginBottom: 22 }}>
              <label>Notas / observaciones</label>
              <input value={editEntryModal.notes || ''} placeholder="Observaciones de la entrada…"
                onChange={e => setEditEntryModal(m => ({ ...m, notes: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setEditEntryModal(null)}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1.5px solid var(--border)',
                  background: 'var(--surface-2)', color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Cancelar
              </button>
              <button onClick={saveEntryEdit} disabled={confirmBusy}
                style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none',
                  background: 'var(--brand)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                {confirmBusy ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Admin: Modal eliminar entrada ── */}
      {deleteEntryModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => e.target === e.currentTarget && setDeleteEntryModal(null)}>
          <div style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 400,
            padding: 26, boxShadow: '0 24px 80px rgba(0,0,0,.45)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <span style={{ fontSize: 28 }}>🗑️</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#dc2626' }}>Eliminar entrada</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{deleteEntryModal.entry_no}</div>
              </div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text)', margin: '0 0 6px', lineHeight: 1.5 }}>
              ¿Seguro que deseas eliminar <strong>{deleteEntryModal.entry_no}</strong>? Esta acción es <strong>irreversible</strong>.
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 22px', lineHeight: 1.5,
              background: 'var(--surface-2)', padding: '8px 12px', borderRadius: 8 }}>
              Solo se pueden eliminar entradas no contabilizadas.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteEntryModal(null)}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1.5px solid var(--border)',
                  background: 'var(--surface-2)', color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Cancelar
              </button>
              <button onClick={confirmDeleteEntry} disabled={confirmBusy}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none',
                  background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                {confirmBusy ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Reabastecimiento ── */
function Reabastecimiento({ branches, notify, onGenerated }) {
  const [branchId, setBranchId] = useState(branches[0]?.id || '')
  const [rows, setRows]         = useState(null)
  const [loading, setLoading]   = useState(false)
  const [generating, setGenerating] = useState(false)

  async function load(bid) {
    if (!bid) return
    setLoading(true); setRows(null)
    try { setRows(await api.replenishment(bid)) }
    catch (e) { notify(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { if (branchId) load(branchId) }, [branchId])

  async function generate() {
    if (!branchId) return notify('Selecciona una sucursal', 'error')
    const need = (rows || []).filter(r => r.suggested_qty > 0 && r.supplier_id)
    if (need.length === 0) return notify('Sin variantes con proveedor asignado para generar órdenes', 'error')
    setGenerating(true)
    try {
      const r = await api.generateReorders(branchId)
      const msg = r.created?.length > 0
        ? `${r.created.length} orden(es) creada(s) en borrador`
        : 'No se generaron órdenes'
      const warn = r.sin_proveedor?.length > 0 ? ` · ${r.sin_proveedor.length} variante(s) sin proveedor omitidas` : ''
      notify(msg + warn)
      setRows(null); onGenerated()
    } catch (e) { notify(e.message, 'error') }
    finally { setGenerating(false) }
  }

  const withNeed  = (rows || []).filter(r => r.suggested_qty > 0)
  const noSupp    = withNeed.filter(r => !r.supplier_id)
  const withSupp  = withNeed.filter(r => r.supplier_id)

  return (
    <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)' }}>
      {/* Controles */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <select value={branchId} onChange={e => { setBranchId(e.target.value); setRows(null) }}
          style={{ fontSize: 13, height: 34, borderRadius: 7, border: '1px solid var(--border)', padding: '0 10px', background: 'var(--surface)', color: 'var(--text)', minWidth: 160 }}>
          <option value="">— sucursal —</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <button onClick={() => load(branchId)} disabled={loading || !branchId}
          style={{ height: 34, padding: '0 14px', borderRadius: 7, border: '1px solid var(--border)',
            background: 'var(--surface)', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
          {loading ? 'Cargando…' : '↺ Actualizar'}
        </button>
        {withSupp.length > 0 && (
          <button onClick={generate} disabled={generating}
            style={{ height: 34, padding: '0 16px', borderRadius: 7, border: 'none',
              background: 'var(--brand)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            {generating ? 'Generando…' : `＋ Generar ${withSupp.length} orden(es)`}
          </button>
        )}
        {rows !== null && (
          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 4 }}>
            {withNeed.length} variante(s) bajo mínimo
            {noSupp.length > 0 && <span style={{ color: '#d97706', marginLeft: 6 }}>· {noSupp.length} sin proveedor</span>}
          </span>
        )}
      </div>

      {/* Tabla */}
      {loading && <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)', fontSize: 13 }}>Cargando sugerencias…</div>}
      {!loading && rows !== null && rows.length === 0 && (
        <div style={{ textAlign: 'center', padding: 20, color: '#15803d', fontSize: 13 }}>✅ Todos los productos están sobre su stock mínimo</div>
      )}
      {!loading && rows !== null && rows.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Producto / Variante</th>
                <th style={{ textAlign: 'center', width: 80 }}>Stock</th>
                <th style={{ textAlign: 'center', width: 80 }}>Mínimo</th>
                <th style={{ textAlign: 'center', width: 80 }}>Sugerido</th>
                <th>Proveedor</th>
                <th style={{ textAlign: 'right', width: 100 }}>Costo unit.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ opacity: r.suggested_qty <= 0 ? 0.5 : 1 }}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{r.product_name}</div>
                    <code style={{ fontSize: 10, color: 'var(--muted)' }}>{r.variant_sku}{r.size ? ` T${r.size}` : ''}{r.color ? ` ${r.color}` : ''}</code>
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: r.current_stock <= 0 ? '#dc2626' : '#c2410c' }}>{r.current_stock}</td>
                  <td style={{ textAlign: 'center', color: 'var(--muted)' }}>{r.min_stock}</td>
                  <td style={{ textAlign: 'center', fontWeight: 800, color: r.suggested_qty > 0 ? 'var(--brand)' : 'var(--muted)' }}>
                    {r.suggested_qty > 0 ? r.suggested_qty : '—'}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {r.supplier_name
                      ? <span>{r.supplier_name}</span>
                      : <span style={{ color: '#d97706', fontSize: 11 }}>⚠ Sin proveedor</span>
                    }
                  </td>
                  <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--muted)' }}>
                    {r.unit_cost > 0 ? formatMoney(r.unit_cost, r.supplier_currency || 'USD') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            {withNeed.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan="3" style={{ textAlign: 'right', fontSize: 12, color: 'var(--muted)', fontWeight: 600, padding: '8px' }}>
                    {withNeed.length} variante(s) bajo mínimo
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 800, color: 'var(--brand)', padding: '8px' }}>
                    {withNeed.reduce((s, r) => s + r.suggested_qty, 0)} uds.
                  </td>
                  <td colSpan="2" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}

/* ── Helpers ── */
const fmtDate = (s) => s ? s.slice(0, 16).replace('T', ' ') : '—'

const STATUS_META = {
  draft:    { label: 'Solicitud',  bg: '#f1f5f9', color: '#64748b' },
  sent:     { label: 'Creada',     bg: '#fef9c3', color: '#a16207' },
  partial:  { label: 'Parcial',    bg: '#fed7aa', color: '#c2410c' },
  received: { label: '✓ Completa', bg: '#dcfce7', color: '#15803d' },
  closed:   { label: '🔒 Cerrada', bg: '#e0e7ff', color: '#3730a3' },
  cancelled:{ label: 'Anulada',    bg: '#fee2e2', color: '#dc2626' },
}

const EVENT_META = {
  created:  { icon: '🆕', label: 'Creada',              color: '#64748b' },
  partial:  { icon: '📦', label: 'Recepción parcial',   color: '#c2410c' },
  received: { icon: '✅', label: 'Recepción completa',  color: '#15803d' },
  closed:   { icon: '🔒', label: 'Cerrada',             color: '#3730a3' },
  cancelled:{ icon: '❌', label: 'Anulada',             color: '#dc2626' },
}
const PoBadge = ({ status }) => {
  const m = STATUS_META[status] || STATUS_META.sent
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12, background: m.bg, color: m.color }}>{m.label}</span>
}

/* ── PO Detail Modal ── */
function PODetailModal({ poId, onClose, onOpenReceive, notify, onRefresh, isAdmin, onEditDraft, onEditPo, onDeletePo, onEditEntry, onDeleteEntry }) {
  const [po, setPo] = useState(null)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('items')
  const [actionModal, setActionModal] = useState(null) // 'close' | 'cancel'
  const [actionReason, setActionReason] = useState('')
  const [actioning, setActioning] = useState(false)
  const [entryDetail, setEntryDetail] = useState(null)

  const loadAll = () => {
    setLoading(true)
    Promise.all([
      api.getPurchaseOrder(poId),
      api.listPoEntries(poId),
    ]).then(([p, e]) => { setPo(p); setEntries(e) })
      .catch(e => { notify(e.message, 'error'); onClose() })
      .finally(() => setLoading(false))
  }

  useEffect(loadAll, [poId])

  if (loading) return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 32, color: 'var(--muted)' }}>Cargando…</div>
    </div>
  )
  if (!po) return null

  const items       = po.items || []
  const totalItems  = items.length
  const recItems    = items.filter(it => n(it.qty_received) >= n(it.qty_ordered)).length
  const pendItems   = items.filter(it => n(it.qty_received) < n(it.qty_ordered)).length
  const totalOrd    = items.reduce((s, it) => s + n(it.qty_ordered)  * n(it.unit_cost), 0)
  const totalRec    = items.reduce((s, it) => s + n(it.qty_received) * n(it.unit_cost), 0)
  const totalPend   = totalOrd - totalRec
  const qtyOrd      = items.reduce((s, it) => s + n(it.qty_ordered),  0)
  const qtyRec      = items.reduce((s, it) => s + n(it.qty_received), 0)
  const qtyPend     = qtyOrd - qtyRec
  const pctRec      = totalOrd > 0 ? Math.round(totalRec / totalOrd * 100) : 0
  const pctQty      = qtyOrd  > 0 ? Math.round(qtyRec  / qtyOrd  * 100) : 0
  const canReceive  = !['draft','received','closed','cancelled'].includes(po.status)
  const canClose    = !['draft','received','closed','cancelled'].includes(po.status)
  const canCancel   = !['draft','received','closed','cancelled'].includes(po.status) && entries.length === 0
  const canConfirm  = po.status === 'draft'

  const tabStyle = (id) => ({
    padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 6,
    border: 'none', background: activeTab === id ? 'var(--brand)' : 'var(--surface-2)',
    color: activeTab === id ? '#fff' : 'var(--text)',
  })

  async function doAction(type) {
    setActioning(true)
    try {
      if (type === 'close')  await api.closePurchaseOrder(poId, actionReason)
      if (type === 'cancel') await api.cancelPurchaseOrder(poId, actionReason)
      notify(type === 'close' ? 'OC cerrada' : 'OC cancelada')
      setActionModal(null)
      loadAll()
      onRefresh?.()
    } catch (e) { notify(e.message, 'error') }
    finally { setActioning(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 880, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.3)', position: 'relative' }}>

        {/* Header — fila título + fila acciones */}
        <div style={{ borderBottom: '1px solid var(--border)', flexShrink: 0 }}>

          {/* Fila 1: título, badge, proveedor, cerrar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 18px 10px', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{ fontWeight: 800, fontSize: 16, whiteSpace: 'nowrap', color: 'var(--text)' }}>
                {po.status === 'draft' ? '📋' : '🧾'} {po.po_no || (po.status === 'draft' ? 'SC-' : 'OC-')+String(po.id).padStart(6,'0')}
              </span>
              <PoBadge status={po.status} />
              <span style={{ fontSize: 13, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {po.supplier_name}
              </span>
            </div>
            <Ib icon="close" tip="Cerrar ventana" variant="ghost" onClick={onClose} />
          </div>

          {/* Fila 2: barra de acciones */}
          {(() => {
            const BTN_H = 32
            const btn = (extra) => ({
              height: BTN_H, borderRadius: 8, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', whiteSpace: 'nowrap', border: '1.5px solid transparent',
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 12px',
              ...extra,
            })
            return (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 8, padding: '0 18px 12px' }}>

                {/* Acciones primarias */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {canConfirm && isAdmin && (
                    <button style={btn({ borderColor: '#15803d', background: '#f0fdf4', color: '#15803d' })}
                      onClick={async () => { try { const r = await api.updatePo(po.id, { status: 'sent' }); notify(`Solicitud confirmada como ${r.po_no}`); onRefresh?.(); onClose() } catch(e) { notify(e.message,'error') } }}>
                      ✓ Confirmar como OC
                    </button>
                  )}
                  {canReceive && (
                    <button style={btn({ borderColor: 'var(--brand)', background: 'var(--brand)', color: '#fff' })}
                      onClick={() => onOpenReceive(po.id)}>
                      ↓ Registrar recepción
                    </button>
                  )}
                  {canClose && (
                    <button style={btn({ borderColor: '#c7d2fe', background: '#e0e7ff', color: '#3730a3' })}
                      onClick={() => { setActionReason(''); setActionModal('close') }}>
                      🔒 Cerrar OC
                    </button>
                  )}
                  {canCancel && (
                    <button style={btn({ borderColor: '#fca5a5', background: '#fef2f2', color: '#dc2626' })}
                      onClick={() => { setActionReason(''); setActionModal('cancel') }}>
                      ✕ Cancelar OC
                    </button>
                  )}
                </div>

                {/* Acciones secundarias */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <Ib icon="download" tip="Exportar CSV" variant="ghost"
                    onClick={async () => { try { await api.exportPoCsv(po.id) } catch (e) { notify(e.message, 'error') } }} />
                  {isAdmin && (
                    <>
                      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }} />
                      {po.status === 'draft'
                        ? <Ib icon="edit" tip="Editar solicitud" variant="ghost" onClick={() => onEditDraft?.(po)} />
                        : <Ib icon="edit" tip="Editar OC" variant="ghost" onClick={() => onEditPo?.(po)} />
                      }
                      {['draft','sent'].includes(po.status) && (
                        <Ib icon="delete" tip="Eliminar" variant="danger" onClick={() => onDeletePo?.(po)} />
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })()}
        </div>

        {/* Resumen encabezado */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 0, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {[
            { label: 'Ítems totales',   val: totalItems,                 sub: `${qtyOrd} uds.`,                 color: 'var(--text)' },
            { label: 'Recibidos',       val: recItems,                   sub: `${qtyRec} uds.`,                 color: '#15803d' },
            { label: 'Pendientes',      val: pendItems,                  sub: `${qtyPend} uds.`,                color: pendItems > 0 ? '#c2410c' : '#15803d' },
            { label: 'Total OC',        val: formatMoney(totalOrd, po.currency), sub: po.currency,              color: 'var(--text)' },
            { label: 'Recibido $',      val: formatMoney(totalRec, po.currency), sub: `${pctRec}%`,             color: '#15803d' },
            { label: 'Pendiente $',     val: formatMoney(totalPend, po.currency),sub: po.expected_at ? `Entrega: ${po.expected_at.slice(0,10)}` : '', color: totalPend > 0 ? '#c2410c' : '#15803d' },
          ].map(({ label, val, sub, color }) => (
            <div key={label} style={{ padding: '10px 14px', borderRight: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>{label.toUpperCase()}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color }}>{val}</div>
              {sub && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
            </div>
          ))}
        </div>

        {/* Barras de progreso */}
        <div style={{ padding: '8px 20px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: 16 }}>
          {/* Unidades */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>
              <span>Unidades recibidas</span>
              <span style={{ fontWeight: 700, color: pctQty >= 100 ? '#15803d' : 'var(--text)' }}>{qtyRec} / {qtyOrd} ({pctQty}%)</span>
            </div>
            <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pctQty}%`, borderRadius: 3,
                background: pctQty >= 100 ? '#15803d' : pctQty > 0 ? '#f59e0b' : '#e2e8f0', transition: 'width .3s' }} />
            </div>
          </div>
          {/* Costo */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>
              <span>Costo recibido</span>
              <span style={{ fontWeight: 700, color: pctRec >= 100 ? '#15803d' : 'var(--text)' }}>{formatMoney(totalRec, po.currency)} ({pctRec}%)</span>
            </div>
            <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pctRec}%`, borderRadius: 3,
                background: pctRec >= 100 ? '#15803d' : pctRec > 0 ? '#3b82f6' : '#e2e8f0', transition: 'width .3s' }} />
            </div>
          </div>
        </div>

        {/* Sub-tabs */}
        <div style={{ display: 'flex', gap: 6, padding: '10px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <button style={tabStyle('items')} onClick={() => setActiveTab('items')}>📋 Ítems ({totalItems})</button>
          <button style={tabStyle('entradas')} onClick={() => setActiveTab('entradas')}>📦 Entradas ({entries.length})</button>
          {po.note && (
            <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              📝 {po.note}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: 20 }}>

          {/* Tab Ítems */}
          {activeTab === 'items' && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Producto / SKU</th>
                    <th style={{ width: 60 }}>Talla</th>
                    <th style={{ width: 70 }}>Color</th>
                    <th style={{ width: 75, textAlign: 'center' }}>Ord.</th>
                    <th style={{ width: 75, textAlign: 'center' }}>Rec.</th>
                    <th style={{ width: 75, textAlign: 'center' }}>Pend.</th>
                    <th style={{ width: 100, textAlign: 'right' }}>Costo</th>
                    <th style={{ width: 110, textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const ord = n(it.qty_ordered), rec = n(it.qty_received), pend = ord - rec
                    const done = pend <= 0
                    return (
                      <tr key={it.id} style={{ background: done ? '#f0fdf4' : undefined }}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{it.product_name}</div>
                          <code style={{ fontSize: 10, color: 'var(--muted)' }}>{it.variant_sku}</code>
                          {it.reception_note && <div style={{ fontSize: 10, color: '#92400e', marginTop: 2 }}>📝 {it.reception_note}</div>}
                        </td>
                        <td style={{ fontSize: 12 }}>{it.size || '—'}</td>
                        <td style={{ fontSize: 12 }}>{it.color || '—'}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{ord}</td>
                        <td style={{ textAlign: 'center', color: rec > 0 ? '#15803d' : 'var(--muted)', fontWeight: 700 }}>{rec}</td>
                        <td style={{ textAlign: 'center', color: pend > 0 ? '#c2410c' : '#15803d', fontWeight: 700 }}>{pend > 0 ? pend : '✓'}</td>
                        <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--muted)' }}>{formatMoney(it.unit_cost, po.currency)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--brand)' }}>{formatMoney(ord * n(it.unit_cost), po.currency)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  {/* col: [1:Producto] [2:Talla] [3:Color] [4:Ord.] [5:Rec.] [6:Pend.] [7:Costo unit.] [8:Total línea] */}
                  <tr>
                    <td colSpan="3" style={{ padding: '10px 8px', fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                      {totalItems} ítem(s)
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 800, fontSize: 13, padding: '10px 8px' }}>{qtyOrd.toLocaleString()}</td>
                    <td style={{ textAlign: 'center', fontWeight: 800, fontSize: 13, padding: '10px 8px', color: '#15803d' }}>{qtyRec.toLocaleString()}</td>
                    <td style={{ textAlign: 'center', fontWeight: 800, fontSize: 13, padding: '10px 8px', color: qtyPend > 0 ? '#c2410c' : '#15803d' }}>
                      {qtyPend > 0 ? qtyPend.toLocaleString() : '✓'}
                    </td>
                    <td />
                    <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 14, color: 'var(--brand)', padding: '10px 8px' }}>{formatMoney(totalOrd, po.currency)}</td>
                  </tr>
                  {qtyRec > 0 && (
                    <tr style={{ background: 'rgba(21,128,61,.05)' }}>
                      <td colSpan="3" style={{ padding: '6px 8px', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Recibido:</td>
                      <td colSpan="4" style={{ padding: '6px 8px' }} />
                      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: '#15803d', padding: '6px 8px' }}>{formatMoney(totalRec, po.currency)}</td>
                    </tr>
                  )}
                  {qtyPend > 0 && (
                    <tr style={{ background: 'rgba(194,65,12,.04)' }}>
                      <td colSpan="3" style={{ padding: '6px 8px', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Pendiente:</td>
                      <td colSpan="4" style={{ padding: '6px 8px' }} />
                      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: '#c2410c', padding: '6px 8px' }}>{formatMoney(totalPend, po.currency)}</td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          )}

          {/* Tab Entradas */}
          {activeTab === 'entradas' && (
            <>
              {entryDetail && (
                <EntryDetailModal entry={entryDetail} onClose={() => setEntryDetail(null)} notify={notify} />
              )}
              {entries.length === 0
                ? <EmptyState icon="📦" text="Sin entradas de almacén" sub="Las entradas se registran al recibir mercancía en la OC" />
                : <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Entrada</th>
                          <th>Fecha</th>
                          <th style={{ textAlign: 'center' }}>Ítems</th>
                          <th style={{ textAlign: 'right' }}>Monto</th>
                          <th>Notas</th>
                          <th style={{ width: 44 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map(e => (
                          <tr key={e.id} style={{ cursor: 'pointer' }}
                            onClick={() => api.getEntryDetail(e.id).then(setEntryDetail).catch(err => notify(err.message, 'error'))}>
                            <td><strong style={{ color: 'var(--brand)' }}>{e.entry_no}</strong></td>
                            <td style={{ fontSize: 12 }}>{e.entry_date}</td>
                            <td style={{ textAlign: 'center' }}>{e.line_count}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(e.total, po.currency)}</td>
                            <td style={{ fontSize: 12, color: 'var(--muted)' }}>{e.notes || '—'}</td>
                            <td onClick={ev => ev.stopPropagation()}>
                              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                <Ib icon="view" tip="Ver detalle" variant="ghost"
                                  onClick={() => api.getEntryDetail(e.id).then(setEntryDetail).catch(err => notify(err.message, 'error'))} />
                                {isAdmin && (
                                  <>
                                    <Ib icon="edit" tip="Editar notas" variant="ghost"
                                      onClick={() => onEditEntry?.({ id: e.id, entry_no: e.entry_no, notes: e.notes || '' })} />
                                    {e.status !== 'posted' && (
                                      <Ib icon="delete" tip="Eliminar entrada" variant="danger"
                                        onClick={() => onDeleteEntry?.({ id: e.id, entry_no: e.entry_no })} />
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td style={{ padding: '10px 8px', fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                            {entries.length} entrada(s)
                          </td>
                          <td colSpan="2" style={{ padding: '10px 8px' }} />
                          <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--brand)', padding: '10px 8px' }}>
                            {formatMoney(entries.reduce((s, e) => s + n(e.total), 0), po.currency)}
                          </td>
                          <td colSpan="2" />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
              }
            </>
          )}
        </div>

        {/* Dialog de acción (cerrar / cancelar) */}
        {actionModal && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 10 }}>
            <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 28, maxWidth: 420, width: '100%',
              boxShadow: '0 12px 40px rgba(0,0,0,.3)' }}>
              <div style={{ fontSize: 24, marginBottom: 10 }}>{actionModal === 'close' ? '🔒' : '❌'}</div>
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>
                {actionModal === 'close' ? 'Cerrar orden de compra' : 'Cancelar orden de compra'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
                {actionModal === 'close'
                  ? `La OC quedará cerrada con ${pendItems} ítem(s) sin recibir (${formatMoney(totalPend, po.currency)} pendientes). Esta acción no afecta las entradas ya registradas.`
                  : 'La OC será cancelada. No se han registrado entradas de almacén para esta orden.'}
              </div>
              <textarea
                placeholder={actionModal === 'close' ? 'Motivo del cierre (opcional)…' : 'Motivo de cancelación (opcional)…'}
                value={actionReason}
                onChange={e => setActionReason(e.target.value)}
                rows={2}
                style={{ width: '100%', fontSize: 12, border: '1px solid var(--border)', borderRadius: 8,
                  padding: '8px 10px', background: 'var(--surface)', color: 'var(--text)', resize: 'none', marginBottom: 16 }}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setActionModal(null)}
                  style={{ flex: 1, padding: '9px', borderRadius: 8,
                    border: '1.5px solid var(--border)', background: '#f8fafc',
                    cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#334155' }}>
                  Volver
                </button>
                <button onClick={() => doAction(actionModal)} disabled={actioning}
                  style={{ flex: 1, padding: '9px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 700, color: '#fff',
                    background: actioning ? '#94a3b8' : actionModal === 'close' ? '#3730a3' : '#dc2626',
                    opacity: actioning ? 0.7 : 1 }}>
                  {actioning ? 'Procesando…' : actionModal === 'close' ? '🔒 Confirmar cierre' : '❌ Confirmar cancelación'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Receive Modal — recepción selectiva por ítem ── */
function ReceiveModal({ poId, onClose, onDone, notify }) {
  const [po, setPo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sel, setSel] = useState({})
  const [entryNotes, setEntryNotes] = useState('')
  // Paso 2: confirmación de cierre cuando hay pendientes
  const [closeStep, setCloseStep] = useState(false)
  const [closeReason, setCloseReason] = useState('')
  const [pendingPayload, setPendingPayload] = useState(null)

  useEffect(() => {
    api.getPurchaseOrder(poId)
      .then(data => {
        setPo(data)
        const init = {}
        for (const it of data.items || []) {
          const pend = n(it.qty_ordered) - n(it.qty_received)
          if (pend > 0) {
            init[it.id] = { checked: true, qty: pend, unit_cost: n(it.unit_cost), note: '' }
          }
        }
        setSel(init)
      })
      .catch(e => { notify(e.message, 'error'); onClose() })
      .finally(() => setLoading(false))
  }, [poId])

  const pendingItems = (po?.items || []).filter(it => n(it.qty_ordered) - n(it.qty_received) > 0)
  const allChecked   = pendingItems.length > 0 && pendingItems.every(it => sel[it.id]?.checked)
  const anyChecked   = pendingItems.some(it => sel[it.id]?.checked)

  function toggleAll(val) {
    setSel(prev => {
      const next = { ...prev }
      for (const it of pendingItems) next[it.id] = { ...next[it.id], checked: val }
      return next
    })
  }

  function updateSel(itemId, field, value) {
    setSel(prev => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }))
  }

  const selectedTotal = pendingItems.reduce((s, it) => {
    const e = sel[it.id]
    return s + (e?.checked ? (n(e.qty) * n(e.unit_cost ?? it.unit_cost)) : 0)
  }, 0)

  // Advertencias de diferencias vs OC
  const diffWarnings = pendingItems.filter(it => {
    const e = sel[it.id]
    if (!e?.checked) return false
    const pend = n(it.qty_ordered) - n(it.qty_received)
    const qtyDiff = n(e.qty) !== pend
    const costDiff = n(e.unit_cost ?? it.unit_cost) !== n(it.unit_cost)
    return qtyDiff || costDiff
  })

  // Calcular si la selección actual deja ítems pendientes
  const selectedItems = pendingItems.filter(it => sel[it.id]?.checked && n(sel[it.id]?.qty) > 0)
  const unselectedOrPartial = pendingItems.filter(it => {
    const e = sel[it.id]
    if (!e?.checked) return true
    const pend = n(it.qty_ordered) - n(it.qty_received)
    return n(e.qty) < pend
  })
  const willHavePending = unselectedOrPartial.length > 0

  function buildPayload(closePo, reason) {
    return {
      items: selectedItems.map(it => ({
        item_id: it.id,
        qty_to_receive: n(sel[it.id].qty),
        unit_cost: n(sel[it.id].unit_cost ?? it.unit_cost),
        note: sel[it.id].note || undefined,
      })),
      entry_notes: entryNotes || undefined,
      close_po: closePo,
      close_reason: reason || undefined,
    }
  }

  async function doReceive() {
    if (selectedItems.length === 0) { notify('Selecciona al menos un ítem', 'error'); return }
    // Si quedará pendiente → preguntar si cerrar
    if (willHavePending) {
      setPendingPayload(buildPayload(false, ''))
      setCloseStep(true)
      return
    }
    await submitReceive(buildPayload(false, ''))
  }

  async function submitReceive(payload) {
    setSaving(true)
    try {
      const r = await api.receivePurchaseOrderPartial(poId, payload)
      let msg = r.entry_no ? `Entrada ${r.entry_no} registrada` : 'Recepción registrada'
      if (r.all_received) msg += ' — OC completamente recibida ✅'
      else if (payload.close_po) msg += ' — OC cerrada 🔒'
      else msg += ` — ${unselectedOrPartial.length} ítem(s) quedan pendientes`
      notify(msg)
      onDone()
    } catch (e) {
      notify(e.message, 'error')
      setCloseStep(false)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 32, color: 'var(--muted)' }}>Cargando…</div>
    </div>
  )
  if (!po) return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 900, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,.35)' }}>

        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>📦 Recepción de mercancía — {po.po_no || 'OC-'+String(po.id).padStart(6,'0')}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                {po.supplier_name} · {po.currency} · {pendingItems.length} ítem(s) pendiente(s)
              </div>
            </div>
            <Ib icon="close" tip="Cerrar" variant="ghost" onClick={onClose} />
          </div>
        </div>

        {/* Toolbar selección */}
        <div style={{ padding: '8px 18px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <input type="checkbox" checked={allChecked} onChange={e => toggleAll(e.target.checked)}
              style={{ width: 15, height: 15, cursor: 'pointer' }} />
            Sel. todos
          </label>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>
            {pendingItems.filter(it => sel[it.id]?.checked).length}/{pendingItems.length} ítems
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
            Total: <strong style={{ color: 'var(--brand)', fontSize: 13 }}>{formatMoney(selectedTotal, po.currency)}</strong>
          </span>
        </div>

        {/* Tabla de recepción */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {pendingItems.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              ✅ Todos los ítems ya fueron recibidos
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', position: 'sticky', top: 0, zIndex: 1 }}>
                  <th style={{ width: 36, padding: '8px 6px' }}></th>
                  <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: 11, fontWeight: 700 }}>Producto / Variante</th>
                  <th style={{ padding: '8px 6px', textAlign: 'center', fontSize: 11, fontWeight: 700, width: 54 }}>Ord.</th>
                  <th style={{ padding: '8px 6px', textAlign: 'center', fontSize: 11, fontWeight: 700, width: 54 }}>Rec.</th>
                  <th style={{ padding: '8px 6px', textAlign: 'center', fontSize: 11, fontWeight: 700, width: 54 }}>Pend.</th>
                  <th style={{ padding: '8px 6px', textAlign: 'center', fontSize: 11, fontWeight: 700, width: 100 }}>A recibir</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right', fontSize: 11, fontWeight: 700, width: 90 }}>Costo OC</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right', fontSize: 11, fontWeight: 700, width: 100 }}>Costo real</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right', fontSize: 11, fontWeight: 700, width: 90 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {pendingItems.map(it => {
                  const pend = n(it.qty_ordered) - n(it.qty_received)
                  const e = sel[it.id] || { checked: false, qty: pend, unit_cost: n(it.unit_cost), note: '' }
                  const realCost = e.unit_cost ?? it.unit_cost
                  const lineTotal = e.checked ? n(e.qty) * n(realCost) : 0
                  const qtyDiffers  = e.checked && n(e.qty) !== pend
                  const costDiffers = e.checked && n(realCost) !== n(it.unit_cost)
                  return (
                    <>
                    <tr key={it.id} style={{
                      borderBottom: e.checked && e.note !== undefined ? 'none' : '1px solid var(--border)',
                      background: (qtyDiffers || costDiffers) ? '#fffbeb' : e.checked ? 'rgba(79,70,229,.04)' : undefined,
                      opacity: e.checked ? 1 : 0.5,
                    }}>
                      <td style={{ textAlign: 'center', padding: '8px 6px' }}>
                        <input type="checkbox" checked={!!e.checked}
                          onChange={ev => updateSel(it.id, 'checked', ev.target.checked)}
                          style={{ width: 16, height: 16, cursor: 'pointer' }} />
                      </td>
                      <td style={{ padding: '8px 6px' }}>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>{it.product_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                          <code>{it.variant_sku}</code>
                          {it.size && <span> · T{it.size}</span>}
                          {it.color && <span> · {it.color}</span>}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, padding: '8px 6px' }}>{n(it.qty_ordered)}</td>
                      <td style={{ textAlign: 'center', fontSize: 12, color: n(it.qty_received) > 0 ? '#15803d' : 'var(--muted)', padding: '8px 6px' }}>{n(it.qty_received)}</td>
                      <td style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#c2410c', padding: '8px 6px' }}>{pend}</td>
                      <td style={{ padding: '6px' }}>
                        <input type="number" min="0" step="1"
                          value={e.qty}
                          onChange={ev => updateSel(it.id, 'qty', ev.target.value)}
                          disabled={!e.checked}
                          style={{
                            width: '100%', textAlign: 'center', fontWeight: 700, fontSize: 13,
                            border: `2px solid ${qtyDiffers ? '#f59e0b' : e.checked ? 'var(--brand)' : 'var(--border)'}`,
                            borderRadius: 7, padding: '4px 2px',
                            background: qtyDiffers ? '#fffbeb' : 'var(--surface)',
                            color: qtyDiffers ? '#b45309' : 'var(--text)',
                          }}
                        />
                        {qtyDiffers && <div style={{ fontSize: 10, color: '#b45309', textAlign: 'center', marginTop: 1 }}>⚠ difiere</div>}
                      </td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>
                        <div style={{ fontSize: 12, color: 'var(--muted)', padding: '4px 4px' }}>
                          {formatMoney(n(it.unit_cost), po.currency)}
                        </div>
                      </td>
                      <td style={{ padding: '6px' }}>
                        <input type="number" step="0.01" min="0"
                          value={e.unit_cost ?? it.unit_cost}
                          onChange={ev => updateSel(it.id, 'unit_cost', ev.target.value)}
                          disabled={!e.checked}
                          style={{
                            width: '100%', textAlign: 'right', fontWeight: 700, fontSize: 12,
                            border: `2px solid ${costDiffers ? '#f59e0b' : 'var(--border)'}`,
                            borderRadius: 7, padding: '4px 4px',
                            background: costDiffers ? '#fffbeb' : 'var(--surface)',
                            color: costDiffers ? '#b45309' : 'var(--text)',
                          }}
                        />
                        {costDiffers && <div style={{ fontSize: 10, color: '#b45309', textAlign: 'right', marginTop: 1 }}>⚠ difiere</div>}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: e.checked ? 'var(--brand)' : 'var(--muted)', padding: '8px 6px', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {e.checked ? formatMoney(lineTotal, po.currency) : '—'}
                      </td>
                    </tr>
                    {e.checked && (
                      <tr key={it.id + '_note'} style={{ borderBottom: '1px solid var(--border)', background: e.checked ? 'rgba(79,70,229,.04)' : undefined }}>
                        <td />
                        <td colSpan={8} style={{ padding: '0 6px 6px' }}>
                          <input type="text"
                            placeholder="Nota de inspección (opcional)…"
                            value={e.note || ''}
                            onChange={ev => updateSel(it.id, 'note', ev.target.value)}
                            style={{ width: '100%', fontSize: 11, border: '1px solid var(--border)',
                              borderRadius: 6, padding: '4px 8px', background: 'var(--surface)', color: 'var(--text)' }}
                          />
                        </td>
                      </tr>
                    )}
                    </>
                  )
                })}
              </tbody>
            </table>
          )}

          {/* Ítems ya recibidos — colapsado */}
          {(po.items || []).filter(it => n(it.qty_received) >= n(it.qty_ordered)).length > 0 && (
            <details style={{ margin: '12px 16px', fontSize: 12 }}>
              <summary style={{ cursor: 'pointer', color: 'var(--muted)', userSelect: 'none', padding: '6px 0' }}>
                ✅ {(po.items || []).filter(it => n(it.qty_received) >= n(it.qty_ordered)).length} ítem(s) ya recibidos (mostrar)
              </summary>
              <div style={{ marginTop: 8 }}>
                {(po.items || []).filter(it => n(it.qty_received) >= n(it.qty_ordered)).map(it => (
                  <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: '#f0fdf4', borderRadius: 6, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>{it.product_name} <code style={{ fontWeight: 400 }}>{it.variant_sku}</code></span>
                    <span style={{ color: '#15803d', fontWeight: 700 }}>✓ {n(it.qty_received)} / {n(it.qty_ordered)}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* Notas de entrada */}
        <div style={{ padding: '10px 22px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <input
            type="text"
            placeholder="Notas de la entrada de almacén (opcional): condición de la mercancía, transportista…"
            value={entryNotes}
            onChange={e => setEntryNotes(e.target.value)}
            style={{ width: '100%', fontSize: 12, border: '1px solid var(--border)', borderRadius: 8,
              padding: '7px 12px', background: 'var(--surface)', color: 'var(--text)' }}
          />
        </div>

        {/* Banner de advertencias de diferencias */}
        {diffWarnings.length > 0 && (
          <div style={{ padding: '10px 22px', borderTop: '1px solid #fde68a', background: '#fffbeb', flexShrink: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: '#92400e', marginBottom: 4 }}>
              ⚠️ Advertencia: {diffWarnings.length} ítem(s) con cantidades o costos diferentes a la OC
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {diffWarnings.map(it => {
                const e = sel[it.id]
                const pend = n(it.qty_ordered) - n(it.qty_received)
                const realCost = e.unit_cost ?? it.unit_cost
                const parts = []
                if (n(e.qty) !== pend) parts.push(`cant. ${pend}→${n(e.qty)}`)
                if (n(realCost) !== n(it.unit_cost)) parts.push(`costo ${formatMoney(it.unit_cost, po.currency)}→${formatMoney(realCost, po.currency)}`)
                return (
                  <span key={it.id} style={{ fontSize: 11, background: '#fef3c7', border: '1px solid #fde68a',
                    borderRadius: 6, padding: '2px 8px', color: '#92400e' }}>
                    <strong>{it.product_name}</strong> {it.variant_sku && <code>{it.variant_sku}</code>}: {parts.join(', ')}
                  </span>
                )
              })}
            </div>
            <div style={{ fontSize: 11, color: '#b45309', marginTop: 4 }}>
              Se registrará la entrada con los valores indicados. Las diferencias quedarán documentadas en el historial de la OC.
            </div>
          </div>
        )}

        {/* Footer de acción */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--muted)' }}>
            {!anyChecked && <span style={{ color: '#c2410c', fontWeight: 600 }}>⚠️ Selecciona al menos un ítem para continuar</span>}
            {anyChecked && (
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span><strong style={{ color: 'var(--text)' }}>{selectedItems.length}</strong> ítem(s)</span>
                <span>Total: <strong style={{ color: 'var(--brand)', fontSize: 13 }}>{formatMoney(selectedTotal, po.currency)}</strong></span>
                {willHavePending && (
                  <span style={{ color: '#c2410c', fontWeight: 600 }}>⚠ {unselectedOrPartial.length} quedan pendientes</span>
                )}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={onClose}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--surface-2)', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
              Cancelar
            </button>
            <button onClick={doReceive} disabled={!anyChecked || saving}
              style={{ padding: '8px 20px', borderRadius: 8, border: 'none',
                background: anyChecked ? 'var(--brand)' : '#94a3b8',
                color: '#fff', cursor: anyChecked ? 'pointer' : 'not-allowed',
                fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>
              {saving ? '⏳ Procesando…' : '✅ Registrar entrada'}
            </button>
          </div>
        </div>

        {/* Dialog de cierre: aparece encima cuando hay pendientes */}
        {closeStep && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 28, maxWidth: 460, width: '100%',
              boxShadow: '0 12px 40px rgba(0,0,0,.3)' }}>
              <div style={{ fontSize: 22, marginBottom: 10 }}>⚠️</div>
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>
                Quedan {unselectedOrPartial.length} ítem(s) sin recibir
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
                ¿Qué deseas hacer con los ítems pendientes?
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
                <label style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                  border: '2px solid var(--border)', background: 'var(--surface-2)' }}
                  onClick={() => { submitReceive(buildPayload(false, '')) }}>
                  <span style={{ fontSize: 20 }}>📋</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>Mantener OC abierta</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      Registra esta entrada parcial y deja la OC en estado <strong>Parcial</strong> para futuras recepciones
                    </div>
                  </div>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                    border: '2px solid #c2410c', background: '#fff7f7' }}
                    onClick={() => {}}>
                    <span style={{ fontSize: 20 }}>🔒</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#c2410c' }}>Cerrar la OC</div>
                      <div style={{ fontSize: 11, color: '#7f1d1d', marginTop: 2 }}>
                        Registra esta entrada y cierra la OC — los ítems pendientes no se esperan más
                      </div>
                    </div>
                  </label>
                  <input
                    type="text"
                    placeholder="Motivo del cierre (opcional): mercancía no disponible, negociación…"
                    value={closeReason}
                    onChange={e => setCloseReason(e.target.value)}
                    style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 8,
                      padding: '7px 12px', background: 'var(--surface)', color: 'var(--text)' }}
                  />
                  <button
                    onClick={() => submitReceive(buildPayload(true, closeReason))}
                    disabled={saving}
                    style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#c2410c',
                      color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                    {saving ? '⏳ Procesando…' : '🔒 Registrar entrada y cerrar OC'}
                  </button>
                </div>
              </div>
              <button onClick={() => setCloseStep(false)}
                style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--surface)', cursor: 'pointer', fontSize: 13, color: 'var(--muted)' }}>
                ← Volver a la recepción
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Helpers de filtros por columna ── */
const colInputStyle = {
  width: '100%', fontSize: 11, height: 26, padding: '0 22px 0 7px',
  borderRadius: 5, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text)',
}

function ColFilterInput({ value, onChange, placeholder }) {
  return (
    <div style={{ position: 'relative' }}>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ ...colInputStyle, paddingRight: value ? 22 : 7 }} />
      {value && (
        <button onClick={() => onChange('')} style={{
          position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)',
          fontSize: 13, lineHeight: 1, padding: 0,
        }}>×</button>
      )}
    </div>
  )
}

function ColFilterSelect({ value, onChange, placeholder, children }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ ...colInputStyle, paddingRight: 4, cursor: 'pointer', appearance: 'auto' }}>
      <option value="">{placeholder}</option>
      {children}
    </select>
  )
}

function Chip({ label, val, onClear }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px 3px 10px', borderRadius: 20,
      background: 'var(--brand-soft)', color: 'var(--brand)',
      fontSize: 11, fontWeight: 600,
    }}>
      <span style={{ color: 'var(--muted)', fontWeight: 400 }}>{label}:</span> {val}
      <button onClick={onClear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', fontSize: 14, lineHeight: 1, padding: 0, marginLeft: 2 }}>×</button>
    </span>
  )
}

const pgBtn = (disabled) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--surface)', color: disabled ? 'var(--muted)' : 'var(--text)',
  cursor: disabled ? 'default' : 'pointer', fontSize: 13, fontWeight: 500,
  opacity: disabled ? 0.45 : 1,
})

/* ── Proveedores tab ── */
function ProveedoresTab({ defCur, country, notify, onSuppliersChange }) {
  const emptySup = () => ({ name: '', fiscal_person_type: '', fiscal_id_type: '', tax_id: '', tax_dv: '', email: '', phone: '', mobile: '', city: '', address: '', currency: defCur })

  const fiscalTypes      = getFiscalTypes(country)
  const fiscalIdTypes    = getFiscalIdTypes(country)
  const fileRef          = useRef(null)
  const [suppliers,     setSuppliers]     = useState([])
  const [loading,       setLoading]       = useState(true)
  const [sup,           setSup]           = useState(emptySup)
  const [showForm,      setShowForm]      = useState(false)
  const [editSupId,     setEditSupId]     = useState(null)
  const [showImport,    setShowImport]    = useState(false)
  const [search,        setSearch]        = useState('')
  const [drag,          setDrag]          = useState(false)
  const [bulkProgress,  setBulkProgress]  = useState(null)
  const [bulkResults,   setBulkResults]   = useState(null)
  const [pageSize,      setPageSize]      = useState(25)
  const [page,          setPage]          = useState(1)
  const [confirmDel,    setConfirmDel]    = useState(null)
  const [deleting,      setDeleting]      = useState(false)
  const [colFilters, setColFilters] = useState({ name: '', fiscal_person_type: '', identification: '', contact: '', city: '', currency: '', is_active: '', created_at: '' })

  const availableIdTypes = getAvailableIdTypes(country, sup.fiscal_person_type)

  async function refresh() {
    try {
      const list = await api.listSuppliers()
      setSuppliers(list)
      onSuppliersChange?.(list)
    } catch (e) { notify(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])

  const setColF = (key, val) => { setColFilters(f => ({ ...f, [key]: val })); setPage(1) }
  const hasColFilters = Object.values(colFilters).some(Boolean)
  const clearColFilters = () => { setColFilters({ name: '', fiscal_person_type: '', identification: '', contact: '', city: '', currency: '', is_active: '', created_at: '' }); setPage(1) }

  const lc = (v) => (v || '').toLowerCase()

  const filtered = suppliers.filter(s => {
    if (search && !lc(s.name).includes(lc(search)) && !lc(s.tax_id).includes(lc(search)) && !lc(s.email).includes(lc(search))) return false
    if (colFilters.name && !lc(s.name).includes(lc(colFilters.name))) return false
    if (colFilters.fiscal_person_type && s.fiscal_person_type !== colFilters.fiscal_person_type) return false
    if (colFilters.identification && !lc(s.fiscal_id_type).includes(lc(colFilters.identification)) && !lc(s.tax_id).includes(lc(colFilters.identification))) return false
    if (colFilters.contact && !lc(s.email).includes(lc(colFilters.contact)) && !lc(s.phone).includes(lc(colFilters.contact)) && !lc(s.mobile).includes(lc(colFilters.contact))) return false
    if (colFilters.city && !lc(s.city).includes(lc(colFilters.city)) && !lc(s.address).includes(lc(colFilters.city))) return false
    if (colFilters.currency && s.currency !== colFilters.currency) return false
    if (colFilters.is_active === 'true'  && !s.is_active) return false
    if (colFilters.is_active === 'false' &&  s.is_active) return false
    if (colFilters.created_at && !(s.created_at || '').startsWith(colFilters.created_at)) return false
    return true
  })

  const uniqFiscalTypes   = [...new Set(suppliers.map(s => s.fiscal_person_type).filter(Boolean))]
  const uniqCurrencies    = [...new Set(suppliers.map(s => s.currency).filter(Boolean))]

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const pageRows   = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  function openEdit(s) {
    setSup({ name: s.name, fiscal_person_type: s.fiscal_person_type || '', fiscal_id_type: s.fiscal_id_type || '',
      tax_id: s.tax_id || '', tax_dv: s.tax_dv || '', email: s.email || '', phone: s.phone || '',
      mobile: s.mobile || '', city: s.city || '', address: s.address || '', currency: s.currency || defCur })
    setEditSupId(s.id)
    setShowForm(true)
  }

  async function handleSaveEdit(e) {
    e.preventDefault()
    try {
      await api.updateSupplier(editSupId, sup)
      notify('Proveedor actualizado'); setSup(emptySup()); setEditSupId(null); setShowForm(false); refresh()
    } catch (err) { notify(err.message, 'error') }
  }

  function openCreate() { setSup(emptySup()); setEditSupId(null); setShowForm(true) }

  async function confirmDelete() {
    if (!confirmDel) return
    setDeleting(true)
    try {
      await api.deleteSupplier(confirmDel.id)
      notify(`Proveedor "${confirmDel.name}" eliminado`); setConfirmDel(null); refresh()
    } catch (err) { notify(err.message, 'error') }
    setDeleting(false)
  }

  const initials = (name) =>
    (name || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()

  const avatarColor = (name) => {
    const colors = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6']
    let h = 0; for (const c of name || '') h = (h * 31 + c.charCodeAt(0)) & 0xff
    return colors[h % colors.length]
  }

  function downloadLayout() {
    const req = ['*Obligatorio']
    const opt = ['Opcional']
    const headerRow  = SUPPLIER_CSV_HEADERS.join(',')
    const labelRow   = ['name *','fiscal_person_type','tax_id','email','phone','address','currency *'].join(',')
    const exampleRows = SUPPLIER_CSV_EXAMPLES.map(r => r.map(v => `"${v}"`).join(','))
    const blob = new Blob(
      ['﻿# Layout Proveedores — no modificar cabecera\n', headerRow + '\n', ...exampleRows.map(r => r + '\n')],
      { type: 'text/csv;charset=utf-8;' }
    )
    const url = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), { href: url, download: 'layout_proveedores.csv' }).click()
    URL.revokeObjectURL(url)
  }

  async function processFile(file) {
    if (!file) return
    const text     = await file.text()
    const lines    = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'))
    const header   = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''))
    const dataRows = lines.slice(1).filter(Boolean)
    if (dataRows.length === 0) { notify('El archivo no tiene filas de datos', 'error'); return }

    setBulkProgress({ done: 0, total: dataRows.length, errors: 0 })
    setBulkResults(null)
    let done = 0, errors = 0
    const results = []

    for (const line of dataRows) {
      const vals = parseCsvLine(line)
      const obj  = Object.fromEntries(header.map((h, i) => [h, (vals[i] || '').trim()]))
      if (!obj.name) {
        done++; errors++
        results.push({ name: '(sin nombre)', id: null, fiscal: '', error: 'Nombre requerido' })
        setBulkProgress({ done, total: dataRows.length, errors })
        continue
      }
      try {
        const res = await api.createSupplier({
          name:               obj.name,
          fiscal_person_type: obj.fiscal_person_type || null,
          fiscal_id_type:     obj.fiscal_id_type     || null,
          tax_id:             obj.tax_id             || null,
          tax_dv:             obj.tax_dv             || null,
          email:              obj.email              || null,
          phone:              obj.phone              || null,
          mobile:             obj.mobile             || null,
          city:               obj.city               || null,
          address:            obj.address            || null,
          currency:           (obj.currency || defCur).toUpperCase().slice(0, 3) || defCur,
        })
        results.push({ name: obj.name, id: res.id, fiscal: obj.fiscal_person_type || '', idType: obj.fiscal_id_type || '', taxId: obj.tax_id || '', error: null })
      } catch (err) {
        errors++
        results.push({ name: obj.name, id: null, fiscal: '', idType: '', taxId: '', error: err.message || 'Error al crear' })
      }
      done++
      setBulkProgress({ done, total: dataRows.length, errors })
    }

    setBulkProgress(null)
    setBulkResults(results)
    notify(
      errors === 0
        ? `${done - errors} proveedor(es) importado(s) correctamente`
        : `${done - errors} importado(s) · ${errors} con error`,
      errors === 0 ? 'ok' : 'warn'
    )
    refresh()
  }

  const handleFileInput = (e) => { processFile(e.target.files?.[0]); e.target.value = '' }
  const handleDrop = (e) => { e.preventDefault(); setDrag(false); processFile(e.dataTransfer.files?.[0]) }

  async function handleSave(e) {
    e.preventDefault()
    try {
      await api.createSupplier(sup)
      notify('Proveedor creado')
      setSup(emptySup())
      setShowForm(false)
      await refresh()
    } catch (err) { notify(err.message, 'error') }
  }

  const fiscalLabel = (value) => fiscalTypes.find(t => t.value === value)?.label || value

  function downloadProveedoresCsv() {
    const headers = ['id','nombre','tipo_persona_fiscal','tipo_id_fiscal','numero_fiscal','dv','email','telefono','celular','ciudad','direccion','moneda','estado','fecha_creacion']
    const rows = filtered.map(s => [
      s.id,
      `"${(s.name||'').replace(/"/g,'""')}"`,
      s.fiscal_person_type || '',
      s.fiscal_id_type || '',
      s.tax_id || '',
      s.tax_dv || '',
      s.email || '',
      s.phone || '',
      s.mobile || '',
      `"${(s.city||'').replace(/"/g,'""')}"`,
      `"${(s.address||'').replace(/"/g,'""')}"`,
      s.currency || '',
      s.is_active ? 'activo' : 'inactivo',
      s.created_at ? s.created_at.slice(0, 10) : '',
    ].join(','))
    const blob = new Blob(['﻿' + headers.join(',') + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), { href: url, download: 'proveedores.csv' }).click()
    URL.revokeObjectURL(url)
  }

  async function toggleEstado(s) {
    try {
      const updated = await api.toggleSupplierEstado(s.id)
      notify(`Proveedor ${updated.is_active ? 'activado' : 'desactivado'}`, 'ok')
      refresh()
    } catch (err) {
      notify(err.message || 'Error al cambiar estado', 'error')
    }
  }

  return (
    <div className="vtab-content">

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
        padding: '12px 16px', marginBottom: 16,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        borderRadius: 10,
      }}>
        {/* Buscador */}
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180, maxWidth: 340 }}>
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: 'var(--muted)', pointerEvents: 'none' }} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="8.5" cy="8.5" r="5.5"/><path d="M13.5 13.5L18 18"/></svg>
          <input
            placeholder="Buscar por nombre, identificación o correo…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            style={{ paddingLeft: 32, paddingRight: search ? 32 : 12, width: '100%', height: 36, fontSize: 13 }}
          />
          {search && (
            <button onClick={() => { setSearch(''); setPage(1) }} style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)',
              fontSize: 16, lineHeight: 1, padding: '0 2px',
            }}>×</button>
          )}
        </div>

        {/* Contador de resultados */}
        {search && (
          <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {filtered.length} de {suppliers.length}
          </span>
        )}

        {/* Separador flex */}
        <div style={{ flex: 1 }} />

        {/* Resumen rápido */}
        {suppliers.length > 0 && !search && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, background: '#dcfce7', color: '#15803d', fontWeight: 600, fontSize: 11 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a' }} />
              {suppliers.filter(s => s.is_active).length} activos
            </span>
            {suppliers.filter(s => !s.is_active).length > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, background: 'var(--surface-2)', color: 'var(--muted)', fontWeight: 600, fontSize: 11 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#9ca3af' }} />
                {suppliers.filter(s => !s.is_active).length} inactivos
              </span>
            )}
          </div>
        )}

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: 'var(--border)', flexShrink: 0 }} />

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {suppliers.length > 0 && (
            <button onClick={downloadProveedoresCsv} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '0 14px', height: 36, borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', transition: 'background .15s',
            }}>
              <svg style={{ width: 14, height: 14 }} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 3v10M6 9l4 4 4-4"/><path d="M3 17h14"/></svg>
              Exportar CSV
            </button>
          )}
          <button onClick={() => { setBulkResults(null); setShowImport(true) }} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '0 14px', height: 36, borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
          }}>
            <svg style={{ width: 14, height: 14 }} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 17V7M6 11l4-4 4 4"/><path d="M3 17h14"/></svg>
            Importar CSV
          </button>
          <button onClick={openCreate} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '0 16px', height: 36, borderRadius: 8, border: 'none',
            background: 'var(--brand)', color: '#fff', cursor: 'pointer',
            fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
          }}>
            <svg style={{ width: 15, height: 15 }} viewBox="0 0 20 20" fill="currentColor"><path d="M10 4a1 1 0 011 1v4h4a1 1 0 010 2h-4v4a1 1 0 01-2 0v-4H5a1 1 0 010-2h4V5a1 1 0 011-1z"/></svg>
            Nuevo proveedor
          </button>
        </div>
      </div>

      {/* ── Chips de filtros activos ── */}
      {hasColFilters && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Filtros activos:</span>
          {colFilters.name && <Chip label="Proveedor" val={colFilters.name} onClear={() => setColF('name', '')} />}
          {colFilters.fiscal_person_type && <Chip label="Tipo fiscal" val={fiscalTypes.find(t => t.value === colFilters.fiscal_person_type)?.label || colFilters.fiscal_person_type} onClear={() => setColF('fiscal_person_type', '')} />}
          {colFilters.identification && <Chip label="Identificación" val={colFilters.identification} onClear={() => setColF('identification', '')} />}
          {colFilters.contact && <Chip label="Contacto" val={colFilters.contact} onClear={() => setColF('contact', '')} />}
          {colFilters.city && <Chip label="Ciudad" val={colFilters.city} onClear={() => setColF('city', '')} />}
          {colFilters.currency && <Chip label="Moneda" val={colFilters.currency} onClear={() => setColF('currency', '')} />}
          {colFilters.is_active && <Chip label="Estado" val={colFilters.is_active === 'true' ? 'Activo' : 'Inactivo'} onClear={() => setColF('is_active', '')} />}
          {colFilters.created_at && <Chip label="Registro" val={colFilters.created_at} onClear={() => setColF('created_at', '')} />}
          <button onClick={clearColFilters} style={{ fontSize: 11, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: '2px 6px' }}>
            Limpiar todos
          </button>
        </div>
      )}

      {/* ── Tabla de proveedores ── */}
      {suppliers.length === 0 ? (
        <EmptyState icon="🏭" text="Sin proveedores registrados"
          sub='Haz clic en "+ Nuevo proveedor" o importa un archivo CSV' />
      ) : filtered.length === 0 ? (
        <EmptyState icon="🔍" text="Sin resultados" sub={search || hasColFilters ? 'Prueba cambiando los filtros o el término de búsqueda' : 'No hay proveedores registrados'} />
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div className="table-wrap" style={{ borderRadius: 0, border: 'none' }}>
            <table>
              <thead>
                {/* Fila de títulos */}
                <tr>
                  <th style={{ width: 44, textAlign: 'center' }}>#</th>
                  <th>Proveedor</th>
                  <th style={{ width: 145 }}>Tipo fiscal</th>
                  <th style={{ width: 160 }}>Identificación</th>
                  <th style={{ width: 185 }}>Contacto</th>
                  <th style={{ width: 135 }}>Ciudad</th>
                  <th style={{ width: 70, textAlign: 'center' }}>Moneda</th>
                  <th style={{ width: 100, textAlign: 'center' }}>Estado</th>
                  <th style={{ width: 96, textAlign: 'center' }}>Registro</th>
                  <th style={{ width: 72, textAlign: 'center' }}>Acciones</th>
                </tr>
                {/* Fila de filtros por columna */}
                <tr style={{ background: 'var(--surface-2)' }}>
                  <th style={{ padding: '4px 6px' }}>
                    {/* sin filtro en # */}
                  </th>
                  <th style={{ padding: '4px 6px' }}>
                    <ColFilterInput value={colFilters.name} onChange={v => setColF('name', v)} placeholder="Filtrar nombre…" />
                  </th>
                  <th style={{ padding: '4px 6px' }}>
                    <ColFilterSelect value={colFilters.fiscal_person_type} onChange={v => setColF('fiscal_person_type', v)} placeholder="Todos">
                      {uniqFiscalTypes.map(ft => {
                        const label = fiscalTypes.find(t => t.value === ft)?.label || ft
                        return <option key={ft} value={ft}>{label}</option>
                      })}
                    </ColFilterSelect>
                  </th>
                  <th style={{ padding: '4px 6px' }}>
                    <ColFilterInput value={colFilters.identification} onChange={v => setColF('identification', v)} placeholder="Tipo o número…" />
                  </th>
                  <th style={{ padding: '4px 6px' }}>
                    <ColFilterInput value={colFilters.contact} onChange={v => setColF('contact', v)} placeholder="Correo o teléfono…" />
                  </th>
                  <th style={{ padding: '4px 6px' }}>
                    <ColFilterInput value={colFilters.city} onChange={v => setColF('city', v)} placeholder="Ciudad…" />
                  </th>
                  <th style={{ padding: '4px 6px' }}>
                    <ColFilterSelect value={colFilters.currency} onChange={v => setColF('currency', v)} placeholder="Todas">
                      {uniqCurrencies.map(c => <option key={c} value={c}>{c}</option>)}
                    </ColFilterSelect>
                  </th>
                  <th style={{ padding: '4px 6px', textAlign: 'center' }}>
                    <ColFilterSelect value={colFilters.is_active} onChange={v => setColF('is_active', v)} placeholder="Todos">
                      <option value="true">Activo</option>
                      <option value="false">Inactivo</option>
                    </ColFilterSelect>
                  </th>
                  <th style={{ padding: '4px 6px' }}>
                    <ColFilterInput value={colFilters.created_at} onChange={v => setColF('created_at', v)} placeholder="AAAA-MM-DD" />
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pageRows.map(s => {
                  const ft  = fiscalTypes.find(t => t.value === s.fiscal_person_type)
                  const idt = fiscalIdTypes.find(t => t.value === s.fiscal_id_type)
                  const bg  = avatarColor(s.name)
                  return (
                    <tr key={s.id}>
                      <td style={{ textAlign: 'center' }}>
                        <code style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>#{s.id}</code>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 34, height: 34, borderRadius: '50%', background: bg, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontWeight: 800, fontSize: 11, letterSpacing: '.02em',
                          }}>
                            {initials(s.name)}
                          </div>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
                        </div>
                      </td>
                      <td>
                        {ft
                          ? <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '3px 10px', borderRadius: 20,
                              background: 'var(--brand-soft)', color: 'var(--brand)',
                              fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap',
                            }}>● {ft.label}</span>
                          : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                        }
                      </td>
                      <td>
                        {s.tax_id
                          ? <div>
                              {idt && (
                                <div style={{ marginBottom: 3 }}>
                                  <span style={{
                                    display: 'inline-block', padding: '1px 7px', borderRadius: 5,
                                    background: '#e0f2fe', color: '#0369a1',
                                    fontWeight: 800, fontSize: 10, letterSpacing: '.04em',
                                  }}>{idt.label}</span>
                                  <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 5 }}>
                                    {idt.fullName}
                                  </span>
                                </div>
                              )}
                              <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600 }}>
                                {idt?.hasDV && s.tax_dv
                                  ? <>{s.tax_id}<span style={{ color: '#0369a1', fontWeight: 800 }}>-{s.tax_dv}</span></>
                                  : s.tax_id}
                              </div>
                            </div>
                          : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                        }
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {s.email  && <div style={{ display: 'flex', gap: 5, alignItems: 'center', color: 'var(--text)' }}>
                          <svg style={{ width: 12, height: 12, flexShrink: 0, color: 'var(--muted)' }} viewBox="0 0 20 20" fill="currentColor"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 155 }}>{s.email}</span>
                        </div>}
                        {s.mobile && <div style={{ display: 'flex', gap: 5, alignItems: 'center', color: 'var(--muted)', marginTop: 2 }}>
                          <svg style={{ width: 11, height: 11, flexShrink: 0 }} viewBox="0 0 20 20" fill="currentColor"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/></svg>
                          <span style={{ fontSize: 10, color: 'var(--brand)', fontWeight: 700, flexShrink: 0 }}>Cel</span>{s.mobile}
                        </div>}
                        {s.phone && <div style={{ display: 'flex', gap: 5, alignItems: 'center', color: 'var(--muted)', marginTop: 2 }}>
                          <svg style={{ width: 11, height: 11, flexShrink: 0 }} viewBox="0 0 20 20" fill="currentColor"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/></svg>
                          <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, flexShrink: 0 }}>Tel</span>{s.phone}
                        </div>}
                        {!s.email && !s.mobile && !s.phone && <span style={{ color: 'var(--muted)' }}>—</span>}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {s.city
                          ? <div>
                              <div style={{ fontWeight: 500 }}>{s.city}</div>
                              {s.address && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{s.address}</div>}
                            </div>
                          : s.address
                            ? <span style={{ color: 'var(--muted)' }}>{s.address}</span>
                            : <span style={{ color: 'var(--muted)' }}>—</span>
                        }
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                          background: 'var(--surface-2)', fontWeight: 700, fontSize: 12, letterSpacing: '.03em',
                        }}>{s.currency}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <ActiveBadge active={s.is_active} onClick={() => toggleEstado(s)} />
                      </td>
                      <td style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {s.created_at
                          ? <div>
                              <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 12 }}>
                                {new Date(s.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </div>
                              <div style={{ fontSize: 10, marginTop: 1 }}>
                                {new Date(s.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          : <span>—</span>
                        }
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          <Ib icon="edit" tip="Editar proveedor" variant="ghost" onClick={() => openEdit(s)} />
                          <Ib icon="delete" tip="Eliminar proveedor" variant="danger" onClick={() => setConfirmDel(s)} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ── Footer: paginación ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            padding: '10px 16px', borderTop: '1px solid var(--border)',
            background: 'var(--surface-2)', fontSize: 12, color: 'var(--muted)',
          }}>
            {/* Info */}
            <span style={{ flexShrink: 0 }}>
              {filtered.length === 0 ? '0 proveedores' : (
                <>
                  <strong style={{ color: 'var(--text)' }}>{(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)}</strong>
                  {' de '}
                  <strong style={{ color: 'var(--text)' }}>{filtered.length}</strong>
                  {search ? ` (filtrado de ${suppliers.length})` : ' proveedores'}
                </>
              )}
            </span>

            <div style={{ flex: 1 }} />

            {/* Filas por página */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span>Filas por página:</span>
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                style={{ fontSize: 12, padding: '2px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}
              >
                {[25, 50, 100, 500].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            {/* Controles de página */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <button onClick={() => setPage(1)} disabled={safePage === 1} style={pgBtn(safePage === 1)} title="Primera página">«</button>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1} style={pgBtn(safePage === 1)} title="Anterior">‹</button>
                {/* Páginas numeradas */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
                  .reduce((acc, p, i, arr) => {
                    if (i > 0 && p - arr[i - 1] > 1) acc.push('…')
                    acc.push(p)
                    return acc
                  }, [])
                  .map((p, i) =>
                    p === '…'
                      ? <span key={`e${i}`} style={{ padding: '0 4px', color: 'var(--muted)' }}>…</span>
                      : <button key={p} onClick={() => setPage(p)} style={{
                          ...pgBtn(false),
                          background: p === safePage ? 'var(--brand)' : 'var(--surface)',
                          color: p === safePage ? '#fff' : 'var(--text)',
                          fontWeight: p === safePage ? 700 : 500,
                          borderColor: p === safePage ? 'var(--brand)' : 'var(--border)',
                        }}>{p}</button>
                  )
                }
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} style={pgBtn(safePage === totalPages)} title="Siguiente">›</button>
                <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages} style={pgBtn(safePage === totalPages)} title="Última página">»</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: Nuevo / Editar proveedor ── */}
      {showForm && (
        <div className="modal-bg" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <form onSubmit={editSupId ? handleSaveEdit : handleSave} className="form-card" style={{
            maxWidth: 560, width: '100%', margin: 0, maxHeight: '92vh', overflowY: 'auto',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 className="form-card-title" style={{ margin: 0 }}>
                🏭 {editSupId ? 'Editar proveedor' : 'Nuevo proveedor'}
              </h3>
              <Ib icon="close" tip="Cerrar" variant="ghost" onClick={() => setShowForm(false)} />
            </div>

            {/* ── Sección: Datos generales ── */}
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 10 }}>Datos generales</div>

            <div className="form-field">
              <label>Razón social / Nombre <span style={{ color: 'var(--brand)' }}>*</span></label>
              <input placeholder="Distribuidora ABC S.A." value={sup.name}
                onChange={e => setSup({ ...sup, name: e.target.value })} required autoFocus />
            </div>

            {/* ── Sección: Perfil fiscal ── */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              margin: '20px 0 12px', padding: '8px 12px',
              background: 'var(--surface-2)', borderRadius: 8,
              borderLeft: '3px solid var(--brand)',
            }}>
              <span style={{ fontSize: 14 }}>🏛️</span>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--brand)' }}>Perfil fiscal</span>
            </div>

            {/* Tipo de persona — chips */}
            <div className="form-field">
              <label style={{ marginBottom: 8, display: 'block', fontWeight: 600 }}>Tipo de persona</label>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {fiscalTypes.map(ft => {
                  const sel = sup.fiscal_person_type === ft.value
                  return (
                    <button key={ft.value} type="button"
                      onClick={() => {
                        const newPT = ft.value
                        const newAvail = getAvailableIdTypes(country, newPT)
                        const idStillValid = newAvail.some(t => t.value === sup.fiscal_id_type)
                        const autoId = !idStillValid ? (newAvail.length === 1 ? newAvail[0].value : '') : sup.fiscal_id_type
                        setSup({ ...sup, fiscal_person_type: newPT, fiscal_id_type: autoId, tax_id: idStillValid ? sup.tax_id : '', tax_dv: idStillValid ? sup.tax_dv : '' })
                      }}
                      style={{
                        padding: '8px 18px', borderRadius: 20, cursor: 'pointer',
                        border: `2px solid ${sel ? 'var(--brand)' : 'var(--border)'}`,
                        background: sel ? 'var(--brand)' : 'var(--surface)',
                        color: sel ? '#fff' : 'var(--text)',
                        fontWeight: 600, fontSize: 13, transition: 'all .15s',
                        boxShadow: sel ? '0 2px 8px rgba(0,0,0,.12)' : 'none',
                      }}>
                      {ft.label}
                    </button>
                  )
                })}
              </div>
              {sup.fiscal_person_type && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: 'var(--brand)' }}>ℹ</span>
                  {fiscalTypes.find(t => t.value === sup.fiscal_person_type)?.hint}
                </div>
              )}
            </div>

            {/* Tipo de identificación fiscal — chips con nombre completo */}
            {availableIdTypes.length > 0 && (
              <div className="form-field">
                <label style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                  Tipo de identificación fiscal
                  {!sup.fiscal_person_type && (
                    <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400, background: 'var(--surface-2)', padding: '2px 7px', borderRadius: 10 }}>
                      selecciona tipo de persona para filtrar
                    </span>
                  )}
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {availableIdTypes.map(dt => {
                    const sel = sup.fiscal_id_type === dt.value
                    return (
                      <button key={dt.value} type="button"
                        onClick={() => setSup({ ...sup, fiscal_id_type: dt.value, tax_id: '', tax_dv: '' })}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                          border: `2px solid ${sel ? '#0ea5e9' : 'var(--border)'}`,
                          background: sel ? '#f0f9ff' : 'var(--surface)',
                          transition: 'all .15s',
                          boxShadow: sel ? '0 2px 8px rgba(14,165,233,.15)' : 'none',
                        }}>
                        {/* Badge código */}
                        <span style={{
                          flexShrink: 0, padding: '3px 10px', borderRadius: 8,
                          background: sel ? '#0ea5e9' : 'var(--surface-2)',
                          color: sel ? '#fff' : 'var(--muted)',
                          fontWeight: 800, fontSize: 12, letterSpacing: '.04em',
                          minWidth: 52, textAlign: 'center',
                        }}>
                          {dt.label}
                        </span>
                        {/* Nombre completo oficial */}
                        <span style={{
                          fontWeight: sel ? 700 : 500,
                          fontSize: 13,
                          color: sel ? '#0369a1' : 'var(--text)',
                          lineHeight: 1.3,
                        }}>
                          {dt.fullName}
                        </span>
                        {sel && (
                          <span style={{ marginLeft: 'auto', color: '#0ea5e9', fontSize: 16, flexShrink: 0 }}>✓</span>
                        )}
                      </button>
                    )
                  })}
                </div>
                {sup.fiscal_id_type && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, padding: '6px 10px', background: 'var(--surface-2)', borderRadius: 7, display: 'flex', alignItems: 'flex-start', gap: 5 }}>
                    <span style={{ color: '#0ea5e9', flexShrink: 0 }}>ℹ</span>
                    {availableIdTypes.find(t => t.value === sup.fiscal_id_type)?.hint}
                  </div>
                )}
              </div>
            )}

            {/* Número + D.V. — label usa el nombre oficial del documento */}
            {(() => {
              const dt = availableIdTypes.find(t => t.value === sup.fiscal_id_type)
              const fullId = dt?.format ? dt.format(sup.tax_id, sup.tax_dv) : sup.tax_id
              return (
                <div className="form-field">
                  <label style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    {dt ? (
                      <>
                        <span style={{
                          padding: '2px 9px', borderRadius: 7,
                          background: '#0ea5e9', color: '#fff',
                          fontWeight: 800, fontSize: 11, letterSpacing: '.04em',
                        }}>{dt.label}</span>
                        {dt.fullName}
                      </>
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>
                        Número de identificación
                        <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 400 }}>(selecciona el tipo primero)</span>
                      </span>
                    )}
                  </label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {dt?.hasDV && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', visibility: 'hidden' }}>_</span>
                      )}
                      <input
                        placeholder={dt?.placeholder || 'Ej. 900.123.456'}
                        value={sup.tax_id}
                        onChange={e => setSup({ ...sup, tax_id: e.target.value })}
                        style={{ width: '100%', margin: 0 }}
                        disabled={!dt}
                      />
                    </div>
                    {dt?.hasDV && (
                      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#0ea5e9', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                          {dt.dvLabel || 'D.V.'}
                        </span>
                        <input
                          placeholder="0"
                          maxLength={2}
                          value={sup.tax_dv}
                          onChange={e => setSup({ ...sup, tax_dv: e.target.value.replace(/\D/, '') })}
                          style={{ width: 64, textAlign: 'center', fontWeight: 800, fontSize: 18, letterSpacing: '.06em', padding: '8px 4px', margin: 0 }}
                        />
                      </div>
                    )}
                  </div>
                  {/* Preview del ID completo */}
                  {dt?.hasDV && sup.tax_id && (
                    <div style={{
                      marginTop: 8, padding: '9px 14px', borderRadius: 8,
                      background: sup.tax_dv ? '#f0f9ff' : 'var(--surface-2)',
                      border: `1.5px solid ${sup.tax_dv ? '#0ea5e9' : 'var(--border)'}`,
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        {dt.label} completo:
                      </span>
                      <code style={{ fontSize: 15, fontWeight: 800, color: sup.tax_dv ? '#0369a1' : 'var(--muted)', letterSpacing: '.04em', flex: 1 }}>
                        {sup.tax_dv ? fullId : <span>{sup.tax_id}<span style={{ opacity: .4 }}> — falta {dt.dvLabel || 'D.V.'}</span></span>}
                      </code>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* ── Sección: Ubicación ── */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              margin: '20px 0 12px', padding: '8px 12px',
              background: 'var(--surface-2)', borderRadius: 8,
              borderLeft: '3px solid #10b981',
            }}>
              <span style={{ fontSize: 14 }}>📍</span>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#10b981' }}>Ubicación</span>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Ciudad</label>
                <input placeholder="Bogotá / CDMX / Lima…" value={sup.city}
                  onChange={e => setSup({ ...sup, city: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Moneda preferida</label>
                <select value={sup.currency} onChange={e => setSup({ ...sup, currency: e.target.value })}>
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="form-field">
              <label>Dirección</label>
              <input placeholder="Calle, número, barrio" value={sup.address}
                onChange={e => setSup({ ...sup, address: e.target.value })} />
            </div>

            {/* ── Sección: Contacto ── */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              margin: '20px 0 12px', padding: '8px 12px',
              background: 'var(--surface-2)', borderRadius: 8,
              borderLeft: '3px solid #8b5cf6',
            }}>
              <span style={{ fontSize: 14 }}>📞</span>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#8b5cf6' }}>Contacto</span>
            </div>

            <div className="form-field">
              <label>Correo electrónico</label>
              <input type="email" placeholder="compras@empresa.com" value={sup.email}
                onChange={e => setSup({ ...sup, email: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="form-field">
                <label>Teléfono fijo</label>
                <input placeholder="+57 1 234 5678" value={sup.phone}
                  onChange={e => setSup({ ...sup, phone: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Celular</label>
                <input placeholder="+57 300 000 0000" value={sup.mobile}
                  onChange={e => setSup({ ...sup, mobile: e.target.value })} />
              </div>
            </div>

            {/* Acciones */}
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button type="submit" className="form-submit-btn" style={{ flex: 1, marginTop: 0 }}>
                {editSupId ? 'Actualizar proveedor' : 'Guardar proveedor'}
              </button>
              <Ab icon="close" label="Cancelar" variant="ghost" onClick={() => setShowForm(false)} />
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDel}
        title="Eliminar proveedor"
        message={`¿Estás seguro de eliminar a "${confirmDel?.name}"? Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmDel(null)}
      />

      {/* ── Modal: Importar CSV ── */}
      {showImport && (
        <div className="modal-bg" onClick={e => e.target === e.currentTarget && !bulkProgress && setShowImport(false)}>
          <div className="form-card" style={{ maxWidth: 600, width: '100%', margin: 0 }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 className="form-card-title" style={{ margin: 0 }}>📤 Importar proveedores CSV</h3>
              {!bulkProgress && (
                <button type="button" onClick={() => setShowImport(false)}
                  style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)', padding: '0 4px' }}>✕</button>
              )}
            </div>

            {!bulkResults ? (
              <>
                {/* Instrucciones */}
                <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '14px 16px', marginBottom: 16, fontSize: 13, lineHeight: 1.7, color: 'var(--text)' }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>¿Cómo funciona?</div>
                  <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--muted)' }}>
                    <li>Descarga el layout CSV con los campos y ejemplos.</li>
                    <li>Llena los datos de tus proveedores (una fila por proveedor).</li>
                    <li>Sube el archivo — se importarán automáticamente.</li>
                  </ol>
                </div>

                {/* Vista previa de columnas del layout */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                    Columnas del layout
                  </div>
                  <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <table style={{ fontSize: 11, borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
                      <thead>
                        <tr style={{ background: 'var(--surface-2)' }}>
                          {[
                            { col: 'name',               req: true,  desc: 'Razón social / Nombre' },
                            { col: 'fiscal_person_type', req: false, desc: 'Tipo persona (value interno)' },
                            { col: 'fiscal_id_type',     req: false, desc: 'Tipo doc. (NIT, CC, RFC…)' },
                            { col: 'tax_id',             req: false, desc: 'Número de identificación' },
                            { col: 'email',              req: false, desc: 'Correo electrónico' },
                            { col: 'phone',              req: false, desc: 'Teléfono fijo' },
                            { col: 'mobile',             req: false, desc: 'Celular' },
                            { col: 'city',               req: false, desc: 'Ciudad' },
                            { col: 'address',            req: false, desc: 'Dirección' },
                            { col: 'currency',           req: true,  desc: 'Moneda (3 letras)' },
                          ].map(({ col, req, desc }) => (
                            <th key={col} style={{
                              padding: '8px 10px', textAlign: 'left', borderRight: '1px solid var(--border)',
                              borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                            }}>
                              <div style={{ fontWeight: 800, color: req ? 'var(--brand)' : 'var(--text)', fontSize: 11 }}>
                                {col}{req ? ' *' : ''}
                              </div>
                              <div style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 10, marginTop: 1 }}>{desc}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {SUPPLIER_CSV_EXAMPLES.map((row, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
                            {row.map((v, j) => (
                              <td key={j} style={{
                                padding: '5px 10px', borderRight: '1px solid var(--border)',
                                borderBottom: i < SUPPLIER_CSV_EXAMPLES.length - 1 ? '1px solid var(--border)' : 'none',
                                color: 'var(--muted)', fontSize: 11, maxWidth: 120,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                                {v || <span style={{ opacity: .35 }}>—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                    * Obligatorios · fiscal_person_type: usa los valores internos (ej. <code>persona_natural</code>, <code>persona_juridica</code>)
                  </div>
                </div>

                {/* Zona drag & drop */}
                {!bulkProgress ? (
                  <div
                    onDragOver={e => { e.preventDefault(); setDrag(true) }}
                    onDragLeave={() => setDrag(false)}
                    onDrop={handleDrop}
                    onClick={() => fileRef.current?.click()}
                    style={{
                      border: `2px dashed ${drag ? 'var(--brand)' : 'var(--border)'}`,
                      borderRadius: 12, padding: '28px 20px', textAlign: 'center',
                      cursor: 'pointer', transition: 'all .2s',
                      background: drag ? 'var(--brand-soft)' : 'var(--surface)',
                      marginBottom: 14,
                    }}
                  >
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: drag ? 'var(--brand)' : 'var(--text)', marginBottom: 4 }}>
                      {drag ? 'Suelta el archivo aquí' : 'Arrastra tu CSV aquí'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>o haz clic para seleccionar un archivo .csv</div>
                  </div>
                ) : (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
                      <span style={{ fontWeight: 600 }}>Importando… {bulkProgress.done} / {bulkProgress.total}</span>
                      {bulkProgress.errors > 0 && <span style={{ color: '#dc2626', fontWeight: 600 }}>{bulkProgress.errors} error(es)</span>}
                    </div>
                    <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 4, transition: 'width .3s',
                        background: bulkProgress.errors > 0 ? '#f59e0b' : 'var(--brand)',
                        width: `${Math.round((bulkProgress.done / bulkProgress.total) * 100)}%`,
                      }} />
                    </div>
                  </div>
                )}

                <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileInput} />

                <Ab icon="download" label="Descargar layout CSV" variant="ghost" style={{ width: '100%' }} onClick={downloadLayout} />
              </>
            ) : (
              /* Resultados de la importación */
              <>
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  <div style={{ flex: 1, background: '#dcfce7', borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#16a34a' }}>
                      {bulkResults.filter(r => !r.error).length}
                    </div>
                    <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600, marginTop: 2 }}>Importados</div>
                  </div>
                  {bulkResults.some(r => r.error) && (
                    <div style={{ flex: 1, background: '#fee2e2', borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: '#dc2626' }}>
                        {bulkResults.filter(r => r.error).length}
                      </div>
                      <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 600, marginTop: 2 }}>Con error</div>
                    </div>
                  )}
                </div>

                <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 14 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)', position: 'sticky', top: 0 }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>ID</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>Proveedor</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>Doc. fiscal</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkResults.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '7px 12px' }}>
                            {r.id != null
                              ? <code style={{ fontWeight: 800, color: 'var(--brand)', fontSize: 13 }}>#{r.id}</code>
                              : <span style={{ color: 'var(--muted)' }}>—</span>}
                          </td>
                          <td style={{ padding: '7px 12px' }}>
                            <div style={{ fontWeight: 600 }}>{r.name}</div>
                            {r.fiscal && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{fiscalLabel(r.fiscal)}</div>}
                          </td>
                          <td style={{ padding: '7px 12px', fontSize: 12 }}>
                            {r.idType
                              ? <span><strong>{r.idType}</strong>{r.taxId ? ` · ${r.taxId}` : ''}</span>
                              : <span style={{ color: 'var(--muted)' }}>—</span>}
                          </td>
                          <td style={{ padding: '7px 12px' }}>
                            {r.error
                              ? <span style={{ color: '#dc2626', fontWeight: 600 }}>✕ {r.error}</span>
                              : <span style={{ color: '#059669', fontWeight: 600 }}>✓ Creado</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <Ab icon="upload" label="Importar otro" variant="ghost" style={{ flex: 1 }} onClick={() => setBulkResults(null)} />
                  <button className="primary-btn" style={{ flex: 1 }}
                    onClick={() => { setBulkResults(null); setShowImport(false) }}>
                    Cerrar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* Parser CSV simple con soporte de comillas */
function parseCsvLine(line) {
  const result = []; let cur = ''; let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      result.push(cur); cur = ''
    } else cur += ch
  }
  result.push(cur)
  return result
}

/* ── Estado de cuenta ── */
/* ── Entradas de Almacén — listado general ── */
function EntradasAlmacen({ notify }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null)   // entry detail
  const [filters, setFilters] = useState({ date_from: '', date_to: '' })
  const { currency } = useAuth()

  const load = () => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (filters.date_from) qs.set('date_from', filters.date_from)
    if (filters.date_to)   qs.set('date_to',   filters.date_to)
    api.listAllEntries(qs.toString() ? `?${qs}` : '')
      .then(setEntries).catch(e => notify(e.message, 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const totales = entries.reduce((s, e) => s + n(e.total), 0)

  return (
    <div className="vtab-content">
      {detail && <EntryDetailModal entry={detail} onClose={() => setDetail(null)} notify={notify} />}

      <div className="section-header" style={{ marginBottom: 16 }}>
        <h3 className="section-title" style={{ fontSize: 16 }}>Entradas de Almacén</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={filters.date_from}
            onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))}
            style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', background: 'var(--surface)', color: 'var(--text)' }} />
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>–</span>
          <input type="date" value={filters.date_to}
            onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))}
            style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', background: 'var(--surface)', color: 'var(--text)' }} />
          <button onClick={load} style={{ padding: '5px 14px', fontSize: 12, borderRadius: 6, border: 'none', background: 'var(--brand)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
            Filtrar
          </button>
        </div>
      </div>

      {/* KPI totales */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          ['Total entradas', entries.length, '📦'],
          ['Monto total', formatMoney(totales, currency), '💰'],
          ['OCs relacionadas', new Set(entries.map(e => e.po_id).filter(Boolean)).size, '🧾'],
        ].map(([label, val, icon]) => (
          <div key={label} style={{ flex: '1 0 160px', background: 'var(--surface-2)', borderRadius: 10, padding: '12px 16px', minWidth: 150 }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{val}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Cargando…</div>
        : entries.length === 0 ? <EmptyState icon="📦" text="Sin entradas de almacén" sub="Las entradas se crean automáticamente al recibir órdenes de compra" />
        : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Entrada</th>
                  <th>Fecha</th>
                  <th>Proveedor</th>
                  <th style={{ textAlign: 'center' }}>OC</th>
                  <th style={{ textAlign: 'center' }}>Estado OC</th>
                  <th style={{ textAlign: 'center' }}>Líneas</th>
                  <th style={{ textAlign: 'right' }}>Monto</th>
                  <th>Notas</th>
                  <th style={{ width: 50 }}></th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id}>
                    <td><strong style={{ color: 'var(--brand)' }}>{e.entry_no}</strong></td>
                    <td style={{ fontSize: 12 }}>{e.entry_date}</td>
                    <td style={{ fontSize: 13 }}>{e.supplier_name || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      {e.po_id ? <span className="row-id">{'OC-'+String(e.po_id).padStart(6,'0')}</span> : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {e.po_status ? <PoBadge status={e.po_status} /> : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>{e.line_count}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--brand)' }}>{formatMoney(e.total, currency)}</td>
                    <td style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.notes || '—'}</td>
                    <td>
                      <Ib icon="view" tip="Ver detalle" variant="ghost"
                        onClick={() => api.getEntryDetail(e.id).then(setDetail).catch(err => notify(err.message, 'error'))} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="6" style={{ textAlign: 'right', fontWeight: 700, fontSize: 12, padding: '10px 8px' }}>Total período:</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--brand)', fontSize: 14, padding: '10px 8px' }}>{formatMoney(totales, currency)}</td>
                  <td colSpan="2" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
    </div>
  )
}

/* ── Entry Detail Modal ── */
function EntryDetailModal({ entry, onClose, notify }) {
  if (!entry) return null
  const currency = entry.currency || 'USD'
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 680,
        maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>📦 {entry.entry_no}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {entry.supplier_name} · {entry.entry_date}
              {entry.po_id && <span> · <strong>{'OC-'+String(entry.po_id).padStart(6,'0')}</strong></span>}
            </div>
          </div>
          <Ib icon="close" tip="Cerrar" variant="ghost" onClick={onClose} />
        </div>
        {entry.notes && (
          <div style={{ padding: '8px 20px', background: 'var(--surface-2)', fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
            📝 {entry.notes}
          </div>
        )}
        <div style={{ overflowY: 'auto', flex: 1, padding: 20 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Producto / Variante</th>
                  <th style={{ textAlign: 'center', width: 70 }}>Cant.</th>
                  <th style={{ textAlign: 'right', width: 110 }}>Costo unit.</th>
                  <th style={{ textAlign: 'right', width: 110 }}>Total línea</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {(entry.lines || []).map(l => (
                  <tr key={l.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{l.product_name}</div>
                      <code style={{ fontSize: 10, color: 'var(--muted)' }}>{l.variant_sku}{l.size ? ` T${l.size}` : ''}{l.color ? ` ${l.color}` : ''}</code>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{n(l.qty)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)', fontSize: 12 }}>{formatMoney(l.unit_cost, currency)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--brand)' }}>{formatMoney(l.line_total, currency)}</td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>{l.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ padding: '10px 8px', fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                    {(entry.lines || []).length} ítem(s)
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 800, fontSize: 13, padding: '10px 8px' }}>
                    {(entry.lines || []).reduce((s, l) => s + n(l.qty), 0).toLocaleString()} uds.
                  </td>
                  <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--muted)', padding: '10px 8px' }}>Total:</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--brand)', fontSize: 15, padding: '10px 8px' }}>
                    {formatMoney(entry.total, currency)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── helpers aging ── */
const AGING_BUCKETS = [
  { key: 'vigente',  label: 'Vigente',      color: '#15803d', bg: '#dcfce7' },
  { key: '1_30',     label: '1–30 días',    color: '#dc2626', bg: '#fee2e2' },
  { key: '31_60',    label: '31–60 días',   color: '#dc2626', bg: '#fecaca' },
  { key: '61_90',    label: '61–90 días',   color: '#b91c1c', bg: '#fca5a5' },
  { key: 'mas_90',   label: 'Más de 90d',   color: '#7f1d1d', bg: '#f87171' },
  { key: 'sin_fecha',label: 'Vigente',      color: '#15803d', bg: '#dcfce7' },
  { key: 'locked',   label: 'Bloqueada',    color: '#6b7280', bg: '#f3f4f6' },
  { key: 'paid',     label: 'Pagada',       color: '#15803d', bg: '#dcfce7' },
]
function agingStyle(bucket) {
  const b = AGING_BUCKETS.find(x => x.key === bucket) || AGING_BUCKETS[5]
  return { background: b.bg, color: b.color }
}
function agingLabel(bucket) {
  return (AGING_BUCKETS.find(x => x.key === bucket) || { label: bucket }).label
}

function InvStatusBadge({ inv }) {
  const bucket = inv.aging_bucket || (inv.status === 'paid' ? 'paid' : inv.status === 'locked' ? 'locked' : 'sin_fecha')
  const st = agingStyle(bucket)
  let label = inv.status === 'paid' ? 'Pagada' : inv.status === 'locked' ? '🔒 Bloqueada'
    : inv.status === 'partial' ? 'Pago parcial'
    : agingLabel(bucket)
  return (
    <span style={{ ...st, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

function FacturacionTab({ notify, suppliers, isAdmin, onEditPo, onDeletePo, onEditEntry, onDeleteEntry }) {
  const { currency: defCur } = useAuth()
  const [view, setView]         = useState('cxp')  // 'cxp' | 'cartera'
  const [estadoCuenta, setEstadoCuenta] = useState([])  // por proveedor
  const [cartera, setCartera]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState({})  // supplier_id → bool

  // Modals
  const [pay, setPay]               = useState(null)
  const [showNew, setShowNew]       = useState(false)
  const [detailInv, setDetailInv]   = useState(null)
  const [poFromInvoice, setPoFromInvoice] = useState(null)  // po id to open PODetailModal from invoice
  // Admin: edit/delete facturas
  const [editInvModal, setEditInvModal]     = useState(null)  // { id, invoice_no, supplier_ref, invoice_date, payment_days, notes, total, currency }
  const [deleteInvModal, setDeleteInvModal] = useState(null)  // { id, invoice_no }
  const [adminBusy, setAdminBusy] = useState(false)

  // Nueva factura wizard
  const emptyForm = { supplier_id: '', po_ids: [], supplier_ref: '', invoice_date: '', payment_days: 30, currency: defCur, total: '', notes: '' }
  const [form, setForm]           = useState(emptyForm)
  const [wizStep, setWizStep]     = useState(0)   // 0=tipo, 1=OCs(linked)/proveedor(free), 2=datos
  const [wizLinked, setWizLinked] = useState(null) // true=con OCs, false=libre
  const [suppSearch, setSuppSearch] = useState('')
  const [supplierPos, setSupplierPos] = useState([])   // OCs del proveedor seleccionado (paso 2)
  const [allPosWithEntries, setAllPosWithEntries] = useState([]) // todas las OCs con entradas (paso 1 linked)
  const [loadingPos, setLoadingPos]   = useState(false)

  function openNew(suppId) {
    setForm({ ...emptyForm, supplier_id: suppId ? String(suppId) : '' })
    setSuppSearch(''); setSupplierPos([]); setAllPosWithEntries([])
    if (suppId) {
      // Viene de un proveedor con entregas confirmadas → saltar directo a datos de factura
      setWizLinked(true); setWizStep(2)
      setLoadingPos(true)
      api.getSupplierPosWithEntries(suppId)
        .then(pos => { setSupplierPos(pos) })
        .catch(() => {})
        .finally(() => setLoadingPos(false))
    } else {
      setWizLinked(null); setWizStep(0)
    }
    setShowNew(true)
  }
  function closeNew() {
    setShowNew(false); setForm(emptyForm); setWizStep(0)
    setWizLinked(null); setSuppSearch(''); setSupplierPos([]); setAllPosWithEntries([])
  }

  async function chooseType(linked) {
    setWizLinked(linked)
    if (linked) {
      setLoadingPos(true)
      try {
        const pos = await api.getAllPosWithEntries()
        setAllPosWithEntries(pos)
      } catch (_) { setAllPosWithEntries([]) }
      finally { setLoadingPos(false) }
    }
    setWizStep(1)
  }

  // Seleccionar OC en paso 1 (linked): infiere proveedor y carga sus OCs restantes
  async function selectPoFromList(po) {
    const suppId = po.supplier_id
    setForm(f => ({ ...f, supplier_id: String(suppId), po_ids: [po.id],
      total: n(po.entries_total).toFixed(2), currency: po.currency }))
    setWizStep(2)
    setLoadingPos(true)
    try {
      const pos = await api.getSupplierPosWithEntries(suppId)
      setSupplierPos(pos)
    } catch (e) { notify(e.message, 'error') }
    finally { setLoadingPos(false) }
  }

  // Filtros
  const [suppSearch2, setSuppSearch2] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [ec, cart] = await Promise.all([
        api.getEstadoCuentaProveedores(),
        api.getCartera(),
      ])
      setEstadoCuenta(ec); setCartera(cart)
      // Expandir todos por defecto
      const exp = {}
      ec.forEach(p => { exp[p.supplier_id] = true })
      setExpanded(exp)
    } catch (e) { notify(e.message, 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])


  // Al seleccionar/deseleccionar OC, recalcular total
  function togglePo(po) {
    setForm(f => {
      const already = f.po_ids.includes(po.id)
      const newIds = already ? f.po_ids.filter(id => id !== po.id) : [...f.po_ids, po.id]
      const newTotal = supplierPos
        .filter(p => newIds.includes(p.id))
        .reduce((s, p) => s + n(p.entries_total || p.total), 0)
      return { ...f, po_ids: newIds, total: newTotal.toFixed(2) }
    })
  }

  async function submitNewInvoice(e) {
    e.preventDefault()
    if (!form.supplier_id) return notify('Selecciona un proveedor', 'error')
    if (!form.total || n(form.total) <= 0) return notify('El monto de la factura debe ser mayor a 0', 'error')
    try {
      const r = await api.createInvoice({
        supplier_id: Number(form.supplier_id),
        po_ids: form.po_ids,
        supplier_ref: form.supplier_ref || null,
        invoice_date: form.invoice_date || null,
        payment_days: Number(form.payment_days) || 30,
        currency: form.currency,
        total: Number(form.total),
        notes: form.notes || null,
      })
      const msg = r.status === 'locked'
        ? `Factura ${r.invoice_no} creada — pendiente de confirmar entradas para desbloquear pago`
        : `Factura ${r.invoice_no} creada y desbloqueada para pago`
      notify(msg)
      setForm(emptyForm); setSupplierPos([]); setShowNew(false); load()
    } catch (err) { notify(err.message, 'error') }
  }

  async function submitPay(e) {
    e.preventDefault()
    try {
      const r = await api.payInvoice(pay.invoice.id, { amount: Number(pay.amount), method: pay.method, reference: pay.reference || null })
      notify(`Pago registrado · Saldo: ${formatMoney(r.balance, pay.invoice.currency)}`)
      setPay(null)
      if (detailInv?.id === pay.invoice.id) {
        const d = await api.getInvoiceDetail(pay.invoice.id)
        setDetailInv(d)
      }
      load()
    } catch (err) { notify(err.message, 'error') }
  }

  async function openDetail(inv) {
    try {
      const d = await api.getInvoiceDetail(inv.id)
      setDetailInv(d)
    } catch (e) { notify(e.message, 'error') }
  }

  async function saveInvEdit() {
    setAdminBusy(true)
    try {
      await api.updateInvoice(editInvModal.id, {
        supplier_ref: editInvModal.supplier_ref || null,
        invoice_date: editInvModal.invoice_date || null,
        payment_days: Number(editInvModal.payment_days) || 30,
        notes: editInvModal.notes || null,
        total: n(editInvModal.total) > 0 ? n(editInvModal.total) : undefined,
      })
      notify('Factura actualizada'); setEditInvModal(null); load()
    } catch (e) { notify(e.message, 'error') }
    finally { setAdminBusy(false) }
  }

  async function confirmDeleteInv() {
    setAdminBusy(true)
    try {
      await api.deleteInvoice(deleteInvModal.id)
      notify(`${deleteInvModal.invoice_no} eliminada`); setDeleteInvModal(null); load()
    } catch (e) { notify(e.message, 'error') }
    finally { setAdminBusy(false) }
  }

  // Derived
  const filteredEC  = estadoCuenta.filter(p =>
    !suppSearch2 || p.supplier_name.toLowerCase().includes(suppSearch2.toLowerCase())
  )
  const totalDeuda  = estadoCuenta.reduce((s, p) =>
    s + p.facturas.filter(f => f.status !== 'paid').reduce((a, f) => a + n(f.balance), 0), 0)
  const totalOcPend = estadoCuenta.reduce((s, p) => s + p.ocs_sin_factura.length, 0)
  const totalVenc   = estadoCuenta.reduce((s, p) =>
    s + p.facturas.filter(f => f.status !== 'paid' && n(f.days_overdue) > 0).length, 0)

  // Cartera buckets
  const carteraBuckets = ['vigente','1_30','31_60','61_90','mas_90'].map(key => ({
    key, ...AGING_BUCKETS.find(b => b.key === key),
    total: cartera.filter(r => r.bucket === key && r.status !== 'paid').reduce((s, r) => s + n(r.balance), 0),
    count: cartera.filter(r => r.bucket === key && r.status !== 'paid').length,
  }))

  return (
    <div className="vtab-content">

      {/* ── PODetailModal abierto desde factura ── */}
      {poFromInvoice && (
        <PODetailModal
          poId={poFromInvoice}
          onClose={() => setPoFromInvoice(null)}
          onOpenReceive={() => {}}
          notify={notify}
          onRefresh={load}
          isAdmin={isAdmin}
          onEditPo={onEditPo || (() => {})}
          onDeletePo={onDeletePo || (() => {})}
          onEditEntry={onEditEntry || (() => {})}
          onDeleteEntry={onDeleteEntry || (() => {})}
        />
      )}

      {/* ── Modal nueva factura (wizard) ── */}
      {showNew && (() => {
        const WIZ_STEPS = wizLinked ? ['Tipo', 'OC', 'Datos'] : ['Tipo', 'Proveedor', 'Datos']
        const selectedSupplier = suppliers.find(s => s.id === Number(form.supplier_id))
        const dueDate = (() => {
          if (!form.invoice_date || !form.payment_days) return null
          const d = new Date(form.invoice_date)
          d.setDate(d.getDate() + Number(form.payment_days))
          return d.toISOString().slice(0, 10)
        })()
        const BTN = { base: { padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' } }

        return (
          <div className="modal-bg" onClick={e => e.target === e.currentTarget && closeNew()}>
            <div style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 640,
              maxHeight: '94vh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 24px 80px rgba(0,0,0,.4)', overflow: 'hidden' }}>

              {/* ── Header con stepper ── */}
              <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                flexShrink: 0, background: 'var(--surface)' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>📄 Nueva factura de proveedor</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
                    {WIZ_STEPS.map((label, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: '50%', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800,
                          flexShrink: 0,
                          background: i <= wizStep ? 'var(--brand)' : 'var(--surface-2)',
                          color: i <= wizStep ? '#fff' : 'var(--muted)',
                          border: i <= wizStep ? 'none' : '1.5px solid var(--border)',
                        }}>{i < wizStep ? '✓' : i + 1}</div>
                        <span style={{ fontSize: 12, fontWeight: 600,
                          color: i === wizStep ? 'var(--text)' : 'var(--muted)' }}>{label}</span>
                        {i < WIZ_STEPS.length - 1 && (
                          <div style={{ width: 28, height: 2, borderRadius: 2,
                            background: i < wizStep ? 'var(--brand)' : 'var(--border)', flexShrink: 0 }} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <Ib icon="close" tip="Cancelar" variant="ghost" onClick={closeNew} />
              </div>

              {/* ── Paso 0: Tipo de factura ── */}
              {wizStep === 0 && (
                <div style={{ padding: '24px 22px', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ margin: '0 0 4px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                    ¿Esta factura está relacionada con órdenes de compra que ya tienen recepciones de mercancía confirmadas?
                  </p>
                  {[
                    {
                      linked: true, icon: '🔗',
                      title: 'Sí — vinculada a OC recibidas',
                      desc: 'Muestra los proveedores con órdenes y entradas confirmadas. La factura quedará habilitada para pago de inmediato.',
                      accent: 'var(--brand)',
                    },
                    {
                      linked: false, icon: '📝',
                      title: 'No — factura libre (sin OC)',
                      desc: 'Lista completa de proveedores. La factura queda bloqueada hasta que se confirmen entradas de almacén.',
                      accent: '#6b7280',
                    },
                  ].map(opt => (
                    <button key={String(opt.linked)} type="button" onClick={() => chooseType(opt.linked)}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 18px',
                        borderRadius: 10, border: `2px solid ${opt.linked ? 'var(--brand)' : 'var(--border)'}`,
                        background: 'var(--surface-2)', cursor: 'pointer', textAlign: 'left',
                        transition: 'border-color .15s, box-shadow .15s' }}
                      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.12)' }}
                      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}>
                      <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>{opt.icon}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: opt.accent, marginBottom: 5 }}>{opt.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>{opt.desc}</div>
                      </div>
                    </button>
                  ))}
                  <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', paddingTop: 8 }}>
                    <button type="button" onClick={closeNew}
                      style={{ ...BTN.base, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* ── Paso 1: OCs con entradas (linked) o selección de proveedor (libre) ── */}
              {wizStep === 1 && wizLinked && (
                <div style={{ padding: '18px 22px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                    🔗 Selecciona la OC a facturar
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Solo se muestran órdenes con recepciones confirmadas. Al seleccionar una OC se cargará el proveedor automáticamente.
                  </div>
                  {loadingPos ? (
                    <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Cargando órdenes…</div>
                  ) : allPosWithEntries.length === 0 ? (
                    <div style={{ padding: '10px 14px', background: '#fef3c7', borderRadius: 8, fontSize: 12, color: '#92400e', border: '1px solid #fde68a' }}>
                      ⚠️ No hay órdenes de compra con recepciones confirmadas pendientes de facturar.
                    </div>
                  ) : (
                    <>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                          color: 'var(--muted)', fontSize: 14, pointerEvents: 'none' }}>🔍</span>
                        <input autoFocus placeholder="Buscar OC o proveedor…" value={suppSearch}
                          onChange={e => setSuppSearch(e.target.value)}
                          style={{ width: '100%', paddingLeft: 34, paddingRight: 12, height: 36, borderRadius: 8,
                            border: '1.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)',
                            fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
                      </div>
                      <div style={{ flex: 1, overflowY: 'auto', border: '1.5px solid var(--border)', borderRadius: 8, minHeight: 0, background: 'var(--surface)' }}>
                        {(() => {
                          const q = suppSearch.trim().toLowerCase()
                          const filtered = q ? allPosWithEntries.filter(p =>
                            (p.po_no || '').toLowerCase().includes(q) ||
                            (p.supplier_name || '').toLowerCase().includes(q)
                          ) : allPosWithEntries
                          if (filtered.length === 0) return (
                            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                              Sin resultados para "{suppSearch}"
                            </div>
                          )
                          return filtered.map((po, idx) => (
                            <button key={po.id} type="button" onClick={() => selectPoFromList(po)}
                              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
                                background: 'var(--surface)', border: 'none',
                                borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                                cursor: 'pointer', textAlign: 'left', opacity: po.already_invoiced ? 0.65 : 1 }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <span>{po.po_no || 'OC-'+String(po.id).padStart(6,'0')}</span>
                                  <PoBadge status={po.status} />
                                  {po.already_invoiced && (
                                    <span style={{ fontSize: 10, color: '#d97706', fontWeight: 700,
                                      background: '#fef3c7', padding: '1px 6px', borderRadius: 4, border: '1px solid #fde68a' }}>
                                      ya facturada
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                                  🏭 {po.supplier_name} · {po.entry_count} entrada(s)
                                </div>
                              </div>
                              <div style={{ flexShrink: 0, textAlign: 'right' }}>
                                <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--brand)' }}>
                                  {formatMoney(n(po.entries_total), po.currency)}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--muted)' }}>recibido</div>
                              </div>
                            </button>
                          ))
                        })()}
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                    <button type="button" onClick={() => { setWizStep(0); setSuppSearch('') }}
                      style={{ ...BTN.base, flex: 1, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }}>
                      ← Atrás
                    </button>
                    <button type="button" onClick={closeNew}
                      style={{ ...BTN.base, flex: 1, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--muted)' }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* ── Paso 1 libre: selección de proveedor ── */}
              {wizStep === 1 && !wizLinked && (
                <div style={{ padding: '18px 22px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                    📋 Selecciona el proveedor
                  </div>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                      color: 'var(--muted)', fontSize: 14, pointerEvents: 'none' }}>🔍</span>
                    <input autoFocus placeholder="Buscar proveedor…" value={suppSearch}
                      onChange={e => setSuppSearch(e.target.value)}
                      style={{ width: '100%', paddingLeft: 34, paddingRight: 12, height: 36, borderRadius: 8,
                        border: '1.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)',
                        fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', border: '1.5px solid var(--border)', borderRadius: 8, minHeight: 0, background: 'var(--surface)' }}>
                    {(() => {
                      const q = suppSearch.trim().toLowerCase()
                      const list = q ? suppliers.filter(s => s.name.toLowerCase().includes(q)) : suppliers
                      if (list.length === 0) return (
                        <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                          {suppSearch ? `Sin resultados para "${suppSearch}"` : 'Sin proveedores disponibles'}
                        </div>
                      )
                      return list.map((s, idx) => (
                        <button key={s.id} type="button"
                          onClick={() => { setForm(f => ({ ...f, supplier_id: String(s.id) })); setSuppSearch(''); setWizStep(2) }}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
                            background: 'var(--surface)', border: 'none',
                            borderBottom: idx < list.length - 1 ? '1px solid var(--border)' : 'none',
                            cursor: 'pointer', textAlign: 'left' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                            {s.tax_id && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>NIT/ID: {s.tax_id}</div>}
                          </div>
                          <span style={{ color: 'var(--muted)', fontSize: 18, flexShrink: 0 }}>›</span>
                        </button>
                      ))
                    })()}
                  </div>
                  <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                    <button type="button" onClick={() => { setWizStep(0); setSuppSearch('') }}
                      style={{ ...BTN.base, flex: 1, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }}>
                      ← Atrás
                    </button>
                    <button type="button" onClick={closeNew}
                      style={{ ...BTN.base, flex: 1, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--muted)' }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* ── Paso 2: Datos de la factura + OCs ── */}
              {wizStep === 2 && (
                <form onSubmit={submitNewInvoice} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                  <div style={{ overflowY: 'auto', flex: 1, padding: '18px 22px' }}>

                    {/* Proveedor seleccionado */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                      background: 'var(--surface-2)', borderRadius: 10, marginBottom: 20,
                      border: '1.5px solid var(--border)' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--surface)',
                        border: '1px solid var(--border)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🏭</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{selectedSupplier?.name}</div>
                        {selectedSupplier?.tax_id && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>NIT/ID: {selectedSupplier.tax_id}</div>}
                      </div>
                      {wizStep > 0 && (
                        <button type="button" onClick={() => { setWizStep(1); setSuppSearch('') }}
                          style={{ fontSize: 11, color: 'var(--brand)', background: 'none', border: '1px solid var(--brand)',
                            borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}>
                          Cambiar
                        </button>
                      )}
                    </div>

                    {/* Sección: Datos de la factura */}
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.06em',
                      textTransform: 'uppercase', marginBottom: 10 }}>Encabezado de factura</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', marginBottom: 22 }}>
                      <div className="form-field">
                        <label>N° Factura del proveedor</label>
                        <input placeholder="Ej. FAC-2024-001"
                          value={form.supplier_ref}
                          onChange={e => setForm(f => ({ ...f, supplier_ref: e.target.value }))} />
                      </div>
                      <div className="form-field">
                        <label>Moneda</label>
                        <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                          {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="form-field">
                        <label>Fecha de emisión</label>
                        <input type="date" value={form.invoice_date}
                          onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value }))} />
                      </div>
                      <div className="form-field">
                        <label>Plazo de pago (días)</label>
                        <input type="number" min="0" value={form.payment_days}
                          onChange={e => setForm(f => ({ ...f, payment_days: e.target.value }))} />
                      </div>
                      <div className="form-field" style={{ gridColumn: 'span 2' }}>
                        <label>
                          Monto total de la factura *
                          {wizLinked && form.po_ids.length > 0 && (
                            <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>
                              (pre-llenado con total de entradas recibidas — ajusta si la factura difiere)
                            </span>
                          )}
                        </label>
                        <div style={{ position: 'relative' }}>
                          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
                            fontSize: 12, fontWeight: 700, color: 'var(--muted)', pointerEvents: 'none' }}>
                            {form.currency}
                          </span>
                          <input type="number" step="0.01" min="0.01" required
                            value={form.total}
                            onChange={e => setForm(f => ({ ...f, total: e.target.value }))}
                            style={{ paddingLeft: form.currency.length * 8 + 20 }} />
                        </div>
                        {n(form.total) > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6,
                            padding: '6px 10px', background: 'var(--surface-2)', borderRadius: 6,
                            border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand)' }}>
                              {formatMoney(n(form.total), form.currency)}
                            </span>
                            {dueDate && <span style={{ fontSize: 12, color: 'var(--muted)' }}>· Vence el {dueDate}</span>}
                          </div>
                        )}
                      </div>
                      <div className="form-field" style={{ gridColumn: 'span 2' }}>
                        <label>Notas u observaciones</label>
                        <input placeholder="Condiciones especiales, referencias internas…"
                          value={form.notes}
                          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                      </div>
                    </div>

                    {/* Sección: OCs vinculadas */}
                    {wizLinked && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.06em',
                          textTransform: 'uppercase', marginBottom: 10 }}>
                          Órdenes de compra con entradas confirmadas
                        </div>
                        {loadingPos && (
                          <div style={{ padding: '16px', background: 'var(--surface-2)', borderRadius: 8,
                            color: 'var(--muted)', fontSize: 13, textAlign: 'center', border: '1px solid var(--border)' }}>
                            Cargando órdenes…
                          </div>
                        )}
                        {!loadingPos && supplierPos.length === 0 && (
                          <div style={{ padding: '12px 14px', background: '#fef3c7', borderRadius: 8,
                            fontSize: 13, color: '#92400e', border: '1px solid #fde68a', lineHeight: 1.5 }}>
                            ⚠️ Este proveedor no tiene órdenes con entradas confirmadas.
                            La factura quedará <strong>bloqueada</strong> hasta que existan recepciones.
                          </div>
                        )}
                        {supplierPos.length > 0 && (
                          <div style={{ border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                            {supplierPos.map((po, idx) => {
                              const sel = form.po_ids.includes(po.id)
                              return (
                                <label key={po.id}
                                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                                    cursor: 'pointer',
                                    borderBottom: idx < supplierPos.length - 1 ? '1px solid var(--border)' : 'none',
                                    background: sel ? 'var(--surface-2)' : 'var(--surface)',
                                    borderLeft: sel ? '3px solid var(--brand)' : '3px solid transparent',
                                    transition: 'background .12s' }}>
                                  <input type="checkbox" checked={sel} onChange={() => togglePo(po)}
                                    style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0, accentColor: 'var(--brand)' }} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                      <span>{po.po_no || 'OC-'+String(po.id).padStart(6,'0')}</span>
                                      <PoBadge status={po.status} />
                                      {po.already_invoiced && (
                                        <span style={{ fontSize: 10, color: '#d97706', fontWeight: 700,
                                          background: '#fef3c7', padding: '2px 7px', borderRadius: 4, border: '1px solid #fde68a' }}>
                                          ya facturada
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                                        {po.entry_count} entrada(s) confirmada(s)
                                      </span>
                                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                                        Pedido: <span style={{ fontWeight: 600 }}>{formatMoney(po.total, po.currency)}</span>
                                      </span>
                                      {n(po.entries_total) !== n(po.total) && (
                                        <span style={{ fontSize: 11, color: '#d97706', fontWeight: 600 }}>
                                          Recepción parcial
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                                    <div style={{ fontSize: 14, fontWeight: 800, color: sel ? 'var(--brand)' : 'var(--text)' }}>
                                      {formatMoney(n(po.entries_total), po.currency)}
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>recibido</div>
                                  </div>
                                </label>
                              )
                            })}
                          </div>
                        )}
                        {form.po_ids.length > 0 && (() => {
                          const selPos = supplierPos.filter(p => form.po_ids.includes(p.id))
                          const totalEntries = selPos.reduce((s, p) => s + n(p.entries_total), 0)
                          const totalOrdered = selPos.reduce((s, p) => s + n(p.total), 0)
                          return (
                            <div style={{ marginTop: 10, padding: '10px 14px',
                              background: 'var(--surface-2)', borderRadius: 8,
                              border: '1.5px solid var(--border)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>
                                  {form.po_ids.length} OC(s) seleccionada(s)
                                </span>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--brand)' }}>
                                    {formatMoney(totalEntries, form.currency)}
                                  </div>
                                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>total recibido (entradas)</div>
                                </div>
                              </div>
                              {totalEntries !== totalOrdered && (
                                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 12 }}>
                                  <span>Pedido total: <strong>{formatMoney(totalOrdered, form.currency)}</strong></span>
                                  <span style={{ color: totalEntries < totalOrdered ? '#d97706' : '#15803d', fontWeight: 600 }}>
                                    Diferencia: {formatMoney(totalEntries - totalOrdered, form.currency)}
                                  </span>
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Footer fijo */}
                  <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)',
                    display: 'flex', gap: 10, flexShrink: 0, background: 'var(--surface)' }}>
                    <button type="button" onClick={() => setWizStep(Math.max(0, wizStep - 1))}
                      style={{ ...BTN.base, flex: 1, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }}>
                      ← Atrás
                    </button>
                    <button type="button" onClick={closeNew}
                      style={{ ...BTN.base, flex: 1, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--muted)' }}>
                      Cancelar
                    </button>
                    <button type="submit"
                      style={{ ...BTN.base, flex: 2, border: 'none', background: 'var(--brand)', color: '#fff', fontWeight: 700 }}>
                      📄 Registrar factura
                    </button>
                  </div>
                </form>
              )}

            </div>
          </div>
        )
      })()}

      {/* ── Modal detalle factura ── */}
      {detailInv && (
        <div className="modal-bg" onClick={e => e.target === e.currentTarget && setDetailInv(null)}>
          <div style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 680,
            maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,.3)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>📄 {detailInv.invoice_no}
                  {detailInv.supplier_ref && <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>· Ref. {detailInv.supplier_ref}</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                  {detailInv.supplier_name} · {detailInv.currency} · Emitida {(detailInv.issued_at || '').slice(0,10) || '—'} · Vence {(detailInv.due_at || '').slice(0,10) || '—'}
                </div>
              </div>
              <Ib icon="close" tip="Cerrar" variant="ghost" onClick={() => setDetailInv(null)} />
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '20px 22px' }}>

              {/* Status + monto */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                {[
                  { label: 'Total factura', val: formatMoney(detailInv.total, detailInv.currency) },
                  { label: 'Pagado', val: formatMoney(n(detailInv.total) - n(detailInv.balance), detailInv.currency), color: '#15803d' },
                  { label: 'Saldo pendiente', val: formatMoney(detailInv.balance, detailInv.currency), color: n(detailInv.balance) > 0 ? '#dc2626' : '#15803d' },
                  { label: 'Plazo', val: `${detailInv.payment_days ?? 30} días` },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ flex: '1 0 130px', background: 'var(--surface-2)', borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: color || 'var(--text-1)' }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Estado + notas */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
                <InvStatusBadge inv={detailInv} />
                {detailInv.status === 'locked' && (
                  <span style={{ fontSize: 12, color: '#92400e', background: '#fef3c7', borderRadius: 8, padding: '4px 10px' }}>
                    🔒 Bloqueada — requiere entrada de almacén confirmada para habilitar el pago
                  </span>
                )}
              </div>
              {detailInv.notes && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16, padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 8 }}>
                  📝 {detailInv.notes}
                </div>
              )}

              {/* OCs vinculadas */}
              {detailInv.pos?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>ÓRDENES DE COMPRA VINCULADAS</div>
                  {detailInv.pos.map(po => (
                    <div key={po.id} style={{ padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8, marginBottom: 6,
                      border: '1px solid var(--border)', fontSize: 13 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700 }}>{po.po_no || 'OC-'+String(po.id).padStart(6,'0')}</span>
                            <PoBadge status={po.status} />
                            <span style={{ color: 'var(--muted)', fontSize: 11 }}>{po.entry_count} entrada(s)</span>
                          </div>
                          <div style={{ marginTop: 4, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12 }}>
                            <span style={{ color: 'var(--muted)' }}>
                              Pedido: <strong>{formatMoney(po.total, po.currency)}</strong>
                            </span>
                            <span style={{ color: n(po.entries_total) < n(po.total) ? '#d97706' : 'var(--muted)' }}>
                              Recibido: <strong style={{ color: n(po.entries_total) < n(po.total) ? '#d97706' : '#15803d' }}>
                                {formatMoney(n(po.entries_total), po.currency)}
                              </strong>
                              {n(po.entries_total) < n(po.total) && (
                                <span style={{ marginLeft: 4, fontSize: 10, background: '#fef3c7', color: '#92400e',
                                  padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>parcial</span>
                              )}
                            </span>
                          </div>
                        </div>
                        <button type="button"
                          onClick={() => { setDetailInv(null); setPoFromInvoice(po.id) }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px',
                            borderRadius: 7, border: '1.5px solid var(--brand)', background: 'none',
                            color: 'var(--brand)', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          🔍 Ver detalle
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pagos registrados */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>PAGOS REGISTRADOS</div>
                {detailInv.payments?.length === 0
                  ? <div style={{ fontSize: 13, color: 'var(--muted)', padding: '10px 0' }}>Sin pagos aún</div>
                  : detailInv.payments.map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 12px', background: '#f0fdf4', borderRadius: 8, marginBottom: 4, fontSize: 13 }}>
                      <div>
                        <span style={{ fontWeight: 700, color: '#15803d' }}>{formatMoney(p.amount, detailInv.currency)}</span>
                        <span style={{ marginLeft: 8, color: 'var(--muted)', fontSize: 12 }}>vía {p.method}</span>
                        {p.reference && <span style={{ marginLeft: 6, color: 'var(--muted)', fontSize: 11 }}>· {p.reference}</span>}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{(p.paid_at || '').slice(0,10)}</span>
                    </div>
                  ))
                }
              </div>

              {/* Acción pago */}
              {n(detailInv.balance) > 0 && detailInv.status !== 'locked' && (
                <button onClick={() => { setPay({ invoice: detailInv, amount: n(detailInv.balance).toFixed(2), method: 'transferencia', reference: '' }); setDetailInv(null) }}
                  style={{ width: '100%', padding: '11px', borderRadius: 8, border: 'none',
                    background: 'var(--brand)', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
                  💳 Registrar pago — {formatMoney(detailInv.balance, detailInv.currency)} pendientes
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal pago ── */}
      {pay && (
        <div className="modal-bg" onClick={e => e.target === e.currentTarget && setPay(null)}>
          <form onSubmit={submitPay} className="form-card" style={{ maxWidth: 420, marginTop: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>💳 Registrar pago</h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                  {pay.invoice.supplier_name} · {pay.invoice.invoice_no || pay.invoice.supplier_ref || `FC-${String(pay.invoice.id).padStart(6,'0')}`}
                </p>
              </div>
              <button type="button" onClick={() => setPay(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)', padding: 4 }}>×</button>
            </div>
            <div style={{ background: '#fef9c3', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Saldo pendiente: </span>
              <strong style={{ color: '#92400e', fontSize: 16 }}>{formatMoney(pay.invoice.balance, pay.invoice.currency)}</strong>
              {pay.invoice.due_at && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  Vence: {(pay.invoice.due_at || '').slice(0, 10)}
                  {n(pay.invoice.days_overdue) > 0 && <span style={{ color: '#dc2626', fontWeight: 700, marginLeft: 6 }}>· {pay.invoice.days_overdue} días vencida</span>}
                </div>
              )}
            </div>
            <div className="form-field"><label>Monto *</label><input type="number" step="0.01" min="0.01" value={pay.amount} onChange={e => setPay({ ...pay, amount: e.target.value })} required /></div>
            <div className="form-row">
              <div className="form-field">
                <label>Método de pago</label>
                <select value={pay.method} onChange={e => setPay({ ...pay, method: e.target.value })}>
                  {[['efectivo','Efectivo'],['transferencia','Transferencia'],['cheque','Cheque'],['tarjeta','Tarjeta']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="form-field"><label>Referencia</label><input placeholder="N° transf. / cheque…" value={pay.reference} onChange={e => setPay({ ...pay, reference: e.target.value })} /></div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button type="button" onClick={() => setPay(null)}
                style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cancelar</button>
              <button type="submit"
                style={{ flex: 2, padding: '9px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>💳 Confirmar pago</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { label: 'Saldo total', val: formatMoney(totalDeuda, defCur), color: totalDeuda > 0 ? '#dc2626' : '#15803d' },
              { label: 'OC sin factura', val: totalOcPend, color: totalOcPend > 0 ? '#d97706' : '#15803d' },
              { label: 'Facturas vencidas', val: totalVenc, color: totalVenc > 0 ? '#dc2626' : '#15803d' },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '6px 14px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500 }}>{k.label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: k.color }}>{k.val}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <input placeholder="Buscar proveedor…" value={suppSearch2} onChange={e => setSuppSearch2(e.target.value)}
            style={{ height: 34, padding: '0 12px', borderRadius: 7, border: '1px solid var(--border)',
              background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, width: 180 }} />
          <button onClick={openNew}
            style={{ height: 34, padding: '0 16px', borderRadius: 7, border: 'none',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'var(--brand)', color: '#fff', whiteSpace: 'nowrap' }}>
            ＋ Nueva factura
          </button>
          <button onClick={load} style={{ height: 34, padding: '0 12px', borderRadius: 7, border: '1px solid var(--border)',
            background: 'var(--surface-2)', cursor: 'pointer', fontSize: 13, color: 'var(--muted)' }}>↻</button>
        </div>
      </div>

      {/* ── Sub-nav ── */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 14, borderBottom: '2px solid var(--border)' }}>
        {[
          { id: 'cxp',     label: 'CxP Proveedores', count: filteredEC.length },
          { id: 'cartera', label: 'Cartera por antigüedad' },
        ].map(sv => (
          <button key={sv.id} onClick={() => setView(sv.id)}
            style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
              borderBottom: view === sv.id ? '2px solid var(--brand)' : '2px solid transparent',
              marginBottom: -2, background: 'none', borderRadius: '6px 6px 0 0',
              color: view === sv.id ? 'var(--brand)' : 'var(--muted)',
              display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {sv.label}
            {sv.count != null && (
              <span style={{ borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700,
                background: view === sv.id ? 'var(--brand)' : 'var(--surface-2)',
                color: view === sv.id ? '#fff' : 'var(--muted)' }}>{sv.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Vista: CxP Proveedores (estado de cuenta) ── */}
      {view === 'cxp' && (
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Cargando…</div>
          ) : filteredEC.length === 0 ? (
            <EmptyState icon="📦" text="Sin movimientos" sub="Aquí aparecerán los proveedores con facturas u OCs pendientes de facturar" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredEC.map(prov => {
                const isOpen = expanded[prov.supplier_id] !== false
                const saldoPend = prov.facturas.filter(f => f.status !== 'paid').reduce((s, f) => s + n(f.balance), 0)
                const tieneVenc = prov.facturas.some(f => f.status !== 'paid' && n(f.days_overdue) > 0)
                const tieneOcPend = prov.ocs_sin_factura.length > 0

                return (
                  <div key={prov.supplier_id} style={{
                    border: `1.5px solid ${tieneVenc ? '#fca5a5' : 'var(--border)'}`,
                    borderRadius: 10, overflow: 'hidden',
                    background: tieneVenc ? '#fff8f8' : 'var(--surface)',
                  }}>
                    {/* Cabecera del proveedor */}
                    <div
                      onClick={() => setExpanded(e => ({ ...e, [prov.supplier_id]: !isOpen }))}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                        cursor: 'pointer', background: isOpen ? 'var(--surface-2)' : 'var(--surface)',
                        userSelect: 'none' }}>
                      <span style={{ fontSize: 12, color: 'var(--muted)', width: 14, textAlign: 'center', flexShrink: 0 }}>
                        {isOpen ? '▾' : '▸'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span>{prov.supplier_name}</span>
                          {tieneVenc && <span style={{ fontSize: 10, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>vencida</span>}
                          {tieneOcPend && <span style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>⚠ {prov.ocs_sin_factura.length} OC sin factura</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
                        {saldoPend > 0 && (
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>Saldo pendiente</div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#dc2626' }}>{formatMoney(saldoPend, defCur)}</div>
                          </div>
                        )}
                        {saldoPend === 0 && prov.facturas.length > 0 && (
                          <span style={{ fontSize: 11, color: '#15803d', fontWeight: 700 }}>✓ Al día</span>
                        )}
                        <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => openNew(prov.supplier_id)}
                            style={{ height: 28, padding: '0 10px', borderRadius: 6, border: '1.5px solid var(--brand)',
                              background: 'none', color: 'var(--brand)', cursor: 'pointer', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                            + Factura
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Subnivel expandible */}
                    {isOpen && (
                      <div style={{ borderTop: '1px solid var(--border)' }}>

                        {/* Facturas */}
                        {prov.facturas.length > 0 && (
                          <div>
                            <div style={{ padding: '6px 14px 4px 38px', fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.06em', textTransform: 'uppercase', background: 'var(--surface-2)' }}>
                              Facturas
                            </div>
                            {prov.facturas.map((f, idx) => {
                              const overdue = f.status !== 'paid' && n(f.days_overdue) > 0
                              const isPaid = f.status === 'paid'
                              return (
                                <div key={f.id}
                                  onClick={() => openDetail(f)}
                                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px 8px 38px',
                                    borderBottom: idx < prov.facturas.length - 1 ? '1px solid var(--border)' : 'none',
                                    cursor: 'pointer', background: overdue ? '#fff5f5' : 'var(--surface)',
                                    transition: 'background .1s' }}
                                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                                  onMouseLeave={e => e.currentTarget.style.background = overdue ? '#fff5f5' : 'var(--surface)'}>
                                  <span style={{ fontSize: 13, flexShrink: 0 }}>📄</span>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                      <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--brand)' }}>{f.invoice_no}</span>
                                      {f.supplier_ref && <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {f.supplier_ref}</span>}
                                      <InvStatusBadge inv={f} />
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                                      Emitida {f.issued_at || '—'}
                                      {f.due_at && <span> · Vence {f.due_at}</span>}
                                      {overdue && <span style={{ color: '#dc2626', fontWeight: 700 }}> · {f.days_overdue}d vencida</span>}
                                    </div>
                                  </div>
                                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: isPaid ? '#15803d' : n(f.balance) > 0 ? '#dc2626' : 'var(--muted)' }}>
                                      {isPaid ? '✓ Pagada' : formatMoney(f.balance, f.currency)}
                                    </div>
                                    {!isPaid && <div style={{ fontSize: 10, color: 'var(--muted)' }}>de {formatMoney(f.total, f.currency)}</div>}
                                  </div>
                                  <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                    {!isPaid && n(f.balance) > 0 && f.status !== 'locked' && (
                                      <Ib icon="pay" tip="Registrar pago" variant="primary"
                                        onClick={() => setPay({ invoice: { ...f, supplier_name: prov.supplier_name }, amount: n(f.balance).toFixed(2), method: 'transferencia', reference: '' })} />
                                    )}
                                    {isAdmin && (
                                      <>
                                        <Ib icon="edit" tip="Editar" variant="ghost"
                                          onClick={() => setEditInvModal({ id: f.id, invoice_no: f.invoice_no, supplier_ref: f.supplier_ref || '', invoice_date: f.issued_at || '', payment_days: f.payment_days || 30, notes: '', total: f.total, currency: f.currency })} />
                                        <Ib icon="delete" tip="Eliminar" variant="danger"
                                          onClick={() => setDeleteInvModal({ id: f.id, invoice_no: f.invoice_no })} />
                                      </>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* OCs sin factura */}
                        {prov.ocs_sin_factura.length > 0 && (
                          <div style={{ borderTop: prov.facturas.length > 0 ? '1px dashed var(--border)' : 'none' }}>
                            <div style={{ padding: '6px 14px 4px 38px', fontSize: 10, fontWeight: 700, color: '#92400e', letterSpacing: '.06em', textTransform: 'uppercase', background: '#fffbeb' }}>
                              OC sin factura
                            </div>
                            {prov.ocs_sin_factura.map((oc, idx) => (
                              <div key={oc.id}
                                onClick={() => setPoFromInvoice(oc.id)}
                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px 8px 38px',
                                  borderBottom: idx < prov.ocs_sin_factura.length - 1 ? '1px solid var(--border)' : 'none',
                                  cursor: 'pointer', background: '#fffdf5',
                                  transition: 'background .1s' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#fef9e7'}
                                onMouseLeave={e => e.currentTarget.style.background = '#fffdf5'}>
                                <span style={{ fontSize: 13, flexShrink: 0 }}>📦</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 700, fontSize: 12 }}>{oc.po_no || 'OC-'+String(oc.id).padStart(6,'0')}</span>
                                    <PoBadge status={oc.status} />
                                    {n(oc.entry_count) > 0 && (
                                      <span style={{ fontSize: 10, color: '#15803d', fontWeight: 700 }}>✓ {oc.entry_count} entrada(s)</span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                                    {oc.branch_name && <span>{oc.branch_name} · </span>}
                                    {oc.expected_at ? `Entrega: ${String(oc.expected_at).slice(0,10)}` : 'Sin fecha de entrega'}
                                  </div>
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                  {n(oc.entries_total) > 0 ? (
                                    <>
                                      <div style={{ fontSize: 12, fontWeight: 800, color: '#15803d' }}>{formatMoney(oc.entries_total, oc.currency)}</div>
                                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>recibido de {formatMoney(oc.total, oc.currency)}</div>
                                    </>
                                  ) : (
                                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{formatMoney(oc.total, oc.currency)}</div>
                                  )}
                                </div>
                                <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
                                  <button onClick={() => openNew(prov.supplier_id)}
                                    style={{ height: 26, padding: '0 10px', borderRadius: 6, border: '1.5px solid var(--brand)',
                                      background: 'none', color: 'var(--brand)', cursor: 'pointer', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                                    + Factura
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Proveedor sin facturas ni OCs: huérfano */}
                        {prov.facturas.length === 0 && prov.ocs_sin_factura.length === 0 && (
                          <div style={{ padding: '10px 38px', fontSize: 12, color: 'var(--muted)' }}>
                            Sin movimientos
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Vista: Cartera por antigüedad ── */}
      {view === 'cartera' && (
        <div>
          {/* Resumen de buckets */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            {carteraBuckets.map(b => (
              <div key={b.key} style={{ flex: '1 0 120px', background: b.bg, borderRadius: 12, padding: '12px 16px', border: `1px solid ${b.color}30` }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: b.color, marginBottom: 6 }}>{b.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: b.color }}>{formatMoney(b.total, defCur)}</div>
                <div style={{ fontSize: 11, color: b.color, opacity: 0.8, marginTop: 2 }}>{b.count} factura(s)</div>
              </div>
            ))}
          </div>
          {/* Tabla cartera */}
          <div className="table-wrap">
            {cartera.filter(r => r.status !== 'paid').length === 0
              ? <EmptyState icon="✅" text="Sin saldos pendientes" sub="Todas las facturas están pagadas" />
              : (
                <table>
                  <thead>
                    <tr>
                      <th>Factura</th>
                      <th>Proveedor</th>
                      <th style={{ textAlign: 'center' }}>Vencimiento</th>
                      <th style={{ textAlign: 'center' }}>Días vencida</th>
                      <th style={{ textAlign: 'right' }}>Saldo</th>
                      <th>Antigüedad</th>
                      <th style={{ width: 60 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cartera.filter(r => r.status !== 'paid').map(r => (
                      <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>
                        <td>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{r.invoice_no}</div>
                          {r.supplier_ref && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.supplier_ref}</div>}
                        </td>
                        <td><strong>{r.supplier_name}</strong></td>
                        <td style={{ textAlign: 'center', fontSize: 12 }}>{(r.due_at || '').slice(0,10) || '—'}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: n(r.days_overdue) > 0 ? '#dc2626' : '#15803d', fontSize: 13 }}>
                          {n(r.days_overdue) > 0 ? r.days_overdue : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: '#dc2626' }}>{formatMoney(r.balance, r.currency)}</td>
                        <td>
                          <span style={{ ...agingStyle(r.bucket), fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12 }}>
                            {agingLabel(r.bucket)}
                          </span>
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            {r.status !== 'locked' && (
                              <Ib icon="pay" tip="Registrar pago" variant="primary"
                                onClick={() => setPay({ invoice: r, amount: n(r.balance).toFixed(2), method: 'transferencia', reference: '' })} />
                            )}
                            {isAdmin && (
                              <>
                                <Ib icon="edit" tip="Editar factura" variant="ghost"
                                  onClick={() => setEditInvModal({ id: r.id, invoice_no: r.invoice_no, supplier_ref: r.supplier_ref || '', invoice_date: r.issued_at || '', payment_days: r.payment_days || 30, notes: '', total: r.total, currency: r.currency })} />
                                <Ib icon="delete" tip="Eliminar factura" variant="danger"
                                  onClick={() => setDeleteInvModal({ id: r.id, invoice_no: r.invoice_no })} />
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'right', fontWeight: 700, fontSize: 12, padding: '10px 8px' }}>Total cartera pendiente:</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#dc2626', fontSize: 15, padding: '10px 8px' }}>
                        {formatMoney(cartera.filter(r => r.status !== 'paid').reduce((s, r) => s + n(r.balance), 0), defCur)}
                      </td>
                      <td colSpan="2" />
                    </tr>
                  </tfoot>
                </table>
              )
            }
          </div>
        </div>
      )}

      {/* ── Admin: Editar Factura ── */}
      {editInvModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 480, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,.35)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 17 }}>Editar Factura {editInvModal.invoice_no}</h3>
              <Ib icon="close" tip="Cerrar" onClick={() => setEditInvModal(null)} />
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Ref. proveedor</label>
                <input value={editInvModal.supplier_ref} onChange={e => setEditInvModal(p => ({ ...p, supplier_ref: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Fecha factura</label>
                  <input type="date" value={editInvModal.invoice_date} onChange={e => setEditInvModal(p => ({ ...p, invoice_date: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Días de crédito</label>
                  <input type="number" min="0" value={editInvModal.payment_days} onChange={e => setEditInvModal(p => ({ ...p, payment_days: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Total ({editInvModal.currency})</label>
                <input type="number" step="0.01" min="0" value={editInvModal.total} onChange={e => setEditInvModal(p => ({ ...p, total: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Notas</label>
                <textarea value={editInvModal.notes} onChange={e => setEditInvModal(p => ({ ...p, notes: e.target.value }))} rows={2}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
              <button type="button" onClick={() => setEditInvModal(null)} disabled={adminBusy}
                style={{ padding: '9px 20px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>
                Cancelar
              </button>
              <button type="button" onClick={saveInvEdit} disabled={adminBusy}
                style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                {adminBusy ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Admin: Eliminar Factura ── */}
      {deleteInvModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 420, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,.35)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <span style={{ fontSize: 32 }}>🗑️</span>
              <div>
                <h3 style={{ margin: 0, fontSize: 17 }}>Eliminar factura</h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>{deleteInvModal.invoice_no}</p>
              </div>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text)', margin: '0 0 20px', lineHeight: 1.5 }}>
              Esta acción es irreversible. Solo se permite si la factura no tiene pagos registrados.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setDeleteInvModal(null)} disabled={adminBusy}
                style={{ padding: '9px 20px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>
                Cancelar
              </button>
              <button type="button" onClick={confirmDeleteInv} disabled={adminBusy}
                style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                {adminBusy ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

function EstadoCuenta({ notify }) {
  return null  // replaced by FacturacionTab
}
