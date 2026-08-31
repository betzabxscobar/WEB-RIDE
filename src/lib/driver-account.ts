import { supabase } from './supabase'

export type DriverState = {
  exists: boolean
  approved: boolean
  approvalStatus: 'pendiente' | 'aprobado' | 'rechazado'
  available: boolean
  hasActiveVehicle: boolean
  rating: number | null
}

export type OwnVehicle = {
  id: string
  plate: string
  make: string
  model: string
  year: number
  color: string | null
  active: boolean
}

export type DocumentType = 'licencia' | 'SOAT' | 'matricula'
export type OwnDocument = {
  id: string
  type: DocumentType
  status: 'pendiente' | 'aprobado' | 'rechazado'
  path: string
  uploadedAt: string
}

function failure(error: { message: string } | null, fallback: string): Error {
  if (!error) return new Error(fallback)
  const message = error.message.toLowerCase()
  if (message.includes('row-level security') || message.includes('permission denied')) return new Error('No tienes permiso para realizar esta acción.')
  if (message.includes('disponible_requiere_aprobacion')) return new Error('Tu cuenta debe estar aprobada para ponerte en línea.')
  if (message.includes('placa') && message.includes('registrada')) return new Error('Esa placa ya está registrada.')
  return new Error(error.message || fallback)
}

export function driverBlockReason(state: DriverState): string {
  if (!state.exists) return 'Registra un vehículo y tus documentos para crear tu perfil de conductor.'
  if (state.approvalStatus === 'rechazado') return 'La administración rechazó tu solicitud. Revisa y vuelve a subir tus documentos.'
  if (!state.approved) return 'La administración todavía está revisando tu cuenta y tus documentos.'
  if (!state.hasActiveVehicle) return 'Activa un vehículo para recibir solicitudes.'
  return ''
}

export async function getDriverState(userId: string): Promise<DriverState> {
  const [driver, activeVehicle] = await Promise.all([
    supabase.from('conductores').select('estado_aprobacion, disponible, calificacion_promedio').eq('id', userId).maybeSingle(),
    supabase.from('vehiculos').select('id').eq('conductor_id', userId).eq('activo', true).maybeSingle(),
  ])
  if (driver.error) throw failure(driver.error, 'No se pudo cargar tu estado de conductor.')
  if (activeVehicle.error) throw failure(activeVehicle.error, 'No se pudo consultar tu vehículo activo.')
  if (!driver.data) return { exists: false, approved: false, approvalStatus: 'pendiente', available: false, hasActiveVehicle: false, rating: null }
  return {
    exists: true,
    approved: driver.data.estado_aprobacion === 'aprobado',
    approvalStatus: driver.data.estado_aprobacion,
    available: Boolean(driver.data.disponible),
    hasActiveVehicle: activeVehicle.data != null,
    rating: driver.data.calificacion_promedio == null ? null : Number(driver.data.calificacion_promedio),
  }
}

export async function setDriverAvailability(userId: string, available: boolean): Promise<void> {
  const { error } = await supabase.from('conductores').update({ disponible: available }).eq('id', userId)
  if (error) throw failure(error, 'No se pudo cambiar tu disponibilidad.')
}

export async function listOwnVehicles(userId: string): Promise<OwnVehicle[]> {
  const { data, error } = await supabase.from('vehiculos').select('id, placa, marca, modelo, anio, color, activo').eq('conductor_id', userId).order('activo', { ascending: false }).order('created_at')
  if (error) throw failure(error, 'No se pudieron cargar tus vehículos.')
  return (data ?? []).map((row) => ({ id: row.id, plate: row.placa, make: row.marca, model: row.modelo, year: Number(row.anio), color: row.color, active: row.activo }))
}

export async function saveVehicle(input: { id?: string; plate: string; make: string; model: string; year: number; color?: string }): Promise<string> {
  const { data, error } = await supabase.rpc('registrar_vehiculo', {
    p_placa: input.plate,
    p_marca: input.make,
    p_modelo: input.model,
    p_anio: input.year,
    p_color: input.color?.trim() || null,
    p_vehiculo_id: input.id ?? null,
  })
  if (error) throw failure(error, 'No se pudo guardar el vehículo.')
  return String(data)
}

export async function activateVehicle(vehicleId: string): Promise<void> {
  const { error } = await supabase.rpc('activar_vehiculo', { p_vehiculo_id: vehicleId })
  if (error) throw failure(error, 'No se pudo activar el vehículo.')
}

export async function listOwnDocuments(userId: string): Promise<OwnDocument[]> {
  const { data, error } = await supabase.from('documentos_conductor').select('id, tipo_documento, estado, url_archivo, fecha_subida').eq('conductor_id', userId)
  if (error) throw failure(error, 'No se pudieron cargar tus documentos.')
  return (data ?? []).map((row) => ({ id: row.id, type: row.tipo_documento, status: row.estado, path: row.url_archivo, uploadedAt: row.fecha_subida }))
}

export async function uploadDriverDocument(userId: string, type: DocumentType, file: File): Promise<void> {
  if (file.size > 5 * 1024 * 1024) throw new Error('El archivo pesa más de 5 MB.')
  if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) throw new Error('Sube una imagen JPG, PNG, WebP o un PDF.')
  const extension = file.name.split('.').pop()?.toLowerCase() || (file.type === 'application/pdf' ? 'pdf' : 'jpg')
  const path = `${userId}/${type}.${extension}`
  const { error: uploadError } = await supabase.storage.from('documentos').upload(path, file, { upsert: true, contentType: file.type })
  if (uploadError) throw failure(uploadError, 'No se pudo subir el archivo.')
  const { error } = await supabase.rpc('registrar_documento', { p_tipo: type, p_url: path })
  if (error) throw failure(error, 'No se pudo registrar el documento.')
}

export async function ownDocumentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('documentos').createSignedUrl(path, 3600)
  if (error || !data) throw failure(error, 'No se pudo abrir el documento.')
  return data.signedUrl
}

