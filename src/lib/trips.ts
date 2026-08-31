import { supabase } from './supabase'
import { gridDisk, latLngToCell } from 'h3-js'

/** Los nueve valores de `public.enum_estado_viaje`. */
export type TripStatus =
  | 'SOLICITADO'
  | 'BUSCANDO_CONDUCTOR'
  | 'ACEPTADO'
  | 'CONDUCTOR_EN_CAMINO'
  | 'CONDUCTOR_EN_ORIGEN'
  | 'EN_CURSO'
  | 'FINALIZADO'
  | 'CANCELADO'
  | 'SIN_CONDUCTOR'

export type Trip = {
  id: string
  estado: TripStatus
  pasajeroId: string
  conductorId: string | null
  tarifaEstimada: number
  tarifaFinal: number | null
  fechaSolicitud: string
  pasajeroNombre: string
  pasajeroTelefono: string | null
  conductorNombre: string | null
  conductorTelefono: string | null
  conductorCalificacion: number | null
  vehiculoPlaca: string | null
  vehiculoMarca: string | null
  vehiculoModelo: string | null
  vehiculoColor: string | null
  origenTexto: string
  destinoTexto: string
  origenLat: number | null
  origenLng: number | null
  destinoLat: number | null
  destinoLng: number | null
  tarifaNombre: string
  montoCobrado: number
  pagoEstado: 'pendiente' | 'completado' | 'fallido' | null
}

export type Place = {
  id: string
  nombre: string
  direccion: string
  lat: number
  lng: number
  source?: 'recent' | 'recommended'
  favorite?: boolean
  lastUsedAt?: string | null
}

export type Coordinates = { lat: number; lng: number; label: string }

export type Quote = {
  tarifaId: string
  tarifaNombre: string
  km: number
  minutos: number
  total: number
  conductor: number
  comision: number
  aplicoMinima: boolean
}

export type TripPosition = {
  lat: number
  lng: number
  recordedAt: string
}

const COLUMNAS = `
  id, estado, pasajero_id, conductor_id, tarifa_estimada, tarifa_final,
  fecha_solicitud, tarifa_nombre, pasajero_nombre, pasajero_telefono,
  conductor_nombre, conductor_telefono, conductor_calificacion,
  vehiculo_placa, vehiculo_marca, vehiculo_modelo, vehiculo_color,
  origen_lat, origen_lng, origen_texto, destino_lat, destino_lng, destino_texto,
  monto_cobrado, pago_estado
`

export const ESTADO_LABEL: Record<TripStatus, string> = {
  SOLICITADO: 'Solicitado',
  BUSCANDO_CONDUCTOR: 'Buscando chofer',
  ACEPTADO: 'Chofer asignado',
  CONDUCTOR_EN_CAMINO: 'Chofer en camino',
  CONDUCTOR_EN_ORIGEN: 'Chofer en el punto',
  EN_CURSO: 'En viaje',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado',
  SIN_CONDUCTOR: 'Sin choferes',
}

/** Un viaje cerrado ya no cambia de estado. */
export function esFinal(estado: TripStatus): boolean {
  return estado === 'FINALIZADO' || estado === 'CANCELADO' || estado === 'SIN_CONDUCTOR'
}

export function puedeCancelar(estado: TripStatus): boolean {
  return !['EN_CURSO', 'FINALIZADO', 'CANCELADO', 'SIN_CONDUCTOR'].includes(estado)
}

export function progresoViaje(estado: TripStatus): number {
  const progreso: Record<TripStatus, number> = {
    SOLICITADO: 8,
    BUSCANDO_CONDUCTOR: 20,
    ACEPTADO: 40,
    CONDUCTOR_EN_CAMINO: 55,
    CONDUCTOR_EN_ORIGEN: 70,
    EN_CURSO: 90,
    FINALIZADO: 100,
    CANCELADO: 100,
    SIN_CONDUCTOR: 100,
  }
  return progreso[estado]
}

type Row = Record<string, unknown>

