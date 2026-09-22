/* ══════════════════════════════════════════════════════
   Shared icon button + action button components
   Usage:
     <Ib icon="edit" tip="Editar" onClick={...} />
     <Ib icon="delete" tip="Eliminar" variant="danger" onClick={...} />
     <Ab label="Recibir" icon="check" variant="primary" onClick={...} />
   ══════════════════════════════════════════════════════ */

/* SVG icon library — single path per icon */
const P = {
  edit:      'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  delete:    'M3 6h18 M8 6V4h8v2 M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6',
  close:     'M18 6L6 18 M6 6l12 12',
  check:     'M20 6L9 17l-5-5',
  view:      'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 100 6 3 3 0 000-6z',
  print:     'M6 9V2h12v7 M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2 M6 14h12v8H6z',
  deliver:   'M22 12h-4l-3 9L9 3l-3 9H2',
  receive:   'M12 2v10 M7 7l5 5 5-5 M20 21H4a2 2 0 01-2-2V5a2 2 0 012-2h14l4 4v12a2 2 0 01-2 2z',
  pay:       'M12 1v22 M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  kardex:    'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  download:  'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  upload:    'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
  toggle:    'M18 20V10 M12 20V4 M6 20v-6',
  add:       'M12 5v14 M5 12h14',
  history:   'M12 22a10 10 0 110-20 10 10 0 010 20z M12 6v6l4 2',
  cancel:    'M18 6L6 18 M6 6l12 12',
  refresh:   'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0114.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0020.49 15',
  statement: 'M9 11l3 3L22 4 M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  replenish: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 3a4 4 0 100 8 4 4 0 000-8z M22 11l-4-4-4 4',
  order:     'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2 M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  move:      'M5 9l-3 3 3 3 M9 5l3-3 3 3 M15 19l-3 3-3-3 M19 9l3 3-3 3 M2 12h20 M12 2v20',
}

function SvgIcon({ name, size = 15 }) {
  const d = P[name]
  if (!d) return null
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {d.split(' M').map((seg, i) => (
        <path key={i} d={i === 0 ? seg : 'M' + seg} />
      ))}
    </svg>
  )
}

/* Icon-only button with tooltip */
export function Ib({ icon, tip, variant = 'ghost', onClick, disabled, size = 15, type = 'button', style: extra }) {
  return (
    <button
      type={type}
      className={`ib ib-${variant}`}
      data-tip={tip}
      onClick={onClick}
      disabled={disabled}
      style={extra}
    >
      <SvgIcon name={icon} size={size} />
    </button>
  )
}

/* Action button: icon + label (for primary actions, modals, etc.) */
export function Ab({ icon, label, variant = 'ghost', onClick, disabled, type = 'button', form, style: extra }) {
  return (
    <button
      type={type}
      form={form}
      className={`ab ab-${variant}`}
      onClick={onClick}
      disabled={disabled}
      style={extra}
    >
      {icon && <SvgIcon name={icon} size={13} />}
      {label}
    </button>
  )
}

export { SvgIcon }
