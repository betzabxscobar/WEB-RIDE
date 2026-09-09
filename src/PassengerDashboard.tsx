import { PanelPreview, SidebarDismiss, SidebarBackdrop } from './components/PanelPreview'
import { PanelAtmosphere } from './components/PanelAtmosphere'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import './PassengerDashboard.css'
import logoTipo from './assets/LogoTipo.png'
import seguroImg from './assets/seguro.png'
import sostenibleImg from './assets/sostenible.png'
import confiableImg from './assets/confiable.png'
import RideMap from './components/RideMap'
import RequestPage from './passenger/RequestPage'
import { dateTime as date, initials, money } from './dashboard/formatters'
import { AppearanceSettings } from './components/AppearanceSettings'
import { AccountSettings } from './components/AccountSettings'
import { Home as HomeIcon, CarFront as RideRequestIcon, List as ListIcon, Bell as BellIcon, MapPin as MapPinIcon, DollarSign as DollarSignIcon, HelpCircle as HelpCircleIcon, User as UserIcon, Settings as SettingsIcon, CheckCircle2, AlertCircle, ArrowRight, Search, LogOut, Menu as MenuIcon } from 'lucide-react'
import { SupportPage, TripChat } from './components/RideExtras'
import { convertPassengerToDriver, panelLabel, type Role, type User } from './lib/auth'
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
  createDeunaCharge,
  deletePaymentMethod,
  listPaymentMethods,
  listPaymentsForTrips,
  registerCashPayment,
  registerDeunaPayment,
  registerTransferPayment,
  type DeunaCharge,
  type PaymentMethod,
  type RidePayment,
} from './lib/payments'
import { listDriverBankAccountsForTrip, type BankAccount } from './lib/driver-account'
import {
  cancelTrip,
  esFinal,
  ESTADO_LABEL,
  getLatestTripPosition,
  getTripStartCode,
  hasRatedTrip,
  listPassengerTrips,
  listPlaces,
  progresoViaje,
  puedeCancelar,
  quoteTripCategories,
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
  type VehicleCategoryQuote,
} from './lib/trips'

type Page = 'inicio' | 'pedir' | 'seguimiento' | 'viajes' | 'avisos' | 'direcciones' | 'pagos' | 'soporte' | 'cuenta' | 'configuracion'
type ThemePreference = 'system' | 'light' | 'dark'

