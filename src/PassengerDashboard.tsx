import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import './PassengerDashboard.css'
import logoTipo from './assets/LogoTipo.png'
import RideMap from './components/RideMap'
import { panelLabel, type Role, type User } from './lib/auth'
import { reverseGeocode, searchPlaces } from './lib/geocoding'
import { routeBetween, type RoadRoute } from './lib/routing'
import {
  addSavedAddress,
  deleteSavedAddress,
  listSavedAddresses,
  setFavoriteAddress,
  type SavedAddress,
} from './lib/addresses'
import {
  listNotifications,
  markAllNotificationsRead,
  watchNotifications,
  type RideNotification,
} from './lib/notifications'
import {
  choosePreferredPayment,
  deletePaymentMethod,
  listPaymentMethods,
  listPaymentsForTrips,
  registerCashPayment,
  type PaymentMethod,
  type RidePayment,
} from './lib/payments'
import {
  cancelTrip,
  esFinal,
  ESTADO_LABEL,
  getLatestTripPosition,
  hasRatedTrip,
  listPassengerTrips,
  listPlaces,
  progresoViaje,
  puedeCancelar,
  quoteTrip,
  rateTrip,
  requestTrip,
  watchTrips,
  watchTripPositions,
  type Coordinates,
  type Place,
  type Quote,
  type Trip,
  type TripPosition,
  type TripStatus,
} from './lib/trips'

