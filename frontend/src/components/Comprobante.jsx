import { useEffect, useState } from 'react'
import { api } from '../api/client.js'

const money = (v, cur) => `${cur} ${Number(v || 0).toFixed(2)}`
const PAY_LABEL = {
  efectivo: 'Efectivo', tarjeta_credito: 'T. Crédito', tarjeta_debito: 'T. Débito',
  transferencia: 'Transferencia', cheque: 'Cheque',
}

// Formato fiscal según país. CO = factura electrónica de venta (DIAN),
// MX = CFDI (SAT). Los identificadores son DEMO (no timbrados).
export default function Comprobante({ saleId, onClose }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.comprobante(saleId).then(setData).catch(e => setError(e.message))
  }, [saleId])

  if (error) return <div className="modal-bg" onClick={onClose}><div className="receipt">{error}</div></div>
  if (!data) return null

  const { sale, items, payments, customer, tenant, branch } = data
  const fc = tenant.fiscal_config || {}
  const country = (data.country || '').toUpperCase()
  const cur = sale.currency
  const isCO = country === 'CO'
  const isMX = country === 'MX'
  const docTitle = isCO ? 'FACTURA ELECTRÓNICA DE VENTA'
    : isMX ? 'CFDI — COMPROBANTE FISCAL' : 'TICKET DE VENTA'

  return (
    <div className="modal-bg" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}>
        <div className="receipt" id="receipt">
          <h3>{fc.razon_social || tenant.name}</h3>
          <div className="muted" style={{ textAlign: 'center' }}>
            {isCO && fc.nit && <div>NIT: {fc.nit}{fc.regimen ? ` · ${fc.regimen}` : ''}</div>}
            {isMX && fc.rfc && <div>RFC: {fc.rfc}{fc.regimen_fiscal ? ` · Rég. ${fc.regimen_fiscal}` : ''}</div>}
            {(fc.direccion || branch.address) && <div>{fc.direccion || branch.address}</div>}
            <div>Sucursal: {branch.name} ({branch.code})</div>
          </div>
          <hr />

          <div className="muted"><b>{docTitle}</b></div>
          <div className="tot"><span>{isMX ? 'Serie-Folio' : 'N°'}</span><span>{data.sale_no || `${data.serie}-${data.folio}`}</span></div>
          <div className="tot"><span>Fecha</span><span>{sale.created_at?.slice(0, 16).replace('T', ' ')}</span></div>
          {isCO && <div className="tot"><span>CUFE</span><span style={{ fontSize: 9, wordBreak: 'break-all', maxWidth: 170 }}>{data.uuid}</span></div>}
          {isMX && <div className="tot"><span>Folio fiscal</span><span style={{ fontSize: 9, wordBreak: 'break-all', maxWidth: 170 }}>{data.uuid}</span></div>}
          {isCO && fc.resolucion && <div className="muted">Resolución DIAN: {fc.resolucion}</div>}
          {isMX && <div className="muted">Uso CFDI: {customer?.uso_cfdi || fc.uso_cfdi || 'G03'} · {fc.metodo_pago || 'PUE'}</div>}
          <hr />

          <div className="muted">Cliente: {customer?.name || 'Consumidor final'}
            {customer?.tax_id ? ` · ${customer.tax_id}` : ''}</div>
          <hr />

          <table>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td>
                    {it.quantity} x {it.product_name}
                    <div style={{ fontSize: 9, color: '#555' }}>{it.variant_sku}{it.size ? ` T${it.size}` : ''}{it.color ? ` ${it.color}` : ''} · {money(it.unit_price, '')}</div>
                  </td>
                  <td style={{ textAlign: 'right', verticalAlign: 'top' }}>{money(it.line_total, '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <hr />

          <div className="tot"><span>Subtotal</span><span>{money(sale.subtotal, cur)}</span></div>
          {sale.discount > 0 && <div className="tot"><span>Descuentos</span><span>-{money(sale.discount, '')}</span></div>}
          <div className="tot"><span>{isCO ? 'IVA' : isMX ? 'IVA trasladado' : 'Impuesto'}</span><span>{money(sale.tax, '')}</span></div>
          <div className="tot" style={{ fontWeight: 'bold', fontSize: 13 }}><span>TOTAL</span><span>{money(sale.total, cur)}</span></div>
          <hr />

          {payments.length > 0 && <div className="muted"><b>Pagos</b></div>}
          {payments.map((p, i) => (
            <div className="tot" key={i}><span>{PAY_LABEL[p.method] || p.method}{p.reference ? ` (${p.reference})` : ''}</span><span>{money(p.amount, '')}</span></div>
          ))}

          <hr />
          <div style={{ textAlign: 'center', fontSize: 10, color: '#555' }}>
            {data.fiscal_status === 'no_timbrado'
              ? '*** DOCUMENTO DEMO — NO VÁLIDO COMO FACTURA (sin timbrar/DIAN) ***'
              : 'Documento fiscal válido'}
            <div style={{ marginTop: 4 }}>¡Gracias por su compra!</div>
          </div>
        </div>

        <div className="no-print" style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center' }}>
          <button style={{ width: 'auto', marginTop: 0 }} onClick={() => window.print()}>Imprimir</button>
          <button style={{ width: 'auto', marginTop: 0, background: '#9ca3af' }} onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
