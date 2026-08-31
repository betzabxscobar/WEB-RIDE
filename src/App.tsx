import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import './App.css'
import logoTipo from './assets/LogoTipo.png'
import AdminDashboard from './AdminDashboard'
import PassengerDashboard from './PassengerDashboard'
import DriverDashboard from './DriverDashboard'
import './DriverDashboard.css'
import { supabase } from './lib/supabase'
import {
  changeInitialPassword,
  completePasswordReset,
  loadCurrentUser,
  panelLabel,
  requestPasswordReset,
  signIn,
  signOut,
  signUp,
  viewsAllowed,
  type Role,
  type User,
} from './lib/auth'

type Screen = 'welcome' | 'login' | 'register' | 'forgot' | 'home'

function Logo() {
  return <img src={logoTipo} className="logo" alt="Ride" />
}

function App() {
  const [screen, setScreen] = useState<Screen>('welcome')
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Llegó por el enlace de recuperación: hay que fijar contraseña nueva antes
  // de cualquier otra cosa. Gana sobre el resto del árbol de pantallas.
  const [recovering, setRecovering] = useState(false)

  // Pantalla que se está mostrando. El rol real del usuario no cambia nunca:
  // esto solo decide qué interfaz se ve. `null` = la que toca por su rol.
  const [view, setView] = useState<Role | null>(null)

  // Restaura la sesión guardada y se mantiene al día si el token se refresca
  // o si la sesión se cierra en otra pestaña.
  useEffect(() => {
    let active = true

    // El listener se registra ANTES de restaurar la sesión: al abrir el enlace
    // del correo, Supabase consume el token de la URL y emite PASSWORD_RECOVERY
    // enseguida. Si se registrara después, ese evento se perdería y la persona
    // entraría al home sin pasar por el cambio de contraseña.
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY') {
        setRecovering(true)
        setMessage('')
        setNotice('')
        return
      }
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setRecovering(false)
        setView(null)
        setScreen('welcome')
      }
    })

    loadCurrentUser()
      .then((restored) => {
        if (!active) return
        if (restored) {
          setUser(restored)
          setScreen('home')
        }
      })
      .catch(() => supabase.auth.signOut())
      .finally(() => { if (active) setLoading(false) })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  const handleForgotPassword = async (form: HTMLFormElement) => {
    setLoading(true); setMessage(''); setNotice('')
    const values = Object.fromEntries(new FormData(form))
    try {
      await requestPasswordReset(String(values.email))
      setScreen('login')
      // Mismo aviso exista o no la cuenta: no se filtra qué correos hay.
      setNotice('Si ese correo tiene una cuenta, te enviamos el enlace para restablecer la contraseña.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ocurrió un error inesperado.')
    } finally { setLoading(false) }
  }

  const handleResetPassword = async (form: HTMLFormElement) => {
    setLoading(true); setMessage('')
    const values = Object.fromEntries(new FormData(form))
    if (values.password !== values.confirmPassword) {
      setMessage('Las contraseñas no coinciden.'); setLoading(false); return
    }
    try {
      await completePasswordReset(String(values.password))
      // La sesión de recuperación ya vale como sesión normal: se entra directo.
      const actualizado = await loadCurrentUser()
      setRecovering(false)
      if (actualizado) {
        setUser(actualizado)
        setScreen('home')
      } else {
        setScreen('login')
        setNotice('Contraseña actualizada. Ya puedes iniciar sesión.')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ocurrió un error inesperado.')
    } finally { setLoading(false) }
  }

  const handleLogin = async (form: HTMLFormElement) => {
    setLoading(true); setMessage(''); setNotice('')
    const values = Object.fromEntries(new FormData(form))
    try {
      setUser(await signIn(String(values.email), String(values.password)))
      setScreen('home')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ocurrió un error inesperado.')
    } finally { setLoading(false) }
  }

  const handleRegister = async (form: HTMLFormElement) => {
    setLoading(true); setMessage(''); setNotice('')
    const values = Object.fromEntries(new FormData(form))
    try {
      const result = await signUp({
        name: String(values.name),
        email: String(values.email),
        phone: String(values.phone),
        password: String(values.password),
        role: String(values.role) as 'passenger' | 'driver',
      })
      if (result.status === 'needs_email_confirmation') {
        setScreen('login')
        setNotice('Te enviamos un correo de confirmación. Ábrelo para activar tu cuenta.')
        return
      }
      setUser(result.user)
      setScreen('home')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ocurrió un error inesperado.')
    } finally { setLoading(false) }
  }

  const logout = async () => {
    await signOut()
    setUser(null); setScreen('welcome'); setMessage(''); setNotice(''); setView(null)
  }

  // Vista efectiva y opciones disponibles para la sesión actual.
  const activeView: Role | null = user ? (view ?? user.role) : null
  const availableViews = user ? viewsAllowed(user.role) : []
  const viewingOtherPanel = user != null && view != null && view !== user.role

  const switchView = (next: Role) => {
    if (!user) return
    // La comprobación es genérica para no dejar huecos: lo que más importa es
    // que un admin no pueda abrir la vista de superadmin.
    if (!viewsAllowed(user.role).includes(next)) return
    setView(next === user.role ? null : next)
  }

  const finishFirstAccess = async (form: HTMLFormElement) => {
    setLoading(true); setMessage('')
    const values = Object.fromEntries(new FormData(form))
    if (values.password !== values.confirmPassword) {
      setMessage('Las contraseñas no coinciden.'); setLoading(false); return
    }
    try {
      setUser(await changeInitialPassword(String(values.password)))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ocurrió un error inesperado.')
    } finally { setLoading(false) }
  }

  // Antes que nada: si vino por el enlace del correo, fija la contraseña.
  if (recovering) return <ResetPasswordForm loading={loading} message={message} onSubmit={(event)=>{event.preventDefault();handleResetPassword(event.currentTarget)}} onCancel={logout} />

  const isAdministrative = user?.role === 'admin' || user?.role === 'superadmin'
  if (screen === 'home' && user && isAdministrative && user.mustChangePassword) return <FirstAccessForm user={user} loading={loading} message={message} onSubmit={(event)=>{event.preventDefault();finishFirstAccess(event.currentTarget)}} onLogout={logout} />

  // La pantalla la decide la vista activa, no el rol: un administrador puede
  // estar mirando la interfaz de usuario o de chofer con su propia cuenta.
  const viewIsAdministrative = activeView === 'admin' || activeView === 'superadmin'
  if (screen === 'home' && user && viewIsAdministrative) return <AdminDashboard user={user} viewAs={activeView as Role} views={availableViews} onSwitchView={switchView} onLogout={logout} />

  if (screen === 'home' && user && activeView === 'passenger') return <>
    {viewingOtherPanel && <ViewingAsBar role={user.role} onBack={() => setView(null)} />}
    <PassengerDashboard user={user} views={availableViews} activeView={activeView} onSwitchView={switchView} onLogout={logout} />
  </>

  if (screen === 'home' && user && activeView === 'driver') return <>
    {viewingOtherPanel && <ViewingAsBar role={user.role} onBack={() => setView(null)} />}
    <DriverDashboard user={user} views={availableViews} activeView={activeView} onSwitchView={switchView} onLogout={logout} />
  </>

  if (loading && screen === 'welcome') return <div className="loading-screen"><span>Preparando Ride…</span></div>

  if (screen === 'home' && user) return <main className="user-home">
    {viewingOtherPanel && <ViewingAsBar role={user.role} onBack={() => setView(null)} />}
    <header><div className="mini-brand"><Logo /><b>Ride</b></div><div className="home-actions"><PanelSwitcher views={availableViews} active={activeView} onSwitch={switchView} /><button onClick={logout}>Cerrar sesión</button></div></header>
    <section><span className="success-mark">✓</span><p>Sesión iniciada correctamente</p><h1>Hola, {user.name.split(' ')[0]}</h1><p className="home-copy">{viewingOtherPanel ? `Así ve la app una cuenta de ${activeView === 'driver' ? 'conductor' : 'pasajero'}.` : `Tu cuenta de ${activeView === 'driver' ? 'conductor' : 'pasajero'} está lista.`}</p><div className="account-card"><div><small>Correo</small><strong>{user.email}</strong></div><div><small>Teléfono</small><strong>{user.phone || 'Sin teléfono'}</strong></div><div><small>Modo</small><strong>{activeView === 'driver' ? 'Conduzco' : 'Viajo'}</strong></div></div></section>
  </main>

  return <main className="auth-page">
    <section className="brand-panel">
      <div className="brand-copy"><div className="wordmark"><img src={logoTipo} className="wordmark-logo" alt="Ride" /><span>Ride</span></div><h1>Muévete con<br/><em>libertad.</em></h1><p>Una forma más segura, transparente y humana de llegar a donde quieres.</p></div>
      <div className="city-art"><div className="moon"/><div className="route"><i/><i/><i/></div><div className="car">▰</div><div className="buildings"><i/><i/><i/><i/><i/><i/></div></div>
    </section>

    <section className="form-panel">
      <div className="mobile-brand"><img src={logoTipo} className="wordmark-logo mobile-logo" alt="Ride" /><b>Ride</b></div>
      {screen === 'welcome' && <div className="auth-box welcome-box"><span className="eyebrow">BIENVENIDO A RIDE</span><h2>Tu próximo viaje<br/>empieza aquí.</h2><p>Crea una cuenta o inicia sesión para continuar.</p><button className="primary-action" onClick={() => setScreen('register')}>Crear cuenta <span>→</span></button><button className="secondary-action" onClick={() => setScreen('login')}>Ya tengo una cuenta</button></div>}
      {screen === 'login' && <AuthForm title="Qué bueno verte" subtitle="Ingresa tus datos para continuar." submit="Iniciar sesión" loading={loading} message={message} notice={notice} showPassword={showPassword} setShowPassword={setShowPassword} onSubmit={(event) => { event.preventDefault(); handleLogin(event.currentTarget) }} onBack={() => { setScreen('welcome'); setMessage(''); setNotice('') }} footer={<>¿Aún no tienes cuenta? <button onClick={() => { setScreen('register'); setMessage(''); setNotice('') }}>Regístrate</button></>} extra={<button type="button" className="link-button" onClick={() => { setScreen('forgot'); setMessage(''); setNotice('') }}>¿Olvidaste tu contraseña?</button>} />}
      {screen === 'forgot' && <ForgotPasswordForm loading={loading} message={message} onSubmit={(event) => { event.preventDefault(); handleForgotPassword(event.currentTarget) }} onBack={() => { setScreen('login'); setMessage(''); setNotice('') }} />}
      {screen === 'register' && <RegisterForm loading={loading} message={message} notice={notice} showPassword={showPassword} setShowPassword={setShowPassword} onSubmit={(event) => { event.preventDefault(); handleRegister(event.currentTarget) }} onBack={() => { setScreen('welcome'); setMessage(''); setNotice('') }} onLogin={() => { setScreen('login'); setMessage(''); setNotice('') }} />}
    </section>
  </main>
}