type Page = 'inicio' | 'pedir' | 'seguimiento' | 'viajes' | 'avisos' | 'direcciones' | 'pagos' | 'cuenta'

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
  const [destinationPoint, setDestinationPoint] = useState<Place | null>(null)
  const [roadRoute, setRoadRoute] = useState<RoadRoute | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [locating, setLocating] = useState(false)
  const [quoting, setQuoting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [canceling, setCanceling] = useState<Trip | null>(null)
  const [rating, setRating] = useState<Trip | null>(null)
  const [ratingScore, setRatingScore] = useState(5)
  const [ratingComment, setRatingComment] = useState('')
  const [notifications, setNotifications] = useState<RideNotification[]>([])
  const [addresses, setAddresses] = useState<SavedAddress[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [payments, setPayments] = useState<RidePayment[]>([])
  const [trackingTripId, setTrackingTripId] = useState<string | null>(null)
  const [tripPosition, setTripPosition] = useState<TripPosition | null>(null)
  const [offeredRatingTripId, setOfferedRatingTripId] = useState<string | null>(null)

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

  const loadNotifications = useCallback(async () => {
    try {
      setNotifications(await listNotifications(user.id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos actualizar tus avisos.')
    }
  }, [user.id])

  const loadAddresses = useCallback(async () => {
    try {
      setAddresses(await listSavedAddresses(user.id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos actualizar tus direcciones.')
    }
  }, [user.id])

  const loadPaymentData = useCallback(async () => {
    try {
      const [methods, history] = await Promise.all([
        listPaymentMethods(user.id),
        listPaymentsForTrips(trips.map((trip) => trip.id)),
      ])
      setPaymentMethods(methods)
      setPayments(history)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos actualizar tus pagos.')
    }
  }, [trips, user.id])

  useEffect(() => {
    queueMicrotask(() => load())
    return watchTrips(() => load())
  }, [load])

  useEffect(() => {
    queueMicrotask(() => loadNotifications())
    return watchNotifications(user.id, loadNotifications)
  }, [loadNotifications, user.id])

  useEffect(() => {
    queueMicrotask(() => loadAddresses())
  }, [loadAddresses])

  useEffect(() => {
    queueMicrotask(() => loadPaymentData())
  }, [loadPaymentData])

  const destination = useMemo(
    () => destinationPoint ?? places.find((place) => place.id === destinationId) ?? null,
    [destinationId, destinationPoint, places],
  )
  const activeTrip = useMemo(() => trips.find((trip) => !esFinal(trip.estado)) ?? null, [trips])
  const trackingTrip = useMemo(
    () => trips.find((trip) => trip.id === trackingTripId) ?? activeTrip,
    [activeTrip, trackingTripId, trips],
  )

  useEffect(() => {
    const tripId = trackingTrip?.id
    if (!tripId || esFinal(trackingTrip.estado)) {
      queueMicrotask(() => setTripPosition(null))
      return
    }
    const refresh = () => {
      void getLatestTripPosition(tripId)
        .then(setTripPosition)
        .catch(() => setTripPosition(null))
    }
    queueMicrotask(refresh)
    return watchTripPositions(tripId, refresh)
  }, [trackingTrip?.estado, trackingTrip?.id])

  useEffect(() => {
    const controller = new AbortController()
    let current = true
    queueMicrotask(() => { if (current) setRoadRoute(null) })
    if (!origin || !destination) return () => { current = false; controller.abort() }
    queueMicrotask(() => { if (current) setQuoting(true) })

    void quoteTrip(origin, destination)
      .then((nextQuote) => { if (current) { setQuote(nextQuote); setError('') } })
      .catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : 'No pudimos cotizar el viaje.') })

    void routeBetween(origin, destination, controller.signal)
      .then(async (route) => {
        if (!current || !route) return
        setRoadRoute(route)
        const adjusted = await quoteTrip(origin, destination, route.meters / 1000)
        if (current) setQuote(adjusted)
      })
      .catch((cause) => {
        if (current && !(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError('No pudimos trazar la ruta; la cotización sigue disponible.')
        }
      })
      .finally(() => { if (current) setQuoting(false) })

    return () => { current = false; controller.abort() }
  }, [origin, destination])

  const selectOrigin = (id: string) => {
    setQuote(null)
    setQuoting(Boolean(id && destinationId))
    setOriginPlaceId(id)
    const place = places.find((item) => item.id === id)
    setOrigin(place ? { lat: place.lat, lng: place.lng, label: place.nombre } : null)
  }

  const selectOriginPoint = (place: Place) => {
    setQuote(null); setOriginPlaceId(place.id)
    setOrigin({ lat: place.lat, lng: place.lng, label: [place.nombre, place.direccion].filter(Boolean).join(', ') })
  }

  const selectDestination = (id: string) => {
    setQuote(null)
    setQuoting(Boolean(id && origin))
    setDestinationId(id)
    setDestinationPoint(null)
  }

  const selectDestinationPoint = (place: Place) => {
    setQuote(null); setDestinationId(place.id); setDestinationPoint(place)
  }

  const getUserLocation = () => {
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

  useEffect(() => {
    if (page !== 'seguimiento' || !trackingTrip || trackingTrip.estado !== 'FINALIZADO' || !trackingTrip.conductorId || offeredRatingTripId === trackingTrip.id || rating) return
    const trip = trackingTrip
    queueMicrotask(async () => {
      setOfferedRatingTripId(trip.id)
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
    })
  }, [offeredRatingTripId, page, rating, trackingTrip, user.id])

  const go = (next: Page) => {
    setPage(next); setError(''); setNotice('')
  }

  const openTracking = (trip: Trip) => {
    setTrackingTripId(trip.id)
    go('seguimiento')
  }

  const openNotifications = async () => {
    go('avisos')
    if (!notifications.some((item) => !item.read)) return
    try {
      await markAllNotificationsRead()
      await loadNotifications()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron actualizar tus avisos.')
    }
  }

  const unread = notifications.filter((item) => !item.read).length

  const saveCurrentAddress = async (label: string, address: string) => {
    if (!navigator.geolocation) {
      setError('Tu navegador no permite obtener la ubicación.')
      return
    }
    setBusy(true); setError(''); setNotice('')
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        await addSavedAddress(user.id, label, address, position.coords.latitude, position.coords.longitude)
        await Promise.all([loadAddresses(), load()])
        setNotice('La dirección quedó guardada y ya puedes usarla al pedir un viaje.')
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'No se pudo guardar la dirección.')
      } finally { setBusy(false) }
    }, () => {
      setError('No pudimos acceder a tu ubicación. Revisa el permiso del navegador.')
      setBusy(false)
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 })
  }

  const toggleFavoriteAddress = async (address: SavedAddress) => {
    setBusy(true); setError('')
    try {
      await setFavoriteAddress(address.id, !address.favorite)
      await Promise.all([loadAddresses(), load()])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar la dirección.')
    } finally { setBusy(false) }
  }

  const removeAddress = async (address: SavedAddress) => {
    setBusy(true); setError('')
    try {
      await deleteSavedAddress(address.id)
      await Promise.all([loadAddresses(), load()])
      setNotice('La dirección fue eliminada.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo eliminar la dirección.')
    } finally { setBusy(false) }
  }

  const addCashPayment = async () => {
    setBusy(true); setError(''); setNotice('')
    try {
      await registerCashPayment()
      await loadPaymentData()
      setNotice('El pago en efectivo quedó como opción principal.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar la forma de pago.')
    } finally { setBusy(false) }
  }

  const selectPreferredPayment = async (method: PaymentMethod) => {
    setBusy(true); setError('')
    try {
      await choosePreferredPayment(method.id)
      await loadPaymentData()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cambiar la forma de pago.')
    } finally { setBusy(false) }
  }

  const removePaymentMethod = async (method: PaymentMethod) => {
    setBusy(true); setError(''); setNotice('')
    try {
      await deletePaymentMethod(method.id)
      await loadPaymentData()
      setNotice('La forma de pago fue eliminada.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo eliminar la forma de pago.')
    } finally { setBusy(false) }
  }

  return <main className="passenger-shell">
    <aside className="passenger-sidebar">
      <div className="passenger-brand"><img src={logoTipo} alt="Ride"/><b>Ride</b></div>
      <nav aria-label="Panel del pasajero">
        <NavButton active={page === 'inicio'} icon="⌂" label="Inicio" onClick={() => go('inicio')}/>
        <NavButton active={page === 'pedir'} icon="↗" label="Pedir viaje" onClick={() => go('pedir')}/>
        <NavButton active={page === 'viajes'} icon="≡" label="Mis viajes" onClick={() => go('viajes')}/>
        <NavButton active={page === 'avisos'} icon="♢" label="Avisos" onClick={openNotifications}/>
        <NavButton active={page === 'direcciones'} icon="⌖" label="Direcciones" onClick={() => go('direcciones')}/>
        <NavButton active={page === 'pagos'} icon="$" label="Pagos" onClick={() => go('pagos')}/>
        <NavButton active={page === 'cuenta'} icon="○" label="Mi cuenta" onClick={() => go('cuenta')}/>
      </nav>
      <div className="passenger-profile">
        <span>{initials(user.name)}</span>
        <div><strong>{user.name}</strong><small>Pasajero</small></div>
      </div>
      <button className="passenger-logout" onClick={onLogout}>Cerrar sesión</button>
    </aside>

    {page === 'inicio' ? <HomePage
      user={user}
      activeTrip={activeTrip}
      tripPosition={tripPosition}
      locating={locating}
      notice={notice}
      error={error}
      views={views}
      activeView={activeView}
      onSwitchView={onSwitchView}
      onAccount={() => go('cuenta')}
      onRequest={() => go('pedir')}
      onUseLocation={() => { getUserLocation(); go('pedir') }}
      onTrack={openTracking}
      onCancel={setCanceling}
      onDismissError={() => setError('')}
    /> : <section className="passenger-workspace">
      <header className="passenger-topbar">
        <div className="passenger-mobile-brand"><img src={logoTipo} alt="Ride"/><b>Ride</b></div>
        <div><span className="passenger-kicker">PANEL DE PASAJERO</span><h1>{page === 'pedir' ? 'Pide un viaje' : page === 'seguimiento' ? 'Seguimiento del viaje' : page === 'viajes' ? 'Tus viajes' : page === 'avisos' ? 'Tus avisos' : page === 'direcciones' ? 'Tus direcciones' : page === 'pagos' ? 'Tus pagos' : 'Tu cuenta'}</h1></div>
        <div className="passenger-top-actions">
          {views.length > 1 && <label className="passenger-view-select"><span>Vista</span><select value={activeView} onChange={(event) => onSwitchView(event.target.value as Role)}>{views.map((view) => <option value={view} key={view}>{panelLabel(view)}</option>)}</select></label>}
          <button className="notification-button" onClick={openNotifications} aria-label={unread ? `${unread} avisos sin leer` : 'Abrir avisos'}>♢{unread > 0 && <b>{unread > 9 ? '9+' : unread}</b>}</button>
          <button className="passenger-avatar" onClick={() => go('cuenta')} aria-label="Abrir mi cuenta">{initials(user.name)}</button>
        </div>
      </header>

      <div className="passenger-content">
        {notice && <div className="passenger-feedback success"><span>✓</span>{notice}</div>}
        {error && <div className="passenger-feedback failure"><span>!</span>{error}<button onClick={() => setError('')}>Cerrar</button></div>}
        {loading ? <LoadingPanel/> : page === 'pedir' ? <RequestPage places={places} origin={origin} destination={destination} originPlaceId={originPlaceId} destinationId={destinationId} quote={quote} route={roadRoute} quoting={quoting} locating={locating} busy={busy} activeTrip={activeTrip} onUseLocation={getUserLocation} onOrigin={selectOrigin} onOriginPoint={selectOriginPoint} onDestination={selectDestination} onDestinationPoint={selectDestinationPoint} onConfirm={confirmRequest} onActive={() => activeTrip && openTracking(activeTrip)}/>
          : page === 'seguimiento' ? <TrackingPage trip={trackingTrip} position={tripPosition} onCancel={setCanceling} onBack={() => go('inicio')}/>
          : page === 'viajes' ? <TripsPage trips={trips} busy={busy} onCancel={setCanceling} onRate={openRating} onTrack={openTracking}/>
          : page === 'avisos' ? <NotificationsPage notifications={notifications}/>
          : page === 'direcciones' ? <AddressesPage addresses={addresses} busy={busy} onSave={saveCurrentAddress} onFavorite={toggleFavoriteAddress} onDelete={removeAddress}/>
          : page === 'pagos' ? <PaymentsPage methods={paymentMethods} payments={payments} trips={trips} busy={busy} onAddCash={addCashPayment} onPreferred={selectPreferredPayment} onDelete={removePaymentMethod}/>
          : <AccountPage user={user} trips={trips} addresses={addresses} methods={paymentMethods} onAddresses={() => go('direcciones')} onPayments={() => go('pagos')}/>
        }
      </div>
    </section>}

    <nav className="passenger-mobile-nav" aria-label="Navegación móvil">
      <NavButton active={page === 'inicio'} icon="⌂" label="Inicio" onClick={() => go('inicio')}/>
      <NavButton active={page === 'pedir'} icon="↗" label="Pedir" onClick={() => go('pedir')}/>
      <NavButton active={page === 'viajes'} icon="≡" label="Viajes" onClick={() => go('viajes')}/>
      <NavButton active={page === 'avisos'} icon="♢" label="Avisos" onClick={openNotifications}/>
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

function HomePage({ user, activeTrip, tripPosition, locating, notice, error, views, activeView, onSwitchView, onAccount, onRequest, onUseLocation, onTrack, onCancel, onDismissError }: {
  user: User
  activeTrip: Trip | null
  tripPosition: TripPosition | null
  locating: boolean
  notice: string
  error: string
  views: Role[]
  activeView: Role
  onSwitchView: (view: Role) => void
  onAccount: () => void
  onRequest: () => void
  onUseLocation: () => void
  onTrack: (trip: Trip) => void
  onCancel: (trip: Trip) => void
  onDismissError: () => void
}) {
  const [device, setDevice] = useState<Coordinates | null>(null)
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (position) => setDevice({ lat: position.coords.latitude, lng: position.coords.longitude, label: 'Mi ubicación actual' }),
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }, [])
  return <section className="passenger-map-screen">
    {activeTrip ? <TripTrackingMap trip={activeTrip} position={tripPosition}/> : <RideMap origin={device} dark labels={false} className="home-map" locateTo={device}/>}
    <div className="map-float-top">
      <button className="map-float-avatar" onClick={onAccount} aria-label="Abrir mi cuenta">{initials(user.name)}</button>
      <div className="map-float-right">
        {views.length > 1 && <label className="map-float-select"><select value={activeView} onChange={(event) => onSwitchView(event.target.value as Role)}>{views.map((view) => <option value={view} key={view}>{panelLabel(view)}</option>)}</select></label>}
      </div>
    </div>
    <div className="map-sheet">
      <span className="map-sheet-handle"/>
      {notice && <div className="passenger-feedback success"><span>✓</span>{notice}</div>}
      {error && <div className="passenger-feedback failure"><span>!</span>{error}<button onClick={onDismissError}>Cerrar</button></div>}
      {activeTrip ? <>
        <ActiveTrip trip={activeTrip} onCancel={onCancel}/>
        <button className="sheet-cta" onClick={() => onTrack(activeTrip)}>Ver seguimiento del viaje</button>
      </> : <>
        <h2>¡Hola, {user.name.split(' ')[0]}! 👋</h2>
        <p>¿A dónde vamos hoy?</p>
        <div className="sheet-card">
          <button className="sheet-row" onClick={onRequest}><span className="sheet-row-icon pin">◎</span>¿A dónde quieres llegar?<b>›</b></button>
          <button className="sheet-row" disabled={locating} onClick={onUseLocation}><span className="sheet-row-icon gps">⌖</span>{locating ? 'Obteniendo tu ubicación…' : 'Usar mi ubicación como punto de partida'}<b>›</b></button>
        </div>
        <button className="sheet-cta" onClick={onRequest}>🚖 Pedir un viaje</button>
      </>}
    </div>
  </section>
}

