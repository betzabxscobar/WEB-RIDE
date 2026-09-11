import { PanelPreview, SidebarDismiss, SidebarBackdrop, SidebarJourney } from './components/PanelPreview'
import { PanelAtmosphere } from './components/PanelAtmosphere'
import { ReactBitsEffects } from './components/ReactBitsEffects'
import './DriverDashboard.css'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { SupportPage, TripChat } from './components/RideExtras'
import logoTipo from './assets/LogoTipo.webp'
import { panelLabel, type Role, type User } from './lib/auth'
import { AppearanceSettings, useAppearance } from './components/AppearanceSettings'
import { AccountSettings } from './components/AccountSettings'
import { Home as HomeIcon, MapPin as MapPinIcon, MapPinned as ZonesIcon, Landmark as BankIcon, Truck as TruckIcon, FileText as FileTextIcon, HelpCircle as HelpCircleIcon, User as UserIcon, Settings as SettingsIcon, Menu as MenuIcon, WalletCards as WalletIcon, LogOut as LogOutIcon } from 'lucide-react'
import { DriverAccount, DriverHome, DriverNav, DriverTrips, DocumentsPage, EarningsPage, VehiclesPage } from './driver/DriverPages'
import { BankAccountsPage, WorkZonesPage } from './driver/DriverToolsPages'
import { initials, money } from './dashboard/formatters'
import {
  activateVehicle,
  deleteBankAccount,
  getDriverEarnings,
  getDriverIdentity,
  getMissingDriverRequirements,
  getDriverState,
  listBanks,
  listOwnBankAccounts,
  listOwnDocuments,
  listOwnVehicles,
  listWorkZones,
  ownDocumentUrl,
  saveVehicle,
  saveDriverIdentity,
  saveBankAccount,
  saveWorkZones,
  setDriverAvailability,
  uploadDriverDocument,
  type DriverState,
  type DriverEarnings,
  type DriverIdentity,
  type OwnDocument,
  type OwnVehicle,
  type Bank,
  type BankAccount,
  type WorkZone,
} from './lib/driver-account'
import {
  acceptTrip,
  advanceTrip,
  cancelTrip,
  confirmPaymentReceived,
  esFinal,
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

type Page = 'inicio' | 'viajes' | 'ganancias' | 'zonas' | 'bancos' | 'vehiculos' | 'documentos' | 'soporte' | 'cuenta' | 'configuracion'
type Props = { user: User; views: Role[]; activeView: Role; onSwitchView: (view: Role) => void; onUserUpdate: (user: User) => void; onLogout: () => void }

const EMPTY_STATE: DriverState = { exists: false, approved: false, approvalStatus: 'pendiente', available: false, hasActiveVehicle: false, rating: null }
const EMPTY_IDENTITY: DriverIdentity = { cedula: '', fingerprintCode: '', licenseType: '', licenseExpiresAt: '' }

export default function DriverDashboard({ user, views, activeView, onSwitchView, onUserUpdate, onLogout }: Props) {
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
  const [zones, setZones] = useState<WorkZone[]>([])
  const [banks, setBanks] = useState<Bank[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [position, setPosition] = useState<TripPosition | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [ratingTrip, setRatingTrip] = useState<Trip | null>(null)
  const [chatTrip, setChatTrip] = useState<Trip | null>(null)
  const [startingTrip, setStartingTrip] = useState<Trip | null>(null)
  const [startCode, setStartCode] = useState('')
  const [cancelingTrip, setCancelingTrip] = useState<Trip | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [ratingScore, setRatingScore] = useState(5)
  const [ratingComment, setRatingComment] = useState('')
  const appearance = useAppearance()

  const activeTrip = useMemo(() => trips.find((trip) => !esFinal(trip.estado)) ?? null, [trips])

  const load = useCallback(async () => {
    try {
      // La vista administrativa es una demostración segura del panel. No debe
      // consultar ni crear una identidad operativa de conductor para el admin.
      if (user.role !== 'driver') {
        setState(EMPTY_STATE); setTrips([]); setRequests([]); setVehicles([]); setDocuments([])
        setEarnings({}); setIdentity(EMPTY_IDENTITY); setMissingRequirements([]); setZones([])
        setBanks([]); setBankAccounts([]); setPosition(null); setError('')
        return
      }
      const [nextState, nextTrips, nextVehicles, nextDocuments, nextEarnings, nextIdentity, nextMissing, nextZones, nextBanks, nextAccounts] = await Promise.all([
        getDriverState(user.id), listDriverTrips(user.id), listOwnVehicles(user.id), listOwnDocuments(user.id), getDriverEarnings(), getDriverIdentity(user.id), getMissingDriverRequirements(),
        listWorkZones(), listBanks(), listOwnBankAccounts(user.id),
      ])
      const active = nextTrips.find((trip) => !esFinal(trip.estado))
      const nextRequests = !active && nextState.approved && nextState.hasActiveVehicle && nextState.available ? await listOpenTripRequests() : []
      setState(nextState); setTrips(nextTrips); setVehicles(nextVehicles); setDocuments(nextDocuments); setEarnings(nextEarnings); setIdentity(nextIdentity); setMissingRequirements(nextMissing); setZones(nextZones); setBanks(nextBanks); setBankAccounts(nextAccounts); setRequests(nextRequests); setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos actualizar tu panel.')
    } finally { setLoading(false) }
  }, [user.id, user.role])

  useEffect(() => { queueMicrotask(() => void load()); return watchTrips(() => void load()) }, [load])

  // Las cuentas administrativas pueden revisar la experiencia, pero la base
  // solo permite operar viajes y publicar ubicación al rol conductor real.
  const isReviewOnly = user.role !== 'driver'
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

  const advance = (trip: Trip) => {
    if (trip.estado === 'CONDUCTOR_EN_ORIGEN') { setStartCode(''); setStartingTrip(trip); return }
    void action(() => advanceTrip(trip.id).then(() => undefined))
  }

  const startWithCode = () => {
    if (!startingTrip || !/^\d{6}$/.test(startCode)) { setError('Escribe los seis dígitos que muestra el pasajero.'); return }
    const trip = startingTrip
    void action(async () => { await advanceTrip(trip.id, startCode); setStartingTrip(null); setStartCode('') }, 'Código correcto. El viaje comenzó.')
  }

  const cancelWithReason = () => {
    if (!cancelingTrip) return
    const trip = cancelingTrip
    void action(async () => { await cancelTrip(trip.id, cancelReason); setCancelingTrip(null); setCancelReason('') }, 'Viaje cancelado y motivo registrado.')
  }

  const go = (next: Page) => { window.scrollTo({ top: 0, behavior: 'instant' }); setPage(next); setSidebarOpen(false); setError(''); setNotice('') }
  const canWork = !isReviewOnly && state.approved && state.hasActiveVehicle

  return <main className={`driver-shell ${appearance.darkMode ? 'theme-dark' : ''} ${appearance.reducedMotion ? 'reduced-motion' : ''} ${sidebarOpen ? 'sidebar-open' : ''}`}><ReactBitsEffects/>
    <aside id="driver-sidebar" className="driver-sidebar" aria-hidden={!sidebarOpen} inert={!sidebarOpen}><SidebarDismiss onClose={() => setSidebarOpen(false)} />
      <div className="driver-brand"><img src={logoTipo} alt="Ride"/><b>Ride</b></div>
      <SidebarJourney kind="driver" />
      <nav aria-label="Panel del conductor">
        <DriverNav active={page === 'inicio'} icon={<HomeIcon size={18} />} label="Inicio" onClick={() => go('inicio')}/>
        <DriverNav active={page === 'viajes'} icon={<MapPinIcon size={18} />} label="Viajes" onClick={() => go('viajes')}/>
        <DriverNav active={page === 'ganancias'} icon={<WalletIcon size={18} />} label="Ganancias" onClick={() => go('ganancias')}/>
        <DriverNav active={page === 'zonas'} icon={<ZonesIcon size={18} />} label="Zonas de trabajo" onClick={() => go('zonas')}/>
        <DriverNav active={page === 'bancos'} icon={<BankIcon size={18} />} label="Cuentas bancarias" onClick={() => go('bancos')}/>
        <DriverNav active={page === 'vehiculos'} icon={<TruckIcon size={18} />} label="Vehículos" onClick={() => go('vehiculos')}/>
        <DriverNav active={page === 'documentos'} icon={<FileTextIcon size={18} />} label="Documentos" onClick={() => go('documentos')}/>
        <DriverNav active={page === 'soporte'} icon={<HelpCircleIcon size={18} />} label="Soporte" onClick={() => go('soporte')}/>
        <DriverNav active={page === 'cuenta'} icon={<UserIcon size={18} />} label="Mi cuenta" onClick={() => go('cuenta')}/>
        <DriverNav active={page === 'configuracion'} icon={<SettingsIcon size={18} />} label="Configuración" onClick={() => go('configuracion')}/>
      </nav>
      <div className="driver-profile"><span>{initials(user.name)}</span><div><strong>{user.name}</strong><small>Conductor</small></div></div>
      <button className="driver-logout" onClick={onLogout}><LogOutIcon size={17} aria-hidden /><span>Cerrar sesión</span></button>
    </aside>
    {sidebarOpen && <SidebarBackdrop onClose={() => setSidebarOpen(false)} />}
      <section className="driver-workspace">
      <PanelPreview role={user.role} activeView={activeView} onSwitchView={onSwitchView} />
      <header className="driver-topbar"><button type="button" className="driver-hamburger" aria-controls="driver-sidebar" aria-expanded={sidebarOpen} aria-label="Alternar menú" onClick={() => setSidebarOpen((value) => !value)}><MenuIcon size={18} aria-hidden /></button><div><span>PANEL DE CONDUCTOR</span><h1>{page === 'inicio' ? `Hola, ${user.name.split(' ')[0]}` : page === 'viajes' ? 'Tus viajes' : page === 'ganancias' ? 'Tus ganancias' : page === 'zonas' ? 'Zonas de trabajo' : page === 'bancos' ? 'Cuentas bancarias' : page === 'vehiculos' ? 'Tus vehículos' : page === 'documentos' ? 'Tus documentos' : page === 'soporte' ? 'Soporte' : page === 'configuracion' ? 'Configuración' : 'Tu cuenta'}</h1></div><div className="driver-top-actions">{views.length > 1 && <label className="driver-view-select"><span>Vista</span><select value={activeView} onChange={(event) => onSwitchView(event.target.value as Role)}>{views.map((view) => <option key={view} value={view}>{panelLabel(view)}</option>)}</select></label>}<button className="driver-avatar" onClick={() => go('cuenta')}>{initials(user.name)}</button></div></header>
      <PanelAtmosphere kind="driver" />
      <div className="driver-content">
        {isReviewOnly && <div className="driver-review-notice">Vista de revisión: puedes recorrer el panel, pero una cuenta administradora no puede ponerse en línea, aceptar ni finalizar viajes.</div>}
        {notice && <div className="driver-feedback success">✓ {notice}</div>}{error && <div className="driver-feedback failure">! {error}<button onClick={() => setError('')}>Cerrar</button></div>}
        {loading ? <div className="driver-loading"><span><MapPinIcon size={22} aria-hidden /></span><div><strong>Actualizando tu ruta de trabajo</strong><small>Sincronizando viajes, vehículo y disponibilidad…</small></div><i aria-hidden /></div> : page === 'inicio' ? <DriverHome state={state} active={activeTrip} requests={requests} position={position} busy={busy} reviewOnly={isReviewOnly} onAvailability={toggleAvailability} onTrips={() => go('viajes')} onProfile={() => go('documentos')} onReport={() => reportPosition(activeTrip?.id)}/>
          : page === 'viajes' ? <DriverTrips active={activeTrip} requests={requests} history={trips} position={position} busy={busy} canWork={canWork} available={state.available} onAccept={(trip) => void action(() => acceptTrip(trip.id), 'Solicitud aceptada.')} onAdvance={advance} onFinish={finalize} onCancel={(trip) => { setCancelReason(''); setCancelingTrip(trip) }} onConfirmPayment={(trip) => void action(() => confirmPaymentReceived(trip.id), 'Pago recibido y registrado.')} onChat={setChatTrip}/>
          : page === 'ganancias' ? <EarningsPage earnings={earnings} reviewOnly={isReviewOnly}/>
          : page === 'zonas' ? <WorkZonesPage zones={zones} busy={busy} reviewOnly={isReviewOnly} onSave={(ids) => void action(() => saveWorkZones(ids), 'Tus zonas de trabajo quedaron actualizadas.')}/>
          : page === 'bancos' ? <BankAccountsPage banks={banks} accounts={bankAccounts} busy={busy} reviewOnly={isReviewOnly} onSave={(input) => void action(() => saveBankAccount(input).then(() => undefined), 'Cuenta bancaria guardada.')} onDelete={(id) => void action(() => deleteBankAccount(id), 'Cuenta bancaria eliminada.')}/>
          : page === 'vehiculos' ? <VehiclesPage vehicles={vehicles} busy={busy} onSave={(input) => void action(() => saveVehicle(input).then(() => undefined), 'Vehículo guardado.')} onActivate={(id) => void action(() => activateVehicle(id), 'Vehículo activado.')}/>
          : page === 'documentos' ? <DocumentsPage identity={identity} missing={missingRequirements} vehicles={vehicles} documents={documents} busy={busy} reviewOnly={isReviewOnly} onIdentity={(input) => void action(() => saveDriverIdentity(input), 'Identidad y licencia guardadas.')} onUpload={(type, file, options) => void action(() => uploadDriverDocument(user.id, type, file, options), 'Documento enviado para revisión.')} onOpen={async (path) => { try { window.open(await ownDocumentUrl(path), '_blank', 'noopener,noreferrer') } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo abrir el documento.') } }}/>
          : page === 'soporte' ? <SupportPage userId={user.id} trips={trips}/>
          : page === 'configuracion' ? <div className="driver-page settings-page"><section className="driver-section-head"><span>PREFERENCIAS</span><h2>Configuración</h2><p>Personaliza todos los paneles de Ride.</p></section><AccountSettings user={user} onUserUpdate={onUserUpdate}/><AppearanceSettings theme={appearance.theme} reducedMotion={appearance.reducedMotion} onTheme={appearance.setTheme} onReducedMotion={appearance.setReducedMotion}/></div>
          : <DriverAccount user={user} state={state} vehicles={vehicles} documents={documents}/>
        }
      </div>
    </section>
    <nav className="driver-mobile-nav"><DriverNav active={page === 'inicio'} icon={<HomeIcon size={18} />} label="Inicio" onClick={() => go('inicio')}/><DriverNav active={page === 'viajes'} icon={<MapPinIcon size={18} />} label="Viajes" onClick={() => go('viajes')}/><DriverNav active={page === 'vehiculos'} icon={<TruckIcon size={18} />} label="Autos" onClick={() => go('vehiculos')}/><DriverNav active={page === 'documentos'} icon={<FileTextIcon size={18} />} label="Docs" onClick={() => go('documentos')}/><DriverNav active={page === 'cuenta'} icon={<UserIcon size={18} />} label="Cuenta" onClick={() => go('cuenta')}/></nav>
    {ratingTrip && <div className="driver-dialog-backdrop"><section className="driver-dialog"><button onClick={() => setRatingTrip(null)}>×</button><h2>¿Cómo estuvo el pasajero?</h2><p>Califica a {ratingTrip.pasajeroNombre}.</p><div className="driver-rating">{[1,2,3,4,5].map((score) => <button key={score} className={score <= ratingScore ? 'selected' : ''} onClick={() => setRatingScore(score)}>★</button>)}</div><textarea maxLength={300} value={ratingComment} onChange={(event) => setRatingComment(event.target.value)} placeholder="Comentario opcional"/><button className="primary" disabled={busy} onClick={submitRating}>Enviar calificación</button></section></div>}
    {startingTrip && <div className="driver-dialog-backdrop"><section className="driver-dialog" role="dialog" aria-modal="true" aria-labelledby="start-trip-title"><button onClick={() => setStartingTrip(null)} aria-label="Cerrar">×</button><h2 id="start-trip-title">Código de inicio</h2><p>Pide al pasajero los seis dígitos que aparecen en su seguimiento. Así confirmamos que está dentro del vehículo correcto.</p><label className="driver-dialog-field">Código<input value={startCode} onChange={(event) => setStartCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000"/></label><button className="primary" disabled={busy || startCode.length !== 6} onClick={startWithCode}>{busy ? 'Comprobando…' : 'Validar y comenzar'}</button></section></div>}
    {cancelingTrip && <div className="driver-dialog-backdrop"><section className="driver-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-trip-title"><button onClick={() => setCancelingTrip(null)} aria-label="Cerrar">×</button><h2 id="cancel-trip-title">Cancelar viaje</h2><p>Indica brevemente el motivo. Quedará registrado para soporte y posibles reclamos.</p><label className="driver-dialog-field">Motivo<textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} maxLength={200} placeholder="Ej. el pasajero no se presentó"/></label><button className="primary danger" disabled={busy} onClick={cancelWithReason}>{busy ? 'Cancelando…' : 'Confirmar cancelación'}</button></section></div>}
    {chatTrip && <TripChat trip={chatTrip} userId={user.id} onClose={() => setChatTrip(null)}/>}
  </main>
}

