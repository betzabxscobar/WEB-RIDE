import { useCallback, useEffect, useMemo, useState } from 'react'
import RideMap from './components/RideMap'
import { SupportPage, TripChat } from './components/RideExtras'
import logoTipo from './assets/LogoTipo.png'
import { panelLabel, type Role, type User } from './lib/auth'
import { AppearanceSettings, useAppearance } from './components/AppearanceSettings'
import { type ReactNode } from 'react'
import { Home as HomeIcon, MapPin as MapPinIcon, Truck as TruckIcon, FileText as FileTextIcon, HelpCircle as HelpCircleIcon, User as UserIcon, Settings as SettingsIcon, Menu as MenuIcon, WalletCards as WalletIcon } from 'lucide-react'
import { routeBetween, type RoadRoute } from './lib/routing'
import {
  activateVehicle,
  driverBlockReason,
  getDriverEarnings,
  getDriverIdentity,
  getMissingDriverRequirements,
  getDriverState,
  listOwnDocuments,
  listOwnVehicles,
  ownDocumentUrl,
  prepareSuperadminDriver,
  saveVehicle,
  saveDriverIdentity,
  setDriverAvailability,
  uploadDriverDocument,
  type DocumentType,
  type DriverState,
  type DriverEarnings,
  type DriverIdentity,
  type OwnDocument,
  type OwnVehicle,
} from './lib/driver-account'
import {
  acceptTrip,
  advanceTrip,
  cancelTrip,
  esFinal,
  ESTADO_LABEL,
  finishTrip,
  hasRatedTrip,
  listDriverTrips,
  listOpenTripRequests,
  rateParticipant,
  reportDriverPosition,
  watchTrips,
  type Trip,
  type TripPosition,
} from './lib/trips'

type Page = 'inicio' | 'viajes' | 'ganancias' | 'vehiculos' | 'documentos' | 'soporte' | 'cuenta' | 'configuracion'
type Props = { user: User; views: Role[]; activeView: Role; onSwitchView: (view: Role) => void; onLogout: () => void }

const EMPTY_STATE: DriverState = { exists: false, approved: false, approvalStatus: 'pendiente', available: false, hasActiveVehicle: false, rating: null }
const PERSON_DOCS: { type: DocumentType; label: string; hint: string; expires?: boolean }[] = [
  { type: 'cedula', label: 'Cédula de identidad', hint: 'Foto legible del frente de tu cédula' },
  { type: 'licencia', label: 'Licencia de conducir', hint: 'Foto del frente de tu licencia vigente' },
  { type: 'foto_perfil', label: 'Tu foto', hint: 'De frente y con la cara descubierta' },
]
const VEHICLE_DOCS: { type: DocumentType; label: string; hint: string; expires?: boolean; number?: boolean }[] = [
  { type: 'matricula', label: 'Matrícula', hint: 'Documento vigente del vehículo', expires: true, number: true },
  { type: 'SPPAT', label: 'SPPAT', hint: 'Seguro que reemplazó al SOAT', expires: true, number: true },
  { type: 'revision_tecnica', label: 'Revisión técnica', hint: 'Revisión del año en curso', expires: true, number: true },
  { type: 'foto_vehiculo', label: 'Foto del vehículo', hint: 'De frente y con la placa legible' },
]
const EMPTY_IDENTITY: DriverIdentity = { cedula: '', fingerprintCode: '', licenseType: '', licenseExpiresAt: '' }

function money(value: number): string { return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(value) }
function initials(name: string): string { return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() }

