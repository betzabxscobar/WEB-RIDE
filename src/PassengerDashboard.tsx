import { useCallback, useEffect, useMemo, useState } from 'react'
import './PassengerDashboard.css'
import logoTipo from './assets/LogoTipo.png'
import { panelLabel, type Role, type User } from './lib/auth'
import {
  cancelTrip,
  esFinal,
  ESTADO_LABEL,
  hasRatedTrip,
  listPassengerTrips,
  listPlaces,
  progresoViaje,
  puedeCancelar,
  quoteTrip,
  rateTrip,
  requestTrip,
  watchTrips,
  type Coordinates,
  type Place,
  type Quote,
  type Trip,
  type TripStatus,
} from './lib/trips'

type Page = 'inicio' | 'pedir' | 'viajes' | 'cuenta'

type Props = {
  user: User
  views: Role[]
  activeView: Role
  onSwitchView: (view: Role) => void
  onLogout: () => void
}

const STATUS_HINT: Record<TripStatus, string> = {
  SOLICITADO: 'Estamos registrando tu solicitud.',
  BUSCANDO_CONDUCTOR: 'Buscando un conductor disponible cerca de ti.',
  ACEPTADO: 'Tu conductor aceptó el viaje.',
  CONDUCTOR_EN_CAMINO: 'El conductor va hacia el punto de partida.',
  CONDUCTOR_EN_ORIGEN: 'Tu conductor ya llegó al punto de partida.',
  EN_CURSO: 'Vas rumbo a tu destino.',
  FINALIZADO: 'Llegaste a tu destino.',
  CANCELADO: 'Este viaje fue cancelado.',
  SIN_CONDUCTOR: 'No encontramos un conductor disponible.',
}

function money(value: number): string {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(value)
}