function toTrip(row: Row): Trip {
  return {
    id: row.id as string,
    estado: row.estado as TripStatus,
    pasajeroId: row.pasajero_id as string,
    conductorId: (row.conductor_id as string) ?? null,
    tarifaEstimada: Number(row.tarifa_estimada ?? 0),
    tarifaFinal: row.tarifa_final == null ? null : Number(row.tarifa_final),
    fechaSolicitud: row.fecha_solicitud as string,
    pasajeroNombre: (row.pasajero_nombre as string) ?? 'Pasajero',
    pasajeroTelefono: (row.pasajero_telefono as string) ?? null,
    conductorNombre: (row.conductor_nombre as string) ?? null,
    conductorTelefono: (row.conductor_telefono as string) ?? null,
    conductorCalificacion: row.conductor_calificacion == null ? null : Number(row.conductor_calificacion),
    vehiculoPlaca: (row.vehiculo_placa as string) ?? null,
    vehiculoMarca: (row.vehiculo_marca as string) ?? null,
    vehiculoModelo: (row.vehiculo_modelo as string) ?? null,
    vehiculoColor: (row.vehiculo_color as string) ?? null,
    origenTexto: (row.origen_texto as string) ?? 'Origen',
    destinoTexto: (row.destino_texto as string) ?? 'Destino',
    origenLat: row.origen_lat == null ? null : Number(row.origen_lat),
    origenLng: row.origen_lng == null ? null : Number(row.origen_lng),
    destinoLat: row.destino_lat == null ? null : Number(row.destino_lat),
    destinoLng: row.destino_lng == null ? null : Number(row.destino_lng),
    tarifaNombre: (row.tarifa_nombre as string) ?? 'Tarifa',
    montoCobrado: Number(row.monto_cobrado ?? 0),
    pagoEstado: (row.pago_estado as Trip['pagoEstado']) ?? null,
  }
}

function databaseMessage(error: { message: string } | null, fallback: string): Error {
  if (!error) return new Error(fallback)
  const message = error.message.toLowerCase()
  if (message.includes('ya tienes un viaje')) return new Error('Ya tienes un viaje en curso.')
  if (message.includes('no hay tarifas')) return new Error('No hay tarifas disponibles en este momento.')
  if (message.includes('row-level security') || message.includes('permission denied')) {
    return new Error('No tienes permiso para realizar esta acción.')
  }
  return new Error(error.message || fallback)
}

/**
 * Viajes visibles para el panel.
 *
 * RLS decide qué filas llegan: la política `viajes_participante` da lectura
 * global a las cuentas administrativas. No se filtra en el cliente.
 */
export async function listTrips(limite = 50): Promise<Trip[]> {
  const { data, error } = await supabase
    .from('viajes_detalle')
    .select(COLUMNAS)
    .order('fecha_solicitud', { ascending: false })
    .limit(limite)

  if (error) throw new Error('No se pudieron cargar los viajes.')
  return (data ?? []).map((row) => toTrip(row as Row))
}

/** Viajes de un pasajero concreto; el filtro evita mezclar datos al previsualizar el panel desde administración. */
export async function listPassengerTrips(userId: string, limite = 20): Promise<Trip[]> {
  const { data, error } = await supabase
    .from('viajes_detalle')
    .select(COLUMNAS)
    .eq('pasajero_id', userId)
    .order('fecha_solicitud', { ascending: false })
    .limit(limite)

  if (error) throw databaseMessage(error, 'No se pudieron cargar tus viajes.')
  return (data ?? []).map((row) => toTrip(row as Row))
}

/** Solicitudes que RLS permite ver al conductor disponible actual. */
export async function listOpenTripRequests(limite = 30): Promise<Trip[]> {
  const { data, error } = await supabase
    .from('viajes_detalle')
    .select(COLUMNAS)
    .in('estado', ['SOLICITADO', 'BUSCANDO_CONDUCTOR'])
    .order('fecha_solicitud', { ascending: true })
    .limit(limite)
  if (error) throw databaseMessage(error, 'No se pudieron cargar las solicitudes cercanas.')
  return (data ?? []).map((row) => toTrip(row as Row))
}

