import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api/client.js'
import { formatMoney } from '../utils/currency.js'

const AuthContext = createContext(null)

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click']

export function AuthProvider({ children }) {
  const [role, setRole]         = useState(localStorage.getItem('role'))
  const [currency, setCurrency] = useState(localStorage.getItem('currency') || 'USD')
  const [country, setCountry]   = useState(localStorage.getItem('country') || '')
  const [branches, setBranches] = useState(() => {
    try { return JSON.parse(localStorage.getItem('branches') || '[]') } catch { return [] }
  })
  const [sessionExpired, setSessionExpired] = useState(false)

  const timerRef    = useRef(null)
  const enabledRef  = useRef(false)
  const minutesRef  = useRef(30)

  function _clearTimer() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }

  const _doLogout = useCallback((expired = false) => {
    _clearTimer()
    localStorage.clear()
    if (expired) localStorage.setItem('session_expired', '1')
    setRole(null); setCurrency('USD'); setCountry(''); setBranches([])
  }, [])

  const _resetTimer = useCallback(() => {
    if (!enabledRef.current || !minutesRef.current) return
    _clearTimer()
    timerRef.current = setTimeout(() => _doLogout(true), minutesRef.current * 60 * 1000)
  }, [_doLogout])

  // Attach / detach activity listeners
  function _startWatching() {
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, _resetTimer, { passive: true }))
    _resetTimer()
  }
  function _stopWatching() {
    ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, _resetTimer))
    _clearTimer()
  }

  function _applyInactivity(enabled, minutes) {
    enabledRef.current  = enabled
    minutesRef.current  = minutes
    localStorage.setItem('inactivity_enabled', enabled ? '1' : '0')
    localStorage.setItem('inactivity_timeout', String(minutes))
    if (enabled && localStorage.getItem('token')) {
      _startWatching()
    } else {
      _stopWatching()
    }
  }

  function _applyMe(me) {
    const cur = me.base_currency || 'USD'
    const brs = me.branches || []
    const cty = me.country || ''
    setCurrency(cur); setBranches(brs); setCountry(cty)
    localStorage.setItem('currency', cur)
    localStorage.setItem('branches', JSON.stringify(brs))
    localStorage.setItem('country', cty)
    _applyInactivity(
      me.inactivity_enabled ?? (localStorage.getItem('inactivity_enabled') === '1'),
      me.inactivity_timeout_minutes ?? Number(localStorage.getItem('inactivity_timeout') || 30),
    )
  }

  // On mount, restore timer if session exists
  useEffect(() => {
    const expired = localStorage.getItem('session_expired')
    if (expired) { setSessionExpired(true); localStorage.removeItem('session_expired') }

    if (localStorage.getItem('token')) {
      const en  = localStorage.getItem('inactivity_enabled') === '1'
      const min = Number(localStorage.getItem('inactivity_timeout') || 30)
      enabledRef.current = en
      minutesRef.current = min
      if (en) _startWatching()
      api.me().then(_applyMe).catch(() => {})
    }
    return () => _stopWatching()
  }, [])

  // Listen for config changes dispatched from Configuracion tab
  useEffect(() => {
    function onCfgChange(e) {
      const { inactivity_enabled, inactivity_timeout_minutes } = e.detail || {}
      if (inactivity_enabled !== undefined) {
        _applyInactivity(inactivity_enabled, inactivity_timeout_minutes ?? minutesRef.current)
      }
    }
    window.addEventListener('gaban-security-config', onCfgChange)
    return () => window.removeEventListener('gaban-security-config', onCfgChange)
  }, [_resetTimer])

  async function login(email, password) {
    const res = await api.login(email, password)
    localStorage.setItem('token', res.access_token)
    localStorage.setItem('role', res.role)
    setRole(res.role)
    setSessionExpired(false)
    try { const me = await api.me(); _applyMe(me) } catch {}
    window.dispatchEvent(new CustomEvent('gaban-login'))
    return res.role
  }

  function logout() {
    _doLogout(false)
  }

  const fmtMoney = (amount) => formatMoney(amount, currency)

  return (
    <AuthContext.Provider value={{ role, login, logout, isAuthed: !!localStorage.getItem('token'), currency, country, branches, fmtMoney, sessionExpired }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