function date(value: string): string {
  return new Intl.DateTimeFormat('es-EC', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function vehicle(trip: Trip): string {
  const model = [trip.vehiculoMarca, trip.vehiculoModelo].filter(Boolean).join(' ')
  return [model || 'Vehículo asignado', trip.vehiculoColor, trip.vehiculoPlaca].filter(Boolean).join(' · ')
}

function PassengerDashboard({ user, views, activeView, onSwitchView, onLogout }: Props) {
  const [page, setPage] = useState<Page>('inicio')
  const [trips, setTrips] = useState<Trip[]>([])
  const [places, setPlaces] = useState<Place[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [origin, setOrigin] = useState<Coordinates | null>(null)
  const [originPlaceId, setOriginPlaceId] = useState('')
  const [destinationId, setDestinationId] = useState('')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [locating, setLocating] = useState(false)
  const [quoting, setQuoting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [canceling, setCanceling] = useState<Trip | null>(null)
  const [rating, setRating] = useState<Trip | null>(null)
  const [ratingScore, setRatingScore] = useState(5)
  const [ratingComment, setRatingComment] = useState('')

  const load = useCallback(async () => {
    try {
      const [nextTrips, nextPlaces] = await Promise.all([
        listPassengerTrips(user.id),
        listPlaces(user.id),
      ])
      setTrips(nextTrips)
      setPlaces(nextPlaces)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos actualizar tu panel.')
    } finally {
      setLoading(false)
    }
  }, [user.id])

  useEffect(() => {
    queueMicrotask(() => load())
    return watchTrips(() => load())
  }, [load])

  const destination = useMemo(
    () => places.find((place) => place.id === destinationId) ?? null,
    [destinationId, places],
  )
  const activeTrip = useMemo(() => trips.find((trip) => !esFinal(trip.estado)) ?? null, [trips])

  useEffect(() => {
    let current = true
    if (!origin || !destination) return () => { current = false }
    quoteTrip(origin, destination)
      .then((nextQuote) => { if (current) { setQuote(nextQuote); setError('') } })
      .catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : 'No pudimos cotizar el viaje.') })
      .finally(() => { if (current) setQuoting(false) })
    return () => { current = false }
  }, [origin, destination])

  const selectOrigin = (id: string) => {
    setQuote(null)
    setQuoting(Boolean(id && destinationId))
    setOriginPlaceId(id)
    const place = places.find((item) => item.id === id)
    setOrigin(place ? { lat: place.lat, lng: place.lng, label: place.nombre } : null)
  }

  const selectDestination = (id: string) => {
    setQuote(null)
    setQuoting(Boolean(id && origin))
    setDestinationId(id)
  }

  const useLocation = () => {
    if (!navigator.geolocation) {
      setError('Tu navegador no permite obtener la ubicación. Elige un punto de la lista.')
      return
    }
    setLocating(true)
    setError('')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setQuote(null)
        setQuoting(Boolean(destinationId))
        setOriginPlaceId('gps')
        setOrigin({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: 'Mi ubicación actual',
        })
        setLocating(false)
      },
      () => {
        setError('No pudimos acceder a tu ubicación. Elige un punto de partida de la lista.')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    )
  }

  const confirmRequest = async () => {
    if (!origin || !destination || !quote || activeTrip) return
    setBusy(true); setError(''); setNotice('')
    try {
      await requestTrip(origin, destination, quote)
      await load()
      setNotice('Tu viaje fue solicitado. El estado se actualizará automáticamente.')
      setPage('inicio')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo solicitar el viaje.')
    } finally { setBusy(false) }
  }

  const confirmCancel = async () => {
    if (!canceling) return
    setBusy(true); setError('')
    try {
      await cancelTrip(canceling.id)
      setCanceling(null)
      setNotice('El viaje fue cancelado.')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cancelar el viaje.')
    } finally { setBusy(false) }
  }

  const openRating = async (trip: Trip) => {
    setBusy(true); setError('')
    try {
      if (await hasRatedTrip(trip.id, user.id)) {
        setNotice('Ya calificaste este viaje.')
        return
      }
      setRatingScore(5); setRatingComment(''); setRating(trip)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo abrir la calificación.')
    } finally { setBusy(false) }
  }

  const submitRating = async () => {
    if (!rating) return
    setBusy(true); setError('')
    try {
      await rateTrip(rating, user.id, ratingScore, ratingComment)
      setRating(null)
      setNotice('Gracias. Tu calificación quedó guardada.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la calificación.')
    } finally { setBusy(false) }
  }

  const go = (next: Page) => {
    setPage(next); setError(''); setNotice('')
  }

  return <main className="passenger-shell">
    <aside className="passenger-sidebar">
      <div className="passenger-brand"><img src={logoTipo} alt="Ride"/><b>Ride</b></div>
      <nav aria-label="Panel del pasajero">
        <NavButton active={page === 'inicio'} icon="⌂" label="Inicio" onClick={() => go('inicio')}/>
        <NavButton active={page === 'pedir'} icon="↗" label="Pedir viaje" onClick={() => go('pedir')}/>
        <NavButton active={page === 'viajes'} icon="≡" label="Mis viajes" onClick={() => go('viajes')}/>
        <NavButton active={page === 'cuenta'} icon="○" label="Mi cuenta" onClick={() => go('cuenta')}/>
      </nav>
      <div className="passenger-profile">
        <span>{initials(user.name)}</span>
        <div><strong>{user.name}</strong><small>Pasajero</small></div>
      </div>
      <button className="passenger-logout" onClick={onLogout}>Cerrar sesión</button>
    </aside>

    <section className="passenger-workspace">
      <header className="passenger-topbar">
        <div className="passenger-mobile-brand"><img src={logoTipo} alt="Ride"/><b>Ride</b></div>
        <div><span className="passenger-kicker">PANEL DE PASAJERO</span><h1>{page === 'inicio' ? `Hola, ${user.name.split(' ')[0]}` : page === 'pedir' ? 'Pide un viaje' : page === 'viajes' ? 'Tus viajes' : 'Tu cuenta'}</h1></div>
        <div className="passenger-top-actions">
          {views.length > 1 && <label className="passenger-view-select"><span>Vista</span><select value={activeView} onChange={(event) => onSwitchView(event.target.value as Role)}>{views.map((view) => <option value={view} key={view}>{panelLabel(view)}</option>)}</select></label>}
          <button className="passenger-avatar" onClick={() => go('cuenta')} aria-label="Abrir mi cuenta">{initials(user.name)}</button>
        </div>
      </header>

      <div className="passenger-content">
        {notice && <div className="passenger-feedback success"><span>✓</span>{notice}</div>}
        {error && <div className="passenger-feedback failure"><span>!</span>{error}<button onClick={() => setError('')}>Cerrar</button></div>}
        {loading ? <LoadingPanel/> : page === 'inicio' ? <HomePage user={user} activeTrip={activeTrip} trips={trips} onRequest={() => go('pedir')} onTrips={() => go('viajes')} onCancel={setCanceling}/>
          : page === 'pedir' ? <RequestPage places={places} origin={origin} originPlaceId={originPlaceId} destinationId={destinationId} quote={quote} quoting={quoting} locating={locating} busy={busy} activeTrip={activeTrip} onUseLocation={useLocation} onOrigin={selectOrigin} onDestination={selectDestination} onConfirm={confirmRequest} onActive={() => go('inicio')}/>
          : page === 'viajes' ? <TripsPage trips={trips} busy={busy} onCancel={setCanceling} onRate={openRating}/>
          : <AccountPage user={user} trips={trips}/>
        }
      </div>
    </section>

    <nav className="passenger-mobile-nav" aria-label="Navegación móvil">
      <NavButton active={page === 'inicio'} icon="⌂" label="Inicio" onClick={() => go('inicio')}/>
      <NavButton active={page === 'pedir'} icon="↗" label="Pedir" onClick={() => go('pedir')}/>
      <NavButton active={page === 'viajes'} icon="≡" label="Viajes" onClick={() => go('viajes')}/>
      <NavButton active={page === 'cuenta'} icon="○" label="Cuenta" onClick={() => go('cuenta')}/>
    </nav>

    {canceling && <Dialog title="¿Cancelar este viaje?" text={`Se cancelará el viaje hacia ${canceling.destinoTexto}.`} onClose={() => setCanceling(null)}><button className="dialog-secondary" onClick={() => setCanceling(null)}>Volver</button><button className="dialog-danger" disabled={busy} onClick={confirmCancel}>{busy ? 'Cancelando…' : 'Sí, cancelar'}</button></Dialog>}
    {rating && <Dialog title="Califica tu viaje" text={`¿Cómo estuvo tu experiencia con ${rating.conductorNombre ?? 'tu conductor'}?`} onClose={() => setRating(null)}><div className="rating-fields"><div className="rating-stars" aria-label="Puntuación">{[1,2,3,4,5].map((score) => <button key={score} className={score <= ratingScore ? 'selected' : ''} onClick={() => setRatingScore(score)} aria-label={`${score} estrellas`}>★</button>)}</div><label>Comentario opcional<textarea maxLength={300} value={ratingComment} onChange={(event) => setRatingComment(event.target.value)} placeholder="Cuéntanos cómo fue el viaje"/></label></div><button className="dialog-secondary" onClick={() => setRating(null)}>Ahora no</button><button className="dialog-primary" disabled={busy} onClick={submitRating}>{busy ? 'Guardando…' : 'Enviar calificación'}</button></Dialog>}
  </main>
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) {
  return <button className={active ? 'active' : ''} onClick={onClick}><span>{icon}</span>{label}</button>
}

