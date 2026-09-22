/* Paginación reutilizable — mismo estilo que el footer de la tabla de proveedores */
import { useState } from 'react'

export const PAGE_SIZES = [25, 50, 100, 500]

const pgBtn = (disabled) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--surface)', color: disabled ? 'var(--muted)' : 'var(--text)',
  cursor: disabled ? 'default' : 'pointer', fontSize: 13, fontWeight: 500,
  opacity: disabled ? 0.45 : 1,
})

/* Hook: devuelve { page, pageSize, setPage, setPageSize, paginated, total, totalPages } */
export function usePaginator(items, defaultSize = 25) {
  const [page, setPage]         = useState(1)
  const [pageSize, setPageSize] = useState(defaultSize)

  const total      = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage   = Math.min(page, totalPages)
  const paginated  = items.slice((safePage - 1) * pageSize, safePage * pageSize)

  const goTo       = (p) => setPage(Math.max(1, Math.min(p, totalPages)))
  const changeSize = (s) => { setPageSize(Number(s)); setPage(1) }

  return { page: safePage, pageSize, setPage: goTo, setPageSize: changeSize, paginated, total, totalPages }
}

/* Barra de paginación — estilo idéntico al footer de la tabla de proveedores */
export function Paginator({ page, pageSize, totalPages, total, setPage, setPageSize, label = 'registros', subset }) {
  if (total === 0) return null

  const from = (page - 1) * pageSize + 1
  const to   = Math.min(page * pageSize, total)

  const pageNums = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
    .reduce((acc, p, i, arr) => {
      if (i > 0 && p - arr[i - 1] > 1) acc.push('…')
      acc.push(p)
      return acc
    }, [])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      padding: '10px 16px', borderTop: '1px solid var(--border)',
      background: 'var(--surface-2)', fontSize: 12, color: 'var(--muted)',
    }}>
      {/* Info */}
      <span style={{ flexShrink: 0 }}>
        <strong style={{ color: 'var(--text)' }}>{from}–{to}</strong>
        {' de '}
        <strong style={{ color: 'var(--text)' }}>{total}</strong>
        {subset != null && total !== subset ? ` (filtrado de ${subset})` : ''}
        {' '}{label}
      </span>

      <div style={{ flex: 1 }} />

      {/* Filas por página */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span>Filas por página:</span>
        <select value={pageSize} onChange={e => setPageSize(e.target.value)}
          style={{ fontSize: 12, padding: '2px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>
          {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Controles de página */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button onClick={() => setPage(1)}          disabled={page === 1}          style={pgBtn(page === 1)}          title="Primera">«</button>
          <button onClick={() => setPage(page - 1)}   disabled={page === 1}          style={pgBtn(page === 1)}          title="Anterior">‹</button>
          {pageNums.map((p, i) =>
            p === '…'
              ? <span key={`e${i}`} style={{ padding: '0 4px', color: 'var(--muted)' }}>…</span>
              : <button key={p} onClick={() => setPage(p)} style={{
                  ...pgBtn(false),
                  background:   p === page ? 'var(--brand)' : 'var(--surface)',
                  color:        p === page ? '#fff'         : 'var(--text)',
                  fontWeight:   p === page ? 700            : 500,
                  borderColor:  p === page ? 'var(--brand)' : 'var(--border)',
                }}>{p}</button>
          )}
          <button onClick={() => setPage(page + 1)}   disabled={page === totalPages} style={pgBtn(page === totalPages)} title="Siguiente">›</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages} style={pgBtn(page === totalPages)} title="Última">»</button>
        </div>
      )}
    </div>
  )
}
