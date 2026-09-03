import { useEffect, useMemo, useState } from 'react'
import './AdminDashboard.css'
import logoAsset from './assets/LogoTipo.png'
import { listUsers, panelLabel, type Role, type User } from './lib/auth'
import { faltantes, listDrivers, type Driver } from './lib/drivers'
import { listTrips, watchTrips, esFinal, ESTADO_LABEL, type Trip } from './lib/trips'
import DriversPanel from './DriversPanel'
import { AppearanceSettings, useAppearance } from './components/AppearanceSettings'
import { Home as HomeIcon, Map as MapIcon, Users as UsersIcon, User as UserIcon, Settings as SettingsIcon, LogOut as LogOutIcon, Menu as MenuIcon, MapPin as MapPinIcon, Navigation as NavigationIcon, Search as SearchIcon, SlidersHorizontal as FilterIcon, CalendarDays as CalendarIcon, ArrowDownUp as SortIcon, Route as RouteIcon, CircleDollarSign as DollarIcon, CarFront as CarIcon, CheckCircle2 as CheckIcon, CircleX as CancelIcon, Activity as ActivityIcon, MoreVertical as MoreIcon, ShieldCheck as ShieldIcon } from 'lucide-react'

type Props = {
  user: { name: string; email: string; role: string }
  viewAs: Role
  views: Role[]
  onSwitchView: (view: Role) => void
  onLogout: () => void
}

type Section = 'Resumen' | 'Usuarios' | 'Conductores' | 'Viajes' | 'Mi cuenta' | 'Configuración'

const sections: { label: Section; group: 'Operación' | 'Gestión' }[] = [
  { label: 'Resumen', group: 'Operación' },
  { label: 'Viajes', group: 'Operación' },
  { label: 'Conductores', group: 'Gestión' },
  { label: 'Usuarios', group: 'Gestión' },
  { label: 'Mi cuenta', group: 'Gestión' },
  { label: 'Configuración', group: 'Gestión' },
]