function LoadingPanel() {
  return <div className="passenger-loading"><i/><span>Actualizando tu información…</span></div>
}

function HomePage({ user, activeTrip, trips, onRequest, onTrips, onCancel }: { user: User; activeTrip: Trip | null; trips: Trip[]; onRequest: () => void; onTrips: () => void; onCancel: (trip: Trip) => void }) {
  const recent = trips.filter((trip) => esFinal(trip.estado)).slice(0, 3)
  return <div className="passenger-page home-page">
    <section className="passenger-welcome"><div><span>{activeTrip ? 'VIAJE ACTIVO' : 'LISTO PARA SALIR'}</span><h2>{activeTrip ? STATUS_HINT[activeTrip.estado] : '¿A dónde vamos hoy?'}</h2><p>{activeTrip ? `Destino: ${activeTrip.destinoTexto}` : 'Elige tu punto de partida y destino. Ride calcula la tarifa antes de confirmar.'}</p></div>{activeTrip ? <button onClick={() => document.getElementById('active-trip')?.scrollIntoView({ behavior: 'smooth' })}>Ver seguimiento</button> : <button onClick={onRequest}>Pedir un viaje <b>→</b></button>}</section>
    {activeTrip ? <ActiveTrip trip={activeTrip} onCancel={onCancel}/> : <section className="start-ride-card"><div className="route-mark"><i/><span/><b/></div><div><small>NUEVA SOLICITUD</small><h3>Tu viaje empieza con dos puntos</h3><p>Usa tu ubicación actual o elige una dirección en Ecuador.</p></div><button onClick={onRequest}>Definir ruta</button></section>}
    <section className="passenger-section-head"><div><span>ACTIVIDAD</span><h2>Viajes recientes</h2></div>{trips.length > 0 && <button onClick={onTrips}>Ver todos →</button>}</section>
    {recent.length === 0 ? <EmptyState title="Aún no tienes viajes" text={`Cuando pidas el primero, ${user.name.split(' ')[0]}, podrás consultarlo aquí.`} action="Pedir mi primer viaje" onAction={onRequest}/> : <div className="recent-trip-list">{recent.map((trip) => <TripRow key={trip.id} trip={trip}/>)}</div>}
  </div>
}

