import { supabase } from './supabase'

export type PaymentMethod = {
  id: string
  type: 'efectivo' | 'tarjeta' | 'deuna'
  detail: string | null
  preferred: boolean
  createdAt: string
}

export type RidePayment = {
  id: string
  tripId: string
  amount: number
  type: 'pago' | 'reembolso' | 'reintento'
  status: 'pendiente' | 'completado' | 'fallido'
  createdAt: string
}

export async function listPaymentMethods(userId: string): Promise<PaymentMethod[]> {
  const { data, error } = await supabase
    .from('metodos_pago')
    .select('id, tipo, detalle_tokenizado, predeterminado, created_at')
    .eq('pasajero_id', userId)
    .order('predeterminado', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw new Error('No se pudieron cargar tus formas de pago.')
  return (data ?? []).map((row) => ({
    id: row.id as string,
    type: row.tipo as PaymentMethod['type'],
    detail: (row.detalle_tokenizado as string | null) ?? null,
    preferred: Boolean(row.predeterminado),
    createdAt: row.created_at as string,
  }))
}

export async function registerPaymentMethod(type: 'efectivo' | 'deuna'): Promise<void> {
  const { error } = await supabase.rpc('registrar_metodo_pago', {
    p_tipo: type,
    p_token: null,
    p_predeterminado: true,
  })
  if (error) throw new Error(`No se pudo registrar ${type === 'deuna' ? 'DeUna' : 'el pago en efectivo'}.`)
}

export const registerCashPayment = () => registerPaymentMethod('efectivo')
export const registerDeunaPayment = () => registerPaymentMethod('deuna')

export type DeunaCharge = { order: string; amount: number; qr: string | null; deepLink: string | null; alreadyPaid: boolean }

/** El importe lo resuelve la función segura; la web solo envía el viaje. */
export async function createDeunaCharge(tripId: string): Promise<DeunaCharge> {
  const { data, error } = await supabase.functions.invoke('cobro-deuna', { body: { viaje_id: tripId } })
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status
    if (status === 404 || status === 503) throw new Error('El cobro con DeUna todavía no está configurado.')
    throw new Error('No pudimos generar el cobro con DeUna. Inténtalo nuevamente.')
  }
  const row = data as Record<string, unknown>
  return { order: String(row.orden ?? ''), amount: Number(row.monto ?? 0), qr: typeof row.qr === 'string' ? row.qr : null, deepLink: typeof row.deep_link === 'string' ? row.deep_link : null, alreadyPaid: row.ya_pagado === true }
}

export async function choosePreferredPayment(id: string): Promise<void> {
  const { error } = await supabase.rpc('elegir_metodo_predeterminado', { p_metodo_id: id })
  if (error) throw new Error('No se pudo cambiar la forma de pago principal.')
}

export async function deletePaymentMethod(id: string): Promise<void> {
  const { error } = await supabase.from('metodos_pago').delete().eq('id', id)
  if (error?.message.toLowerCase().includes('foreign key')) throw new Error('No puedes eliminar una forma de pago que ya tiene cobros registrados.')
  if (error) throw new Error('No se pudo eliminar la forma de pago.')
}

export async function listPaymentsForTrips(tripIds: string[]): Promise<RidePayment[]> {
  if (tripIds.length === 0) return []
  const { data, error } = await supabase
    .from('pagos')
    .select('id, viaje_id, monto, tipo, estado, fecha')
    .in('viaje_id', tripIds)
    .order('fecha', { ascending: false })

  if (error) throw new Error('No se pudo cargar el historial de pagos.')
  return (data ?? []).map((row) => ({
    id: row.id as string,
    tripId: row.viaje_id as string,
    amount: Number(row.monto),
    type: row.tipo as RidePayment['type'],
    status: row.estado as RidePayment['status'],
    createdAt: row.fecha as string,
  }))
}