export async function listDriverTrips(userId: string, limite = 30): Promise<Trip[]> {
  const { data, error } = await supabase
    .from('viajes_detalle')
    .select(COLUMNAS)
    .eq('conductor_id', userId)
    .order('fecha_solicitud', { ascending: false })
    .limit(limite)
  if (error) throw databaseMessage(error, 'No se pudieron cargar tus viajes.')
  return (data ?? []).map((row) => toTrip(row as Row))
}

export async function acceptTrip(tripId: string): Promise<void> {
  const { error } = await supabase.rpc('aceptar_viaje', { p_viaje_id: tripId })
  if (error) throw databaseMessage(error, 'No se pudo aceptar el viaje.')
}

export async function advanceTrip(tripId: string): Promise<TripStatus> {
  const { data, error } = await supabase.rpc('avanzar_viaje', { p_viaje_id: tripId })
  if (error) throw databaseMessage(error, 'No se pudo avanzar el viaje.')
  return String(data) as TripStatus
}

export async function finishTrip(tripId: string): Promise<number> {
  const { data, error } = await supabase.rpc('finalizar_viaje', { p_viaje_id: tripId })
  if (error) throw databaseMessage(error, 'No se pudo finalizar el viaje.')
  return Number(data)
}

export async function reportDriverPosition(lat: number, lng: number, tripId?: string): Promise<void> {
  let cell7: string | null = null
  let cell9: string | null = null
  try {
    cell7 = latLngToCell(lat, lng, 7)
    cell9 = latLngToCell(lat, lng, 9)
  } catch {
    // PostGIS conserva las coordenadas aunque H3 no esté disponible.
  }
  const { error } = await supabase.rpc('reportar_posicion', {
    p_lat: lat,
    p_lng: lng,
    p_viaje_id: tripId ?? null,
    p_celda_h3_7: cell7,
    p_celda_h3_9: cell9,
  })
  if (error) throw databaseMessage(error, 'No se pudo actualizar tu ubicación.')
}

export async function rateParticipant(tripId: string, userId: string, ratedUserId: string, score: number, comment: string): Promise<void> {
  const { error } = await supabase.from('calificaciones').insert({
    viaje_id: tripId,
    calificador_id: userId,
    calificado_id: ratedUserId,
    puntuacion: score,
    comentario: comment.trim() || null,
  })
  if (error?.message.toLowerCase().includes('duplicate')) throw new Error('Ya calificaste este viaje.')
  if (error) throw databaseMessage(error, 'No se pudo guardar la calificación.')
}

export async function listPlaces(userId: string): Promise<Place[]> {
  const [catalog, saved] = await Promise.all([
    supabase
      .from('lugares')
      .select('id, nombre, direccion, latitud, longitud')
      .eq('activo', true)
      .order('nombre'),
    supabase
      .from('direcciones_guardadas')
      .select('id, etiqueta, direccion, latitud, longitud, favorita, usada_en')
      .eq('usuario_id', userId)
      .order('favorita', { ascending: false })
      .order('usada_en', { ascending: false }),
  ])

  if (catalog.error) throw databaseMessage(catalog.error, 'No se pudo cargar el catálogo de destinos.')
  if (saved.error) throw databaseMessage(saved.error, 'No se pudieron cargar tus direcciones.')

  const recentPlaces: Place[] = (saved.data ?? []).map((row) => ({
    id: row.id as string,
    nombre: (row.etiqueta || row.direccion) as string,
    direccion: row.direccion as string,
    lat: Number(row.latitud),
    lng: Number(row.longitud),
    source: 'recent',
    favorite: Boolean(row.favorita),
    lastUsedAt: (row.usada_en as string | null) ?? null,
  }))
  const recommendedPlaces: Place[] = (catalog.data ?? []).map((row) => ({
    id: row.id as string,
    nombre: row.nombre as string,
    direccion: row.direccion as string,
    lat: Number(row.latitud),
    lng: Number(row.longitud),
    source: 'recommended',
  }))
  return [...recentPlaces, ...recommendedPlaces]
}