/// Selector de panel. Solo aparece si la cuenta puede ver más de una vista.
function PanelSwitcher({views,active,onSwitch}:{views:Role[];active:Role|null;onSwitch:(view:Role)=>void}) {
  if (views.length < 2 || !active) return null
  return <label className="panel-switcher"><span className="sr-only">Cambiar de panel</span><select value={active} onChange={(event)=>onSwitch(event.target.value as Role)}>{views.map((view)=><option key={view} value={view}>{panelLabel(view)}</option>)}</select></label>
}

/// Aviso de que se está mirando una pantalla distinta a la del rol propio.
function ViewingAsBar({role,onBack}:{role:Role;onBack:()=>void}) {
  const nombre = role === 'superadmin' ? 'superadministrador' : 'administrador'
  return <div className="viewing-as"><span>Viendo como {nombre}</span><button onClick={onBack}>Volver a mi panel</button></div>
}

type AuthProps = { title:string; subtitle:string; submit:string; loading:boolean; message:string; notice:string; showPassword:boolean; setShowPassword:(value:boolean)=>void; onSubmit:(event:FormEvent<HTMLFormElement>)=>void; onBack:()=>void; footer:ReactNode; extra?:ReactNode }
function AuthForm(props: AuthProps) {
  return <div className="auth-box"><button className="back" onClick={props.onBack}>← Volver</button><span className="eyebrow">ACCESO SEGURO</span><h2>{props.title}</h2><p>{props.subtitle}</p><form onSubmit={props.onSubmit}><label>Correo electrónico<input required name="email" type="email" autoComplete="email" placeholder="nombre@correo.com" /></label><label>Contraseña<div className="password-field"><input required name="password" type={props.showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Tu contraseña" /><button type="button" onClick={() => props.setShowPassword(!props.showPassword)}>{props.showPassword ? 'Ocultar' : 'Ver'}</button></div></label>{props.notice && <div className="notice">{props.notice}</div>}{props.message && <div className="error">{props.message}</div>}<button className="primary-action" disabled={props.loading}>{props.loading ? 'Ingresando…' : props.submit}<span>→</span></button>{props.extra && <div className="form-extra">{props.extra}</div>}</form><div className="form-footer">{props.footer}</div></div>
}

/// Paso 1 de la recuperación: pedir el enlace por correo.
function ForgotPasswordForm({loading,message,onSubmit,onBack}:{loading:boolean;message:string;onSubmit:(event:FormEvent<HTMLFormElement>)=>void;onBack:()=>void}) {
  return <div className="auth-box"><button className="back" onClick={onBack}>← Volver</button><span className="eyebrow">RECUPERAR ACCESO</span><h2>¿Olvidaste tu<br/>contraseña?</h2><p>Escribe tu correo y te enviamos un enlace para crear una nueva.</p><form onSubmit={onSubmit}><label>Correo electrónico<input required name="email" type="email" autoComplete="email" placeholder="nombre@correo.com" /></label>{message&&<div className="error">{message}</div>}<button className="primary-action" disabled={loading}>{loading?'Enviando…':'Enviar enlace'}<span>→</span></button></form><div className="form-footer">¿Ya la recordaste? <button onClick={onBack}>Inicia sesión</button></div></div>
}

/// Paso 2 de la recuperación: llegó por el enlace del correo y fija la nueva.
///
/// Comparte el aspecto de `FirstAccessForm`: misma pantalla completa, mismo
/// bloque centrado. Cambia el texto porque el motivo es otro.
function ResetPasswordForm({loading,message,onSubmit,onCancel}:{loading:boolean;message:string;onSubmit:(event:FormEvent<HTMLFormElement>)=>void;onCancel:()=>void}) {
  return <main className="first-access"><section><div className="mini-brand"><Logo/><b>Ride</b></div><span className="security-icon" aria-hidden="true"/><span className="eyebrow">RESTABLECER CONTRASEÑA</span><h1>Crea tu contraseña nueva</h1><p>Abriste el enlace que te enviamos. Elige una contraseña y entrarás enseguida.</p><form onSubmit={onSubmit}><label>Nueva contraseña<input required name="password" type="password" minLength={8} autoComplete="new-password" placeholder="Mínimo 8 caracteres"/></label><label>Confirmar contraseña<input required name="confirmPassword" type="password" minLength={8} autoComplete="new-password" placeholder="Repite tu contraseña"/></label>{message&&<div className="error">{message}</div>}<button className="primary-action" disabled={loading}>{loading?'Guardando…':'Guardar y entrar'}<span>→</span></button></form><button type="button" className="cancel-access" onClick={onCancel}>Cancelar</button></section></main>
}

function RegisterForm(props: Omit<AuthProps,'title'|'subtitle'|'submit'|'footer'> & { onLogin:()=>void }) {
  const [role, setRole] = useState<Role>('passenger')
  return <div className="auth-box register-box"><button className="back" onClick={props.onBack}>← Volver</button><span className="eyebrow">CREA TU CUENTA</span><h2>Comienza con Ride</h2><p>Cuéntanos cómo vas a utilizar la plataforma.</p><form onSubmit={props.onSubmit}><div className="role-picker"><button type="button" className={role==='passenger'?'selected':''} onClick={()=>setRole('passenger')}><b>Viajo</b><small>Quiero solicitar viajes</small></button><button type="button" className={role==='driver'?'selected':''} onClick={()=>setRole('driver')}><b>Conduzco</b><small>Quiero ofrecer viajes</small></button><input type="hidden" name="role" value={role}/></div><div className="two-fields"><label>Nombre completo<input required name="name" minLength={3} autoComplete="name" placeholder="Tu nombre" /></label><label>Teléfono<input required name="phone" minLength={8} inputMode="tel" autoComplete="tel" placeholder="099 999 9999" /></label></div><label>Correo electrónico<input required name="email" type="email" autoComplete="email" placeholder="nombre@correo.com" /></label><label>Contraseña<div className="password-field"><input required name="password" minLength={8} type={props.showPassword?'text':'password'} autoComplete="new-password" placeholder="Mínimo 8 caracteres"/><button type="button" onClick={()=>props.setShowPassword(!props.showPassword)}>{props.showPassword?'Ocultar':'Ver'}</button></div></label>{props.notice&&<div className="notice">{props.notice}</div>}{props.message&&<div className="error">{props.message}</div>}<button className="primary-action" disabled={props.loading}>{props.loading?'Creando cuenta…':'Crear mi cuenta'}<span>→</span></button></form><div className="form-footer">¿Ya tienes cuenta? <button onClick={props.onLogin}>Inicia sesión</button></div></div>
}

function FirstAccessForm({user,loading,message,onSubmit,onLogout}:{user:User;loading:boolean;message:string;onSubmit:(event:FormEvent<HTMLFormElement>)=>void;onLogout:()=>void}) {
  return <main className="first-access"><section><div className="mini-brand"><Logo/><b>Ride</b></div><span className="security-icon" aria-hidden="true"/><span className="eyebrow">PRIMER ACCESO ADMINISTRATIVO</span><h1>Crea tu contraseña personal</h1><p>Hola, {user.name}. Por seguridad debes reemplazar la contraseña temporal antes de entrar al panel.</p><form onSubmit={onSubmit}><label>Nueva contraseña<input required name="password" type="password" minLength={10} autoComplete="new-password" placeholder="Mínimo 10 caracteres"/></label><label>Confirmar contraseña<input required name="confirmPassword" type="password" minLength={10} autoComplete="new-password" placeholder="Repite tu contraseña"/></label>{message&&<div className="error">{message}</div>}<button className="primary-action" disabled={loading}>{loading?'Guardando…':'Guardar y entrar'}<span>→</span></button></form><button type="button" className="cancel-access" onClick={onLogout}>Cerrar sesión</button></section></main>
}

export default App