function ActiveTrip({ trip, onCancel }: { trip: Trip; onCancel: (trip: Trip) => void }) {
  return <section className="active-trip" id="active-trip"><div className="active-trip-head"><div><span className={`trip-status ${trip.estado.toLowerCase()}`}>{ESTADO_LABEL[trip.estado]}</span><h2>{STATUS_HINT[trip.estado]}</h2></div><strong>{money(trip.tarifaFinal ?? trip.tarifaEstimada)}</strong></div><div className="trip-progress"><span style={{ width: `${progresoViaje(trip.estado)}%` }}/></div><div className="active-trip-grid"><Route trip={trip}/><div className="driver-card">{trip.conductorId ? <><span className="driver-avatar">{initials(trip.conductorNombre ?? 'Conductor')}</span><div><small>TU CONDUCTOR</small><strong>{trip.conductorNombre}</strong><p>{vehicle(trip)}</p>{trip.conductorCalificacion != null && <em>★ {trip.conductorCalificacion.toFixed(1)}</em>}</div></> : <><span className="searching-driver">⌁</span><div><small>CONDUCTOR</small><strong>Buscando disponibilidad</strong><p>La asignación aparecerá aquí automáticamente.</p></div></>}</div></div>{puedeCancelar(trip.estado) && <button className="cancel-trip" onClick={() => onCancel(trip)}>Cancelar viaje</button>}</section>
}

