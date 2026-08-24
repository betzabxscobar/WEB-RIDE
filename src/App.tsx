import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import './App.css'
import AdminDashboard from './AdminDashboard'

type Screen = 'welcome' | 'login' | 'register' | 'home'
type Role = 'passenger' | 'driver' | 'superadmin'
type User = { id: string; name: string; email: string; phone: string; role: Role }

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8788'

function Logo() {
  return <div className="logo" aria-label="Ride"><span>R</span></div>
}

function App() {
  const [screen, setScreen] = useState<Screen>('welcome')
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('ride_token')))
  const [message, setMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('ride_token')
    if (!token) return
    fetch(`${API_URL}/api/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error()
        const data = await response.json()
        setUser(data.user)
        setScreen('home')
      })
      .catch(() => localStorage.removeItem('ride_token'))
      .finally(() => setLoading(false))
  }, [])

  const authenticate = async (endpoint: 'login' | 'register', form: HTMLFormElement) => {
    setLoading(true); setMessage('')
    const values = Object.fromEntries(new FormData(form))
    try {
      const response = await fetch(`${API_URL}/api/${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'No pudimos completar la solicitud.')
      localStorage.setItem('ride_token', data.token)
      setUser(data.user); setScreen('home')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ocurrió un error inesperado.')
    } finally { setLoading(false) }
  }

  const logout = () => {
    localStorage.removeItem('ride_token'); setUser(null); setScreen('welcome'); setMessage('')
  }

  if (screen === 'home' && user?.role === 'superadmin') return <AdminDashboard user={user} token={localStorage.getItem('ride_token') || ''} onLogout={logout} />

  if (loading && screen === 'welcome') return <div className="loading-screen"><Logo /><span>Preparando Ride…</span></div>

  if (screen === 'home' && user) return <main className="user-home">
    <header><div className="mini-brand"><Logo /><b>Ride</b></div><button onClick={logout}>Cerrar sesión</button></header>
    <section><span className="success-mark">✓</span><p>Sesión iniciada correctamente</p><h1>Hola, {user.name.split(' ')[0]}</h1><p className="home-copy">Tu cuenta de {user.role === 'driver' ? 'conductor' : 'pasajero'} está lista.</p><div className="account-card"><div><small>Correo</small><strong>{user.email}</strong></div><div><small>Teléfono</small><strong>{user.phone}</strong></div><div><small>Modo</small><strong>{user.role === 'driver' ? 'Conduzco' : 'Viajo'}</strong></div></div><p className="next-note">La solicitud de viajes será el siguiente módulo.</p></section>
  </main>

  return <main className="auth-page">
    <section className="brand-panel">
      <div className="brand-copy"><div className="wordmark"><Logo /><span>Ride</span></div><h1>Muévete con<br/><em>libertad.</em></h1><p>Una forma más segura, transparente y humana de llegar a donde quieres.</p></div>
      <div className="city-art"><div className="moon"/><div className="route"><i/><i/><i/></div><div className="car">▰</div><div className="buildings"><i/><i/><i/><i/><i/><i/></div></div>
      <div className="trust"><span>◈ Viajes protegidos</span><span>◉ Precio transparente</span></div>
    </section>

    <section className="form-panel">
      <div className="mobile-brand"><Logo /><b>Ride</b></div>
      {screen === 'welcome' && <div className="auth-box welcome-box"><span className="eyebrow">BIENVENIDO A RIDE</span><h2>Tu próximo viaje<br/>empieza aquí.</h2><p>Crea una cuenta o inicia sesión para continuar.</p><button className="primary-action" onClick={() => setScreen('register')}>Crear cuenta <span>→</span></button><button className="secondary-action" onClick={() => setScreen('login')}>Ya tengo una cuenta</button><small>Al continuar aceptas nuestros <a>Términos</a> y la <a>Política de privacidad</a>.</small></div>}
      {screen === 'login' && <AuthForm title="Qué bueno verte" subtitle="Ingresa tus datos para continuar." submit="Iniciar sesión" loading={loading} message={message} showPassword={showPassword} setShowPassword={setShowPassword} onSubmit={(event) => { event.preventDefault(); authenticate('login', event.currentTarget) }} onBack={() => { setScreen('welcome'); setMessage('') }} footer={<>¿Aún no tienes cuenta? <button onClick={() => { setScreen('register'); setMessage('') }}>Regístrate</button></>} />}
      {screen === 'register' && <RegisterForm loading={loading} message={message} showPassword={showPassword} setShowPassword={setShowPassword} onSubmit={(event) => { event.preventDefault(); authenticate('register', event.currentTarget) }} onBack={() => { setScreen('welcome'); setMessage('') }} onLogin={() => { setScreen('login'); setMessage('') }} />}
    </section>
  </main>
}

