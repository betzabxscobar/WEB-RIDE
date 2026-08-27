import { useEffect, useMemo, useState } from 'react'
import './AdminDashboard.css'
import logoAsset from './assets/LogoTipo.png'
import { listUsers, panelLabel, type Role, type User } from './lib/auth'
import { listTrips, watchTrips, esFinal, ESTADO_LABEL, type Trip } from './lib/trips'
import DriversPanel from './DriversPanel'

type Props = {
  user: { name: string; email: string; role: string }
  /** Panel que se muestra: `admin` o `superadmin`. */
  viewAs: Role
  views: Role[]
  onSwitchView: (view: Role) => void
  onLogout: () => void
}

type SidebarIconName = 'dashboard' | 'user' | 'wheel' | 'route' | 'money' | 'help' | 'logout'

const sections: ReadonlyArray<{ label: string; icon: SidebarIconName }> = [
  { label: 'Resumen', icon: 'dashboard' },
  { label: 'Usuarios', icon: 'user' },
  { label: 'Conductores', icon: 'wheel' },
  { label: 'Viajes', icon: 'route' },
  { label: 'Tarifas', icon: 'money' },
  { label: 'Soporte', icon: 'help' },
]

function SidebarIcon({ name }: { name: SidebarIconName }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    user: <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20c.8-3.3 3.5-5 7.5-5s6.7 1.7 7.5 5" /></>,
    wheel: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="2.5" /><path d="M6 6.2 10.3 10M18 6.2 13.7 10M12 14.5V20" /></>,
    route: <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h2.5a3.5 3.5 0 0 0 3.5-3.5v-5A3.5 3.5 0 0 1 17.5 6H16" /></>,
    money: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M12 8v8M14.3 10.1c-.5-.5-1.3-.8-2.3-.8-1.3 0-2.3.6-2.3 1.6 0 2.4 4.6 1.1 4.6 3.5 0 1-.9 1.6-2.3 1.6-1 0-1.9-.4-2.5-1" /></>,
    help: <><circle cx="12" cy="12" r="8.5" /><path d="M9.7 9.3a2.5 2.5 0 1 1 4.1 2c-1 .8-1.8 1.3-1.8 2.7M12 17.4h.01" /></>,
    logout: <><path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10" /><path d="M14 8l4 4-4 4M18 12H9" /></>,
  }[name]

  return <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths}</svg>
}

function roleLabel(role: string) {
  if (role === 'superadmin') return 'Superadmin'
  if (role === 'admin') return 'Admin'
  if (role === 'driver') return 'Conductor'
  return 'Pasajero'
}