function TrackingPage({ trip, position, onCancel, onBack }: { trip: Trip | null; position: TripPosition | null; onCancel: (trip: Trip) => void; onBack: () => void }) {
  if (!trip) return <EmptyState title="No hay un viaje para seguir" text="Cuando tengas un viaje activo podrás ver aquí cada cambio." action="Volver al inicio" onAction={onBack}/>
  return <div className="passenger-page tracking-page"><button className="tracking-back" onClick={onBack}>← Volver al inicio</button><section className="tracking-hero"><div><span className={`trip-status ${trip.estado.toLowerCase()}`}>{ESTADO_LABEL[trip.estado]}</span><h2>{STATUS_HINT[trip.estado]}</h2><p>Los cambios se muestran automáticamente.</p></div><strong>{money(trip.tarifaFinal ?? trip.tarifaEstimada)}</strong></section><div className="trip-progress tracking-progress"><span style={{ width: `${progresoViaje(trip.estado)}%` }}/></div><TripTrackingMap trip={trip} position={position}/><div className="tracking-layout"><section className="tracking-main"><h3>Recorrido</h3><Route trip={trip}/><div className="tracking-position"><span>⌖</span><div><small>UBICACIÓN DEL CONDUCTOR</small>{position ? <><strong>Actualizada {date(position.recordedAt)}</strong><p>{position.lat.toFixed(5)}, {position.lng.toFixed(5)}</p></> : <><strong>{trip.conductorId ? 'Esperando la primera actualización' : 'Se mostrará cuando se asigne un conductor'}</strong><p>Ride solo enseña una posición que el conductor haya enviado realmente.</p></>}</div></div></section><aside className="tracking-driver"><h3>Conductor y vehículo</h3>{trip.conductorId ? <><div className="tracking-driver-profile"><span>{initials(trip.conductorNombre ?? 'Conductor')}</span><div><strong>{trip.conductorNombre}</strong>{trip.conductorCalificacion != null && <small>★ {trip.conductorCalificacion.toFixed(1)}</small>}</div></div><p>{vehicle(trip)}</p>{trip.conductorTelefono && <a href={`tel:${trip.conductorTelefono}`}>Llamar al conductor</a>}</> : <div className="tracking-search"><span>⌁</span><strong>Buscando conductor</strong><p>Cuando alguien acepte, aquí aparecerán sus datos y los del vehículo.</p></div>}</aside></div>{puedeCancelar(trip.estado) && <button className="tracking-cancel" onClick={() => onCancel(trip)}>Cancelar este viaje</button>}</div>
}

