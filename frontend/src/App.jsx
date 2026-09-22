import { useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import { useTheme, THEMES } from './context/ThemeContext.jsx'
import { api } from './api/client.js'
import Login from './pages/Login.jsx'
import Ventas from './pages/Ventas.jsx'
import Compras from './pages/Compras.jsx'
import Productos from './pages/Productos.jsx'
import Inventarios from './pages/Inventarios.jsx'
import Master from './pages/Master.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Caja from './pages/Caja.jsx'
import Contabilidad from './pages/Contabilidad.jsx'
import Notificaciones from './pages/Notificaciones.jsx'
import Apariencia from './pages/Apariencia.jsx'
import Configuracion from './pages/Configuracion.jsx'

/* ── Íconos SVG ─────────────────────────────────────────────────── */
const Icon = ({ d, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)
const Icons = {
  dashboard:    'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10',
  caja:         'M2 20h20M4 20V10l8-6 8 6v10 M9 20v-5h6v5',
  ventas:       'M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z M3 6h18 M16 10a4 4 0 01-8 0',
  compras:      'M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z M12 7v6 M9 10h6',
  productos:    'M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z M7 7h.01',
  inventarios:  'M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
  contabilidad: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  usuarios:     'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75',
  alertas:      'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0',
  admin:        'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  config:       'M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z',
  menu:         'M3 12h18 M3 6h18 M3 18h18',
  chevronLeft:  'M15 18l-6-6 6-6',
  sun:          'M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42 M12 5a7 7 0 100 14A7 7 0 0012 5z',
  moon:         'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
  system:       'M2 13.5V16c0 1.1.9 2 2 2h16a2 2 0 002-2v-2.5 M12 3v9 M8 8l4 4 4-4 M20 19H4',
  palette:      'M12 22C6.49 22 2 17.52 2 12S6.49 2 12 2s10 4.48 10 10c0 1.1-.9 2-2 2h-1.5c-.83 0-1.5.67-1.5 1.5v.5c0 1.1-.9 2-2 2h-.5 M8.5 8.5a1 1 0 100-2 1 1 0 000 2z M11.5 6.5a1 1 0 100-2 1 1 0 000 2z M15.5 8a1 1 0 100-2 1 1 0 000 2z M16.5 11.5a1 1 0 100-2 1 1 0 000 2z',
  logout:       'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9',
  user:         'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8z',
}

/* ── Hook: alertas ──────────────────────────────────────────────── */
function useAlertCount() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let alive = true
    const fetch = () => api.notificaciones().then(d => alive && setCount(d.total)).catch(() => {})
    fetch()
    const t = setInterval(fetch, 60000)
    return () => { alive = false; clearInterval(t) }
  }, [])
  return count
}

/* ── Sidebar ────────────────────────────────────────────────────── */
const NAV_ITEMS = {
  regular: [
    { to: '/dashboard',    label: 'Dashboard',     icon: 'dashboard',    emoji: '📊' },
    { to: '/caja',         label: 'Caja táctil',   icon: 'caja',         emoji: '🖥️' },
    { to: '/ventas',       label: 'Ventas (POS)',   icon: 'ventas',       emoji: '🛒' },
    { to: '/compras',      label: 'Compras',        icon: 'compras',      emoji: '🛍️' },
    { to: '/productos',    label: 'Productos',      icon: 'productos',    emoji: '🏷️' },
    { to: '/inventarios',  label: 'Inventarios',    icon: 'inventarios',  emoji: '📦' },
    { to: '/contabilidad', label: 'Contabilidad',   icon: 'contabilidad', emoji: '📒' },
  ],
  admin:   [
    { to: '/configuracion', label: 'Configuración', icon: 'config', emoji: '⚙️' },
  ],
  master:  [{ to: '/master', label: 'Administración', icon: 'admin', emoji: '🛡️' }],
}

