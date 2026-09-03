import { supabase } from './supabase'

export type DriverStatus = 'pendiente' | 'aprobado' | 'rechazado'
export type DocStatus = 'pendiente' | 'aprobado' | 'rechazado'
export type DocType = 'cedula' | 'licencia' | 'foto_perfil' | 'matricula' | 'SPPAT' | 'revision_tecnica' | 'foto_vehiculo'

export const TIPOS_DOC: DocType[] = ['cedula', 'licencia', 'foto_perfil', 'matricula', 'SPPAT', 'revision_tecnica', 'foto_vehiculo']

export const DOC_LABEL: Record<DocType, string> = {
  cedula: 'Cédula', licencia: 'Licencia', foto_perfil: 'Foto personal',
  matricula: 'Matrícula',
  SPPAT: 'SPPAT', revision_tecnica: 'Revisión técnica', foto_vehiculo: 'Foto del vehículo',
}

export type DriverDoc = {
  id: string
  tipo: DocType
  estado: DocStatus
  ruta: string
  fecha: string
  vehiculoId: string | null
  numero: string | null
  caducaEl: string | null
  motivoRechazo: string | null
}

export type DriverVehicle = {
  id: string
  placa: string
  marca: string
  modelo: string
  anio: number
  color: string | null
  activo: boolean
  categoria: string
}

export type Driver = {
  id: string
  nombre: string
  email: string
  telefono: string | null
  estado: DriverStatus
  disponible: boolean
  calificacion: number | null
  documentos: DriverDoc[]
  vehiculos: DriverVehicle[]
  cedula: string | null
  codigoDactilar: string | null
  licenciaTipo: string | null
  licenciaCaducaEl: string | null
  papelesQueFaltan: string[]
}

/** La lista la calcula Postgres con las mismas reglas que bloquean la aprobación. */
export function puedeAprobarse(driver: Driver): boolean {
  return driver.papelesQueFaltan.length === 0
}

/** Qué le falta, para explicarlo en pantalla en vez de solo bloquear. */
export function faltantes(driver: Driver): string[] {
  const labels: Record<string, string> = { identidad: 'Identidad incompleta', licencia_vigente: 'Licencia vencida o sin registrar', vehiculo_completo: 'Ningún vehículo tiene todos sus documentos vigentes' }
  return driver.papelesQueFaltan.map((item) => labels[item] ?? `${DOC_LABEL[item as DocType] ?? item} pendiente`)
}

type Row = Record<string, unknown>

/**
 * Choferes con sus documentos y vehículos.
 *
 * RLS decide qué filas llegan: las políticas dan lectura global a las cuentas
 * administrativas. No se filtra en el cliente.
 */
export async function listDrivers(): Promise<Driver[]> {
  const { data, error } = await supabase
    .from('conductores_revision')
    .select('*')
    .order('fecha_registro', { ascending: true })

  if (error) throw new Error('No se pudieron cargar los conductores.')

  return (data ?? []).map((row: Row) => {
    return {
      id: row.id as string,
      nombre: (row.nombre as string) || (row.email as string) || 'Sin nombre',
      email: (row.email as string) ?? '',
      telefono: (row.telefono as string) ?? null,
      estado: row.estado_aprobacion as DriverStatus,
      disponible: row.disponible as boolean,
      calificacion:
        row.calificacion_promedio == null ? null : Number(row.calificacion_promedio),
      cedula: (row.cedula as string) ?? null,
      codigoDactilar: (row.codigo_dactilar as string) ?? null,
      licenciaTipo: (row.licencia_tipo as string) ?? null,
      licenciaCaducaEl: (row.licencia_caduca_el as string) ?? null,
      papelesQueFaltan: ((row.papeles_que_faltan ?? []) as unknown[]).map(String),
      documentos: ((row.documentos ?? []) as Row[]).map((d) => ({
        id: d.id as string,
        tipo: d.tipo_documento as DocType,
        estado: d.estado as DocStatus,
        ruta: d.url_archivo as string,
        fecha: d.fecha_subida as string,
        vehiculoId: (d.vehiculo_id as string) ?? null,
        numero: (d.numero as string) ?? null,
        caducaEl: (d.caduca_el as string) ?? null,
        motivoRechazo: (d.motivo_rechazo as string) ?? null,
      })),
      vehiculos: ((row.vehiculos ?? []) as Row[]).map((v) => ({
        id: v.id as string,
        placa: v.placa as string,
        marca: v.marca as string,
        modelo: v.modelo as string,
        anio: Number(v.anio),
        color: (v.color as string) ?? null,
        activo: v.activo as boolean,
        categoria: (v.categoria as string) ?? 'estandar',
      })),
    }
  })
}

export async function reviewDocument(documentoId: string, aprobado: boolean, motivo?: string) {
  const { error } = await supabase.rpc('revisar_documento', {
    p_documento_id: documentoId,
    p_aprobado: aprobado,
    p_motivo: motivo?.trim() || null,
  })
  if (error) throw new Error(traducir(error.message))
}

export async function reviewDriver(conductorId: string, aprobado: boolean, motivo?: string) {
  const { error } = await supabase.rpc('revisar_conductor', {
    p_conductor_id: conductorId,
    p_aprobado: aprobado,
    p_motivo: motivo?.trim() || null,
  })
  if (error) throw new Error(traducir(error.message))
}

/**
 * URL temporal para ver un documento.
 *
 * El bucket es privado: se firma cada vez y dura una hora, así no queda un
 * enlace permanente a la licencia de nadie.
 */
export async function documentUrl(ruta: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('documentos')
    .createSignedUrl(ruta, 3600)
  if (error || !data) throw new Error('No se pudo abrir el documento.')
  return data.signedUrl
}

function traducir(mensaje: string): string {
  const m = mensaje.toLowerCase()
  if (m.includes('solo la administracion')) return 'No tienes permiso para esta acción.'
  if (m.includes('faltan documentos')) return mensaje
  if (m.includes('ningun vehiculo')) return 'El conductor no tiene vehículo registrado.'
  return mensaje
}
