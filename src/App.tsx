import { Component, lazy, Suspense, useEffect, useState } from 'react'
import type { ErrorInfo, FormEvent, ReactNode } from 'react'
import { PanelPreview } from './components/PanelPreview'
import { ReactBitsEffects } from './components/ReactBitsEffects'
import './App.css'
import logoTipo from './assets/LogoTipo.webp'
import appAuthCity from './assets/app-auth-city.webp'
import appRideCar from './assets/app-ride-car.webp'
import appTravelerMan from './assets/app-traveler-man.webp'
import appTravelerWoman from './assets/app-traveler-woman.webp'
import { AlertTriangle, ArrowRight, CarFront, Clock3, Compass, LockKeyhole, LogIn, Mail, MapPin, Navigation, RotateCcw, Route as RouteIcon, ShieldCheck, Sparkles, UserPlus, WalletCards } from 'lucide-react'
import { supabase } from './lib/supabase'
import { useRideBrowserNotifications } from './lib/browser-notifications'
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

const AdminDashboard = lazy(() => import('./AdminDashboard'))
const PassengerDashboard = lazy(() => import('./PassengerDashboard'))
const DriverDashboard = lazy(() => import('./DriverDashboard'))

function Logo() {
  return <img src={logoTipo} className="logo" alt="Ride" />
}

function LegalFooter({ onOpenTerms }: { onOpenTerms: () => void }) {
  return <footer className="legal-footer">
    <button type="button" onClick={onOpenTerms}>Términos y condiciones</button>
    <span>© 2026 Ride. Todos los derechos reservados.</span>
  </footer>
}

function TermsDialog({ onClose }: { onClose: () => void }) {
  return <div className="terms-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="terms-dialog" role="dialog" aria-modal="true" aria-labelledby="terms-title" onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="terms-close" onClick={onClose} aria-label="Cerrar términos y condiciones">×</button>
      <span className="eyebrow">RIDE</span>
      <h2 id="terms-title">Términos y condiciones</h2>
      <p>Al crear una cuenta o utilizar Ride, aceptas proporcionar información veraz y usar la plataforma de forma segura, respetuosa y conforme a la ley.</p>
      <p>Los viajes, pagos, rutas y comunicaciones se gestionan según la disponibilidad del servicio. Cada persona usuaria es responsable de mantener protegidas sus credenciales y de revisar la información de cada viaje.</p>
      <p>Ride puede actualizar estos términos para mejorar el servicio o cumplir obligaciones legales. Te avisaremos cuando un cambio relevante requiera tu atención.</p>
      <button type="button" className="terms-confirm" onClick={onClose}>Entendido</button>
    </section>
  </div>
}

function loadingThemeClass() {
  if (typeof window === 'undefined') return 'loading-theme-light'
  const saved = localStorage.getItem('ride-theme')
  const dark = saved === 'dark' || (saved !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  return dark ? 'loading-theme-dark' : 'loading-theme-light'
}

function authThemeClass() {
  return loadingThemeClass() === 'loading-theme-dark' ? 'auth-theme-dark' : 'auth-theme-light'
}

function DashboardFallback() {
  return <main className={`loading-screen ${loadingThemeClass()}`} role="status" aria-live="polite" aria-label="Cargando Ride">
    <LoadingExperience title="Preparando tus viajes" text="Sincronizamos rutas, actividad y herramientas de tu cuenta." detail="Tu información estará lista en un momento" />
  </main>
}

class DashboardErrorBoundary extends Component<{ children: ReactNode; onBack?: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('No se pudo abrir el panel de Ride.', error, info) }
  render() {
    if (!this.state.failed) return this.props.children
    return <main className="dashboard-error-screen" role="alert">
      <section><span><AlertTriangle size={25} aria-hidden /></span><small>RIDE SIGUE DISPONIBLE</small><h1>No pudimos abrir este panel</h1><p>Una herramienta del panel dejó de responder. Puedes intentarlo otra vez sin cerrar tu sesión.</p><div><button type="button" onClick={() => window.location.reload()}><RotateCcw size={17} aria-hidden />Reintentar</button>{this.props.onBack && <button type="button" onClick={this.props.onBack}>Volver a mi panel</button>}</div></section>
    </main>
  }
}