function ActiveTrip({ trip, onCancel }: { trip: Trip; onCancel: (trip: Trip) => void }) {
  return <section className="active-trip" id="active-trip"><div className="active-trip-head"><div><span className={`trip-status ${trip.estado.toLowerCase()}`}>{ESTADO_LABEL[trip.estado]}</span><h2>{STATUS_HINT[trip.estado]}</h2></div><strong>{money(trip.tarifaFinal ?? trip.tarifaEstimada)}</strong></div><div className="trip-progress"><span style={{ width: `${progresoViaje(trip.estado)}%` }}/></div><div className="active-trip-grid"><Route trip={trip}/><div className="driver-card">{trip.conductorId ? <><span className="driver-avatar">{initials(trip.conductorNombre ?? 'Conductor')}</span><div><small>TU CONDUCTOR</small><strong>{trip.conductorNombre}</strong><p>{vehicle(trip)}</p>{trip.conductorCalificacion != null && <em>★ {trip.conductorCalificacion.toFixed(1)}</em>}</div></> : <><span className="searching-driver">⌁</span><div><small>CONDUCTOR</small><strong>Buscando disponibilidad</strong><p>La asignación aparecerá aquí automáticamente.</p></div></>}</div></div>{puedeCancelar(trip.estado) && <button className="cancel-trip" onClick={() => onCancel(trip)}>Cancelar viaje</button>}</section>
}

function RequestPage({ places, origin, originPlaceId, destinationId, quote, quoting, locating, busy, activeTrip, onUseLocation, onOrigin, onDestination, onConfirm, onActive }: { places: Place[]; origin: Coordinates | null; originPlaceId: string; destinationId: string; quote: Quote | null; quoting: boolean; locating: boolean; busy: boolean; activeTrip: Trip | null; onUseLocation: () => void; onOrigin: (id: string) => void; onDestination: (id: string) => void; onConfirm: () => void; onActive: () => void }) {
  if (activeTrip) return <EmptyState title="Ya tienes un viaje en curso" text={`Primero termina o cancela el viaje hacia ${activeTrip.destinoTexto}.`} action="Ver mi viaje" onAction={onActive}/>
  return <div className="passenger-page request-page"><div className="request-layout"><section className="request-form"><span className="passenger-kicker">DEFINE TU RECORRIDO</span><h2>Origen y destino</h2><p>Te mostraremos el precio antes de confirmar el viaje.</p><div className="route-form"><div className="route-field origin"><i/><label>Punto de partida<select value={originPlaceId} onChange={(event) => onOrigin(event.target.value)}><option value="">Elige un lugar</option>{originPlaceId === 'gps' && <option value="gps">Mi ubicación actual</option>}{places.map((place) => <option value={place.id} key={place.id}>{place.nombre}</option>)}</select><small>{origin?.label ?? 'Puedes usar tu ubicación actual'}</small></label></div><div className="route-line"/><div className="route-field destination"><i/><label>Destino<select value={destinationId} onChange={(event) => onDestination(event.target.value)}><option value="">¿A dónde quieres ir?</option>{places.map((place) => <option value={place.id} key={place.id}>{place.nombre}</option>)}</select><small>{places.find((place) => place.id === destinationId)?.direccion ?? 'Selecciona un destino disponible'}</small></label></div></div><button className="location-button" disabled={locating} onClick={onUseLocation}>{locating ? 'Obteniendo ubicación…' : '◎ Usar mi ubicación actual'}</button>{places.length === 0 && <p className="request-warning">Aún no hay direcciones disponibles. Inténtalo más tarde.</p>}</section><aside className="quote-card"><span className="passenger-kicker">RESUMEN</span><h3>Tu cotización</h3>{quoting ? <div className="quote-loading"><i/>Calculando la mejor tarifa…</div> : quote ? <><div className="quote-price"><span>Precio estimado</span><strong>{money(quote.total)}</strong></div><dl><div><dt>Distancia estimada</dt><dd>{quote.km.toFixed(2)} km</dd></div><div><dt>Tiempo estimado</dt><dd>{quote.minutos} min</dd></div><div><dt>Tarifa</dt><dd>{quote.tarifaNombre}</dd></div></dl><button disabled={busy} onClick={onConfirm}>{busy ? 'Solicitando…' : `Confirmar por ${money(quote.total)}`}<b>→</b></button><small>El precio final aparecerá cuando termine el viaje.</small></> : <div className="quote-empty"><span>↗</span><p>Completa el origen y el destino para conocer el precio antes de confirmar.</p></div>}</aside></div></div>
}

