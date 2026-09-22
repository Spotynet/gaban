import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

function EyeIcon({ open }) {
  return open
    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
}

export default function Login() {
  const { login, sessionExpired } = useAuth()
  const nav = useNavigate()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [error,    setError]    = useState('')

  async function submit(e) {
    e.preventDefault()
    setError('')
    try {
      const role = await login(email, password)
      nav(role === 'MASTER_ADMIN' ? '/master' : '/ventas')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Iniciar sesión</h2>
      <input placeholder="Correo" value={email} onChange={e => setEmail(e.target.value)} />
      <div style={{ position: 'relative' }}>
        <input
          type={showPwd ? 'text' : 'password'}
          placeholder="Contraseña"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={{ paddingRight: 44, margin: 0 }}
        />
        <button
          type="button"
          onClick={() => setShowPwd(v => !v)}
          style={{
            position: 'absolute', right: 12,
            top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--muted)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: 0, lineHeight: 0, width: 20, height: 20,
          }}
          title={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        >
          <EyeIcon open={showPwd} />
        </button>
      </div>
      {sessionExpired && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', fontSize: 13, marginBottom: 4 }}>
          ⏱️ Tu sesión cerró por inactividad. Inicia sesión de nuevo.
        </div>
      )}
      <button type="submit">Entrar</button>
      {error && <div className="error">{error}</div>}
    </form>
  )
}