function RequestPage({ places, origin, destination, originPlaceId, destinationId, quote, route, quoting, locating, busy, activeTrip, onUseLocation, onOriginPoint, onDestinationPoint, onConfirm, onActive }: { places: Place[]; origin: Coordinates | null; destination: Place | null; originPlaceId: string; destinationId: string; quote: Quote | null; route: RoadRoute | null; quoting: boolean; locating: boolean; busy: boolean; activeTrip: Trip | null; onUseLocation: () => void; onOrigin: (id: string) => void; onOriginPoint: (place: Place) => void; onDestination: (id: string) => void; onDestinationPoint: (place: Place) => void; onConfirm: () => void; onActive: () => void }) {
  const [picking, setPicking] = useState<'origin' | 'destination'>('destination')
  const pickMap = async (lat: number, lng: number) => {
    const place = await reverseGeocode(lat, lng)
    if (picking === 'origin') onOriginPoint(place); else onDestinationPoint(place)
  }
  if (activeTrip) return <EmptyState title="Ya tienes un viaje en curso" text={`Primero termina o cancela el viaje hacia ${activeTrip.destinoTexto}.`} action="Ver mi viaje" onAction={onActive}/>
  const recent = places.filter((place) => place.source === 'recent').slice(0, 4)
  const quito = { lat: -0.1807, lng: -78.4678 }
  const quitoSuggestions = places.filter((place) => place.source === 'recommended').map((place) => ({ place, km: placeDistance(quito, place) })).sort((a, b) => a.km - b.km).slice(0, 4)
  const recommended = places.filter((place) => place.source === 'recommended').map((place) => ({ place, km: origin ? placeDistance(origin, place) : 0 })).sort((a, b) => a.km - b.km).slice(0, 4)
  return <div className="passenger-page request-page"><div className="request-layout"><section className="request-form"><span className="passenger-kicker">DEFINE TU RECORRIDO</span><h2>Origen y destino</h2><p>Busca cualquier dirección de Ecuador o elige un punto directamente en el mapa.</p><PlaceSearch key={`origin-${originPlaceId}-${origin?.lat}`} label="Punto de partida" value={origin?.label ?? ''} center={origin} saved={places} onFocus={() => setPicking('origin')} onSelect={onOriginPoint}/>{quitoSuggestions.length > 0 ? <QuickPlaces title="Sugerencias en Quito" items={quitoSuggestions} onSelect={(place) => { setPicking('origin'); onOriginPoint(place) }}/> : recent.length > 0 && <QuickPlaces title="Ubicaciones recientes" items={recent.map((place) => ({ place }))} onSelect={(place) => { setPicking('origin'); onOriginPoint(place) }}/>}<button className="location-button" disabled={locating} onClick={onUseLocation}>{locating ? 'Obteniendo ubicación…' : '◎ Usar mi ubicación actual'}</button><PlaceSearch key={`destination-${destinationId}-${destination?.lat}`} label="Destino" value={destination ? [destination.nombre, destination.direccion].filter(Boolean).join(', ') : ''} center={origin} saved={places} onFocus={() => setPicking('destination')} onSelect={onDestinationPoint}/>{origin && recommended.length > 0 ? <QuickPlaces title="Recomendados cerca de tu zona" items={recommended} onSelect={(place) => { setPicking('destination'); onDestinationPoint(place) }}/> : quitoSuggestions.length > 0 ? <QuickPlaces title="Destinos recomendados en Quito" items={quitoSuggestions} onSelect={(place) => { setPicking('destination'); onDestinationPoint(place) }}/> : recent.length > 0 && <QuickPlaces title="Destinos recientes" items={recent.map((place) => ({ place }))} onSelect={(place) => { setPicking('destination'); onDestinationPoint(place) }}/>}<small className="map-pick-hint">Al tocar el mapa cambiarás el {picking === 'origin' ? 'origen' : 'destino'}.</small></section><aside className="quote-card"><span className="passenger-kicker">RESUMEN</span><h3>Tu cotización</h3>{quoting && !quote ? <div className="quote-loading"><i/>Calculando la mejor tarifa…</div> : quote ? <><div className="quote-price"><span>Precio estimado</span><strong>{money(quote.total)}</strong></div><dl><div><dt>Distancia estimada</dt><dd>{quote.km.toFixed(2)} km</dd></div><div><dt>Tiempo estimado</dt><dd>{quote.minutos} min</dd></div><div><dt>Ruta</dt><dd>{route ? 'Por calles' : 'Estimación inicial'}</dd></div><div><dt>Tarifa</dt><dd>{quote.tarifaNombre}</dd></div></dl><button disabled={busy || quoting} onClick={onConfirm}>{busy ? 'Solicitando…' : quoting ? 'Ajustando ruta…' : `Confirmar por ${money(quote.total)}`}<b>→</b></button><small>El precio se calcula en el servidor con la distancia de la ruta.</small></> : <div className="quote-empty"><span>↗</span><p>Completa el origen y el destino para conocer el precio antes de confirmar.</p></div>}</aside></div><RideMap origin={origin} destination={destination} route={route} onPick={(lat, lng) => void pickMap(lat, lng)} className="request-map"/></div>
}