function NavIcon({ section }: { section: Section }) {
  if (section === 'Resumen') return <HomeIcon size={18} aria-hidden />
  if (section === 'Viajes') return <MapIcon size={18} aria-hidden />
  if (section === 'Conductores') return <UsersIcon size={18} aria-hidden />
  if (section === 'Configuración') return <SettingsIcon size={18} aria-hidden />
  return <UserIcon size={18} aria-hidden />
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
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function formatDate(value: string) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

function paymentLabel(trip: Trip) {
  return trip.montoCobrado > 0 ? 'Cobrado' : trip.estado === 'FINALIZADO' ? 'Pago pendiente' : 'Estimado'
}

function paymentClass(trip: Trip) {
  return trip.montoCobrado > 0 ? 'paid' : trip.estado === 'FINALIZADO' ? 'pending' : 'estimated'
}

function UserRows({ users, loading, error, limit }: { users: User[]; loading: boolean; error: string; limit?: number }) {
  const rows = limit == null ? users : users.slice(0, limit)
  return <>
    {error && <p className="admin-error">{error}</p>}
    {loading && <p className="admin-empty">Cargando usuarios…</p>}
    {!loading && !error && users.length === 0 && <p className="admin-empty">Todavía no hay cuentas registradas.</p>}
    {!loading && !error && rows.map((account) => (
      <div className="user-row" key={account.id}>
        <span>{initials(account.name)}</span>
        <div><strong>{account.name}</strong><small>{account.email}</small></div>
        <em className={roleClass(account.role)}>{roleLabel(account.role)}</em>
        <time>{formatDate(account.createdAt)}</time>
      </div>
    ))}
  </>
}

function LegacyTripRows({ trips, loading, error, limit }: { trips: Trip[]; loading: boolean; error: string; limit?: number }) {
  const rows = limit == null ? trips : trips.slice(0, limit)
  return <>
    {error && <p className="admin-error">{error}</p>}
    {loading && <p className="admin-empty">Cargando viajes…</p>}
    {!loading && !error && trips.length === 0 && <p className="admin-empty">Todavía no se ha registrado ningún viaje.</p>}
    {!loading && !error && rows.length > 0 && (
      <div className="trips-table">
        {rows.map((trip) => (
          <div className="trip-row" key={trip.id}>
            <em className={`trip-state ${esFinal(trip.estado) ? trip.estado.toLowerCase() : 'activo'}`}>{ESTADO_LABEL[trip.estado]}</em>
            <div className="trip-route">
              <strong>{trip.origenTexto} → {trip.destinoTexto}</strong>
              <small>{trip.pasajeroNombre}{trip.conductorNombre ? ` · ${trip.conductorNombre}` : ' · sin chofer'}{trip.vehiculoPlaca ? ` · ${trip.vehiculoPlaca}` : ''}</small>
            </div>
            <b className="trip-amount">
              <small>{trip.montoCobrado > 0 ? 'Cobrado' : trip.estado === 'FINALIZADO' ? 'Pago pendiente' : 'Estimado'}</small>
              ${trip.montoCobrado > 0 ? trip.montoCobrado.toFixed(2) : (trip.tarifaFinal ?? trip.tarifaEstimada).toFixed(2)}
            </b>
            <time>{formatDate(trip.fechaSolicitud)}</time>
          </div>
        ))}
      </div>
    )}
  </>
}

function TripRows({ trips, loading, error, limit }: { trips: Trip[]; loading: boolean; error: string; limit?: number }) {
  const rows = limit == null ? trips : trips.slice(0, limit)
  return <>
    {error && <p className="admin-error">{error}</p>}
    {loading && <p className="admin-empty">Cargando viajes...</p>}
    {!loading && !error && trips.length === 0 && <p className="admin-empty">No se encontraron viajes con estos filtros.</p>}
    {!loading && !error && rows.length > 0 && <div className="trips-table">
      {rows.map((trip) => (
        <article className="trip-row" key={trip.id}>
          <em className={`trip-state ${esFinal(trip.estado) ? trip.estado.toLowerCase() : 'activo'}`}>{trip.estado === 'FINALIZADO' && <CheckIcon size={11} aria-hidden />}{trip.estado === 'CANCELADO' && <CancelIcon size={11} aria-hidden />}{ESTADO_LABEL[trip.estado]}</em>
          <div className="trip-route"><div className="route-point origin"><MapPinIcon size={15} aria-hidden /><span><small>Origen</small><strong>{trip.origenTexto}</strong></span></div><span className="route-line" aria-hidden /><div className="route-point destination"><NavigationIcon size={15} aria-hidden /><span><small>Destino</small><strong>{trip.destinoTexto}</strong></span></div></div>
          <div className="trip-persons"><span><UserIcon size={14} aria-hidden /><b>{trip.pasajeroNombre}</b></span><span><CarIcon size={14} aria-hidden /><b>{trip.conductorNombre || 'Sin conductor'}{trip.vehiculoPlaca ? ` · ${trip.vehiculoPlaca}` : ''}</b></span></div>
          <b className={`trip-amount ${paymentClass(trip)}`}><small>{paymentLabel(trip)}</small>${trip.montoCobrado > 0 ? trip.montoCobrado.toFixed(2) : (trip.tarifaFinal ?? trip.tarifaEstimada).toFixed(2)}</b>
          <time className="trip-date"><CalendarIcon size={13} aria-hidden />{formatDate(trip.fechaSolicitud)}</time><button className="trip-more" type="button" aria-label="Más opciones del viaje"><MoreIcon size={17} aria-hidden /></button>
        </article>
      ))}
    </div>}
  </>
}

export default function AdminDashboard({ user, viewAs, views, onSwitchView, onLogout }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<Section>('Resumen')
  const [users, setUsers] = useState<User[]>([])
  const [trips, setTrips] = useState<Trip[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [tripsLoading, setTripsLoading] = useState(true)
  const [driversLoading, setDriversLoading] = useState(true)
  const [usersError, setUsersError] = useState('')
  const [tripsError, setTripsError] = useState('')
  const [driversError, setDriversError] = useState('')
  const [tripQuery, setTripQuery] = useState('')
  const [tripStatus, setTripStatus] = useState('')
  const [tripDate, setTripDate] = useState('')
  const [tripSort, setTripSort] = useState<'date-desc' | 'date-asc' | 'status' | 'value-desc'>('date-desc')
  const [userQuery, setUserQuery] = useState('')
  const [userRole, setUserRole] = useState('')
  const appearance = useAppearance()

  const isSuperadmin = viewAs === 'superadmin'
  const viewingOtherPanel = viewAs !== user.role
  const accessName = isSuperadmin ? 'SUPERADMINISTRACIÓN' : 'ADMINISTRACIÓN'
  const profileName = isSuperadmin ? 'Superadministrador' : 'Administrador'

  useEffect(() => {
    let active = true
    listUsers()
      .then((rows) => { if (active) setUsers(rows) })
      .catch((error) => { if (active) setUsersError(error instanceof Error ? error.message : 'No se pudieron cargar los usuarios.') })
      .finally(() => { if (active) setUsersLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    listDrivers()
      .then((rows) => { if (active) setDrivers(rows) })
      .catch((error) => { if (active) setDriversError(error instanceof Error ? error.message : 'No se pudieron cargar los conductores.') })
      .finally(() => { if (active) setDriversLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    const cargar = () => {
      listTrips()
        .then((rows) => { if (active) { setTrips(rows); setTripsError('') } })
        .catch((error) => { if (active) setTripsError(error instanceof Error ? error.message : 'No se pudieron cargar los viajes.') })
        .finally(() => { if (active) setTripsLoading(false) })
    }
    cargar()
    const dejarDeEscuchar = watchTrips(cargar)
    return () => { active = false; dejarDeEscuchar() }
  }, [])

  const visibleUsers = useMemo(
    () => (isSuperadmin ? users : users.filter((item) => item.role !== 'superadmin')),
    [users, isSuperadmin],
  )
  const filteredUsers = useMemo(() => {
    const query = userQuery.trim().toLocaleLowerCase('es-EC')
    return visibleUsers.filter((account) => {
      const searchable = `${account.name} ${account.email} ${account.phone}`.toLocaleLowerCase('es-EC')
      return (!query || searchable.includes(query)) && (!userRole || account.role === userRole)
    })
  }, [visibleUsers, userQuery, userRole])

  const metrics = useMemo(() => ({
    passengers: visibleUsers.filter((item) => item.role === 'passenger').length,
    drivers: visibleUsers.filter((item) => item.role === 'driver').length,
    activeTrips: trips.filter((trip) => !esFinal(trip.estado)).length,
    collected: trips.reduce((total, trip) => total + trip.montoCobrado, 0),
    finishedTrips: trips.filter((trip) => trip.estado === 'FINALIZADO').length,
  }), [visibleUsers, trips])

  const pendingDrivers = useMemo(() => drivers.filter((driver) => driver.estado === 'pendiente'), [drivers])
  const navCount = (section: Section) => section === 'Viajes' ? metrics.activeTrips : section === 'Conductores' ? pendingDrivers.length : 0
  const filteredTrips = useMemo(() => {
    const query = tripQuery.trim().toLocaleLowerCase('es-EC')
    return trips.filter((trip) => {
      const searchable = `${trip.pasajeroNombre} ${trip.conductorNombre ?? ''} ${trip.origenTexto} ${trip.destinoTexto}`.toLocaleLowerCase('es-EC')
      const date = trip.fechaSolicitud ? new Date(trip.fechaSolicitud).toISOString().slice(0, 10) : ''
      return (!query || searchable.includes(query)) && (!tripStatus || trip.estado === tripStatus) && (!tripDate || date === tripDate)
    }).sort((a, b) => {
      if (tripSort === 'status') return ESTADO_LABEL[a.estado].localeCompare(ESTADO_LABEL[b.estado], 'es')
      if (tripSort === 'value-desc') return (b.montoCobrado || b.tarifaFinal || b.tarifaEstimada) - (a.montoCobrado || a.tarifaFinal || a.tarifaEstimada)
      const direction = tripSort === 'date-asc' ? 1 : -1
      return direction * (new Date(a.fechaSolicitud).getTime() - new Date(b.fechaSolicitud).getTime())
    })
  }, [trips, tripQuery, tripStatus, tripDate, tripSort])

  return (
    <main className={`admin-shell ${appearance.darkMode ? 'theme-dark' : ''} ${appearance.reducedMotion ? 'reduced-motion' : ''} ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <aside id="admin-sidebar" className="admin-sidebar" aria-hidden={!sidebarOpen}>
        <div className="admin-brand">
          <img src={logoAsset} className="admin-brand-logo" alt="Ride" />
          <div><strong>Ride</strong><small>Centro de operaciones</small></div>
        </div>

        <nav aria-label="Panel administrativo">
          {(['Operación', 'Gestión'] as const).map((group) => (
            <div className="nav-group" key={group}>
              <small>{group}</small>
              {sections.filter((section) => section.group === group).map(({ label }) => (
                <button
                  key={label}
                  className={activeSection === label ? 'active' : ''}
                  aria-current={activeSection === label ? 'page' : undefined}
                  onClick={() => { setActiveSection(label); setSidebarOpen(false) }}
                >
                  <NavIcon section={label} /><span>{label}</span>{navCount(label) > 0 && <b>{navCount(label)}</b>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          {views.length > 1 && (
            <label className="panel-switcher sidebar">
              <span>Panel actual</span>
              <select value={viewAs} onChange={(event) => onSwitchView(event.target.value as Role)}>
                {views.map((view) => <option key={view} value={view}>{panelLabel(view)}</option>)}
              </select>
            </label>
          )}
          {/* Selector rápido en el header para cambiar vista con botón */}
          {views.length > 1 && (
            <div className="panel-quick-header">
              <select onChange={(e) => onSwitchView(e.target.value as Role)} defaultValue={viewAs}>{views.map((v) => <option key={v} value={v}>{panelLabel(v)}</option>)}</select>
              <button onClick={() => onSwitchView(viewAs)}>Ir</button>
            </div>
          )}
          <div className="sidebar-profile">
            <span>{initials(user.name)}</span>
            <div><strong>{user.name}</strong><small>{profileName}</small></div>
          </div>
          <button className="admin-logout" onClick={onLogout}><LogOutIcon size={17} aria-hidden />Cerrar sesión</button>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="admin-overlay" onClick={() => setSidebarOpen(false)} aria-hidden={!sidebarOpen} />
      )}

      <section className="admin-main">
        {viewingOtherPanel && (
          <div className="viewing-as">
            <span>Vista previa del panel de administrador</span>
            <button onClick={() => onSwitchView(user.role as Role)}>Volver a mi panel</button>
          </div>
        )}
        <header>
          <button aria-controls="admin-sidebar" aria-expanded={sidebarOpen} aria-label="Alternar menú" className="hamburger-button" onClick={() => setSidebarOpen((v) => !v)}>
            <MenuIcon size={18} />
          </button>
          <div><small>{accessName}</small><h1>{activeSection}</h1></div>
          <div className="admin-profile"><span>{initials(user.name)}</span><div><strong>{user.name}</strong><small>{profileName}</small></div></div>
        </header>

        {activeSection === 'Resumen' && (
          <div className="admin-content">
            <section className="overview-heading">
              <div><small>RESUMEN OPERATIVO</small><h2>Actividad actual</h2><p>Usuarios, viajes y revisiones cargados desde Supabase.</p></div>
            </section>

            <section className="metric-strip" aria-label="Indicadores de la operación">
              <article><small>Pasajeros</small><strong>{usersLoading ? '—' : metrics.passengers}</strong></article>
              <article><small>Conductores</small><strong>{usersLoading ? '—' : metrics.drivers}</strong></article>
              <article><small>Viajes activos</small><strong>{tripsLoading ? '—' : metrics.activeTrips}</strong></article>
              <article><small>Cobrado</small><strong>{tripsLoading ? '—' : `$${metrics.collected.toFixed(2)}`}</strong></article>
            </section>

            <div className="operations-grid">
              <section className="admin-card recent-trips">
                <div className="admin-card-head"><div><h3>Viajes recientes</h3><p>Últimos movimientos registrados.</p></div><button onClick={() => setActiveSection('Viajes')}>Ver todos</button></div>
                <LegacyTripRows trips={trips} loading={tripsLoading} error={tripsError} limit={5} />
              </section>

              <section className="admin-card review-queue">
                <div className="admin-card-head"><div><h3>Revisión de conductores</h3><p>Solicitudes que requieren atención.</p></div><button onClick={() => setActiveSection('Conductores')}>Abrir cola</button></div>
                {driversError && <p className="admin-error">{driversError}</p>}
                {driversLoading && <p className="admin-empty">Cargando conductores…</p>}
                {!driversLoading && !driversError && pendingDrivers.length === 0 && <p className="admin-empty">No hay conductores pendientes.</p>}
                {!driversLoading && !driversError && pendingDrivers.slice(0, 5).map((driver) => {
                  const requirements = faltantes(driver)
                  return <div className="queue-row" key={driver.id}>
                    <span>{initials(driver.nombre)}</span>
                    <div><strong>{driver.nombre}</strong><small>{requirements.length > 0 ? requirements.join(' · ') : 'Documentación completa'}</small></div>
                  </div>
                })}
              </section>
            </div>

            <section className="admin-card user-table overview-users">
              <div className="admin-card-head"><div><h3>Usuarios recientes</h3><p>Perfiles visibles para tu nivel de acceso.</p></div><button onClick={() => setActiveSection('Usuarios')}>Ver todos</button></div>
              <UserRows users={visibleUsers} loading={usersLoading} error={usersError} limit={5} />
            </section>
          </div>
        )}

        {activeSection === 'Usuarios' && (
          <div className="admin-content">
            <section className="admin-metrics user-metrics" aria-label="Indicadores de usuarios">
              <article><span className="user-metric-icon passenger"><UserIcon size={18} aria-hidden /></span><div><small>Pasajeros</small><strong>{usersLoading ? '—' : metrics.passengers}</strong></div></article>
              <article><span className="user-metric-icon driver"><CarIcon size={18} aria-hidden /></span><div><small>Conductores</small><strong>{usersLoading ? '—' : metrics.drivers}</strong></div></article>
              <article><span className="user-metric-icon admin"><ShieldIcon size={18} aria-hidden /></span><div><small>Administradores</small><strong>{usersLoading ? '—' : visibleUsers.filter((account) => account.role === 'admin' || account.role === 'superadmin').length}</strong></div></article>
            </section>
            <section className="admin-card users-monitoring">
              <div className="admin-card-head"><div><h3>Usuarios registrados</h3><p>Perfiles visibles para tu nivel de acceso.</p></div><span className="user-result-count">{filteredUsers.length} {filteredUsers.length === 1 ? 'usuario' : 'usuarios'}</span></div>
              <div className="user-filters" aria-label="Filtros de usuarios"><label className="user-search"><SearchIcon size={16} aria-hidden /><input value={userQuery} onChange={(event) => setUserQuery(event.target.value)} placeholder="Buscar por nombre, correo o teléfono" aria-label="Buscar usuario" /></label><label><FilterIcon size={15} aria-hidden /><select value={userRole} onChange={(event) => setUserRole(event.target.value)} aria-label="Filtrar por rol"><option value="">Todos los roles</option><option value="passenger">Pasajeros</option><option value="driver">Conductores</option><option value="admin">Administradores</option>{isSuperadmin && <option value="superadmin">Superadministradores</option>}</select></label></div>
              {!usersLoading && !usersError && visibleUsers.length > 0 && filteredUsers.length === 0 && <p className="admin-empty">No se encontraron usuarios con estos filtros.</p>}
              <UserRows users={filteredUsers} loading={usersLoading} error={usersError} />
            </section>
          </div>
        )}

        {activeSection === 'Conductores' && <DriversPanel />}

        {activeSection === 'Viajes' && (
          <div className="admin-content">
            <section className="trips-hero">
              <div><span>OPERACIÓN EN TIEMPO REAL</span><h2>Administración de viajes</h2><p>Consulta el estado, las rutas y el cobro de cada recorrido desde un solo lugar.</p></div>
            </section>
            <section className="metric-strip trip-metrics" aria-label="Indicadores de viajes">
              <article><span className="metric-icon cyan"><RouteIcon size={18} aria-hidden /></span><div><small>Viajes totales</small><strong>{tripsLoading ? '—' : trips.length}</strong></div></article>
              <article><span className="metric-icon blue"><ActivityIcon size={18} aria-hidden /></span><div><small>En curso</small><strong>{tripsLoading ? '—' : metrics.activeTrips}</strong></div></article>
              <article><span className="metric-icon green"><CheckIcon size={18} aria-hidden /></span><div><small>Finalizados</small><strong>{tripsLoading ? '—' : metrics.finishedTrips}</strong></div></article>
              <article><span className="metric-icon gold"><DollarIcon size={18} aria-hidden /></span><div><small>Cobrado</small><strong>{tripsLoading ? '—' : `$${metrics.collected.toFixed(2)}`}</strong></div></article>
            </section>
            <section className="admin-card trips-monitoring">
              <div className="admin-card-head"><div><h3>Monitoreo de viajes</h3><p>El listado se actualiza cuando cambia un viaje.</p></div><span className="trip-result-count">{filteredTrips.length} {filteredTrips.length === 1 ? 'viaje' : 'viajes'}</span></div>
              <div className="trip-filters" aria-label="Filtros de viajes">
                <label className="trip-search"><SearchIcon size={17} aria-hidden /><input value={tripQuery} onChange={(event) => setTripQuery(event.target.value)} placeholder="Buscar pasajero, conductor o ruta" aria-label="Buscar viaje" /></label>
                <label><FilterIcon size={15} aria-hidden /><select value={tripStatus} onChange={(event) => setTripStatus(event.target.value)} aria-label="Filtrar por estado"><option value="">Todos los estados</option>{Object.entries(ESTADO_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label><CalendarIcon size={15} aria-hidden /><input value={tripDate} onChange={(event) => setTripDate(event.target.value)} type="date" aria-label="Filtrar por fecha" /></label>
                <label><SortIcon size={15} aria-hidden /><select value={tripSort} onChange={(event) => setTripSort(event.target.value as typeof tripSort)} aria-label="Ordenar viajes"><option value="date-desc">Más recientes</option><option value="date-asc">Más antiguos</option><option value="status">Estado</option><option value="value-desc">Mayor valor</option></select></label>
              </div>
              <TripRows trips={filteredTrips} loading={tripsLoading} error={tripsError} />
            </section>
          </div>
        )}
        {activeSection === 'Mi cuenta' && <div className="admin-content"><section className="admin-card admin-account-card"><div className="admin-card-head"><div><h3>Datos de la cuenta</h3><p>Información asociada a tu acceso administrativo.</p></div></div><dl><div><dt>Nombre</dt><dd>{user.name}</dd></div><div><dt>Correo</dt><dd>{user.email}</dd></div><div><dt>Rol</dt><dd>{profileName}</dd></div></dl></section></div>}
        {activeSection === 'Configuración' && <div className="admin-content settings-page"><section className="overview-heading"><small>PREFERENCIAS</small><h2>Configuración</h2><p>Personaliza todos los paneles de Ride.</p></section><AppearanceSettings theme={appearance.theme} reducedMotion={appearance.reducedMotion} onTheme={appearance.setTheme} onReducedMotion={appearance.setReducedMotion}/></div>}
      </section>
    </main>
  )
}
