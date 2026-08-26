import { supabase } from './supabase'

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
  tarifaEstimada: number
  tarifaFinal: number | null
  fechaSolicitud: string
  pasajeroNombre: string
  conductorNombre: string | null
  vehiculoPlaca: string | null
  origenTexto: string
  destinoTexto: string
  tarifaNombre: string
}

const COLUMNAS = `
  id, estado, tarifa_estimada, tarifa_final, fecha_solicitud, tarifa_nombre,
  pasajero_nombre, conductor_nombre, vehiculo_placa, origen_texto, destino_texto
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

type Row = Record<string, unknown>

function toTrip(row: Row): Trip {
  return {
    id: row.id as string,
    estado: row.estado as TripStatus,
    tarifaEstimada: Number(row.tarifa_estimada ?? 0),
    tarifaFinal: row.tarifa_final == null ? null : Number(row.tarifa_final),
    fechaSolicitud: row.fecha_solicitud as string,
    pasajeroNombre: (row.pasajero_nombre as string) ?? 'Pasajero',
    conductorNombre: (row.conductor_nombre as string) ?? null,
    vehiculoPlaca: (row.vehiculo_placa as string) ?? null,
    origenTexto: (row.origen_texto as string) ?? 'Origen',
    destinoTexto: (row.destino_texto as string) ?? 'Destino',
    tarifaNombre: (row.tarifa_nombre as string) ?? 'Tarifa',
  }
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
