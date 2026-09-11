import { supabase } from './supabase'
import { RECEIPT_PHOTO, preparePhoto } from './image-upload'

export type PaymentMethod = {
  id: string
  type: 'efectivo' | 'tarjeta' | 'transferencia'
  detail: string | null
  preferred: boolean
  createdAt: string
}

export type RidePayment = {
  id: string
  tripId: string
  amount: number
  type: 'pago' | 'reembolso' | 'reintento' | 'multa'
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

export async function registerPaymentMethod(type: 'efectivo' | 'transferencia'): Promise<void> {
  const { error } = await supabase.rpc('registrar_metodo_pago', {
    p_tipo: type,
    p_token: null,
    p_predeterminado: true,
  })
  if (error) throw new Error(`No se pudo registrar ${type === 'transferencia' ? 'la transferencia' : 'el pago en efectivo'}.`)
}

export const registerCashPayment = () => registerPaymentMethod('efectivo')
export const registerTransferPayment = () => registerPaymentMethod('transferencia')

/**
 * Sube la foto del comprobante y devuelve su ruta dentro del depósito.
 *
 * La carpeta es el uuid del pasajero porque la política de acceso lo exige:
 * cada quien escribe solo en la suya. Lo leen el que lo subió, el chofer de ese
 * viaje y la administración; el depósito no es público, porque un comprobante
 * lleva número de cuenta, nombre y monto.
 */
export async function uploadTransferReceipt(tripId: string, file: File): Promise<string> {
  const { data: session } = await supabase.auth.getUser()
  const uid = session?.user?.id
  if (!uid) throw new Error('Debes iniciar sesión para subir el comprobante.')

  // Como en la app: a 1600 de ancho y en JPEG. Antes un PDF se guardaba con
  // nombre `.jpg`, y el chofer, que lo ve como imagen, no veía nada.
  const photo = await preparePhoto(file, RECEIPT_PHOTO, tripId)
  const path = `${uid}/${tripId}.jpg`
  // `upsert` para que una segunda foto pise a la primera en vez de acumular
  // basura cuando la primera sale movida.
  const { error } = await supabase.storage.from('comprobantes').upload(path, photo, { upsert: true, contentType: photo.type })
  if (error) throw new Error('No pudimos subir el comprobante.')
  return path
}

/**
 * El pasajero avisa de que ya transfirió, con el comprobante.
 *
 * Esto **no** da el viaje por cobrado: solo se lo dice al chofer, que es el
 * único que puede ver si el dinero llegó a su cuenta. Él lo confirma, y hasta
 * entonces el viaje no se cierra.
 */
export async function reportTransfer(tripId: string, receiptPath: string | null): Promise<void> {
  const { error } = await supabase.rpc('reportar_transferencia', { p_viaje_id: tripId, p_comprobante: receiptPath })
  if (error) throw new Error('No pudimos avisar al chofer. Inténtalo nuevamente.')
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