type AuthProps = { title:string; subtitle:string; submit:string; loading:boolean; message:string; showPassword:boolean; setShowPassword:(value:boolean)=>void; onSubmit:(event:FormEvent<HTMLFormElement>)=>void; onBack:()=>void; footer:ReactNode }
function AuthForm(props: AuthProps) {
  return <div className="auth-box"><button className="back" onClick={props.onBack}>← Volver</button><span className="eyebrow">ACCESO SEGURO</span><h2>{props.title}</h2><p>{props.subtitle}</p><form onSubmit={props.onSubmit}><label>Correo electrónico<input required name="email" type="email" autoComplete="email" placeholder="nombre@correo.com" /></label><label>Contraseña<div className="password-field"><input required name="password" type={props.showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Tu contraseña" /><button type="button" onClick={() => props.setShowPassword(!props.showPassword)}>{props.showPassword ? 'Ocultar' : 'Ver'}</button></div></label>{props.message && <div className="error">{props.message}</div>}<button className="primary-action" disabled={props.loading}>{props.loading ? 'Ingresando…' : props.submit}<span>→</span></button></form><div className="form-footer">{props.footer}</div></div>
}

function RegisterForm(props: Omit<AuthProps,'title'|'subtitle'|'submit'|'footer'> & { onLogin:()=>void }) {
  const [role, setRole] = useState<Role>('passenger')
  return <div className="auth-box register-box"><button className="back" onClick={props.onBack}>← Volver</button><span className="eyebrow">CREA TU CUENTA</span><h2>Comienza con Ride</h2><p>Cuéntanos cómo vas a utilizar la plataforma.</p><form onSubmit={props.onSubmit}><div className="role-picker"><button type="button" className={role==='passenger'?'selected':''} onClick={()=>setRole('passenger')}><b>Viajo</b><small>Quiero solicitar viajes</small></button><button type="button" className={role==='driver'?'selected':''} onClick={()=>setRole('driver')}><b>Conduzco</b><small>Quiero ofrecer viajes</small></button><input type="hidden" name="role" value={role}/></div><div className="two-fields"><label>Nombre completo<input required name="name" minLength={3} autoComplete="name" placeholder="Tu nombre" /></label><label>Teléfono<input required name="phone" minLength={8} inputMode="tel" autoComplete="tel" placeholder="099 999 9999" /></label></div><label>Correo electrónico<input required name="email" type="email" autoComplete="email" placeholder="nombre@correo.com" /></label><label>Contraseña<div className="password-field"><input required name="password" minLength={8} type={props.showPassword?'text':'password'} autoComplete="new-password" placeholder="Mínimo 8 caracteres"/><button type="button" onClick={()=>props.setShowPassword(!props.showPassword)}>{props.showPassword?'Ocultar':'Ver'}</button></div></label>{props.message&&<div className="error">{props.message}</div>}<button className="primary-action" disabled={props.loading}>{props.loading?'Creando cuenta…':'Crear mi cuenta'}<span>→</span></button></form><div className="form-footer">¿Ya tienes cuenta? <button onClick={props.onLogin}>Inicia sesión</button></div></div>
}

export default App