function placeDistance(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (value: number) => value * Math.PI / 180
  const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng)
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

function QuickPlaces({ title, items, onSelect }: { title: string; items: { place: Place; km?: number }[]; onSelect: (place: Place) => void }) {
  return <section className="quick-places"><span>{title}</span><div>{items.map(({ place, km }) => <button type="button" key={`${title}-${place.id}`} onClick={() => onSelect(place)}><b>⌖</b><span><strong>{place.nombre}</strong><small>{km != null ? `${km.toFixed(1)} km · ` : ''}{place.direccion}</small></span></button>)}</div></section>
}

function PlaceSearch({ label, value, center, saved, onFocus, onSelect }: { label: string; value: string; center: Coordinates | null; saved: Place[]; onFocus: () => void; onSelect: (place: Place) => void }) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<Place[]>([])
  const [searching, setSearching] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      if (query.trim().length < 3 || query === value) { setResults([]); return }
      setSearching(true)
      void searchPlaces(query, center ?? undefined, controller.signal)
        .then(setResults)
        .catch((error) => { if (!(error instanceof DOMException && error.name === 'AbortError')) setResults([]) })
        .finally(() => setSearching(false))
    }, 350)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [center, query, value])
  const choose = (place: Place) => { setQuery([place.nombre, place.direccion].filter(Boolean).join(', ')); setResults([]); onSelect(place) }
  const suggestions = results.length ? results : query.trim().length >= 3 ? saved.filter((place) => `${place.nombre} ${place.direccion}`.toLowerCase().includes(query.toLowerCase())).slice(0, 5) : []
  return <label className="place-search" onFocus={onFocus}><span>{label}</span><div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={label === 'Destino' ? '¿A dónde quieres ir?' : 'Busca calle, sitio o ciudad'} autoComplete="off"/>{searching && <i/>}</div>{suggestions.length > 0 && <ul>{suggestions.map((place) => <li key={place.id}><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(place)}><strong>{place.nombre}</strong><small>{place.direccion}</small></button></li>)}</ul>}</label>
}

