import { CalendarDays as CalendarIcon, CarFront as CarIcon, CheckCircle2 as CheckIcon, CircleX as CancelIcon, MapPin as MapPinIcon, MoreVertical as MoreIcon, Navigation as NavigationIcon, User as UserIcon } from 'lucide-react'
import { initials, shortDate } from '../dashboard/formatters'
import type { User } from '../lib/auth'
import { esFinal, ESTADO_LABEL, type Trip } from '../lib/trips'

const roleLabel = (role: string) => role === 'superadmin' ? 'Superadmin' : role === 'admin' ? 'Admin' : role === 'driver' ? 'Conductor' : 'Pasajero'
const roleClass = (role: string) => role === 'admin' ? 'superadmin' : role
const paymentLabel = (trip: Trip) => trip.montoCobrado > 0 ? 'Cobrado' : trip.estado === 'FINALIZADO' ? 'Pago pendiente' : 'Estimado'
const paymentClass = (trip: Trip) => trip.montoCobrado > 0 ? 'paid' : trip.estado === 'FINALIZADO' ? 'pending' : 'estimated'

export function UserRows({ users, loading, error, limit }: { users: User[]; loading: boolean; error: string; limit?: number }) {
  const rows = limit == null ? users : users.slice(0, limit)
  return <>{error && <p className="admin-error">{error}</p>}{loading && <p className="admin-empty">Cargando usuarios…</p>}{!loading && !error && users.length === 0 && <p className="admin-empty">Todavía no hay cuentas registradas.</p>}{!loading && !error && rows.map((account) => <div className="user-row" key={account.id}><span>{initials(account.name)}</span><div><strong>{account.name}</strong><small>{account.email}</small></div><em className={roleClass(account.role)}>{roleLabel(account.role)}</em><time><CalendarIcon size={13} aria-hidden />{shortDate(account.createdAt)}</time></div>)}</>
}

export function TripRows({ trips, loading, error, limit }: { trips: Trip[]; loading: boolean; error: string; limit?: number }) {
  const rows = limit == null ? trips : trips.slice(0, limit)
  return <>{error && <p className="admin-error">{error}</p>}{loading && <p className="admin-empty">Cargando viajes...</p>}{!loading && !error && trips.length === 0 && <p className="admin-empty">No se encontraron viajes con estos filtros.</p>}{!loading && !error && rows.length > 0 && <div className="trips-table">{rows.map((trip) => <article className="trip-row" key={trip.id}><em className={`trip-state ${esFinal(trip.estado) ? trip.estado.toLowerCase() : 'activo'}`}>{trip.estado === 'FINALIZADO' && <CheckIcon size={11} aria-hidden />}{trip.estado === 'CANCELADO' && <CancelIcon size={11} aria-hidden />}{ESTADO_LABEL[trip.estado]}</em><div className="trip-route"><div className="route-point origin"><MapPinIcon size={15} aria-hidden /><span><small>Origen</small><strong>{trip.origenTexto}</strong></span></div><span className="route-line" aria-hidden /><div className="route-point destination"><NavigationIcon size={15} aria-hidden /><span><small>Destino</small><strong>{trip.destinoTexto}</strong></span></div></div><div className="trip-persons"><span><UserIcon size={14} aria-hidden /><b>{trip.pasajeroNombre}</b></span><span><CarIcon size={14} aria-hidden /><b>{trip.conductorNombre || 'Sin conductor'}{trip.vehiculoPlaca ? ` · ${trip.vehiculoPlaca}` : ''}</b></span></div><b className={`trip-amount ${paymentClass(trip)}`}><small>{paymentLabel(trip)}</small>${trip.montoCobrado > 0 ? trip.montoCobrado.toFixed(2) : (trip.tarifaFinal ?? trip.tarifaEstimada).toFixed(2)}</b><time className="trip-date"><CalendarIcon size={13} aria-hidden />{shortDate(trip.fechaSolicitud)}</time><button className="trip-more" type="button" aria-label="Más opciones del viaje"><MoreIcon size={17} aria-hidden /></button></article>)}</div>}</>
}
