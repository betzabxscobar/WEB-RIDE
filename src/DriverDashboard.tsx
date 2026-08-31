import { useCallback, useEffect, useMemo, useState } from 'react'
import RideMap from './components/RideMap'
import logoTipo from './assets/LogoTipo.png'
import { panelLabel, type Role, type User } from './lib/auth'
import { routeBetween, type RoadRoute } from './lib/routing'
import {
  activateVehicle,
  driverBlockReason,
  getDriverState,
  listOwnDocuments,
  listOwnVehicles,
  ownDocumentUrl,
  saveVehicle,
  setDriverAvailability,
  uploadDriverDocument,
  type DocumentType,
  type DriverState,
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

type Page = 'inicio' | 'viajes' | 'vehiculos' | 'documentos' | 'cuenta'
type Props = { user: User; views: Role[]; activeView: Role; onSwitchView: (view: Role) => void; onLogout: () => void }

const EMPTY_STATE: DriverState = { exists: false, approved: false, approvalStatus: 'pendiente', available: false, hasActiveVehicle: false, rating: null }
const DOCS: { type: DocumentType; label: string; hint: string }[] = [
  { type: 'licencia', label: 'Licencia de conducir', hint: 'Foto del frente de tu licencia vigente' },
  { type: 'SOAT', label: 'SOAT', hint: 'Póliza del seguro obligatorio' },
  { type: 'matricula', label: 'Matrícula', hint: 'Matrícula del vehículo' },
]

function money(value: number): string { return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(value) }
function initials(name: string): string { return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() }

export default function DriverDashboard({ user, views, activeView, onSwitchView, onLogout }: Props) {
  const [page, setPage] = useState<Page>('inicio')
  const [state, setState] = useState<DriverState>(EMPTY_STATE)
  const [trips, setTrips] = useState<Trip[]>([])
  const [requests, setRequests] = useState<Trip[]>([])
  const [vehicles, setVehicles] = useState<OwnVehicle[]>([])
  const [documents, setDocuments] = useState<OwnDocument[]>([])
  const [position, setPosition] = useState<TripPosition | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [ratingTrip, setRatingTrip] = useState<Trip | null>(null)
  const [ratingScore, setRatingScore] = useState(5)
  const [ratingComment, setRatingComment] = useState('')

  const activeTrip = useMemo(() => trips.find((trip) => !esFinal(trip.estado)) ?? null, [trips])

  const load = useCallback(async () => {
    try {
      const [nextState, nextTrips, nextVehicles, nextDocuments] = await Promise.all([
        getDriverState(user.id), listDriverTrips(user.id), listOwnVehicles(user.id), listOwnDocuments(user.id),
      ])
      const active = nextTrips.find((trip) => !esFinal(trip.estado))
      const nextRequests = !active && nextState.approved && nextState.hasActiveVehicle && nextState.available ? await listOpenTripRequests() : []
      setState(nextState); setTrips(nextTrips); setVehicles(nextVehicles); setDocuments(nextDocuments); setRequests(nextRequests); setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos actualizar tu panel.')
    } finally { setLoading(false) }
  }, [user.id])

  useEffect(() => { queueMicrotask(() => void load()); return watchTrips(() => void load()) }, [load])

  const reportPosition = useCallback((tripId?: string) => {
    if (!navigator.geolocation) { setError('Tu navegador no permite obtener la ubicación.'); return }
    navigator.geolocation.getCurrentPosition((location) => {
      const current = { lat: location.coords.latitude, lng: location.coords.longitude, recordedAt: new Date().toISOString() }
      setPosition(current)
      void reportDriverPosition(current.lat, current.lng, tripId).catch((cause) => setError(cause instanceof Error ? cause.message : 'No se pudo actualizar tu ubicación.'))
    }, () => setError('No pudimos acceder a tu ubicación. Activa el permiso para trabajar en línea.'), { enableHighAccuracy: true, timeout: 12000, maximumAge: 20000 })
  }, [])

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

  const go = (next: Page) => { setPage(next); setError(''); setNotice('') }
  const canWork = state.approved && state.hasActiveVehicle

  return <main className="driver-shell">
    <aside className="driver-sidebar">
      <div className="driver-brand"><img src={logoTipo} alt="Ride"/><b>Ride</b></div>
      <nav aria-label="Panel del conductor">
        <DriverNav active={page === 'inicio'} icon="⌂" label="Inicio" onClick={() => go('inicio')}/>
        <DriverNav active={page === 'viajes'} icon="↗" label="Viajes" onClick={() => go('viajes')}/>
        <DriverNav active={page === 'vehiculos'} icon="▰" label="Vehículos" onClick={() => go('vehiculos')}/>
        <DriverNav active={page === 'documentos'} icon="▤" label="Documentos" onClick={() => go('documentos')}/>
        <DriverNav active={page === 'cuenta'} icon="○" label="Mi cuenta" onClick={() => go('cuenta')}/>
      </nav>
      <div className="driver-profile"><span>{initials(user.name)}</span><div><strong>{user.name}</strong><small>{state.available ? 'En línea' : 'Fuera de línea'}</small></div></div>
      <button className="driver-logout" onClick={onLogout}>Cerrar sesión</button>
    </aside>
    <section className="driver-workspace">
      <header className="driver-topbar"><div><span>PANEL DE CONDUCTOR</span><h1>{page === 'inicio' ? `Hola, ${user.name.split(' ')[0]}` : page === 'viajes' ? 'Tus viajes' : page === 'vehiculos' ? 'Tus vehículos' : page === 'documentos' ? 'Tus documentos' : 'Tu cuenta'}</h1></div><div className="driver-top-actions">{views.length > 1 && <label><span>Vista</span><select value={activeView} onChange={(event) => onSwitchView(event.target.value as Role)}>{views.map((view) => <option key={view} value={view}>{panelLabel(view)}</option>)}</select></label>}<button className="driver-avatar" onClick={() => go('cuenta')}>{initials(user.name)}</button></div></header>
      <div className="driver-content">
        {notice && <div className="driver-feedback success">✓ {notice}</div>}{error && <div className="driver-feedback failure">! {error}<button onClick={() => setError('')}>Cerrar</button></div>}
        {loading ? <div className="driver-loading">Actualizando tu información…</div> : page === 'inicio' ? <DriverHome state={state} active={activeTrip} requests={requests} position={position} busy={busy} onAvailability={toggleAvailability} onTrips={() => go('viajes')} onProfile={() => go('documentos')} onReport={() => reportPosition(activeTrip?.id)}/>
          : page === 'viajes' ? <DriverTrips active={activeTrip} requests={requests} history={trips} position={position} busy={busy} canWork={canWork} available={state.available} onAccept={(trip) => void action(() => acceptTrip(trip.id), 'Solicitud aceptada.')} onAdvance={(trip) => void action(() => advanceTrip(trip.id).then(() => undefined))} onFinish={finalize} onCancel={(trip) => void action(() => cancelTrip(trip.id), 'Viaje cancelado.')}/>
          : page === 'vehiculos' ? <VehiclesPage vehicles={vehicles} busy={busy} onSave={(input) => void action(() => saveVehicle(input).then(() => undefined), 'Vehículo guardado.')} onActivate={(id) => void action(() => activateVehicle(id), 'Vehículo activado.')}/>
          : page === 'documentos' ? <DocumentsPage documents={documents} busy={busy} onUpload={(type, file) => void action(() => uploadDriverDocument(user.id, type, file), 'Documento enviado para revisión.')} onOpen={async (path) => { try { window.open(await ownDocumentUrl(path), '_blank', 'noopener,noreferrer') } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo abrir el documento.') } }}/>
          : <DriverAccount user={user} state={state} vehicles={vehicles} documents={documents}/>
        }
      </div>
    </section>
    <nav className="driver-mobile-nav"><DriverNav active={page === 'inicio'} icon="⌂" label="Inicio" onClick={() => go('inicio')}/><DriverNav active={page === 'viajes'} icon="↗" label="Viajes" onClick={() => go('viajes')}/><DriverNav active={page === 'vehiculos'} icon="▰" label="Autos" onClick={() => go('vehiculos')}/><DriverNav active={page === 'documentos'} icon="▤" label="Docs" onClick={() => go('documentos')}/><DriverNav active={page === 'cuenta'} icon="○" label="Cuenta" onClick={() => go('cuenta')}/></nav>
    {ratingTrip && <div className="driver-dialog-backdrop"><section className="driver-dialog"><button onClick={() => setRatingTrip(null)}>×</button><h2>¿Cómo estuvo el pasajero?</h2><p>Califica a {ratingTrip.pasajeroNombre}.</p><div className="driver-rating">{[1,2,3,4,5].map((score) => <button key={score} className={score <= ratingScore ? 'selected' : ''} onClick={() => setRatingScore(score)}>★</button>)}</div><textarea maxLength={300} value={ratingComment} onChange={(event) => setRatingComment(event.target.value)} placeholder="Comentario opcional"/><button className="primary" disabled={busy} onClick={submitRating}>Enviar calificación</button></section></div>}
  </main>
}

function DriverNav({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) { return <button className={active ? 'active' : ''} onClick={onClick}><span>{icon}</span>{label}</button> }

function DriverHome({ state, active, requests, position, busy, onAvailability, onTrips, onProfile, onReport }: { state: DriverState; active: Trip | null; requests: Trip[]; position: TripPosition | null; busy: boolean; onAvailability: (value: boolean) => void; onTrips: () => void; onProfile: () => void; onReport: () => void }) {
  return <div className="driver-page"><section className={`driver-status-card ${state.available ? 'online' : ''}`}><div><span className="status-dot"/><div><small>ESTADO DE JORNADA</small><h2>{state.available ? 'Estás disponible' : 'Estás fuera de línea'}</h2><p>{state.available ? 'Ride está enviando tu posición y buscando solicitudes cercanas.' : canWorkText(state)}</p></div></div><label className="availability-switch"><input type="checkbox" checked={state.available} disabled={busy || !state.approved || !state.hasActiveVehicle} onChange={(event) => onAvailability(event.target.checked)}/><span/></label></section>{!state.approved || !state.hasActiveVehicle ? <section className="driver-block"><span>!</span><div><h3>Completa tu perfil para conducir</h3><p>{driverBlockReason(state)}</p></div><button onClick={onProfile}>Revisar requisitos</button></section> : null}<div className="driver-map-wrap"><RideMap origin={position ? { ...position, label: 'Mi ubicación' } : null} className="driver-home-map"/><div className="driver-map-card"><small>UBICACIÓN REAL</small><strong>{position ? 'Posición actualizada' : 'Permiso pendiente'}</strong><p>{position ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}` : 'Ponte en línea para compartir tu ubicación.'}</p><button onClick={onReport}>Actualizar ubicación</button></div></div><section className="driver-summary"><article><small>VIAJE ACTIVO</small><strong>{active ? ESTADO_LABEL[active.estado] : 'Ninguno'}</strong><p>{active?.destinoTexto ?? 'Disponible para una nueva ruta'}</p></article><article><small>SOLICITUDES CERCA</small><strong>{requests.length}</strong><p>Actualizadas en tiempo real</p></article><button onClick={onTrips}>{active ? 'Continuar viaje' : 'Ver solicitudes'} →</button></section></div>
}

function canWorkText(state: DriverState): string { return state.approved && state.hasActiveVehicle ? 'Ponte en línea para recibir solicitudes cercanas.' : driverBlockReason(state) }

function DriverTrips({ active, requests, history, position, busy, canWork, available, onAccept, onAdvance, onFinish, onCancel }: { active: Trip | null; requests: Trip[]; history: Trip[]; position: TripPosition | null; busy: boolean; canWork: boolean; available: boolean; onAccept: (trip: Trip) => void; onAdvance: (trip: Trip) => void; onFinish: (trip: Trip) => void; onCancel: (trip: Trip) => void }) {
  const next: Partial<Record<Trip['estado'], string>> = { ACEPTADO: 'Voy en camino', CONDUCTOR_EN_CAMINO: 'Llegué al punto', CONDUCTOR_EN_ORIGEN: 'Iniciar viaje' }
  if (active) return <div className="driver-page"><section className="driver-section-head"><span>VIAJE EN CURSO</span><h2>{ESTADO_LABEL[active.estado]}</h2></section><DriverActiveMap trip={active} position={position}/><section className="active-driver-trip"><div className="active-driver-title"><div><small>PASAJERO</small><h3>{active.pasajeroNombre}</h3>{active.pasajeroTelefono && <a href={`tel:${active.pasajeroTelefono}`}>{active.pasajeroTelefono}</a>}</div><strong>{money(active.tarifaFinal ?? active.tarifaEstimada)}</strong></div><DriverRoute trip={active}/><div className="driver-trip-actions">{next[active.estado] && <button className="primary" disabled={busy} onClick={() => onAdvance(active)}>{next[active.estado]}</button>}{active.estado === 'EN_CURSO' && <button className="finish" disabled={busy} onClick={() => onFinish(active)}>Finalizar viaje</button>}{!['EN_CURSO','FINALIZADO','CANCELADO','SIN_CONDUCTOR'].includes(active.estado) && <button className="danger" disabled={busy} onClick={() => onCancel(active)}>Cancelar viaje</button>}</div></section></div>
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

function VehiclesPage({ vehicles, busy, onSave, onActivate }: { vehicles: OwnVehicle[]; busy: boolean; onSave: (input: { id?: string; plate: string; make: string; model: string; year: number; color?: string }) => void; onActivate: (id: string) => void }) {
  const [editing, setEditing] = useState<OwnVehicle | null>(null)
  const [showForm, setShowForm] = useState(vehicles.length === 0)
  return <div className="driver-page"><section className="driver-section-head with-action"><div><span>FLOTA PERSONAL</span><h2>Vehículos registrados</h2><p>Solo el vehículo activo se asigna a tus viajes.</p></div><button onClick={() => { setEditing(null); setShowForm(true) }}>+ Registrar vehículo</button></section>{showForm && <VehicleForm vehicle={editing} busy={busy} onCancel={() => setShowForm(false)} onSave={(input) => { onSave(input); setShowForm(false) }}/>}<div className="vehicle-list">{vehicles.map((vehicle) => <article key={vehicle.id} className={vehicle.active ? 'active' : ''}><span>▰</span><div><div><h3>{vehicle.make} {vehicle.model}</h3>{vehicle.active && <b>En servicio</b>}</div><p>{vehicle.plate} · {vehicle.year}{vehicle.color ? ` · ${vehicle.color}` : ''}</p></div><div className="vehicle-actions"><button onClick={() => { setEditing(vehicle); setShowForm(true) }}>Editar</button>{!vehicle.active && <button disabled={busy} onClick={() => onActivate(vehicle.id)}>Activar</button>}</div></article>)}</div></div>
}

function VehicleForm({ vehicle, busy, onCancel, onSave }: { vehicle: OwnVehicle | null; busy: boolean; onCancel: () => void; onSave: (input: { id?: string; plate: string; make: string; model: string; year: number; color?: string }) => void }) {
  const submit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); onSave({ id: vehicle?.id, plate: String(values.plate), make: String(values.make), model: String(values.model), year: Number(values.year), color: String(values.color) }) }
  return <form className="vehicle-form" onSubmit={submit}><h3>{vehicle ? 'Editar vehículo' : 'Nuevo vehículo'}</h3><div><label>Placa<input required name="plate" minLength={5} defaultValue={vehicle?.plate}/></label><label>Marca<input required name="make" defaultValue={vehicle?.make}/></label><label>Modelo<input required name="model" defaultValue={vehicle?.model}/></label><label>Año<input required name="year" type="number" min="1980" max={new Date().getFullYear() + 1} defaultValue={vehicle?.year ?? new Date().getFullYear()}/></label><label>Color<input name="color" defaultValue={vehicle?.color ?? ''}/></label></div><footer><button type="button" onClick={onCancel}>Cancelar</button><button className="primary" disabled={busy}>Guardar vehículo</button></footer></form>
}

function DocumentsPage({ documents, busy, onUpload, onOpen }: { documents: OwnDocument[]; busy: boolean; onUpload: (type: DocumentType, file: File) => void; onOpen: (path: string) => void }) {
  return <div className="driver-page"><section className="driver-section-head"><span>VERIFICACIÓN</span><h2>Documentos del conductor</h2><p>Los archivos son privados. Solo tú y la administración pueden consultarlos.</p></section><div className="document-list">{DOCS.map((definition) => { const document = documents.find((item) => item.type === definition.type); return <article key={definition.type}><span className={`doc-state ${document?.status ?? 'missing'}`}>{document ? document.status === 'aprobado' ? '✓' : document.status === 'rechazado' ? '!' : '…' : '+'}</span><div><h3>{definition.label}</h3><p>{definition.hint}</p><small>{document ? document.status === 'aprobado' ? 'Aprobado' : document.status === 'rechazado' ? 'Rechazado: vuelve a subirlo' : 'En revisión' : 'Pendiente de carga'}</small></div><div>{document && <button onClick={() => onOpen(document.path)}>Ver</button>}<label className={busy ? 'disabled' : ''}>{document ? 'Reemplazar' : 'Subir archivo'}<input disabled={busy} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(definition.type, file); event.target.value = '' }}/></label></div></article> })}</div></div>
}

function DriverAccount({ user, state, vehicles, documents }: { user: User; state: DriverState; vehicles: OwnVehicle[]; documents: OwnDocument[] }) {
  return <div className="driver-page"><section className="driver-account-hero"><span>{initials(user.name)}</span><div><small>PERFIL DE CONDUCTOR</small><h2>{user.name}</h2><p>{state.approved ? 'Cuenta aprobada para conducir' : 'Cuenta en proceso de verificación'}</p></div></section><div className="driver-account-grid"><section><h3>Datos personales</h3><dl><div><dt>Correo</dt><dd>{user.email}</dd></div><div><dt>Teléfono</dt><dd>{user.phone || 'Sin teléfono'}</dd></div><div><dt>Estado</dt><dd>{state.approvalStatus}</dd></div><div><dt>Calificación</dt><dd>{state.rating == null ? 'Sin calificaciones' : `★ ${state.rating.toFixed(1)}`}</dd></div></dl></section><aside><strong>{vehicles.length}</strong><span>vehículos</span><strong>{documents.filter((document) => document.status === 'aprobado').length}/3</strong><span>documentos aprobados</span></aside></div></div>
}
