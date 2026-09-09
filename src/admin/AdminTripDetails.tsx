import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BadgeDollarSign,
  CarFront,
  CheckCircle2,
  Clock3,
  MapPin,
  Navigation,
  Route as RouteIcon,
  UserRound,
  X,
} from 'lucide-react'
import RideMap from '../components/RideMap'
import { money, shortDate } from '../dashboard/formatters'
import { routeBetween, type RoadRoute } from '../lib/routing'
import { ESTADO_LABEL, type Coordinates, type Place, type Trip } from '../lib/trips'
import './AdminTripDetails.css'

type Props = { trip: Trip; onClose: () => void }

const valueOrPending = (value: string | null | undefined) => value?.trim() || 'Sin registrar'

export default function AdminTripDetails({ trip, onClose }: Props) {
  const [route, setRoute] = useState<RoadRoute | null>(null)
  const origin = useMemo<Coordinates | null>(() => (
    trip.origenLat == null || trip.origenLng == null
      ? null
      : { lat: trip.origenLat, lng: trip.origenLng, label: trip.origenTexto }
  ), [trip])
  const destination = useMemo<Place | null>(() => (
    trip.destinoLat == null || trip.destinoLng == null
      ? null
      : { id: `trip-${trip.id}`, nombre: trip.destinoTexto, direccion: trip.destinoTexto, lat: trip.destinoLat, lng: trip.destinoLng }
  ), [trip])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  useEffect(() => {
    if (!origin || !destination) return
    const controller = new AbortController()
    void routeBetween(origin, destination, controller.signal).then(setRoute).catch(() => setRoute(null))
    return () => controller.abort()
  }, [destination, origin])

  const charged = trip.montoCobrado || trip.tarifaFinal || trip.tarifaEstimada
  const vehicle = [trip.vehiculoMarca, trip.vehiculoModelo, trip.vehiculoColor].filter(Boolean).join(' · ')

  return <div className="trip-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="trip-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="trip-detail-title">
      <header className="trip-detail-head">
        <div>
          <span>SEGUIMIENTO DEL VIAJE</span>
          <h2 id="trip-detail-title">{trip.origenTexto} → {trip.destinoTexto}</h2>
          <p><Clock3 size={14} aria-hidden />{shortDate(trip.fechaSolicitud)} · <b>{ESTADO_LABEL[trip.estado]}</b></p>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar detalle del viaje"><X size={20} /></button>
      </header>

      <div className="trip-detail-layout">
        <div className="trip-detail-map-wrap">
          {origin && destination
            ? <RideMap origin={origin} destination={destination} route={route} className="admin-trip-detail-map" />
            : <div className="trip-map-unavailable"><RouteIcon size={28} aria-hidden /><strong>Ruta sin coordenadas</strong><p>El viaje conserva las direcciones, pero no tiene puntos para dibujar el mapa.</p></div>}
          <div className="trip-route-summary">
            <span><MapPin size={17} aria-hidden /><small>Origen</small><b>{trip.origenTexto}</b>{trip.origenReferencia && <em>{trip.origenReferencia}</em>}</span>
            <span><Navigation size={17} aria-hidden /><small>Destino</small><b>{trip.destinoTexto}</b>{trip.destinoReferencia && <em>{trip.destinoReferencia}</em>}</span>
          </div>
        </div>

        <aside className="trip-detail-facts">
          <article><span><UserRound size={19} aria-hidden /></span><div><small>Pasajero</small><strong>{trip.pasajeroNombre}</strong><p>{valueOrPending(trip.pasajeroTelefono)}</p></div></article>
          <article><span><CarFront size={19} aria-hidden /></span><div><small>Conductor y vehículo</small><strong>{valueOrPending(trip.conductorNombre)}</strong><p>{vehicle || 'Vehículo sin registrar'}{trip.vehiculoPlaca ? ` · ${trip.vehiculoPlaca}` : ''}</p></div></article>
          <article><span><BadgeDollarSign size={19} aria-hidden /></span><div><small>Cobro</small><strong>{money(charged)}</strong><p>{trip.pagoEstado === 'completado' ? 'Pago confirmado' : trip.pagoEstado === 'fallido' ? 'Pago fallido' : 'Pendiente o por confirmar'}{trip.multa > 0 ? ` · Multa ${money(trip.multa)}` : ''}</p></div></article>
          <article><span><RouteIcon size={19} aria-hidden /></span><div><small>Recorrido</small><strong>{trip.distanciaRecorridaKm == null ? 'Sin medición final' : `${trip.distanciaRecorridaKm.toFixed(2)} km`}</strong><p>{trip.categoriaNombre || trip.tarifaNombre}</p></div></article>

          <div className="trip-safety-status">
            <span className={trip.llegadaVerificada ? 'ok' : ''}><CheckCircle2 size={16} aria-hidden />{trip.llegadaVerificada ? 'Llegada confirmada' : 'Llegada no confirmada'}</span>
            <span className={trip.desvioDetectado ? 'warning' : 'ok'}><AlertTriangle size={16} aria-hidden />{trip.desvioDetectado ? 'Desvío detectado' : 'Sin desvíos registrados'}</span>
          </div>

          {trip.estado === 'CANCELADO' && <div className="trip-cancellation"><strong>Cancelación</strong><p>{trip.motivoCancelacion || 'No se registró un motivo.'}</p>{trip.canceladoPor && <small>Cancelado por: {trip.canceladoPor}</small>}</div>}
        </aside>
      </div>
    </section>
  </div>
}
