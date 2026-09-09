import type { Trip, TripStatus } from '../lib/trips'

export const STATUS_HINT: Record<TripStatus, string> = {
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

export function vehicle(trip: Trip): string {
  const model = [trip.vehiculoMarca, trip.vehiculoModelo].filter(Boolean).join(' ')
  return [model || 'Vehículo asignado', trip.vehiculoColor, trip.vehiculoPlaca].filter(Boolean).join(' · ')
}
