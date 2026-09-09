import { ArrowRight, Search } from 'lucide-react'
import confiableImg from '../assets/confiable.webp'
import seguroImg from '../assets/seguro.webp'
import sostenibleImg from '../assets/sostenible.webp'
import { dateTime as date, initials, money } from '../dashboard/formatters'
import type { User } from '../lib/auth'
import { esFinal, ESTADO_LABEL, progresoViaje, puedeCancelar, type Trip } from '../lib/trips'
import { STATUS_HINT, vehicle } from './tripPresentation'

export function HomePage({ user, activeTrip, trips, onRequest, onTrips, onCancel, onTrack }: { user: User; activeTrip: Trip | null; trips: Trip[]; onRequest: () => void; onTrips: () => void; onCancel: (trip: Trip) => void; onTrack: (trip: Trip) => void }) {
  const recent = trips.filter((trip) => esFinal(trip.estado)).slice(0, 3)
  return <div className="passenger-page home-page">
    <section className="passenger-welcome"><div><span>{activeTrip ? 'VIAJE ACTIVO' : 'LISTO PARA SALIR'}</span><h2>{activeTrip ? STATUS_HINT[activeTrip.estado] : '¿A dónde vamos hoy?'}</h2><p>{activeTrip ? `Destino: ${activeTrip.destinoTexto}` : 'Elige tu punto de partida y destino. Ride calcula la tarifa antes de confirmar.'}</p></div>{activeTrip ? <button onClick={() => onTrack(activeTrip)}>Ver seguimiento</button> : <button onClick={onRequest}>Pedir un viaje <ArrowRight size={16} aria-hidden /></button>}</section>
    <section className="home-features" aria-label="Beneficios de Ride">
      <article className="feature-card feature-seguro"><img src={seguroImg} alt="" /><div><h4>Seguro</h4><p>Tecnología que te cuida</p></div></article>
      <article className="feature-card feature-sostenible"><img src={sostenibleImg} alt="" /><div><h4>Sostenible</h4><p>Menos emisiones, más futuro</p></div></article>
      <article className="feature-card feature-confiable"><img src={confiableImg} alt="" /><div><h4>Confiable</h4><p>Personas reales, viajes memorables</p></div></article>
    </section>
    {activeTrip ? <ActiveTrip trip={activeTrip} onCancel={onCancel}/> : <section className="start-ride-card"><div className="route-mark"><i/><span/><b/></div><div><small>NUEVA SOLICITUD</small><h3>Tu viaje empieza con dos puntos</h3><p>Usa tu ubicación actual o elige una dirección en Ecuador.</p></div><button className="define-route-button" onClick={onRequest}>Definir ruta</button></section>}
    <section className="passenger-section-head"><div><span>ACTIVIDAD</span><h2>Viajes recientes</h2></div>{trips.length > 0 && <button onClick={onTrips}>Ver todos <ArrowRight size={16} aria-hidden /></button>}</section>
    {recent.length === 0 ? <EmptyState title="Aún no tienes viajes" text={`Cuando pidas el primero, ${user.name.split(' ')[0]}, podrás consultarlo aquí.`} action="Pedir mi primer viaje" onAction={onRequest}/> : <div className="recent-trip-list">{recent.map((trip) => <TripRow key={trip.id} trip={trip}/>)}</div>}
  </div>
}

function ActiveTrip({ trip, onCancel }: { trip: Trip; onCancel: (trip: Trip) => void }) {
  return <section className="active-trip" id="active-trip"><div className="active-trip-head"><div><span className={`trip-status ${trip.estado.toLowerCase()}`}>{ESTADO_LABEL[trip.estado]}</span><h2>{STATUS_HINT[trip.estado]}</h2></div><strong>{money(trip.tarifaFinal ?? trip.tarifaEstimada)}</strong></div><div className="trip-progress"><span style={{ width: `${progresoViaje(trip.estado)}%` }}/></div><div className="active-trip-grid"><Route trip={trip}/><div className="driver-card">{trip.conductorId ? <><span className="driver-avatar">{initials(trip.conductorNombre ?? 'Conductor')}</span><div><small>TU CONDUCTOR</small><strong>{trip.conductorNombre}</strong><p>{vehicle(trip)}</p>{trip.conductorCalificacion != null && <em>★ {trip.conductorCalificacion.toFixed(1)}</em>}</div></> : <><span className="searching-driver"><Search size={22} aria-hidden /></span><div><small>CONDUCTOR</small><strong>Buscando disponibilidad</strong><p>La asignación aparecerá aquí automáticamente.</p></div></>}</div></div>{puedeCancelar(trip.estado) && <button className="cancel-trip" onClick={() => onCancel(trip)}>Cancelar viaje</button>}</section>
}

export function Route({ trip }: { trip: Trip }) {
  return <div className="trip-route-card"><div><i className="origin"/><span><small>ORIGEN</small><strong>{trip.origenTexto}</strong></span></div><b/><div><i className="destination"/><span><small>DESTINO</small><strong>{trip.destinoTexto}</strong></span></div></div>
}

export function TripRow({ trip }: { trip: Trip }) {
  return <div className="passenger-trip-row"><span className="trip-date">{date(trip.fechaSolicitud)}</span><Route trip={trip}/><span className={`trip-status ${trip.estado.toLowerCase()}`}>{ESTADO_LABEL[trip.estado]}</span><strong className="trip-amount">{money(trip.tarifaFinal ?? trip.tarifaEstimada)}</strong></div>
}

export function EmptyState({ title, text, action, onAction }: { title: string; text: string; action?: string; onAction?: () => void }) {
  return <section className="passenger-empty"><span>↗</span><h3>{title}</h3><p>{text}</p>{action && onAction && <button onClick={onAction}>{action}</button>}</section>
}
