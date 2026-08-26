import { supabase } from './supabase'

export type DriverStatus = 'pendiente' | 'aprobado' | 'rechazado'
export type DocStatus = 'pendiente' | 'aprobado' | 'rechazado'
export type DocType = 'licencia' | 'SOAT' | 'matricula'

export const TIPOS_DOC: DocType[] = ['licencia', 'SOAT', 'matricula']

export const DOC_LABEL: Record<DocType, string> = {
  licencia: 'Licencia',
  SOAT: 'SOAT',
  matricula: 'Matrícula',
}

export type DriverDoc = {
  id: string
  tipo: DocType
  estado: DocStatus
  ruta: string
  fecha: string
}

export type DriverVehicle = {
  id: string
  placa: string
  marca: string
  modelo: string
  anio: number
  color: string | null
  activo: boolean
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
}

/** Un chofer solo puede aprobarse con los tres documentos y un vehículo. */
export function puedeAprobarse(driver: Driver): boolean {
  const aprobados = driver.documentos.filter((d) => d.estado === 'aprobado').length
  return aprobados === TIPOS_DOC.length && driver.vehiculos.length > 0
}

/** Qué le falta, para explicarlo en pantalla en vez de solo bloquear. */
export function faltantes(driver: Driver): string[] {
  const pendientes: string[] = []
  for (const tipo of TIPOS_DOC) {
    const doc = driver.documentos.find((d) => d.tipo === tipo)
    if (!doc) pendientes.push(`${DOC_LABEL[tipo]} sin subir`)
    else if (doc.estado !== 'aprobado') pendientes.push(`${DOC_LABEL[tipo]} sin aprobar`)
  }
  if (driver.vehiculos.length === 0) pendientes.push('Sin vehículo registrado')
  return pendientes
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
    .from('conductores')
    .select(`
      id, estado_aprobacion, disponible, calificacion_promedio,
      profiles!inner ( full_name, email, phone ),
      documentos_conductor ( id, tipo_documento, estado, url_archivo, fecha_subida ),
      vehiculos ( id, placa, marca, modelo, anio, color, activo )
    `)
    .order('created_at', { ascending: false })

  if (error) throw new Error('No se pudieron cargar los conductores.')

  return (data ?? []).map((row: Row) => {
    const perfil = (row.profiles ?? {}) as Row
    return {
      id: row.id as string,
      nombre: (perfil.full_name as string) || (perfil.email as string) || 'Sin nombre',
      email: (perfil.email as string) ?? '',
      telefono: (perfil.phone as string) ?? null,
      estado: row.estado_aprobacion as DriverStatus,
      disponible: row.disponible as boolean,
      calificacion:
        row.calificacion_promedio == null ? null : Number(row.calificacion_promedio),
      documentos: ((row.documentos_conductor ?? []) as Row[]).map((d) => ({
        id: d.id as string,
        tipo: d.tipo_documento as DocType,
        estado: d.estado as DocStatus,
        ruta: d.url_archivo as string,
        fecha: d.fecha_subida as string,
      })),
      vehiculos: ((row.vehiculos ?? []) as Row[]).map((v) => ({
        id: v.id as string,
        placa: v.placa as string,
        marca: v.marca as string,
        modelo: v.modelo as string,
        anio: Number(v.anio),
        color: (v.color as string) ?? null,
        activo: v.activo as boolean,
      })),
    }
  })
}

export async function reviewDocument(documentoId: string, aprobado: boolean) {
  const { error } = await supabase.rpc('revisar_documento', {
    p_documento_id: documentoId,
    p_aprobado: aprobado,
  })
  if (error) throw new Error(traducir(error.message))
}

export async function reviewDriver(conductorId: string, aprobado: boolean) {
  const { error } = await supabase.rpc('revisar_conductor', {
    p_conductor_id: conductorId,
    p_aprobado: aprobado,
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
