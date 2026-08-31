import { supabase } from './supabase'

export type SavedAddress = {
  id: string
  label: string
  address: string
  lat: number
  lng: number
  favorite: boolean
  lastUsedAt: string
}

type Row = {
  id: string
  etiqueta: string | null
  direccion: string
  latitud: number
  longitud: number
  favorita: boolean
  usada_en: string
}

function toAddress(row: Row): SavedAddress {
  return {
    id: row.id,
    label: row.etiqueta || 'Dirección guardada',
    address: row.direccion,
    lat: Number(row.latitud),
    lng: Number(row.longitud),
    favorite: row.favorita,
    lastUsedAt: row.usada_en,
  }
}

export async function listSavedAddresses(userId: string): Promise<SavedAddress[]> {
  const { data, error } = await supabase
    .from('direcciones_guardadas')
    .select('id, etiqueta, direccion, latitud, longitud, favorita, usada_en')
    .eq('usuario_id', userId)
    .order('favorita', { ascending: false })
    .order('usada_en', { ascending: false })

  if (error) throw new Error('No se pudieron cargar tus direcciones.')
  return ((data ?? []) as Row[]).map(toAddress)
}

export async function addSavedAddress(
  userId: string,
  label: string,
  address: string,
  lat: number,
  lng: number,
): Promise<void> {
  const { error } = await supabase.from('direcciones_guardadas').insert({
    usuario_id: userId,
    etiqueta: label.trim(),
    direccion: address.trim(),
    latitud: lat,
    longitud: lng,
  })
  if (error) throw new Error('No se pudo guardar la dirección.')
}

export async function setFavoriteAddress(id: string, favorite: boolean): Promise<void> {
  const { error } = await supabase
    .from('direcciones_guardadas')
    .update({ favorita: favorite })
    .eq('id', id)
  if (error) throw new Error('No se pudo actualizar la dirección.')
}

export async function deleteSavedAddress(id: string): Promise<void> {
  const { error } = await supabase.from('direcciones_guardadas').delete().eq('id', id)
  if (error) throw new Error('No se pudo eliminar la dirección.')
}
