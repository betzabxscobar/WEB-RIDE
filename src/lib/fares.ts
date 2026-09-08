import { supabase } from './supabase'

export type Fare = {
  id: string
  name: string
  base: number
  perKm: number
  perMinute: number
  minimum: number
  driverShare: number
  active: boolean
  fromHour: number | null
  toHour: number | null
  days: number[] | null
}

export type VehicleCategory = {
  id: string
  name: string
  description: string
  factor: number
  passengers: number
  active: boolean
  order: number
}

export async function listFares(): Promise<Fare[]> {
  const { data, error } = await supabase.from('tarifas').select('id, nombre, tarifa_base, costo_por_km, costo_por_minuto, carrera_minima, porcentaje_conductor, activo, hora_desde, hora_hasta, dias').order('hora_desde', { ascending: true, nullsFirst: true })
  if (error) throw new Error('No se pudieron cargar las tarifas.')
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.nombre as string,
    base: Number(row.tarifa_base),
    perKm: Number(row.costo_por_km),
    perMinute: Number(row.costo_por_minuto ?? 0),
    minimum: Number(row.carrera_minima),
    driverShare: Number(row.porcentaje_conductor ?? 0.85),
    active: Boolean(row.activo),
    fromHour: row.hora_desde == null ? null : Number(row.hora_desde),
    toHour: row.hora_hasta == null ? null : Number(row.hora_hasta),
    days: Array.isArray(row.dias) ? row.dias.map(Number) : null,
  }))
}

export async function saveFare(fare: Pick<Fare, 'id' | 'base' | 'perKm' | 'minimum' | 'driverShare'>): Promise<void> {
  if ([fare.base, fare.perKm, fare.minimum, fare.driverShare].some((value) => !Number.isFinite(value))) throw new Error('Completa todos los valores numéricos.')
  if ([fare.base, fare.perKm, fare.minimum].some((value) => value < 0)) throw new Error('Los precios no pueden ser negativos.')
  if (fare.driverShare <= 0 || fare.driverShare > 1) throw new Error('El porcentaje del conductor debe estar entre 1 y 100.')
  if (fare.minimum < fare.base) throw new Error('La carrera mínima no puede ser menor que el arranque.')
  const { error } = await supabase.from('tarifas').update({ tarifa_base: fare.base, costo_por_km: fare.perKm, carrera_minima: fare.minimum, porcentaje_conductor: fare.driverShare }).eq('id', fare.id)
  if (error) throw new Error('No se pudo actualizar la tarifa. Comprueba tus permisos.')
}

export async function listVehicleCategories(): Promise<VehicleCategory[]> {
  const { data, error } = await supabase.from('categorias_vehiculo').select('id, nombre, descripcion, factor, pasajeros, activo, orden').order('orden', { ascending: true })
  if (error) throw new Error('No se pudieron cargar los tipos de vehículo.')
  return (data ?? []).map((row) => ({ id: row.id as string, name: row.nombre as string, description: (row.descripcion as string) ?? '', factor: Number(row.factor), passengers: Number(row.pasajeros ?? 4), active: Boolean(row.activo), order: Number(row.orden ?? 0) }))
}

export async function saveVehicleFactor(id: string, factor: number): Promise<void> {
  if (!Number.isFinite(factor)) throw new Error('Escribe un multiplicador válido.')
  if (factor <= 0 || factor > 5) throw new Error('El multiplicador debe estar entre 0,01 y 5.')
  const { error } = await supabase.from('categorias_vehiculo').update({ factor }).eq('id', id)
  if (error) throw new Error('No se pudo actualizar el tipo de vehículo. Comprueba tus permisos.')
}