function roleClass(role: string) {
  if (role === 'admin') return 'superadmin'
  return role
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function formatDate(value: string) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

export default function AdminDashboard({ user, viewAs, views, onSwitchView, onLogout }: Props) {
  const [activeSection, setActiveSection] = useState('Resumen')
  const [users, setUsers] = useState<User[]>([])
  const [trips, setTrips] = useState<Trip[]>([])
  const [tripsError, setTripsError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Manda la vista, no el rol: si un superadmin abrió el panel como admin, la
  // pantalla se comporta como la de un admin.
  const isSuperadmin = viewAs === 'superadmin'
  const viewingOtherPanel = viewAs !== user.role
  const accessName = isSuperadmin ? 'SUPERADMINISTRACIÓN' : 'ADMINISTRACIÓN'
  const profileName = isSuperadmin ? 'Superadministrador' : 'Administrador'

  // Las politicas RLS deciden que filas llegan: un admin no ve superadmins.
  useEffect(() => {
    let active = true
    listUsers()
      .then((rows) => { if (active) setUsers(rows) })
      .catch((requestError) => {
        if (!active) return
        setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar los usuarios.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  // Los viajes se recargan solos: Realtime avisa cuando cambia alguno.
  useEffect(() => {
    let active = true
    const cargar = () => {
      listTrips()
        .then((rows) => { if (active) setTrips(rows) })
        .catch((e) => {
          if (active) setTripsError(e instanceof Error ? e.message : 'No se pudieron cargar los viajes.')
        })
    }
    cargar()
    const dejarDeEscuchar = watchTrips(cargar)
    return () => {
      active = false
      dejarDeEscuchar()
    }
  }, [])

  const tripMetrics = useMemo(() => ({
    total: trips.length,
    activos: trips.filter((t) => !esFinal(t.estado)).length,
    finalizados: trips.filter((t) => t.estado === 'FINALIZADO').length,
    facturado: trips
      .filter((t) => t.estado === 'FINALIZADO')
      .reduce((suma, t) => suma + (t.tarifaFinal ?? 0), 0),
  }), [trips])

  // Al mirar el panel *como admin*, RLS sigue enviando a los superadmin porque
  // el rol real de la cuenta no cambió. Se ocultan aquí para que la
  // previsualización sea fiel. Es filtrado de presentación, no de seguridad:
  // la barrera real son las políticas RLS, que sí aplican a un admin auténtico.
  const visibleUsers = useMemo(
    () => (isSuperadmin ? users : users.filter((item) => item.role !== 'superadmin')),
    [users, isSuperadmin],
  )

  const metrics = useMemo(() => ({
    users: visibleUsers.filter((item) => item.role === 'passenger').length,
    drivers: visibleUsers.filter((item) => item.role === 'driver').length,
    administrators: visibleUsers.filter((item) => item.role === 'admin' || item.role === 'superadmin').length,
  }), [visibleUsers])

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand"><img src={logoAsset} className="admin-brand-logo" alt="Ride" /><span>Ride</span><small>{accessName}</small></div>
        <nav aria-label="Panel administrativo">
          {sections.map(({ label, icon }) => (
            <button key={label} className={activeSection === label ? 'active' : ''} onClick={() => setActiveSection(label)}>
              <span><SidebarIcon name={icon} /></span>{label}
            </button>
          ))}
        </nav>
        <div className="system-ok"><i />Sistema operativo<small>Acceso protegido</small></div>
        {views.length > 1 && (
          <label className="panel-switcher sidebar">
            <span className="sr-only">Cambiar de panel</span>
            <select value={viewAs} onChange={(event) => onSwitchView(event.target.value as Role)}>
              {views.map((view) => <option key={view} value={view}>{panelLabel(view)}</option>)}
            </select>
          </label>
        )}
        <button className="admin-logout" onClick={onLogout}><SidebarIcon name="logout" />Cerrar sesión</button>
      </aside>

      <section className="admin-main">
        {viewingOtherPanel && (
          <div className="viewing-as">
            <span>◉ Vista previa: así ve el panel una cuenta de administrador</span>
            <button onClick={() => onSwitchView(user.role as Role)}>Volver a mi panel</button>
          </div>
        )}
        <header>
          <div><small>{accessName}</small><h1>{activeSection}</h1></div>
          <div className="admin-profile"><span>{initials(user.name)}</span><div><strong>{user.name}</strong><small>{profileName}</small></div></div>
        </header>

        {activeSection === 'Resumen' ? (
          <div className="admin-content">
            <section className="admin-welcome">
              <div><small>PANEL DE CONTROL</small><h2>Hola, {user.name.split(' ')[0]}</h2><p>Revisa el estado real de las cuentas registradas en Ride.</p></div>
              <span className="secure-badge">◇ Sesión administrativa segura</span>
            </section>

            <section className="admin-metrics">
              <article><span className="metric-symbol blue">P</span><div><small>Pasajeros</small><strong>{metrics.users}</strong></div></article>
              <article><span className="metric-symbol mint">C</span><div><small>Conductores</small><strong>{metrics.drivers}</strong></div></article>
              <article><span className="metric-symbol violet">A</span><div><small>Equipo administrativo</small><strong>{metrics.administrators}</strong></div></article>
              <article><span className="metric-symbol coral">V</span><div><small>Viajes registrados</small><strong>{tripMetrics.total}</strong></div></article>
            </section>

            <div className="admin-grid">
              <section className="admin-card user-table">
                <div className="admin-card-head"><div><h3>Usuarios registrados</h3><p>Información obtenida desde Supabase.</p></div><button onClick={() => setActiveSection('Usuarios')}>Ver todos</button></div>
                {error && <p className="admin-error">{error}</p>}
                {loading && <p className="admin-error">Cargando usuarios…</p>}
                {!loading && !error && visibleUsers.length === 0 && <p className="admin-error">Todavía no hay cuentas registradas.</p>}
                {!loading && visibleUsers.slice(0, 6).map((account) => (
                  <div className="user-row" key={account.id}>
                    <span>{initials(account.name)}</span>
                    <div><strong>{account.name}</strong><small>{account.email}</small></div>
                    <em className={roleClass(account.role)}>{roleLabel(account.role)}</em>
                    <time>{formatDate(account.createdAt)}</time>
                  </div>
                ))}
              </section>

              <section className="admin-card next-steps">
                <div className="admin-card-head"><div><h3>Estado de implementación</h3><p>Avance funcional del proyecto.</p></div></div>
                <ul>
                  <li className="done"><span>✓</span><div><b>Acceso por roles</b><small>Admin y superadmin diferenciados</small></div></li>
                  <li className="done"><span>✓</span><div><b>Primer acceso seguro</b><small>Cambio de contraseña administrativa</small></div></li>
                  <li className="done"><span>✓</span><div><b>Conexión con Supabase</b><small>Auth y perfiles en la nube</small></div></li>
                  <li><span>4</span><div><b>Gestión de viajes</b><small>Tablas listas, falta la interfaz</small></div></li>
                </ul>
              </section>
            </div>
          </div>
        ) : activeSection === 'Conductores' ? (
          <DriversPanel />
        ) : activeSection === 'Viajes' ? (
          <div className="admin-content">
            <section className="admin-metrics">
              <article><span className="metric-symbol blue">T</span><div><small>Viajes totales</small><strong>{tripMetrics.total}</strong></div></article>
              <article><span className="metric-symbol mint">A</span><div><small>En curso ahora</small><strong>{tripMetrics.activos}</strong></div></article>
              <article><span className="metric-symbol violet">F</span><div><small>Finalizados</small><strong>{tripMetrics.finalizados}</strong></div></article>
              <article><span className="metric-symbol coral">$</span><div><small>Facturado</small><strong>${tripMetrics.facturado.toFixed(2)}</strong></div></article>
            </section>

            <section className="admin-card">
              <div className="admin-card-head">
                <div><h3>Monitoreo de viajes</h3><p>Se actualiza en vivo conforme cambian los estados.</p></div>
              </div>
              {tripsError && <p className="admin-error">{tripsError}</p>}
              {!tripsError && trips.length === 0 && <p className="admin-error">Todavía no se ha registrado ningún viaje.</p>}
              {trips.length > 0 && (
                <div className="trips-table">
                  {trips.map((trip) => (
                    <div className="trip-row" key={trip.id}>
                      <em className={`trip-state ${esFinal(trip.estado) ? trip.estado.toLowerCase() : 'activo'}`}>
                        {ESTADO_LABEL[trip.estado]}
                      </em>
                      <div className="trip-route">
                        <strong>{trip.origenTexto} → {trip.destinoTexto}</strong>
                        <small>{trip.pasajeroNombre}{trip.conductorNombre ? ` · ${trip.conductorNombre}` : ' · sin chofer'}{trip.vehiculoPlaca ? ` · ${trip.vehiculoPlaca}` : ''}</small>
                      </div>
                      <b>${(trip.tarifaFinal ?? trip.tarifaEstimada).toFixed(2)}</b>
                      <time>{formatDate(trip.fechaSolicitud)}</time>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : (
          <section className="admin-placeholder">
            <span><SidebarIcon name={sections.find((section) => section.label === activeSection)?.icon ?? 'dashboard'} /></span>
            <h2>{activeSection}</h2>
            <p>Este módulo se construirá en una siguiente etapa.</p>
            <button onClick={() => setActiveSection('Resumen')}>Volver al resumen</button>
          </section>
        )}
      </section>
    </main>
  )
}