export default function DriverDashboard({ user, views, activeView, onSwitchView, onLogout }: Props) {
  const [selectedView, setSelectedView] = useState<Role>(activeView)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [page, setPage] = useState<Page>('inicio')
  const [state, setState] = useState<DriverState>(EMPTY_STATE)
  const [trips, setTrips] = useState<Trip[]>([])
  const [requests, setRequests] = useState<Trip[]>([])
  const [vehicles, setVehicles] = useState<OwnVehicle[]>([])
  const [documents, setDocuments] = useState<OwnDocument[]>([])
  const [earnings, setEarnings] = useState<Record<string, DriverEarnings>>({})
  const [identity, setIdentity] = useState<DriverIdentity>(EMPTY_IDENTITY)
  const [missingRequirements, setMissingRequirements] = useState<string[]>([])
  const [position, setPosition] = useState<TripPosition | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [ratingTrip, setRatingTrip] = useState<Trip | null>(null)
  const [chatTrip, setChatTrip] = useState<Trip | null>(null)
  const [ratingScore, setRatingScore] = useState(5)
  const [ratingComment, setRatingComment] = useState('')
  const appearance = useAppearance()

  const activeTrip = useMemo(() => trips.find((trip) => !esFinal(trip.estado)) ?? null, [trips])

  const load = useCallback(async () => {
    try {
      if (user.role === 'superadmin') await prepareSuperadminDriver()
      const [nextState, nextTrips, nextVehicles, nextDocuments, nextEarnings, nextIdentity, nextMissing] = await Promise.all([
        getDriverState(user.id), listDriverTrips(user.id), listOwnVehicles(user.id), listOwnDocuments(user.id), user.role === 'admin' ? Promise.resolve({}) : getDriverEarnings(), getDriverIdentity(user.id), user.role === 'admin' ? Promise.resolve([]) : getMissingDriverRequirements(),
      ])
      const active = nextTrips.find((trip) => !esFinal(trip.estado))
      const nextRequests = !active && nextState.approved && nextState.hasActiveVehicle && nextState.available ? await listOpenTripRequests() : []
      setState(nextState); setTrips(nextTrips); setVehicles(nextVehicles); setDocuments(nextDocuments); setEarnings(nextEarnings); setIdentity(nextIdentity); setMissingRequirements(nextMissing); setRequests(nextRequests); setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos actualizar tu panel.')
    } finally { setLoading(false) }
  }, [user.id, user.role])

  useEffect(() => { queueMicrotask(() => void load()); return watchTrips(() => void load()) }, [load])

  const isReviewOnly = user.role === 'admin'
  const reportPosition = useCallback((tripId?: string) => {
    if (isReviewOnly) { setError('La vista de conductor es solo de revisión para una cuenta administradora.'); return }
    if (!navigator.geolocation) { setError('Tu navegador no permite obtener la ubicación.'); return }
    navigator.geolocation.getCurrentPosition((location) => {
      const current = { lat: location.coords.latitude, lng: location.coords.longitude, recordedAt: new Date().toISOString() }
      setPosition(current)
      void reportDriverPosition(current.lat, current.lng, tripId).catch((cause) => setError(cause instanceof Error ? cause.message : 'No se pudo actualizar tu ubicación.'))
    }, () => setError('No pudimos acceder a tu ubicación. Activa el permiso para trabajar en línea.'), { enableHighAccuracy: true, timeout: 12000, maximumAge: 20000 })
  }, [isReviewOnly])

  useEffect(() => {
    if (!state.available || !state.approved || !state.hasActiveVehicle) return
    queueMicrotask(() => reportPosition(activeTrip?.id))
    const timer = window.setInterval(() => reportPosition(activeTrip?.id), 60_000)
    return () => window.clearInterval(timer)
  }, [activeTrip?.id, reportPosition, state.approved, state.available, state.hasActiveVehicle])

  const action = async (operation: () => Promise<void>, success?: string) => {
    setBusy(true); setError(''); setNotice('')
    try { await operation(); await load(); if (success) setNotice(success) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo completar la acción.'); await load() }
    finally { setBusy(false) }
  }

  const toggleAvailability = (available: boolean) => void action(async () => {
    if (isReviewOnly) throw new Error('La administración solo puede revisar esta vista; no puede trabajar viajes.')
    await setDriverAvailability(user.id, available)
    if (available) reportPosition(activeTrip?.id)
  }, available ? 'Estás en línea y ya puedes recibir solicitudes.' : 'Quedaste fuera de línea.')

  const finalize = (trip: Trip) => void action(async () => {
    const total = await finishTrip(trip.id)
    setNotice(`Viaje finalizado por ${money(total)}.`)
    if (!(await hasRatedTrip(trip.id, user.id))) { setRatingScore(5); setRatingComment(''); setRatingTrip(trip) }
  })

  const submitRating = () => {
    if (!ratingTrip) return
    void action(async () => {
      await rateParticipant(ratingTrip.id, user.id, ratingTrip.pasajeroId, ratingScore, ratingComment)
      setRatingTrip(null)
    }, 'Gracias. La calificación del pasajero quedó guardada.')
  }

  const go = (next: Page) => { setPage(next); setSidebarOpen(false); setError(''); setNotice('') }
  const canWork = !isReviewOnly && state.approved && state.hasActiveVehicle

  return <main className={`driver-shell ${appearance.darkMode ? 'theme-dark' : ''} ${appearance.reducedMotion ? 'reduced-motion' : ''} ${sidebarOpen ? 'sidebar-open' : ''}`}>
    <aside id="driver-sidebar" className="driver-sidebar" aria-hidden={!sidebarOpen}>
      <div className="driver-brand"><img src={logoTipo} alt="Ride"/><b>Ride</b></div>
      <nav aria-label="Panel del conductor">
        <DriverNav active={page === 'inicio'} icon={<HomeIcon size={18} />} label="Inicio" onClick={() => go('inicio')}/>
        <DriverNav active={page === 'viajes'} icon={<MapPinIcon size={18} />} label="Viajes" onClick={() => go('viajes')}/>
        <DriverNav active={page === 'ganancias'} icon={<WalletIcon size={18} />} label="Ganancias" onClick={() => go('ganancias')}/>
        <DriverNav active={page === 'vehiculos'} icon={<TruckIcon size={18} />} label="Vehículos" onClick={() => go('vehiculos')}/>
        <DriverNav active={page === 'documentos'} icon={<FileTextIcon size={18} />} label="Documentos" onClick={() => go('documentos')}/>
        <DriverNav active={page === 'soporte'} icon={<HelpCircleIcon size={18} />} label="Soporte" onClick={() => go('soporte')}/>
        <DriverNav active={page === 'cuenta'} icon={<UserIcon size={18} />} label="Mi cuenta" onClick={() => go('cuenta')}/>
        <DriverNav active={page === 'configuracion'} icon={<SettingsIcon size={18} />} label="Configuración" onClick={() => go('configuracion')}/>
      </nav>
      <div className="driver-profile"><span>{initials(user.name)}</span><div><strong>{user.name}</strong><small>{state.available ? 'En línea' : 'Fuera de línea'}</small></div></div>
      {views.length > 1 && (
        <label className="panel-switcher sidebar">
          <span>Panel actual</span>
          <select value={selectedView} onChange={(event) => setSelectedView(event.target.value as Role)}>
            {views.map((view) => <option key={view} value={view}>{panelLabel(view)}</option>)}
          </select>
          <button type="button" onClick={() => onSwitchView(selectedView)}>Ir</button>
        </label>
      )}
      <button className="driver-logout" onClick={onLogout}>Cerrar sesión</button>
    </aside>
    <section className="driver-workspace">
      <button type="button" className="driver-hamburger" aria-controls="driver-sidebar" aria-expanded={sidebarOpen} aria-label="Alternar menú" onClick={() => setSidebarOpen((value) => !value)}><MenuIcon size={18} aria-hidden /></button>
      <header className="driver-topbar"><div><span>PANEL DE CONDUCTOR</span><h1>{page === 'inicio' ? `Hola, ${user.name.split(' ')[0]}` : page === 'viajes' ? 'Tus viajes' : page === 'ganancias' ? 'Tus ganancias' : page === 'vehiculos' ? 'Tus vehículos' : page === 'documentos' ? 'Tus documentos' : page === 'soporte' ? 'Soporte' : page === 'configuracion' ? 'Configuración' : 'Tu cuenta'}</h1></div><div className="driver-top-actions">{views.length > 1 && <label className="driver-view-select"><span>Vista</span><select value={selectedView} onChange={(event) => setSelectedView(event.target.value as Role)}>{views.map((view) => <option key={view} value={view}>{panelLabel(view)}</option>)}</select><button onClick={() => onSwitchView(selectedView)}>Ir</button></label>}<button className="driver-avatar" onClick={() => go('cuenta')}>{initials(user.name)}</button></div></header>
      <div className="driver-content">
        {isReviewOnly && <div className="driver-review-notice">Vista de revisión: puedes recorrer el panel, pero una cuenta administradora no puede ponerse en línea, aceptar ni finalizar viajes.</div>}
        {notice && <div className="driver-feedback success">✓ {notice}</div>}{error && <div className="driver-feedback failure">! {error}<button onClick={() => setError('')}>Cerrar</button></div>}
        {loading ? <div className="driver-loading">Actualizando tu información…</div> : page === 'inicio' ? <DriverHome state={state} active={activeTrip} requests={requests} position={position} busy={busy} reviewOnly={isReviewOnly} onAvailability={toggleAvailability} onTrips={() => go('viajes')} onProfile={() => go('documentos')} onReport={() => reportPosition(activeTrip?.id)}/>
          : page === 'viajes' ? <DriverTrips active={activeTrip} requests={requests} history={trips} position={position} busy={busy} canWork={canWork} available={state.available} onAccept={(trip) => void action(() => acceptTrip(trip.id), 'Solicitud aceptada.')} onAdvance={(trip) => void action(() => advanceTrip(trip.id).then(() => undefined))} onFinish={finalize} onCancel={(trip) => void action(() => cancelTrip(trip.id), 'Viaje cancelado.')} onChat={setChatTrip}/>
          : page === 'ganancias' ? <EarningsPage earnings={earnings} reviewOnly={isReviewOnly}/>
          : page === 'vehiculos' ? <VehiclesPage vehicles={vehicles} busy={busy} onSave={(input) => void action(() => saveVehicle(input).then(() => undefined), 'Vehículo guardado.')} onActivate={(id) => void action(() => activateVehicle(id), 'Vehículo activado.')}/>
          : page === 'documentos' ? <DocumentsPage identity={identity} missing={missingRequirements} vehicles={vehicles} documents={documents} busy={busy} reviewOnly={isReviewOnly} onIdentity={(input) => void action(() => saveDriverIdentity(input), 'Identidad y licencia guardadas.')} onUpload={(type, file, options) => void action(() => uploadDriverDocument(user.id, type, file, options), 'Documento enviado para revisión.')} onOpen={async (path) => { try { window.open(await ownDocumentUrl(path), '_blank', 'noopener,noreferrer') } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo abrir el documento.') } }}/>
          : page === 'soporte' ? <SupportPage userId={user.id} trips={trips}/>
          : page === 'configuracion' ? <div className="driver-page settings-page"><section className="driver-section-head"><span>PREFERENCIAS</span><h2>Configuración</h2><p>Personaliza todos los paneles de Ride.</p></section><AppearanceSettings theme={appearance.theme} reducedMotion={appearance.reducedMotion} onTheme={appearance.setTheme} onReducedMotion={appearance.setReducedMotion}/></div>
          : <DriverAccount user={user} state={state} vehicles={vehicles} documents={documents}/>
        }
      </div>
    </section>
    <nav className="driver-mobile-nav"><DriverNav active={page === 'inicio'} icon={<HomeIcon size={18} />} label="Inicio" onClick={() => go('inicio')}/><DriverNav active={page === 'viajes'} icon={<MapPinIcon size={18} />} label="Viajes" onClick={() => go('viajes')}/><DriverNav active={page === 'vehiculos'} icon={<TruckIcon size={18} />} label="Autos" onClick={() => go('vehiculos')}/><DriverNav active={page === 'documentos'} icon={<FileTextIcon size={18} />} label="Docs" onClick={() => go('documentos')}/><DriverNav active={page === 'cuenta'} icon={<UserIcon size={18} />} label="Cuenta" onClick={() => go('cuenta')}/></nav>
    {ratingTrip && <div className="driver-dialog-backdrop"><section className="driver-dialog"><button onClick={() => setRatingTrip(null)}>×</button><h2>¿Cómo estuvo el pasajero?</h2><p>Califica a {ratingTrip.pasajeroNombre}.</p><div className="driver-rating">{[1,2,3,4,5].map((score) => <button key={score} className={score <= ratingScore ? 'selected' : ''} onClick={() => setRatingScore(score)}>★</button>)}</div><textarea maxLength={300} value={ratingComment} onChange={(event) => setRatingComment(event.target.value)} placeholder="Comentario opcional"/><button className="primary" disabled={busy} onClick={submitRating}>Enviar calificación</button></section></div>}
    {chatTrip && <TripChat trip={chatTrip} userId={user.id} onClose={() => setChatTrip(null)}/>}
  </main>
}

function DriverNav({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) { return <button className={active ? 'active' : ''} onClick={onClick}><span>{icon}</span>{label}</button> }

function DriverHome({ state, active, requests, position, busy, reviewOnly, onAvailability, onTrips, onProfile, onReport }: { state: DriverState; active: Trip | null; requests: Trip[]; position: TripPosition | null; busy: boolean; reviewOnly: boolean; onAvailability: (value: boolean) => void; onTrips: () => void; onProfile: () => void; onReport: () => void }) {
  return <div className="driver-page"><section className={`driver-status-card ${state.available && !reviewOnly ? 'online' : ''}`}><div><span className="status-dot"/><div><small>ESTADO DE JORNADA</small><h2>{reviewOnly ? 'Modo de revisión' : state.available ? 'Estás disponible' : 'Estás fuera de línea'}</h2><p>{reviewOnly ? 'La cuenta administradora puede comprobar la interfaz sin operar viajes.' : state.available ? 'Ride está enviando tu posición y buscando solicitudes cercanas.' : canWorkText(state)}</p></div></div><label className="availability-switch"><input type="checkbox" checked={state.available && !reviewOnly} disabled={reviewOnly || busy || !state.approved || !state.hasActiveVehicle} onChange={(event) => onAvailability(event.target.checked)}/><span/></label></section>{!reviewOnly && (!state.approved || !state.hasActiveVehicle) ? <section className="driver-block"><span>!</span><div><h3>Completa tu perfil para conducir</h3><p>{driverBlockReason(state)}</p></div><button onClick={onProfile}>Revisar requisitos</button></section> : null}<div className="driver-map-wrap"><RideMap origin={position ? { ...position, label: 'Mi ubicación' } : null} className="driver-home-map"/><div className="driver-map-card"><small>UBICACIÓN REAL</small><strong>{position ? 'Posición actualizada' : reviewOnly ? 'Vista previa' : 'Permiso pendiente'}</strong><p>{position ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}` : reviewOnly ? 'La ubicación no se comparte en modo revisión.' : 'Ponte en línea para compartir tu ubicación.'}</p><button disabled={reviewOnly} onClick={onReport}>Actualizar ubicación</button></div></div><section className="driver-summary"><article><small>VIAJE ACTIVO</small><strong>{active ? ESTADO_LABEL[active.estado] : 'Ninguno'}</strong><p>{active?.destinoTexto ?? 'Disponible para una nueva ruta'}</p></article><article><small>SOLICITUDES CERCA</small><strong>{requests.length}</strong><p>Actualizadas en tiempo real</p></article><button onClick={onTrips}>{active ? 'Continuar viaje' : 'Ver solicitudes'} →</button></section></div>
}

function EarningsPage({ earnings, reviewOnly }: { earnings: Record<string, DriverEarnings>; reviewOnly: boolean }) {
  const today = earnings.hoy ?? { trips: 0, gross: 0, earned: 0, commission: 0 }
  const periods: Array<[string, string]> = [['semana', 'Esta semana'], ['mes', 'Este mes'], ['total', 'Desde que empezaste']]
  const percentage = today.gross > 0 ? Math.round(today.earned / today.gross * 100) : 0
  return <div className="driver-page earnings-page"><section className="driver-section-head"><span>BILLETERA DEL CONDUCTOR</span><h2>Ganancias reales</h2><p>Solo cuentan viajes finalizados y cobrados; los importes los calcula la base de datos.</p></section><section className="earnings-hero"><small>HOY</small><strong>{money(today.earned)}</strong><p>{today.trips ? `${today.trips} ${today.trips === 1 ? 'viaje' : 'viajes'} · los pasajeros pagaron ${money(today.gross)}` : 'Todavía no has cerrado ningún viaje hoy.'}</p></section><div className="earnings-grid">{periods.map(([id, label]) => { const item = earnings[id] ?? { trips: 0, gross: 0, earned: 0, commission: 0 }; return <article key={id}><div><strong>{label}</strong><small>{item.trips ? `${item.trips} viajes completados` : 'Sin viajes cobrados'}</small></div><b>{money(item.earned)}</b></article> })}</div>{today.trips > 0 && <aside className="earnings-note">Te corresponde el {percentage}% de lo pagado. La comisión de Ride de hoy es {money(today.commission)}.</aside>}{reviewOnly && <aside className="earnings-note">En modo revisión no se generan movimientos ni ganancias para la cuenta administradora.</aside>}</div>
}

function canWorkText(state: DriverState): string { return state.approved && state.hasActiveVehicle ? 'Ponte en línea para recibir solicitudes cercanas.' : driverBlockReason(state) }

function DriverTrips({ active, requests, history, position, busy, canWork, available, onAccept, onAdvance, onFinish, onCancel, onChat }: { active: Trip | null; requests: Trip[]; history: Trip[]; position: TripPosition | null; busy: boolean; canWork: boolean; available: boolean; onAccept: (trip: Trip) => void; onAdvance: (trip: Trip) => void; onFinish: (trip: Trip) => void; onCancel: (trip: Trip) => void; onChat: (trip: Trip) => void }) {
  const next: Partial<Record<Trip['estado'], string>> = { ACEPTADO: 'Voy en camino', CONDUCTOR_EN_CAMINO: 'Llegué al punto', CONDUCTOR_EN_ORIGEN: 'Iniciar viaje' }
  if (active) return <div className="driver-page"><section className="driver-section-head"><span>VIAJE EN CURSO</span><h2>{ESTADO_LABEL[active.estado]}{active.categoriaNombre ? ` · ${active.categoriaNombre}` : ''}</h2></section><DriverActiveMap trip={active} position={position}/><section className="active-driver-trip"><div className="active-driver-title"><div><small>PASAJERO</small><h3>{active.pasajeroNombre}</h3>{active.pasajeroTelefono && <a href={`tel:${active.pasajeroTelefono}`}>{active.pasajeroTelefono}</a>}</div><strong>{money(active.tarifaFinal ?? active.tarifaEstimada)}</strong></div><DriverRoute trip={active}/>{active.origenReferencia && <div className="pickup-note"><small>REFERENCIA DE RECOGIDA</small><strong>{active.origenReferencia}</strong></div>}<div className="driver-trip-actions"><button disabled={busy} onClick={() => onChat(active)}>Chat</button>{next[active.estado] && <button className="primary" disabled={busy} onClick={() => onAdvance(active)}>{next[active.estado]}</button>}{active.estado === 'EN_CURSO' && <button className="finish" disabled={busy} onClick={() => onFinish(active)}>Finalizar viaje</button>}{!['EN_CURSO','FINALIZADO','CANCELADO','SIN_CONDUCTOR'].includes(active.estado) && <button className="danger" disabled={busy} onClick={() => onCancel(active)}>Cancelar viaje</button>}</div></section></div>
  return <div className="driver-page"><section className="driver-section-head"><span>SOLICITUDES REALES</span><h2>{available && canWork ? 'Viajes cerca de ti' : 'No estás recibiendo solicitudes'}</h2><p>{available && canWork ? 'La lista cambia automáticamente cuando un pasajero pide un viaje.' : 'Debes tener la cuenta aprobada, un vehículo activo y estar en línea.'}</p></section>{requests.length ? <div className="driver-request-list">{requests.map((trip) => <article key={trip.id}><div><small>{trip.pasajeroNombre}</small><strong>{money(trip.tarifaEstimada)}</strong></div><DriverRoute trip={trip}/><button disabled={busy} onClick={() => onAccept(trip)}>Aceptar ruta</button></article>)}</div> : <div className="driver-empty"><span>⌁</span><h3>{available && canWork ? 'Buscando pasajeros' : 'Sin solicitudes'}</h3><p>{available && canWork ? 'Te avisaremos apenas aparezca un viaje dentro de tu zona.' : 'Vuelve al inicio para revisar tu disponibilidad.'}</p></div>}<section className="driver-section-head history"><span>HISTORIAL</span><h2>Viajes anteriores</h2></section><div className="driver-history">{history.filter(esFinalTrip).map((trip) => <article key={trip.id}><DriverRoute trip={trip}/><span>{ESTADO_LABEL[trip.estado]}</span><strong>{money(trip.tarifaFinal ?? trip.tarifaEstimada)}</strong></article>)}</div></div>
}

function esFinalTrip(trip: Trip) { return esFinal(trip.estado) }
function DriverRoute({ trip }: { trip: Trip }) { return <div className="driver-route"><div><i/><span><small>ORIGEN</small><strong>{trip.origenTexto}</strong></span></div><b/><div><i/><span><small>DESTINO</small><strong>{trip.destinoTexto}</strong></span></div></div> }

function DriverActiveMap({ trip, position }: { trip: Trip; position: TripPosition | null }) {
  const [route, setRoute] = useState<RoadRoute | null>(null)
  const origin = useMemo(() => trip.origenLat != null && trip.origenLng != null ? { lat: trip.origenLat, lng: trip.origenLng, label: trip.origenTexto } : null, [trip.origenLat, trip.origenLng, trip.origenTexto])
  const destination = useMemo(() => trip.destinoLat != null && trip.destinoLng != null ? { id: trip.id, nombre: trip.destinoTexto, direccion: '', lat: trip.destinoLat, lng: trip.destinoLng } : null, [trip.destinoLat, trip.destinoLng, trip.destinoTexto, trip.id])
  useEffect(() => {
    const controller = new AbortController()
    if (!origin || !destination) return () => controller.abort()
    void routeBetween(origin, destination, controller.signal).then(setRoute).catch(() => setRoute(null))
    return () => controller.abort()
  }, [destination, origin])
  return <RideMap origin={origin} destination={destination} driver={position} route={route} className="driver-trip-map"/>
}

function VehiclesPage({ vehicles, busy, onSave, onActivate }: { vehicles: OwnVehicle[]; busy: boolean; onSave: (input: { id?: string; plate: string; make: string; model: string; year: number; color?: string; category: OwnVehicle['category'] }) => void; onActivate: (id: string) => void }) {
  const [editing, setEditing] = useState<OwnVehicle | null>(null)
  const [showForm, setShowForm] = useState(vehicles.length === 0)
  return <div className="driver-page"><section className="driver-section-head with-action"><div><span>FLOTA PERSONAL</span><h2>Vehículos registrados</h2><p>La categoría decide qué viajes puede tomar el vehículo y se valida contra tu licencia.</p></div><button onClick={() => { setEditing(null); setShowForm(true) }}>+ Registrar vehículo</button></section>{showForm && <VehicleForm vehicle={editing} busy={busy} onCancel={() => setShowForm(false)} onSave={(input) => { onSave(input); setShowForm(false) }}/>}<div className="vehicle-list">{vehicles.map((vehicle) => <article key={vehicle.id} className={vehicle.active ? 'active' : ''}><span>▰</span><div><div><h3>{vehicle.make} {vehicle.model}</h3>{vehicle.active && <b>En servicio</b>}</div><p>{vehicle.plate} · {vehicle.year}{vehicle.color ? ` · ${vehicle.color}` : ''} · {vehicle.category}</p></div><div className="vehicle-actions"><button onClick={() => { setEditing(vehicle); setShowForm(true) }}>Editar</button>{!vehicle.active && <button disabled={busy} onClick={() => onActivate(vehicle.id)}>Activar</button>}</div></article>)}</div></div>
}

function VehicleForm({ vehicle, busy, onCancel, onSave }: { vehicle: OwnVehicle | null; busy: boolean; onCancel: () => void; onSave: (input: { id?: string; plate: string; make: string; model: string; year: number; color?: string; category: OwnVehicle['category'] }) => void }) {
  const submit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); onSave({ id: vehicle?.id, plate: String(values.plate), make: String(values.make), model: String(values.model), year: Number(values.year), color: String(values.color), category: String(values.category) as OwnVehicle['category'] }) }
  return <form className="vehicle-form" onSubmit={submit}><h3>{vehicle ? 'Editar vehículo' : 'Nuevo vehículo'}</h3><div><label>Placa<input required name="plate" minLength={5} defaultValue={vehicle?.plate}/></label><label>Marca<input required name="make" defaultValue={vehicle?.make}/></label><label>Modelo<input required name="model" defaultValue={vehicle?.model}/></label><label>Año<input required name="year" type="number" min="1980" max={new Date().getFullYear() + 1} defaultValue={vehicle?.year ?? new Date().getFullYear()}/></label><label>Color<input name="color" defaultValue={vehicle?.color ?? ''}/></label><label>Categoría<select name="category" defaultValue={vehicle?.category ?? 'estandar'}><option value="moto">Moto</option><option value="estandar">Estándar</option><option value="confort">Confort</option><option value="xl">XL</option></select></label></div><footer><button type="button" onClick={onCancel}>Cancelar</button><button className="primary" disabled={busy}>Guardar vehículo</button></footer></form>
}

function DocumentsPage({ identity, missing, vehicles, documents, busy, reviewOnly, onIdentity, onUpload, onOpen }: { identity: DriverIdentity; missing: string[]; vehicles: OwnVehicle[]; documents: OwnDocument[]; busy: boolean; reviewOnly: boolean; onIdentity: (input: DriverIdentity) => void; onUpload: (type: DocumentType, file: File, options?: { vehicleId?: string; number?: string; expiresAt?: string }) => void; onOpen: (path: string) => void }) {
  const submitIdentity = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); onIdentity({ cedula: String(data.cedula), fingerprintCode: String(data.fingerprintCode), licenseType: String(data.licenseType), licenseExpiresAt: String(data.licenseExpiresAt) }) }
  const labels: Record<string, string> = { identidad: 'Cédula, código dactilar y licencia', licencia_vigente: 'Licencia vigente', vehiculo_completo: 'Un vehículo con todos sus documentos' }
  return <div className="driver-page"><section className="driver-section-head"><span>VERIFICACIÓN ECUADOR</span><h2>Identidad y documentos</h2><p>Se aplican los mismos requisitos de la app. Los archivos son privados y cada vehículo conserva sus propios papeles.</p></section>{reviewOnly && <div className="driver-review-notice">En revisión administrativa los formularios están deshabilitados.</div>}{missing.length > 0 && <section className="requirements-card"><strong>Te falta completar</strong><ul>{missing.map((item) => <li key={item}>{labels[item] ?? PERSON_DOCS.concat(VEHICLE_DOCS).find((doc) => doc.type === item)?.label ?? item}</li>)}</ul></section>}<form key={`${identity.cedula}-${identity.licenseExpiresAt}`} className="identity-form" onSubmit={submitIdentity}><h3>Identidad y licencia</h3><div><label>Cédula<input required name="cedula" inputMode="numeric" minLength={10} maxLength={10} defaultValue={identity.cedula}/></label><label>Código dactilar<input required name="fingerprintCode" placeholder="V1234I5678" defaultValue={identity.fingerprintCode}/></label><label>Tipo de licencia<select required name="licenseType" defaultValue={identity.licenseType}><option value="">Selecciona</option>{['A','A1','B','C','C1','D','D1','E','E1','F','G'].map((type) => <option key={type}>{type}</option>)}</select></label><label>Caducidad<input required name="licenseExpiresAt" type="date" defaultValue={identity.licenseExpiresAt}/></label></div><button className="primary" disabled={busy || reviewOnly}>Guardar identidad</button></form><DocumentGroup title="Documentos personales" definitions={PERSON_DOCS} documents={documents.filter((item) => !item.vehicleId)} busy={busy || reviewOnly} onUpload={onUpload} onOpen={onOpen}/>{vehicles.map((vehicle) => <DocumentGroup key={vehicle.id} title={`${vehicle.make} ${vehicle.model} · ${vehicle.plate}`} definitions={VEHICLE_DOCS} documents={documents.filter((item) => item.vehicleId === vehicle.id)} vehicleId={vehicle.id} busy={busy || reviewOnly} onUpload={onUpload} onOpen={onOpen}/>)}</div>
}

function DocumentGroup({ title, definitions, documents, vehicleId, busy, onUpload, onOpen }: { title: string; definitions: typeof PERSON_DOCS; documents: OwnDocument[]; vehicleId?: string; busy: boolean; onUpload: (type: DocumentType, file: File, options?: { vehicleId?: string; number?: string; expiresAt?: string }) => void; onOpen: (path: string) => void }) {
  return <section className="document-group"><h3>{title}</h3><div className="document-list">{definitions.map((definition) => { const document = documents.find((item) => item.type === definition.type); return <DocumentCard key={definition.type} definition={definition} document={document} vehicleId={vehicleId} busy={busy} onUpload={onUpload} onOpen={onOpen}/> })}</div></section>
}

function DocumentCard({ definition, document, vehicleId, busy, onUpload, onOpen }: { definition: (typeof VEHICLE_DOCS)[number]; document?: OwnDocument; vehicleId?: string; busy: boolean; onUpload: (type: DocumentType, file: File, options?: { vehicleId?: string; number?: string; expiresAt?: string }) => void; onOpen: (path: string) => void }) {
  const [file, setFile] = useState<File | null>(null); const [number, setNumber] = useState(document?.number ?? ''); const [expiresAt, setExpiresAt] = useState(document?.expiresAt ?? '')
  const stateText = !document ? 'Pendiente de carga' : document.status === 'aprobado' ? document.expiresAt && new Date(document.expiresAt) < new Date() ? 'Aprobado, pero caducado' : 'Aprobado' : document.status === 'rechazado' ? `Rechazado${document.rejectionReason ? `: ${document.rejectionReason}` : ''}` : 'En revisión'
  return <article><span className={`doc-state ${document?.status ?? 'missing'}`}>{document ? document.status === 'aprobado' ? '✓' : document.status === 'rechazado' ? '!' : '…' : '+'}</span><div><h3>{definition.label}</h3><p>{definition.hint}</p><small>{stateText}</small></div><div className="document-actions">{document && <button onClick={() => onOpen(document.path)}>Ver</button>}{definition.number && <input aria-label={`Número de ${definition.label}`} value={number} onChange={(event) => setNumber(event.target.value)} placeholder="Número"/>}{definition.expires && <input aria-label={`Caducidad de ${definition.label}`} type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)}/>}<label className={busy ? 'disabled' : ''}>{file ? file.name : document ? 'Reemplazar archivo' : 'Elegir archivo'}<input disabled={busy} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)}/></label><button className="upload-document" disabled={busy || !file || Boolean(definition.expires && !expiresAt)} onClick={() => file && onUpload(definition.type, file, { vehicleId, number, expiresAt })}>Enviar</button></div></article>
}

function DriverAccount({ user, state, vehicles, documents }: { user: User; state: DriverState; vehicles: OwnVehicle[]; documents: OwnDocument[] }) {
  return <div className="driver-page"><section className="driver-account-hero"><span>{initials(user.name)}</span><div><small>PERFIL DE CONDUCTOR</small><h2>{user.name}</h2><p>{state.approved ? 'Cuenta aprobada para conducir' : 'Cuenta en proceso de verificación'}</p></div></section><div className="driver-account-grid"><section><h3>Datos personales</h3><dl><div><dt>Correo</dt><dd>{user.email}</dd></div><div><dt>Teléfono</dt><dd>{user.phone || 'Sin teléfono'}</dd></div><div><dt>Estado</dt><dd>{state.approvalStatus}</dd></div><div><dt>Calificación</dt><dd>{state.rating == null ? 'Sin calificaciones' : `★ ${state.rating.toFixed(1)}`}</dd></div></dl></section><aside><strong>{vehicles.length}</strong><span>vehículos</span><strong>{documents.filter((document) => document.status === 'aprobado').length}/3</strong><span>documentos aprobados</span></aside></div></div>
}
