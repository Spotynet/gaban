/**
 * Utilidad de formato de moneda para GabAn POS.
 * Usa Intl.NumberFormat para formatear según locale y moneda del tenant.
 */

export const CURRENCY_CONFIG = {
  COP: { locale: 'es-CO', decimals: 0,  symbol: '$',   name: 'Peso colombiano',    example: 1234567 },
  MXN: { locale: 'es-MX', decimals: 2,  symbol: '$',   name: 'Peso mexicano',      example: 1234.56 },
  USD: { locale: 'en-US', decimals: 2,  symbol: '$',   name: 'Dólar estadounidense', example: 1234.56 },
  EUR: { locale: 'es-ES', decimals: 2,  symbol: '€',   name: 'Euro',               example: 1234.56 },
  PEN: { locale: 'es-PE', decimals: 2,  symbol: 'S/',  name: 'Sol peruano',        example: 1234.56 },
  CLP: { locale: 'es-CL', decimals: 0,  symbol: '$',   name: 'Peso chileno',       example: 1234567 },
  ARS: { locale: 'es-AR', decimals: 2,  symbol: '$',   name: 'Peso argentino',     example: 1234.56 },
  BOB: { locale: 'es-BO', decimals: 2,  symbol: 'Bs',  name: 'Boliviano',          example: 1234.56 },
  PYG: { locale: 'es-PY', decimals: 0,  symbol: '₲',   name: 'Guaraní paraguayo',  example: 1234567 },
  UYU: { locale: 'es-UY', decimals: 2,  symbol: '$U',  name: 'Peso uruguayo',      example: 1234.56 },
}

/**
 * Formatea un valor monetario según la moneda del tenant.
 * @param {number|string} amount - Valor a formatear
 * @param {string} currency - Código ISO de moneda (ej. 'COP', 'USD')
 * @returns {string} Valor formateado (ej. '$ 1.234.567', '$1,234.56')
 */
export function formatMoney(amount, currency = 'USD') {
  const num = Number(amount) || 0
  const code = currency?.toUpperCase() || 'USD'
  const cfg = CURRENCY_CONFIG[code] || { locale: 'en-US', decimals: 2 }
  try {
    return new Intl.NumberFormat(cfg.locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: cfg.decimals,
      maximumFractionDigits: cfg.decimals,
    }).format(num)
  } catch {
    return `${code} ${num.toFixed(cfg.decimals)}`
  }
}

/** Retorna la config de una moneda (con fallback a USD) */
export function getCurrencyConfig(currency) {
  return CURRENCY_CONFIG[currency?.toUpperCase()] || CURRENCY_CONFIG['USD']
}

/**
 * Formatea solo el número (sin símbolo de moneda), con separadores del locale.
 * Útil para inputs y tablas donde el símbolo se muestra por separado.
 */
export function formatNumber(amount, currency = 'USD') {
  const num = Number(amount) || 0
  const code = currency?.toUpperCase() || 'USD'
  const cfg = CURRENCY_CONFIG[code] || { locale: 'en-US', decimals: 2 }
  try {
    return new Intl.NumberFormat(cfg.locale, {
      minimumFractionDigits: cfg.decimals,
      maximumFractionDigits: cfg.decimals,
    }).format(num)
  } catch {
    return num.toFixed(cfg.decimals)
  }
}