function LoadingExperience({ title, text, detail }: { title: string; text: string; detail: string }) {
  return <>
    <div className="loading-glow loading-glow-one" aria-hidden />
    <div className="loading-glow loading-glow-two" aria-hidden />
    <div className="loading-route-art" aria-hidden><span /><span /><span /></div>
    <section className="loading-card">
      <div className="loading-brand"><img src={logoTipo} alt="" /><b>Ride</b><span>EN RUTA</span></div>
      <div className="loading-journey" aria-hidden>
        <span className="loading-vehicle"><CarFront size={24} /></span>
        <div className="loading-road" />
        <span className="loading-destination"><MapPin size={22} /></span>
      </div>
      <h1>{title}</h1>
      <p>{text}</p>
      <div className="loading-signals" aria-hidden>
        <span><Navigation size={15} />Ruta</span>
        <span><ShieldCheck size={15} />Viaje seguro</span>
        <span><Clock3 size={15} />Llegada</span>
      </div>
      <div className="loading-progress" aria-hidden><span /></div>
      <small><RouteIcon size={14} aria-hidden />{detail}</small>
    </section>
  </>
}

function App() {
  const [screen, setScreen] = useState<Screen>('welcome')
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showTerms, setShowTerms] = useState(false)

  // Llegó por el enlace de recuperación: hay que fijar contraseña nueva antes
  // de cualquier otra cosa. Gana sobre el resto del árbol de pantallas.
  const [recovering, setRecovering] = useState(false)

  // Pantalla que se está mostrando. El rol real del usuario no cambia nunca:
  // esto solo decide qué interfaz se ve. `null` = la que toca por su rol.
  const [view, setView] = useState<Role | null>(null)
  useRideBrowserNotifications(user?.id)

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
        return
      }
      // La confirmación de registro también vuelve como SIGNED_IN. Se vuelve
      // a leer el perfil real para que el enlace abra directamente la cuenta.
      if (event === 'SIGNED_IN') {
        void loadCurrentUser().then((signedInUser) => {
          if (!active || !signedInUser) return
          setUser(signedInUser)
          setView(null)
          setScreen('home')
        }).catch(() => undefined)
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

  const switchView = (next: Role) => {
    if (!user) return
    // La comprobación es genérica para no dejar huecos: lo que más importa es
    // que un admin no pueda abrir la vista de superadmin.
    if (!viewsAllowed(user.role).includes(next)) return
    setView(next === user.role ? null : next)
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
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
  if (screen === 'home' && user && viewIsAdministrative) return <DashboardErrorBoundary key={activeView} onBack={activeView !== user.role ? () => switchView(user.role) : undefined}><Suspense fallback={<DashboardFallback />}><AdminDashboard user={user} viewAs={activeView as Role} views={availableViews} onSwitchView={switchView} onUserUpdate={setUser} onLogout={logout} /></Suspense></DashboardErrorBoundary>

  if (screen === 'home' && user && activeView === 'passenger') return <DashboardErrorBoundary key={activeView} onBack={activeView !== user.role ? () => switchView(user.role) : undefined}><Suspense fallback={<DashboardFallback />}><PassengerDashboard user={user} views={availableViews} activeView={activeView} onSwitchView={switchView} onUserUpdate={setUser} onLogout={logout} /></Suspense></DashboardErrorBoundary>

  if (screen === 'home' && user && activeView === 'driver') return <DashboardErrorBoundary key={activeView} onBack={activeView !== user.role ? () => switchView(user.role) : undefined}><Suspense fallback={<DashboardFallback />}><DriverDashboard user={user} views={availableViews} activeView={activeView} onSwitchView={switchView} onUserUpdate={setUser} onLogout={logout} /></Suspense></DashboardErrorBoundary>

  if (loading && screen === 'welcome') return <main className={`loading-screen ${loadingThemeClass()}`} role="status" aria-live="polite" aria-label="Preparando Ride">
    <LoadingExperience title="Tu próximo viaje comienza aquí" text="Conectamos tu cuenta con Ride y preparamos el camino." detail="Buscando la mejor ruta para ti" />
  </main>

  if (screen === 'home' && user) return <main className="user-home"><PanelPreview role={user.role} activeView={activeView ?? user.role} onSwitchView={switchView} />

    <header><div className="mini-brand"><Logo /><b>Ride</b></div><div className="home-actions"><PanelSwitcher views={availableViews} active={activeView} onSwitch={switchView} /><button onClick={logout}>Cerrar sesión</button></div></header>
    <section><span className="success-mark">✓</span><p>Sesión iniciada correctamente</p><h1>Hola, {user.name.split(' ')[0]}</h1><p className="home-copy">{activeView !== user.role ? `Así ve la app una cuenta de ${activeView === 'driver' ? 'conductor' : 'pasajero'}.` : `Tu cuenta de ${activeView === 'driver' ? 'conductor' : 'pasajero'} está lista.`}</p><div className="account-card"><div><small>Correo</small><strong>{user.email}</strong></div><div><small>Teléfono</small><strong>{user.phone || 'Sin teléfono'}</strong></div><div><small>Modo</small><strong>{activeView === 'driver' ? 'Conduzco' : 'Viajo'}</strong></div></div></section>
  </main>

  return <main className={`auth-page auth-page-${screen} ${authThemeClass()}`}><ReactBitsEffects scene="auth"/>
    <section className="brand-panel" aria-hidden="true">
      <img className="auth-city-scene" src={appAuthCity} alt="" decoding="async" fetchPriority="high" />
      <img className="auth-app-person auth-app-woman" src={appTravelerWoman} alt="" decoding="async" />
      <img className="auth-app-person auth-app-man" src={appTravelerMan} alt="" decoding="async" />
      <img className="auth-app-car" src={appRideCar} alt="" decoding="async" />
      <div className="auth-scene-caption"><Navigation size={17}/><span><strong>Tu viaje empieza aquí</strong><small>Viaja o conduce con Ride</small></span></div>
    </section>

    <section className="form-panel">
      <div className="auth-stage">
        <div className="mobile-brand"><img src={logoTipo} className="wordmark-logo mobile-logo" alt="Ride" /><b>Ride</b></div>
        {screen === 'welcome' && <div className="auth-box welcome-box"><div className="welcome-heading"><span className="auth-icon"><Compass size={21} aria-hidden /></span><div><span className="eyebrow">BIENVENIDO A RIDE</span><small><Sparkles size={13} aria-hidden /> Tu viaje comienza aquí</small></div></div><h2>¿Cómo quieres continuar?</h2><p>Gestiona tus viajes, rutas, pagos y seguridad desde un solo lugar.</p><div className="auth-choice-grid"><button type="button" className="primary-action" onClick={() => setScreen('register')}><span className="action-icon"><UserPlus size={19} aria-hidden /></span><span><strong>Crear una cuenta</strong><small>Regístrate para viajar o conducir</small></span><ArrowRight size={18} aria-hidden /></button><button type="button" className="secondary-action" onClick={() => setScreen('login')}><span className="action-icon"><LogIn size={19} aria-hidden /></span><span><strong>Iniciar sesión</strong><small>Continúa con tu cuenta de Ride</small></span><ArrowRight size={18} aria-hidden /></button></div><div className="auth-feature-row"><span><ShieldCheck size={16} aria-hidden /> Sistema seguro</span><span><RouteIcon size={16} aria-hidden /> Rutas visibles</span><span><WalletCards size={16} aria-hidden /> Tarifas claras</span></div></div>}
        {screen === 'login' && <AuthForm title="Qué bueno verte" subtitle="Ingresa tus datos para continuar." submit="Iniciar sesión" loading={loading} message={message} notice={notice} showPassword={showPassword} setShowPassword={setShowPassword} onSubmit={(event) => { event.preventDefault(); handleLogin(event.currentTarget) }} onBack={() => { setScreen('welcome'); setMessage(''); setNotice('') }} footer={<>¿Aún no tienes cuenta? <button onClick={() => { setScreen('register'); setMessage(''); setNotice('') }}>Regístrate</button></>} extra={<button type="button" className="link-button" onClick={() => { setScreen('forgot'); setMessage(''); setNotice('') }}>¿Olvidaste tu contraseña?</button>} />}
        {screen === 'forgot' && <ForgotPasswordForm loading={loading} message={message} onSubmit={(event) => { event.preventDefault(); handleForgotPassword(event.currentTarget) }} onBack={() => { setScreen('login'); setMessage(''); setNotice('') }} />}
        {screen === 'register' && <RegisterForm loading={loading} message={message} notice={notice} showPassword={showPassword} setShowPassword={setShowPassword} onSubmit={(event) => { event.preventDefault(); handleRegister(event.currentTarget) }} onBack={() => { setScreen('welcome'); setMessage(''); setNotice('') }} onLogin={() => { setScreen('login'); setMessage(''); setNotice('') }} />}
        <LegalFooter onOpenTerms={() => setShowTerms(true)} />
      </div>
    </section>
    {showTerms && <TermsDialog onClose={() => setShowTerms(false)} />}
  </main>
}

/// Selector de panel. Solo aparece si la cuenta puede ver más de una vista.
function PanelSwitcher({views,active,onSwitch}:{views:Role[];active:Role|null;onSwitch:(view:Role)=>void}) {
  if (views.length < 2 || !active) return null
  return <label className="panel-switcher"><span className="sr-only">Cambiar de panel</span><select value={active} onChange={(event)=>onSwitch(event.target.value as Role)}>{views.map((view)=><option key={view} value={view}>{panelLabel(view)}</option>)}</select></label>
}


type AuthProps = { title:string; subtitle:string; submit:string; loading:boolean; message:string; notice:string; showPassword:boolean; setShowPassword:(value:boolean)=>void; onSubmit:(event:FormEvent<HTMLFormElement>)=>void; onBack:()=>void; footer:ReactNode; extra?:ReactNode }
function AuthForm(props: AuthProps) {
  return <div className="auth-box"><button className="back" onClick={props.onBack}>← Volver</button><span className="auth-icon"><LockKeyhole size={20} aria-hidden /></span><span className="eyebrow">ACCESO SEGURO</span><h2>{props.title}</h2><p>{props.subtitle}</p><form onSubmit={props.onSubmit}><label>Correo electrónico<div className="input-with-icon"><Mail size={17} aria-hidden /><input required name="email" type="email" autoComplete="email" placeholder="nombre@correo.com" /></div></label><label>Contraseña<div className="password-field input-with-icon"><LockKeyhole size={17} aria-hidden /><input required name="password" type={props.showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Tu contraseña" /><button type="button" onClick={() => props.setShowPassword(!props.showPassword)}>{props.showPassword ? 'Ocultar' : 'Ver'}</button></div></label>{props.notice && <div className="notice">{props.notice}</div>}{props.message && <div className="error">{props.message}</div>}<button className="primary-action" disabled={props.loading}>{props.loading ? 'Ingresando…' : props.submit}<ArrowRight size={18} aria-hidden /></button>{props.extra && <div className="form-extra">{props.extra}</div>}</form><div className="form-footer">{props.footer}</div><div className="auth-assurance"><ShieldCheck size={15} aria-hidden /> Conexión cifrada y acceso protegido</div></div>
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