type Props = {
  user: User
  views: Role[]
  activeView: Role
  onSwitchView: (view: Role) => void
  onUserUpdate: (user: User) => void
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

function vehicle(trip: Trip): string {
  const model = [trip.vehiculoMarca, trip.vehiculoModelo].filter(Boolean).join(' ')
  return [model || 'Vehículo asignado', trip.vehiculoColor, trip.vehiculoPlaca].filter(Boolean).join(' · ')
}

function PassengerDashboard({ user, views, activeView, onSwitchView, onUserUpdate, onLogout }: Props) {
  const [page, setPage] = useState<Page>('inicio')
  const [sidebarOpen, setSidebarOpen] = useState(false)
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
  const [categoryQuotes, setCategoryQuotes] = useState<VehicleCategoryQuote[]>([])
  const [selectedCategory, setSelectedCategory] = useState('estandar')
  const [pickupReference, setPickupReference] = useState('')
  const [locating, setLocating] = useState(false)
  const [quoting, setQuoting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [canceling, setCanceling] = useState<Trip | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [rating, setRating] = useState<Trip | null>(null)
  const [ratingScore, setRatingScore] = useState(5)
  const [ratingComment, setRatingComment] = useState('')
  const [notifications, setNotifications] = useState<RideNotification[]>([])
  const [addresses, setAddresses] = useState<SavedAddress[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [payments, setPayments] = useState<RidePayment[]>([])
  const [deunaCharge, setDeunaCharge] = useState<DeunaCharge | null>(null)
  const [trackingTripId, setTrackingTripId] = useState<string | null>(null)
  const [chatTrip, setChatTrip] = useState<Trip | null>(null)
  const [tripPosition, setTripPosition] = useState<TripPosition | null>(null)
  const [offeredRatingTripId, setOfferedRatingTripId] = useState<string | null>(null)
  const [theme, setTheme] = useState<ThemePreference>(() => (localStorage.getItem('ride-theme') as ThemePreference | null) ?? 'system')
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [reducedMotion, setReducedMotion] = useState(() => localStorage.getItem('ride-reduced-motion') === 'true')

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const changeTheme = (next: ThemePreference) => {
    setTheme(next)
    localStorage.setItem('ride-theme', next)
  }
  const changeReducedMotion = (enabled: boolean) => {
    setReducedMotion(enabled)
    localStorage.setItem('ride-reduced-motion', String(enabled))
  }
  const darkMode = theme === 'dark' || (theme === 'system' && systemDark)

  useEffect(() => {
    document.documentElement.dataset.rideTheme = darkMode ? 'dark' : 'light'
    return () => { delete document.documentElement.dataset.rideTheme }
  }, [darkMode])

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

    void quoteTripCategories(origin, destination)
      .then((options) => { if (current) { setCategoryQuotes(options); setQuote(options.find((item) => item.categoria === selectedCategory) ?? options[0] ?? null); setError('') } })
      .catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : 'No pudimos cotizar el viaje.') })

    void routeBetween(origin, destination, controller.signal)
      .then(async (route) => {
        if (!current || !route) return
        setRoadRoute(route)
        const options = await quoteTripCategories(origin, destination, route.meters / 1000)
        if (current) { setCategoryQuotes(options); setQuote(options.find((item) => item.categoria === selectedCategory) ?? options[0] ?? null) }
      })
      .catch((cause) => {
        if (current && !(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError('No pudimos trazar la ruta; la cotización sigue disponible.')
        }
      })
      .finally(() => { if (current) setQuoting(false) })

    return () => { current = false; controller.abort() }
  }, [origin, destination, selectedCategory])

  const chooseCategory = (category: string) => {
    setSelectedCategory(category)
    const selected = categoryQuotes.find((item) => item.categoria === category)
    if (selected) setQuote(selected)
  }

  const selectOriginPoint = (place: Place) => {
    setQuote(null); setOriginPlaceId(place.id)
    setOrigin({ lat: place.lat, lng: place.lng, label: [place.nombre, place.direccion].filter(Boolean).join(', ') })
  }

  const selectDestinationPoint = (place: Place) => {
    setQuote(null); setDestinationId(place.id); setDestinationPoint(place)
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
      await requestTrip(origin, destination, quote, pickupReference)
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
      await cancelTrip(canceling.id, cancelReason)
      setCanceling(null)
      setCancelReason('')
      setNotice(canceling.estado === 'CONDUCTOR_EN_ORIGEN' ? 'El viaje fue cancelado. Se registró la multa de $1.00 por cancelar cuando el chofer ya estaba en el punto.' : 'El viaje fue cancelado.')
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
    window.scrollTo({ top: 0, behavior: 'instant' })
    setPage(next); setError(''); setNotice('')
  }
  const openCancel = (trip: Trip) => { setCancelReason(''); setCanceling(trip) }

  const navTo = (next: Page) => {
    go(next)
    try {
      if (typeof window !== 'undefined' && window.innerWidth <= 1050) setSidebarOpen(false)
    } catch {
      /* ignore */
    }
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

  const addDeuna = async () => {
    setBusy(true); setError(''); setNotice('')
    try { await registerDeunaPayment(); await loadPaymentData(); setNotice('DeUna quedó como opción principal.') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo registrar DeUna.') }
    finally { setBusy(false) }
  }

  const addTransfer = async () => {
    setBusy(true); setError(''); setNotice('')
    try { await registerTransferPayment(); await loadPaymentData(); setNotice('La transferencia quedó como opción principal.') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo registrar la transferencia.') }
    finally { setBusy(false) }
  }

  const payWithDeuna = async (trip: Trip) => {
    setBusy(true); setError('')
    try { setDeunaCharge(await createDeunaCharge(trip.id)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo generar el cobro.') }
    finally { setBusy(false) }
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

  const becomeDriver = async (): Promise<boolean> => {
    setBusy(true); setError(''); setNotice('')
    try {
      const updated = await convertPassengerToDriver()
      onUserUpdate(updated)
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos cambiar tu cuenta a chofer.')
      return false
    } finally { setBusy(false) }
  }

  return <main className={`passenger-shell ${darkMode ? 'theme-dark' : 'theme-light'} ${reducedMotion ? 'reduced-motion' : ''} ${sidebarOpen ? 'sidebar-open' : ''}`}>
    <div className="passenger-sidebar-trigger" aria-hidden="true"/>
    <aside id="passenger-sidebar" className={`passenger-sidebar ${sidebarOpen ? '' : 'collapsed'}`} inert={!sidebarOpen}><SidebarDismiss onClose={() => setSidebarOpen(false)} />
      <div className="passenger-brand"><img src={logoTipo} alt="Ride"/><b>Ride</b></div>
      <nav aria-label="Panel del pasajero">
        <NavButton active={page === 'inicio'} icon={<HomeIcon size={16} />} label="Inicio" onClick={() => navTo('inicio')}/>
        <NavButton active={page === 'pedir'} icon={<RideRequestIcon size={16} />} label="Pedir viaje" onClick={() => navTo('pedir')}/>
        <NavButton active={page === 'viajes'} icon={<ListIcon size={16} />} label="Mis viajes" onClick={() => navTo('viajes')}/>
        <NavButton active={page === 'avisos'} icon={<BellIcon size={16} />} label="Avisos" onClick={() => { openNotifications(); if (typeof window !== 'undefined' && window.innerWidth <= 1050) setSidebarOpen(false) }} />
        <NavButton active={page === 'direcciones'} icon={<MapPinIcon size={16} />} label="Direcciones" onClick={() => navTo('direcciones')}/>
        <NavButton active={page === 'pagos'} icon={<DollarSignIcon size={16} />} label="Pagos" onClick={() => navTo('pagos')}/>
        <NavButton active={page === 'soporte'} icon={<HelpCircleIcon size={16} />} label="Soporte" onClick={() => navTo('soporte')}/>
        <NavButton active={page === 'cuenta'} icon={<UserIcon size={16} />} label="Mi cuenta" onClick={() => navTo('cuenta')}/>
        <NavButton active={page === 'configuracion'} icon={<SettingsIcon size={16} />} label="Configuración" onClick={() => navTo('configuracion')}/>
      </nav>
      <div className="passenger-profile">
        <span>{initials(user.name)}</span>
        <div><strong>{user.name}</strong><small>Pasajero</small></div>
      </div>
      <button className="passenger-logout" onClick={onLogout}><LogOut size={17} aria-hidden /><span>Cerrar sesión</span></button>
    </aside>

    {sidebarOpen && <SidebarBackdrop onClose={() => setSidebarOpen(false)} />}
      <section className="passenger-workspace">
        <PanelAtmosphere kind="passenger" />
      <PanelPreview role={user.role} activeView={activeView} onSwitchView={onSwitchView} />
      <header className="passenger-topbar">
        <button type="button" aria-controls="passenger-sidebar" aria-expanded={sidebarOpen} aria-label="Alternar menú" className="hamburger-button" onClick={() => setSidebarOpen((v) => !v)}>
          <MenuIcon size={20} aria-hidden />
        </button>
        <div className="passenger-mobile-brand"><img src={logoTipo} alt="Ride"/><b>Ride</b></div>
        <div className="passenger-title">
          <span className="passenger-kicker">PANEL DE PASAJERO</span>
          <h1>{page === 'inicio' ? `Hola, ${user.name.split(' ')[0]}` : page === 'pedir' ? 'Pide un viaje' : page === 'seguimiento' ? 'Seguimiento del viaje' : page === 'viajes' ? 'Tus viajes' : page === 'avisos' ? 'Tus avisos' : page === 'direcciones' ? 'Tus direcciones' : page === 'pagos' ? 'Tus pagos' : page === 'soporte' ? 'Soporte' : page === 'configuracion' ? 'Configuración' : 'Tu cuenta'}</h1>
        </div>
        <div className="passenger-top-actions">
          {views.length > 1 && <label className="passenger-view-select"><span>Vista</span><select value={activeView} onChange={(event) => onSwitchView(event.target.value as Role)}>{views.map((view) => <option value={view} key={view}>{panelLabel(view)}</option>)}</select></label>}
          <button className="notification-button" onClick={openNotifications} aria-label={unread ? `${unread} avisos sin leer` : 'Abrir avisos'}><BellIcon size={19} aria-hidden />{unread > 0 && <b>{unread > 9 ? '9+' : unread}</b>}</button>
          <button className="passenger-avatar" onClick={() => go('cuenta')} aria-label="Abrir mi cuenta">{initials(user.name)}</button>
        </div>
      </header>

      <div className="passenger-content">
        {notice && <div className="passenger-feedback success"><CheckCircle2 size={18} aria-hidden />{notice}</div>}
        {error && <div className="passenger-feedback failure"><AlertCircle size={18} aria-hidden />{error}<button onClick={() => setError('')}>Cerrar</button></div>}
        {loading ? <LoadingPanel/> : page === 'inicio' ? <HomePage user={user} activeTrip={activeTrip} trips={trips} onRequest={() => go('pedir')} onTrips={() => go('viajes')} onCancel={openCancel} onTrack={openTracking}/>
          : page === 'pedir' ? <RequestPage places={places} origin={origin} destination={destination} originPlaceId={originPlaceId} destinationId={destinationId} quote={quote} categoryQuotes={categoryQuotes} selectedCategory={selectedCategory} pickupReference={pickupReference} route={roadRoute} quoting={quoting} locating={locating} busy={busy} activeTrip={activeTrip} onUseLocation={useLocation} onOriginPoint={selectOriginPoint} onDestinationPoint={selectDestinationPoint} onCategory={chooseCategory} onReference={setPickupReference} onConfirm={confirmRequest} onActive={() => activeTrip && openTracking(activeTrip)}/>
          : page === 'seguimiento' ? <TrackingPage trip={trackingTrip} position={tripPosition} canPayDeuna={paymentMethods.some((method) => method.type === 'deuna' && method.preferred)} canPayTransfer={paymentMethods.some((method) => method.type === 'transferencia' && method.preferred)} busy={busy} onPayDeuna={payWithDeuna} onCancel={openCancel} onChat={setChatTrip} onBack={() => go('inicio')}/>
          : page === 'viajes' ? <TripsPage trips={trips} busy={busy} onCancel={openCancel} onRate={openRating} onTrack={openTracking}/>
          : page === 'avisos' ? <NotificationsPage notifications={notifications}/>
          : page === 'direcciones' ? <AddressesPage addresses={addresses} busy={busy} onSave={saveCurrentAddress} onFavorite={toggleFavoriteAddress} onDelete={removeAddress}/>
          : page === 'pagos' ? <PaymentsPage methods={paymentMethods} payments={payments} trips={trips} busy={busy} onAddCash={addCashPayment} onAddDeuna={addDeuna} onAddTransfer={addTransfer} onPreferred={selectPreferredPayment} onDelete={removePaymentMethod}/>
          : page === 'soporte' ? <SupportPage userId={user.id} trips={trips}/>
          : page === 'configuracion' ? <SettingsPage user={user} onUserUpdate={onUserUpdate} theme={theme} reducedMotion={reducedMotion} canBecomeDriver={user.role === 'passenger'} busy={busy} onTheme={changeTheme} onReducedMotion={changeReducedMotion} onBecomeDriver={becomeDriver}/>
          : <AccountPage user={user} trips={trips} addresses={addresses} methods={paymentMethods} onAddresses={() => go('direcciones')} onPayments={() => go('pagos')} onSettings={() => go('configuracion')}/>
        }
      </div>
    </section>

    <nav className="passenger-mobile-nav" aria-label="Navegación móvil">
      <NavButton active={page === 'inicio'} icon={<HomeIcon size={16} />} label="Inicio" onClick={() => go('inicio')}/>
      <NavButton active={page === 'pedir'} icon={<RideRequestIcon size={16} />} label="Pedir" onClick={() => go('pedir')}/>
      <NavButton active={page === 'viajes'} icon={<ListIcon size={16} />} label="Viajes" onClick={() => go('viajes')}/>
      <NavButton active={page === 'avisos'} icon={<BellIcon size={16} />} label="Avisos" onClick={openNotifications}/>
      <NavButton active={page === 'cuenta'} icon={<UserIcon size={16} />} label="Cuenta" onClick={() => go('cuenta')}/>
    </nav>
    {chatTrip && <TripChat trip={chatTrip} userId={user.id} onClose={() => setChatTrip(null)}/>}
    {deunaCharge && <Dialog title={deunaCharge.alreadyPaid ? 'Este viaje ya está pagado' : 'Paga con DeUna'} text={deunaCharge.alreadyPaid ? 'No generamos otro cobro para evitar duplicarlo.' : `Orden ${deunaCharge.order} · ${money(deunaCharge.amount)}`} onClose={() => setDeunaCharge(null)}>{deunaCharge.qr && <img className="deuna-qr" src={deunaCharge.qr} alt="Código QR para pagar con DeUna"/>}{deunaCharge.deepLink && <a className="dialog-primary deuna-link" href={deunaCharge.deepLink}>Abrir DeUna</a>}<button className="dialog-secondary" onClick={() => setDeunaCharge(null)}>Cerrar</button></Dialog>}

    {canceling && <Dialog title="¿Cancelar este viaje?" text={canceling.estado === 'CONDUCTOR_EN_ORIGEN' ? `El chofer ya llegó al punto. Cancelar este viaje registrará una multa de $1.00.` : `Se cancelará el viaje hacia ${canceling.destinoTexto}.`} onClose={() => setCanceling(null)}><label className="cancel-reason">Motivo <small>opcional</small><textarea maxLength={200} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Ej. cambié de planes"/></label><button className="dialog-secondary" onClick={() => setCanceling(null)}>Volver</button><button className="dialog-danger" disabled={busy} onClick={confirmCancel}>{busy ? 'Cancelando…' : canceling.estado === 'CONDUCTOR_EN_ORIGEN' ? 'Cancelar y pagar $1.00' : 'Sí, cancelar'}</button></Dialog>}
    {rating && <Dialog title="Califica tu viaje" text={`¿Cómo estuvo tu experiencia con ${rating.conductorNombre ?? 'tu conductor'}?`} onClose={() => setRating(null)}><div className="rating-fields"><div className="rating-stars" aria-label="Puntuación">{[1,2,3,4,5].map((score) => <button key={score} className={score <= ratingScore ? 'selected' : ''} onClick={() => setRatingScore(score)} aria-label={`${score} estrellas`}>★</button>)}</div><label>Comentario opcional<textarea maxLength={300} value={ratingComment} onChange={(event) => setRatingComment(event.target.value)} placeholder="Cuéntanos cómo fue el viaje"/></label></div><button className="dialog-secondary" onClick={() => setRating(null)}>Ahora no</button><button className="dialog-primary" disabled={busy} onClick={submitRating}>{busy ? 'Guardando…' : 'Enviar calificación'}</button></Dialog>}
  </main>
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: import('react').ReactNode; label: string; onClick: () => void }) {
  return <button className={active ? 'active' : ''} onClick={onClick}><span>{icon}</span><span className="passenger-nav-label">{label}</span></button>
}

function LoadingPanel() {
  return <div className="passenger-loading"><i/><span>Actualizando tu información…</span></div>
}

function HomePage({ user, activeTrip, trips, onRequest, onTrips, onCancel, onTrack }: { user: User; activeTrip: Trip | null; trips: Trip[]; onRequest: () => void; onTrips: () => void; onCancel: (trip: Trip) => void; onTrack: (trip: Trip) => void }) {
  const recent = trips.filter((trip) => esFinal(trip.estado)).slice(0, 3)
  return <div className="passenger-page home-page">

    <section className="passenger-welcome"><div><span>{activeTrip ? 'VIAJE ACTIVO' : 'LISTO PARA SALIR'}</span><h2>{activeTrip ? STATUS_HINT[activeTrip.estado] : '¿A dónde vamos hoy?'}</h2><p>{activeTrip ? `Destino: ${activeTrip.destinoTexto}` : 'Elige tu punto de partida y destino. Ride calcula la tarifa antes de confirmar.'}</p></div>{activeTrip ? <button onClick={() => onTrack(activeTrip)}>Ver seguimiento</button> : <button onClick={onRequest}>Pedir un viaje <ArrowRight size={16} aria-hidden /></button>}</section>

    {/* Tres tarjetas de características: Seguro / Sostenible / Confiable */}
    <section className="home-features">
      <article className="feature-card feature-seguro">
        <img src={seguroImg} alt="Seguro" />
        <div>
          <h4>Seguro</h4>
          <p>Tecnología que te cuida</p>
        </div>
      </article>
      <article className="feature-card feature-sostenible">
        <img src={sostenibleImg} alt="Sostenible" />
        <div>
          <h4>Sostenible</h4>
          <p>Menos emisiones, más futuro</p>
        </div>
      </article>
      <article className="feature-card feature-confiable">
        <img src={confiableImg} alt="Confiable" />
        <div>
          <h4>Confiable</h4>
          <p>Personas reales, viajes memorables</p>
        </div>
      </article>
    </section>
    {activeTrip ? <ActiveTrip trip={activeTrip} onCancel={onCancel}/> : <section className="start-ride-card"><div className="route-mark"><i/><span/><b/></div><div><small>NUEVA SOLICITUD</small><h3>Tu viaje empieza con dos puntos</h3><p>Usa tu ubicación actual o elige una dirección en Ecuador.</p></div><button className="define-route-button" onClick={onRequest}>Definir ruta</button></section>}
    <section className="passenger-section-head"><div><span>ACTIVIDAD</span><h2>Viajes recientes</h2></div>{trips.length > 0 && <button onClick={onTrips}>Ver todos <ArrowRight size={16} aria-hidden /></button>}</section>
    {recent.length === 0 ? <EmptyState title="Aún no tienes viajes" text={`Cuando pidas el primero, ${user.name.split(' ')[0]}, podrás consultarlo aquí.`} action="Pedir mi primer viaje" onAction={onRequest}/> : <div className="recent-trip-list">{recent.map((trip) => <TripRow key={trip.id} trip={trip}/>)}</div>}
  </div>
}

function ActiveTrip({ trip, onCancel }: { trip: Trip; onCancel: (trip: Trip) => void }) {
  return <section className="active-trip" id="active-trip"><div className="active-trip-head"><div><span className={`trip-status ${trip.estado.toLowerCase()}`}>{ESTADO_LABEL[trip.estado]}</span><h2>{STATUS_HINT[trip.estado]}</h2></div><strong>{money(trip.tarifaFinal ?? trip.tarifaEstimada)}</strong></div><div className="trip-progress"><span style={{ width: `${progresoViaje(trip.estado)}%` }}/></div><div className="active-trip-grid"><Route trip={trip}/><div className="driver-card">{trip.conductorId ? <><span className="driver-avatar">{initials(trip.conductorNombre ?? 'Conductor')}</span><div><small>TU CONDUCTOR</small><strong>{trip.conductorNombre}</strong><p>{vehicle(trip)}</p>{trip.conductorCalificacion != null && <em>★ {trip.conductorCalificacion.toFixed(1)}</em>}</div></> : <><span className="searching-driver"><Search size={22} aria-hidden /></span><div><small>CONDUCTOR</small><strong>Buscando disponibilidad</strong><p>La asignación aparecerá aquí automáticamente.</p></div></>}</div></div>{puedeCancelar(trip.estado) && <button className="cancel-trip" onClick={() => onCancel(trip)}>Cancelar viaje</button>}</section>
}

function TrackingPage({ trip, position, canPayDeuna, canPayTransfer, busy, onPayDeuna, onCancel, onChat, onBack }: { trip: Trip | null; position: TripPosition | null; canPayDeuna: boolean; canPayTransfer: boolean; busy: boolean; onPayDeuna: (trip: Trip) => void; onCancel: (trip: Trip) => void; onChat: (trip: Trip) => void; onBack: () => void }) {
  if (!trip) return <EmptyState title="No hay un viaje para seguir" text="Cuando tengas un viaje activo podrás ver aquí cada cambio." action="Volver al inicio" onAction={onBack}/>
  return <div className="passenger-page tracking-page"><button className="tracking-back" onClick={onBack}>← Volver al inicio</button><section className="tracking-hero"><div><span className={`trip-status ${trip.estado.toLowerCase()}`}>{ESTADO_LABEL[trip.estado]}</span><h2>{STATUS_HINT[trip.estado]}</h2><p>Los cambios se muestran automáticamente.</p></div><strong>{money(trip.tarifaFinal ?? trip.tarifaEstimada)}</strong></section><div className="trip-progress tracking-progress"><span style={{ width: `${progresoViaje(trip.estado)}%` }}/></div>{trip.estado === 'CONDUCTOR_EN_ORIGEN' && <TripSecurityCode tripId={trip.id}/>}<TripTrackingMap trip={trip} position={position}/><div className="tracking-layout"><section className="tracking-main"><h3>Recorrido</h3><Route trip={trip}/>{trip.origenReferencia && <div className="pickup-note"><small>REFERENCIA DE RECOGIDA</small><strong>{trip.origenReferencia}</strong></div>}<div className="tracking-position"><span>⌖</span><div><small>UBICACIÓN DEL CONDUCTOR</small>{position ? <><strong>Actualizada {date(position.recordedAt)}</strong><p>{position.lat.toFixed(5)}, {position.lng.toFixed(5)}</p></> : <><strong>{trip.conductorId ? 'Esperando la primera actualización' : 'Se mostrará cuando se asigne un conductor'}</strong><p>Ride solo enseña una posición que el conductor haya enviado realmente.</p></>}</div></div></section><aside className="tracking-driver"><h3>Conductor y vehículo</h3>{trip.conductorId ? <><div className="tracking-driver-profile"><span>{initials(trip.conductorNombre ?? 'Conductor')}</span><div><strong>{trip.conductorNombre}</strong>{trip.conductorCalificacion != null && <small>★ {trip.conductorCalificacion.toFixed(1)}</small>}</div></div><p>{vehicle(trip)}</p><div className="tracking-contact">{trip.conductorTelefono && <a href={`tel:${trip.conductorTelefono}`}>Llamar</a>}<button onClick={() => onChat(trip)}>Abrir chat</button></div></> : <div className="tracking-search"><span>⌁</span><strong>Buscando conductor</strong><p>Cuando alguien acepte, aquí aparecerán sus datos y los del vehículo.</p></div>}</aside></div>{trip.estado === 'FINALIZADO' && canPayTransfer && trip.pagoEstado !== 'completado' && <TransferAccounts tripId={trip.id}/>} {trip.estado === 'FINALIZADO' && canPayDeuna && trip.pagoEstado !== 'completado' && <button className="tracking-pay" disabled={busy} onClick={() => onPayDeuna(trip)}>{busy ? 'Generando QR…' : 'Pagar con DeUna'}</button>}{puedeCancelar(trip.estado) && <button className="tracking-cancel" onClick={() => onCancel(trip)}>Cancelar este viaje</button>}</div>
}

function TripSecurityCode({ tripId }: { tripId: string }) {
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { let active = true; void getTripStartCode(tripId).then((value) => { if (active) setCode(value) }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'No se pudo cargar el código.') }); return () => { active = false } }, [tripId])
  return <section className="trip-security-code"><div><small>CÓDIGO DE INICIO</small><h3>{code ?? (error ? 'No disponible' : 'Generando…')}</h3></div><p>{error || 'Díctale estos seis números al chofer cuando estés dentro del vehículo. No los compartas antes.'}</p></section>
}

function TransferAccounts({ tripId }: { tripId: string }) {
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [error, setError] = useState('')
  useEffect(() => { let active = true; void listDriverBankAccountsForTrip(tripId).then((value) => { if (active) setAccounts(value) }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las cuentas.') }); return () => { active = false } }, [tripId])
  if (error) return <p className="transfer-error">{error}</p>
  return <section className="transfer-accounts"><small>TRANSFERENCIA DIRECTA</small><h3>Datos del chofer</h3><p>Transfiere desde tu banco y avisa al chofer. Ride no mueve el dinero ni solicita claves bancarias.</p>{accounts.map((account) => <article key={account.id}><div><strong>{account.bankName}</strong><small>Cuenta de {account.type}</small></div><button type="button" onClick={() => void navigator.clipboard.writeText(account.number)}>{account.number} · Copiar</button><span>{account.holder}{account.holderId ? ` · ${account.holderId}` : ''}</span></article>)}{accounts.length === 0 && <p>El chofer todavía no registró una cuenta bancaria.</p>}</section>
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
  return <div className="passenger-page trips-page"><section className="passenger-section-head"><div><span>HISTORIAL REAL</span><h2>Todos tus viajes</h2><p>{trips.length} {trips.length === 1 ? 'viaje registrado' : 'viajes registrados'}</p></div></section>{trips.length === 0 ? <EmptyState title="Aún no hay viajes" text="Tus solicitudes aparecerán aquí cuando pidas un viaje."/> : <div className="trip-history">{trips.map((trip) => <article key={trip.id}><TripRow trip={trip}/><div className="history-actions">{!esFinal(trip.estado) && <button className="passenger-primary-action" onClick={() => onTrack(trip)}>Ver seguimiento</button>}{puedeCancelar(trip.estado) && <button className="passenger-danger-action" onClick={() => onCancel(trip)}>Cancelar</button>}{trip.estado === 'FINALIZADO' && trip.conductorId && <button className="passenger-primary-action" disabled={busy} onClick={() => onRate(trip)}>Calificar viaje</button>}</div></article>)}</div>}</div>
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

function PaymentsPage({ methods, payments, trips, busy, onAddCash, onAddDeuna, onAddTransfer, onPreferred, onDelete }: { methods: PaymentMethod[]; payments: RidePayment[]; trips: Trip[]; busy: boolean; onAddCash: () => void; onAddDeuna: () => void; onAddTransfer: () => void; onPreferred: (method: PaymentMethod) => void; onDelete: (method: PaymentMethod) => void }) {
  const tripDestination = (tripId: string) => trips.find((trip) => trip.id === tripId)?.destinoTexto ?? 'Viaje Ride'
  const statusLabel: Record<RidePayment['status'], string> = { pendiente: 'Pendiente', completado: 'Completado', fallido: 'Fallido' }
  return <div className="passenger-page payments-page"><section className="passenger-section-head"><div><span>COBROS REGISTRADOS</span><h2>Formas de pago</h2><p>Efectivo, transferencia o DeUna. Ride nunca guarda tus datos bancarios.</p></div></section><div className="payment-layout"><section className="payment-methods"><div className="payment-head"><h3>Tus opciones</h3><div>{!methods.some((method) => method.type === 'efectivo') && <button disabled={busy} onClick={onAddCash}>+ Efectivo</button>}{!methods.some((method) => method.type === 'transferencia') && <button disabled={busy} onClick={onAddTransfer}>+ Transferencia</button>}{!methods.some((method) => method.type === 'deuna') && <button disabled={busy} onClick={onAddDeuna}>+ DeUna</button>}</div></div>{methods.length === 0 ? <div className="payment-empty"><span>$</span><h4>Sin formas de pago</h4><p>Registra efectivo, transferencia o DeUna para elegir cómo pagar tus viajes.</p><button disabled={busy} onClick={onAddCash}>{busy ? 'Agregando…' : 'Usar efectivo'}</button></div> : <div className="payment-method-list">{methods.map((method) => <article key={method.id}><span>{method.type === 'efectivo' ? '$' : method.type === 'deuna' ? 'QR' : method.type === 'transferencia' ? '⇄' : '▣'}</span><div><strong>{method.type === 'efectivo' ? 'Efectivo' : method.type === 'deuna' ? 'DeUna' : method.type === 'transferencia' ? 'Transferencia bancaria' : 'Tarjeta tokenizada'}</strong><small>{method.preferred ? 'Opción principal' : `Agregada el ${date(method.createdAt)}`}</small></div><div className="payment-method-actions">{method.preferred ? <b>Principal</b> : <button disabled={busy} onClick={() => onPreferred(method)}>Elegir</button>}<button className="delete" disabled={busy} onClick={() => onDelete(method)}>Eliminar</button></div></article>)}</div>}<aside className="payment-security"><b>Pago seguro</b><p>En una transferencia, Ride solo muestra la cuenta registrada por el chofer al terminar el viaje: el dinero va directamente a ella.</p></aside></section><section className="payment-history"><h3>Movimientos</h3>{payments.length === 0 ? <p className="payment-no-history">Aún no tienes cobros registrados.</p> : payments.map((payment) => <article key={payment.id}><span className={`payment-state ${payment.status}`}>{statusLabel[payment.status]}</span><div><strong>{tripDestination(payment.tripId)}</strong><small>{date(payment.createdAt)} · {payment.type === 'multa' ? 'Multa por cancelación tardía' : payment.type === 'reembolso' ? 'Reembolso' : payment.type === 'reintento' ? 'Reintento' : 'Pago'}</small></div><b>{money(payment.amount)}</b></article>)}</section></div></div>
}

function AccountPage({ user, trips, addresses, methods, onAddresses, onPayments, onSettings }: { user: User; trips: Trip[]; addresses: SavedAddress[]; methods: PaymentMethod[]; onAddresses: () => void; onPayments: () => void; onSettings: () => void }) {
  const completed = trips.filter((trip) => trip.estado === 'FINALIZADO').length
  return <div className="passenger-page account-page"><section className="account-hero">{user.avatarUrl ? <img className="account-avatar" src={user.avatarUrl} alt={`Foto de ${user.name}`}/> : <span className="account-avatar">{initials(user.name)}</span>}<div><span className="passenger-kicker">PERFIL DE PASAJERO</span><h2>{user.name}</h2><p>Tu información personal y actividad reciente.</p></div></section><section className="account-layout"><div className="account-details"><h3>Datos personales</h3><dl><div><dt>Nombre</dt><dd>{user.name}</dd></div><div><dt>Correo</dt><dd>{user.email}</dd></div><div><dt>Teléfono</dt><dd>{user.phone || 'Sin teléfono registrado'}</dd></div><div><dt>Tipo de cuenta</dt><dd>Pasajero</dd></div></dl><div className="account-links"><button className="account-link" onClick={onAddresses}>Administrar {addresses.length} {addresses.length === 1 ? 'dirección guardada' : 'direcciones guardadas'} →</button><button className="account-link" onClick={onPayments}>Administrar {methods.length} {methods.length === 1 ? 'forma de pago' : 'formas de pago'} →</button><button className="account-link" onClick={onSettings}>Abrir configuración →</button></div></div><div className="account-summary"><span>VIAJES FINALIZADOS</span><strong>{completed}</strong><p>{trips.length - completed} solicitudes en otros estados</p></div></section></div>
}

function SettingsPage({ user, onUserUpdate, theme, reducedMotion, canBecomeDriver, busy, onTheme, onReducedMotion, onBecomeDriver }: { user: User; onUserUpdate: (user: User) => void; theme: ThemePreference; reducedMotion: boolean; canBecomeDriver: boolean; busy: boolean; onTheme: (theme: ThemePreference) => void; onReducedMotion: (enabled: boolean) => void; onBecomeDriver: () => Promise<boolean> }) {
  const [confirmingDriver, setConfirmingDriver] = useState(false)
  return <div className="passenger-page settings-page"><section className="passenger-section-head"><div><span>PREFERENCIAS</span><h2>Configuración</h2><p>Personaliza cómo se ve y se comporta Ride en este navegador.</p></div></section><AccountSettings user={user} onUserUpdate={onUserUpdate}/><AppearanceSettings theme={theme} reducedMotion={reducedMotion} onTheme={onTheme} onReducedMotion={onReducedMotion}/>{canBecomeDriver && <section className="driver-conversion-card"><span><RideRequestIcon size={22} aria-hidden /></span><div><small>CONDUCIR CON RIDE</small><h3>Quiero ser chofer</h3><p>Usa esta misma cuenta, correo, teléfono e historial para comenzar tu registro como conductor.</p></div><button type="button" onClick={() => setConfirmingDriver(true)}>Comenzar registro</button></section>}{confirmingDriver && <Dialog title="¿Pasarte a chofer?" text="Tu cuenta conservará los viajes anteriores. Después deberás registrar un vehículo, subir tus documentos y esperar la aprobación administrativa antes de recibir solicitudes." onClose={() => setConfirmingDriver(false)}><button className="dialog-secondary" disabled={busy} onClick={() => setConfirmingDriver(false)}>Ahora no</button><button className="dialog-primary" disabled={busy} onClick={() => void onBecomeDriver().then((changed) => { if (changed) setConfirmingDriver(false) })}>{busy ? 'Actualizando…' : 'Sí, quiero conducir'}</button></Dialog>}</div>
}

function Route({ trip }: { trip: Trip }) {
  return <div className="trip-route-card"><div><i className="origin"/><span><small>ORIGEN</small><strong>{trip.origenTexto}</strong></span></div><b/><div><i className="destination"/><span><small>DESTINO</small><strong>{trip.destinoTexto}</strong></span></div></div>
}

function TripRow({ trip }: { trip: Trip }) {
  return <div className="passenger-trip-row"><span className="trip-date">{date(trip.fechaSolicitud)}</span><Route trip={trip}/><span className={`trip-status ${trip.estado.toLowerCase()}`}>{ESTADO_LABEL[trip.estado]}</span><strong className="trip-amount">{money(trip.tarifaFinal ?? trip.tarifaEstimada)}</strong></div>
}

function EmptyState({ title, text, action, onAction }: { title: string; text: string; action?: string; onAction?: () => void }) {
  return <section className="passenger-empty"><span>↗</span><h3>{title}</h3><p>{text}</p>{action && onAction && <button onClick={onAction}>{action}</button>}</section>
}

function Dialog({ title, text, children, onClose }: { title: string; text: string; children: React.ReactNode; onClose: () => void }) {
  return createPortal(<div className="passenger-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="passenger-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><button className="dialog-close" onClick={onClose} aria-label="Cerrar">×</button><span className="dialog-mark">◇</span><h2 id="dialog-title">{title}</h2><p>{text}</p><div className="dialog-actions">{children}</div></section></div>, document.body)
}

export default PassengerDashboard