function TripsPage({ trips, busy, onCancel, onRate }: { trips: Trip[]; busy: boolean; onCancel: (trip: Trip) => void; onRate: (trip: Trip) => void }) {
  return <div className="passenger-page trips-page"><section className="passenger-section-head"><div><span>HISTORIAL REAL</span><h2>Todos tus viajes</h2><p>{trips.length} {trips.length === 1 ? 'viaje registrado' : 'viajes registrados'}</p></div></section>{trips.length === 0 ? <EmptyState title="Aún no hay viajes" text="Tus solicitudes aparecerán aquí cuando pidas un viaje."/> : <div className="trip-history">{trips.map((trip) => <article key={trip.id}><TripRow trip={trip}/><div className="history-actions">{puedeCancelar(trip.estado) && <button onClick={() => onCancel(trip)}>Cancelar</button>}{trip.estado === 'FINALIZADO' && trip.conductorId && <button disabled={busy} onClick={() => onRate(trip)}>Calificar viaje</button>}</div></article>)}</div>}</div>
}

function AccountPage({ user, trips }: { user: User; trips: Trip[] }) {
  const completed = trips.filter((trip) => trip.estado === 'FINALIZADO').length
  return <div className="passenger-page account-page"><section className="account-hero"><span className="account-avatar">{initials(user.name)}</span><div><span className="passenger-kicker">PERFIL DE PASAJERO</span><h2>{user.name}</h2><p>Tu información de Ride y actividad reciente.</p></div></section><section className="account-layout"><div className="account-details"><h3>Datos personales</h3><dl><div><dt>Nombre</dt><dd>{user.name}</dd></div><div><dt>Correo</dt><dd>{user.email}</dd></div><div><dt>Teléfono</dt><dd>{user.phone || 'Sin teléfono registrado'}</dd></div><div><dt>Tipo de cuenta</dt><dd>Pasajero</dd></div></dl></div><div className="account-summary"><span>VIAJES FINALIZADOS</span><strong>{completed}</strong><p>{trips.length - completed} solicitudes en otros estados</p></div></section></div>
}

function Route({ trip }: { trip: Trip }) {
  return <div className="trip-route-card"><div><i className="origin"/><span><small>ORIGEN</small><strong>{trip.origenTexto}</strong></span></div><b/><div><i className="destination"/><span><small>DESTINO</small><strong>{trip.destinoTexto}</strong></span></div></div>
}

function TripRow({ trip }: { trip: Trip }) {
  return <div className="trip-row"><span className="trip-date">{date(trip.fechaSolicitud)}</span><Route trip={trip}/><span className={`trip-status ${trip.estado.toLowerCase()}`}>{ESTADO_LABEL[trip.estado]}</span><strong className="trip-amount">{money(trip.tarifaFinal ?? trip.tarifaEstimada)}</strong></div>
}

function EmptyState({ title, text, action, onAction }: { title: string; text: string; action?: string; onAction?: () => void }) {
  return <section className="passenger-empty"><span>↗</span><h3>{title}</h3><p>{text}</p>{action && onAction && <button onClick={onAction}>{action}</button>}</section>
}

function Dialog({ title, text, children, onClose }: { title: string; text: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="passenger-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="passenger-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><button className="dialog-close" onClick={onClose} aria-label="Cerrar">×</button><span className="dialog-mark">◇</span><h2 id="dialog-title">{title}</h2><p>{text}</p><div className="dialog-actions">{children}</div></section></div>
}

export default PassengerDashboard