function TripTrackingMap({ trip, position }: { trip: Trip; position: TripPosition | null }) {
  const [route, setRoute] = useState<RoadRoute | null>(null)
  const origin = useMemo(() => trip.origenLat != null && trip.origenLng != null ? { lat: trip.origenLat, lng: trip.origenLng, label: trip.origenTexto } : null, [trip.origenLat, trip.origenLng, trip.origenTexto])
  const destination = useMemo(() => trip.destinoLat != null && trip.destinoLng != null ? { id: `trip-${trip.id}`, nombre: trip.destinoTexto, direccion: '', lat: trip.destinoLat, lng: trip.destinoLng } : null, [trip.destinoLat, trip.destinoLng, trip.destinoTexto, trip.id])
  useEffect(() => {
    const controller = new AbortController()
    if (!origin || !destination) return () => controller.abort()
    void routeBetween(origin, destination, controller.signal).then(setRoute).catch(() => setRoute(null))
    return () => controller.abort()
  }, [destination, origin, trip.id])
  return <RideMap origin={origin} destination={destination} driver={position} route={route} className="tracking-map"/>
}

function TripsPage({ trips, busy, onCancel, onRate, onTrack }: { trips: Trip[]; busy: boolean; onCancel: (trip: Trip) => void; onRate: (trip: Trip) => void; onTrack: (trip: Trip) => void }) {
  return <div className="passenger-page trips-page"><section className="passenger-section-head"><div><span>HISTORIAL REAL</span><h2>Todos tus viajes</h2><p>{trips.length} {trips.length === 1 ? 'viaje registrado' : 'viajes registrados'}</p></div></section>{trips.length === 0 ? <EmptyState title="Aún no hay viajes" text="Tus solicitudes aparecerán aquí cuando pidas un viaje."/> : <div className="trip-history">{trips.map((trip) => <article key={trip.id}><TripRow trip={trip}/><div className="history-actions">{!esFinal(trip.estado) && <button onClick={() => onTrack(trip)}>Ver seguimiento</button>}{puedeCancelar(trip.estado) && <button onClick={() => onCancel(trip)}>Cancelar</button>}{trip.estado === 'FINALIZADO' && trip.conductorId && <button disabled={busy} onClick={() => onRate(trip)}>Calificar viaje</button>}</div></article>)}</div>}</div>
}

function NotificationsPage({ notifications }: { notifications: RideNotification[] }) {
  return <div className="passenger-page notifications-page"><section className="passenger-section-head"><div><span>ACTUALIZACIONES REALES</span><h2>Lo que ocurre con tu cuenta</h2><p>Los avisos aparecen cuando cambia un viaje o una solicitud.</p></div></section>{notifications.length === 0 ? <EmptyState title="No tienes avisos" text="Aquí aparecerán los cambios importantes de tus viajes."/> : <div className="notification-list">{notifications.map((item) => <article className={item.read ? '' : 'unread'} key={item.id}><span className="notification-mark">{item.read ? '✓' : '•'}</span><div><div className="notification-title"><h3>{item.title}</h3><time>{date(item.createdAt)}</time></div><p>{item.message}</p></div></article>)}</div>}</div>
}

function AddressesPage({ addresses, busy, onSave, onFavorite, onDelete }: { addresses: SavedAddress[]; busy: boolean; onSave: (label: string, address: string) => void; onFavorite: (address: SavedAddress) => void; onDelete: (address: SavedAddress) => void }) {
  const [label, setLabel] = useState('')
  const [address, setAddress] = useState('')
  const submit = () => {
    if (!label.trim() || !address.trim()) return
    onSave(label, address)
    setLabel(''); setAddress('')
  }
  return <div className="passenger-page addresses-page"><section className="passenger-section-head"><div><span>LUGARES PERSONALES</span><h2>Direcciones guardadas</h2><p>Guarda el punto donde estás para encontrarlo rápidamente en un próximo viaje.</p></div></section><div className="address-layout"><section className="address-form"><h3>Guardar mi ubicación actual</h3><p>Escribe cómo quieres reconocer este lugar. Las coordenadas se obtienen del navegador.</p><label>Nombre del lugar<input maxLength={40} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Ej. Casa, trabajo o universidad"/></label><label>Referencia visible<input maxLength={120} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Ej. Entrada principal, calle y sector"/></label><button disabled={busy || !label.trim() || !address.trim()} onClick={submit}>{busy ? 'Guardando…' : '⌖ Usar mi ubicación y guardar'}</button><small>Ride nunca te pedirá escribir coordenadas manualmente.</small></section><section className="address-list">{addresses.length === 0 ? <EmptyState title="No tienes direcciones guardadas" text="Guarda tu ubicación actual para usarla al pedir un viaje."/> : addresses.map((item) => <article key={item.id}><span className={item.favorite ? 'address-pin favorite' : 'address-pin'}>⌖</span><div><div className="address-title"><h3>{item.label}</h3>{item.favorite && <b>Favorita</b>}</div><p>{item.address}</p><small>Guardada el {date(item.lastUsedAt)}</small></div><div className="address-actions"><button disabled={busy} onClick={() => onFavorite(item)}>{item.favorite ? 'Quitar favorita' : 'Hacer favorita'}</button><button className="danger" disabled={busy} onClick={() => onDelete(item)}>Eliminar</button></div></article>)}</section></div></div>
}

