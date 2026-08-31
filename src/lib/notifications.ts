import { supabase } from './supabase'

export type RideNotification = {
  id: string
  title: string
  message: string
  read: boolean
  createdAt: string
}

type Row = {
  id: string
  titulo: string
  mensaje: string
  leida: boolean
  fecha: string
}

export async function listNotifications(userId: string, limit = 30): Promise<RideNotification[]> {
  const { data, error } = await supabase
    .from('notificaciones')
    .select('id, titulo, mensaje, leida, fecha')
    .eq('usuario_id', userId)
    .order('fecha', { ascending: false })
    .limit(limit)

  if (error) throw new Error('No se pudieron cargar tus avisos.')
  return ((data ?? []) as Row[]).map((row) => ({
    id: row.id,
    title: row.titulo,
    message: row.mensaje,
    read: row.leida,
    createdAt: row.fecha,
  }))
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase.rpc('marcar_notificaciones_leidas')
  if (error) throw new Error('No se pudieron marcar los avisos como leídos.')
}

export function watchNotifications(userId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`avisos-pasajero-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notificaciones', filter: `usuario_id=eq.${userId}` },
      onChange,
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}