function SidebarItem({ to, label, emoji, collapsed }) {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''} ${collapsed ? 'collapsed' : ''}`}
      title={collapsed ? label : undefined}>
      <span className="nav-icon" style={{ fontSize: 18, lineHeight: 1 }}>{emoji}</span>
      {!collapsed && <span className="nav-label">{label}</span>}
    </NavLink>
  )
}

function Sidebar({ collapsed, onToggle, role }) {
  const isMaster = role === 'MASTER_ADMIN'
  const items = isMaster
    ? NAV_ITEMS.master
    : [
        ...NAV_ITEMS.regular,
        ...NAV_ITEMS.admin,
      ]

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Logo */}
      <div className="sidebar-brand">
        {!collapsed && (
          <div className="brand-text">
            <span className="brand-name">GabAn</span>
            <span className="brand-sub">POS</span>
          </div>
        )}
        {collapsed && <span className="brand-icon">G</span>}
        <button className="sidebar-toggle" onClick={onToggle} title={collapsed ? 'Expandir menú' : 'Colapsar menú'}>
          <Icon d={collapsed ? Icons.menu : Icons.chevronLeft} size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {items.map(item => (
          <SidebarItem key={item.to} {...item} collapsed={collapsed} />
        ))}
      </nav>
    </aside>
  )
}

/* ── Profile Dropdown ───────────────────────────────────────────── */
function ProfileDropdown({ role, logout }) {
  const [open, setOpen] = useState(false)
  const { mode, chooseMode } = useTheme()
  const ref = useRef(null)

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const initials = role ? role.slice(0, 2).toUpperCase() : 'US'

  const modeOptions = [
    { id: 'light',  label: 'Claro',   icon: 'sun' },
    { id: 'dark',   label: 'Oscuro',  icon: 'moon' },
    { id: 'system', label: 'Sistema', icon: 'system' },
  ]

  return (
    <div className="profile-wrap" ref={ref}>
      <button className="profile-btn" onClick={() => setOpen(v => !v)}>
        <div className="avatar">{initials}</div>
      </button>
      {open && (
        <div className="profile-dropdown">
          <div className="dropdown-header">
            <div className="avatar avatar-lg">{initials}</div>
            <div>
              <div className="dropdown-role">{role}</div>
              <div className="dropdown-sub">Usuario activo</div>
            </div>
          </div>

          <div className="dropdown-divider" />

          <div className="dropdown-section-label">Apariencia</div>
          <div className="mode-switcher">
            {modeOptions.map(({ id, label, icon }) => (
              <button key={id} onClick={() => chooseMode(id)}
                className={`mode-btn ${mode === id ? 'active' : ''}`}>
                <Icon d={Icons[icon]} size={14} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <NavLink to="/apariencia" className="dropdown-item" onClick={() => setOpen(false)}>
            <Icon d={Icons.palette} size={16} />
            <span>Personalizar tema</span>
          </NavLink>

          <div className="dropdown-divider" />

          <button className="dropdown-item dropdown-item-danger" onClick={logout}>
            <Icon d={Icons.logout} size={16} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Topbar ─────────────────────────────────────────────────────── */
function Topbar({ role, logout, sidebarCollapsed, onMenuToggle }) {
  const location = useLocation()
  const alertCount = useAlertCount()

  const allItems = [
    ...NAV_ITEMS.regular,
    { to: '/notificaciones', label: 'Alertas', icon: 'alertas' },
    ...NAV_ITEMS.admin,
    ...NAV_ITEMS.master,
    { to: '/apariencia',    label: 'Apariencia' },
    { to: '/configuracion', label: 'Configuración' },
  ]
  const current = allItems.find(i => i.to === location.pathname)

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="topbar-menu-btn" onClick={onMenuToggle} title="Toggle menú">
          <Icon d={Icons.menu} size={20} />
        </button>
        <div className="topbar-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {current?.emoji && <span style={{ fontSize: 18, lineHeight: 1 }}>{current.emoji}</span>}
          {current?.label ?? 'GabAn POS'}
        </div>
      </div>
      <div className="topbar-right">
        <NavLink to="/notificaciones" className="topbar-icon-btn" title="Alertas">
          <Icon d={Icons.alertas} size={20} />
          {alertCount > 0 && <span className="topbar-badge">{alertCount}</span>}
        </NavLink>
        <ProfileDropdown role={role} logout={logout} />
      </div>
    </header>
  )
}

/* ── Layout ─────────────────────────────────────────────────────── */
function Layout({ children }) {
  const { logout, role } = useAuth()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true')

  const toggle = () => setCollapsed(v => {
    const next = !v
    localStorage.setItem('sidebar_collapsed', next)
    return next
  })

  return (
    <div className={`layout ${collapsed ? 'layout-collapsed' : ''}`}>
      <Sidebar collapsed={collapsed} onToggle={toggle} role={role} />
      <div className="main-wrap">
        <Topbar role={role} logout={logout} sidebarCollapsed={collapsed} onMenuToggle={toggle} />
        <main className="content">{children}</main>
      </div>
    </div>
  )
}

function Private({ children }) {
  const { isAuthed } = useAuth()
  return isAuthed ? <Layout>{children}</Layout> : <Navigate to="/login" />
}

const isMaster = r => r === 'MASTER_ADMIN'

export default function App() {
  const { role } = useAuth()
  const home = isMaster(role) ? '/master' : '/ventas'
  return (
    <Routes>
      <Route path="/login"        element={<Login />} />
      <Route path="/master"       element={<Private><Master /></Private>} />
      <Route path="/dashboard"    element={<Private><Dashboard /></Private>} />
      <Route path="/caja"         element={<Private><Caja /></Private>} />
      <Route path="/ventas"       element={<Private><Ventas /></Private>} />
      <Route path="/compras"      element={<Private><Compras /></Private>} />
      <Route path="/productos"    element={<Private><Productos /></Private>} />
      <Route path="/inventarios"  element={<Private><Inventarios /></Private>} />
      <Route path="/usuarios"     element={<Navigate to="/configuracion" replace />} />
      <Route path="/contabilidad" element={<Private><Contabilidad /></Private>} />
      <Route path="/notificaciones" element={<Private><Notificaciones /></Private>} />
      <Route path="/apariencia"     element={<Private><Apariencia /></Private>} />
      <Route path="/configuracion"  element={<Private><Configuracion /></Private>} />
      <Route path="*"             element={<Navigate to={home} />} />
    </Routes>
  )
}