export async function quoteTrip(origin: Coordinates, destination: Place, roadKm?: number): Promise<Quote> {
  const { data, error } = await supabase.rpc('cotizar_viaje', {
    p_origen_lat: origin.lat,
    p_origen_lng: origin.lng,
    p_destino_lat: destination.lat,
    p_destino_lng: destination.lng,
    p_distancia_km: roadKm ?? null,
    p_tarifa_id: null,
  })
  if (error) throw databaseMessage(error, 'No se pudo calcular el precio del viaje.')

  const row = Array.isArray(data) ? data[0] as Row | undefined : undefined
  if (!row) throw new Error('No se pudo calcular el precio del viaje.')
  return {
    tarifaId: row.tarifa_id as string,
    tarifaNombre: row.tarifa_nombre as string,
    km: Number(row.distancia_km),
    minutos: Number(row.minutos_estimados),
    total: Number(row.total),
    conductor: Number(row.gana_conductor),
    comision: Number(row.comision_app),
    aplicoMinima: Boolean(row.aplico_minima),
  }
}

export async function requestTrip(origin: Coordinates, destination: Place, quote: Quote): Promise<string> {
  let originCell: string | null = null
  let diffusionCells: string[] | null = null
  try {
    originCell = latLngToCell(origin.lat, origin.lng, 7)
    diffusionCells = gridDisk(originCell, 4)
  } catch {
    // PostGIS sigue siendo el respaldo si H3 no puede calcularse en el navegador.
  }
  const { data, error } = await supabase.rpc('solicitar_viaje', {
    p_origen_lat: origin.lat,
    p_origen_lng: origin.lng,
    p_origen_texto: origin.label,
    p_destino_lat: destination.lat,
    p_destino_lng: destination.lng,
    p_destino_texto: [destination.nombre, destination.direccion].filter(Boolean).join(', '),
    p_tarifa_id: quote.tarifaId,
    p_origen_celda_h3_7: originCell,
    p_celdas_difusion: diffusionCells,
    p_distancia_km: quote.km,
  })
  if (error) throw databaseMessage(error, 'No se pudo solicitar el viaje.')
  return String(data)
}

export async function cancelTrip(tripId: string): Promise<void> {
  const { error } = await supabase.rpc('cancelar_viaje', { p_viaje_id: tripId })
  if (error) throw databaseMessage(error, 'No se pudo cancelar el viaje.')
}

export async function hasRatedTrip(tripId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('calificaciones')
    .select('id')
    .eq('viaje_id', tripId)
    .eq('calificador_id', userId)
    .maybeSingle()
  if (error) throw databaseMessage(error, 'No se pudo consultar la calificación.')
  return data != null
}

export async function rateTrip(trip: Trip, userId: string, score: number, comment: string): Promise<void> {
  if (!trip.conductorId) throw new Error('Este viaje no tiene un conductor para calificar.')
  const { error } = await supabase.from('calificaciones').insert({
    viaje_id: trip.id,
    calificador_id: userId,
    calificado_id: trip.conductorId,
    puntuacion: score,
    comentario: comment.trim() || null,
  })
  if (error?.message.toLowerCase().includes('duplicate')) throw new Error('Ya calificaste este viaje.')
  if (error) throw databaseMessage(error, 'No se pudo guardar la calificación.')
}

/**
 * Escucha los cambios de `viajes` en vivo.
 *
 * Devuelve la función para darse de baja: sin ella, cada montaje del panel
 * dejaría un canal abierto.
 */
export function watchTrips(onChange: () => void): () => void {
  const canal = supabase
    .channel(`viajes-panel-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes' }, onChange)
    .subscribe()

  return () => {
    supabase.removeChannel(canal)
  }
}

export async function getLatestTripPosition(tripId: string): Promise<TripPosition | null> {
  const { data, error } = await supabase
    .from('ubicaciones')
    .select('latitud, longitud, registrado_en')
    .eq('viaje_id', tripId)
    .eq('tipo', 'posicion_actual')
    .order('registrado_en', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw databaseMessage(error, 'No se pudo consultar la ubicación del conductor.')
  if (!data) return null
  return {
    lat: Number(data.latitud),
    lng: Number(data.longitud),
    recordedAt: data.registrado_en as string,
  }
}

export function watchTripPositions(tripId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`posicion-viaje-${tripId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'ubicaciones', filter: `viaje_id=eq.${tripId}` },
      onChange,
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}