function PaymentsPage({ methods, payments, trips, busy, onAddCash, onPreferred, onDelete }: { methods: PaymentMethod[]; payments: RidePayment[]; trips: Trip[]; busy: boolean; onAddCash: () => void; onPreferred: (method: PaymentMethod) => void; onDelete: (method: PaymentMethod) => void }) {
  const tripDestination = (tripId: string) => trips.find((trip) => trip.id === tripId)?.destinoTexto ?? 'Viaje Ride'
  const statusLabel: Record<RidePayment['status'], string> = { pendiente: 'Pendiente', completado: 'Completado', fallido: 'Fallido' }
  return <div className="passenger-page payments-page"><section className="passenger-section-head"><div><span>COBROS REGISTRADOS</span><h2>Formas de pago</h2><p>La aplicación no guarda números de tarjeta ni datos bancarios.</p></div></section><div className="payment-layout"><section className="payment-methods"><div className="payment-head"><h3>Tus opciones</h3>{!methods.some((method) => method.type === 'efectivo') && <button disabled={busy} onClick={onAddCash}>+ Agregar efectivo</button>}</div>{methods.length === 0 ? <div className="payment-empty"><span>$</span><h4>Sin formas de pago</h4><p>Puedes registrar efectivo ahora. Las tarjetas se habilitarán cuando Ride tenga una pasarela de pago real.</p><button disabled={busy} onClick={onAddCash}>{busy ? 'Agregando…' : 'Usar efectivo'}</button></div> : <div className="payment-method-list">{methods.map((method) => <article key={method.id}><span>{method.type === 'efectivo' ? '$' : '▣'}</span><div><strong>{method.type === 'efectivo' ? 'Efectivo' : 'Tarjeta tokenizada'}</strong><small>{method.preferred ? 'Opción principal' : `Agregada el ${date(method.createdAt)}`}</small></div><div className="payment-method-actions">{method.preferred ? <b>Principal</b> : <button disabled={busy} onClick={() => onPreferred(method)}>Elegir</button>}<button className="delete" disabled={busy} onClick={() => onDelete(method)}>Eliminar</button></div></article>)}</div>}<aside className="payment-security"><b>Pago seguro</b><p>Una tarjeta solo podrá agregarse mediante el token de una pasarela. Ride no aceptará ni almacenará el número escrito directamente.</p></aside></section><section className="payment-history"><h3>Movimientos</h3>{payments.length === 0 ? <p className="payment-no-history">Aún no tienes cobros registrados.</p> : payments.map((payment) => <article key={payment.id}><span className={`payment-state ${payment.status}`}>{statusLabel[payment.status]}</span><div><strong>{tripDestination(payment.tripId)}</strong><small>{date(payment.createdAt)} · {payment.type === 'reembolso' ? 'Reembolso' : payment.type === 'reintento' ? 'Reintento' : 'Pago'}</small></div><b>{money(payment.amount)}</b></article>)}</section></div></div>
}

function AccountPage({ user, trips, addresses, methods, onAddresses, onPayments }: { user: User; trips: Trip[]; addresses: SavedAddress[]; methods: PaymentMethod[]; onAddresses: () => void; onPayments: () => void }) {
  const completed = trips.filter((trip) => trip.estado === 'FINALIZADO').length
  return <div className="passenger-page account-page"><section className="account-hero"><span className="account-avatar">{initials(user.name)}</span><div><span className="passenger-kicker">PERFIL DE PASAJERO</span><h2>{user.name}</h2><p>Tu información de Ride y actividad reciente.</p></div></section><section className="account-layout"><div className="account-details"><h3>Datos personales</h3><dl><div><dt>Nombre</dt><dd>{user.name}</dd></div><div><dt>Correo</dt><dd>{user.email}</dd></div><div><dt>Teléfono</dt><dd>{user.phone || 'Sin teléfono registrado'}</dd></div><div><dt>Tipo de cuenta</dt><dd>Pasajero</dd></div></dl><div className="account-links"><button className="account-link" onClick={onAddresses}>Administrar {addresses.length} {addresses.length === 1 ? 'dirección guardada' : 'direcciones guardadas'} →</button><button className="account-link" onClick={onPayments}>Administrar {methods.length} {methods.length === 1 ? 'forma de pago' : 'formas de pago'} →</button></div></div><div className="account-summary"><span>VIAJES FINALIZADOS</span><strong>{completed}</strong><p>{trips.length - completed} solicitudes en otros estados</p></div></section></div>
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
  return createPortal(<div className="passenger-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="passenger-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><button className="dialog-close" onClick={onClose} aria-label="Cerrar">×</button><span className="dialog-mark">◇</span><h2 id="dialog-title">{title}</h2><p>{text}</p><div className="dialog-actions">{children}</div></section></div>, document.body)
}

export default PassengerDashboard
