// Soporte offline para la caja: caché de catálogo y cola de ventas pendientes.
// Persistencia en localStorage (sobrevive a recargas y cierres de la app).
import { api } from './client.js'

const QUEUE_KEY = 'gaban_offline_sales'
const CACHE_KEY = 'gaban_variants_cache'

const uuid = () =>
  (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      }))

// ---- caché de productos (para vender sin conexión) ----
export function cacheVariants(list) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)) } catch {}
}
export function cachedVariants() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]') } catch { return [] }
}

// ---- cola de ventas offline ----
export function getQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch { return [] }
}
function setQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)) }

export function enqueueSale(payload) {
  const q = getQueue()
  const sale = { ...payload, client_uuid: payload.client_uuid || uuid(), _queued_at: Date.now() }
  q.push(sale)
  setQueue(q)
  return sale
}

export function queueCount() { return getQueue().length }

export function isOnline() { return navigator.onLine !== false }

// Intenta sincronizar todas las ventas en cola. Devuelve {ok, fail}.
export async function syncQueue() {
  const q = getQueue()
  if (q.length === 0) return { ok: 0, fail: 0 }
  let ok = 0, fail = 0
  const remaining = []
  for (const sale of q) {
    try {
      await api.createSale(sale)   // el backend es idempotente por client_uuid
      ok++
    } catch (e) {
      fail++
      remaining.push(sale)         // se conserva para el próximo intento
    }
  }
  setQueue(remaining)
  return { ok, fail }
}

export { uuid }
