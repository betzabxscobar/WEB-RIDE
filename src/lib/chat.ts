import { supabase } from './supabase'

export type ChatMessage = { id: string; tripId: string; authorId: string; text: string; sentAt: string; readAt: string | null }
type Row = Record<string, unknown>
const toMessage = (row: Row): ChatMessage => ({ id: row.id as string, tripId: row.viaje_id as string, authorId: row.autor_id as string, text: row.texto as string, sentAt: row.fecha as string, readAt: (row.leido_en as string) ?? null })

export async function listMessages(tripId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase.from('mensajes').select('id, viaje_id, autor_id, texto, fecha, leido_en').eq('viaje_id', tripId).order('fecha', { ascending: true })
  if (error) throw new Error('No se pudo abrir el chat del viaje.')
  return (data ?? []).map((row) => toMessage(row as Row))
}

export async function sendMessage(tripId: string, text: string): Promise<void> {
  const { error } = await supabase.rpc('enviar_mensaje', { p_viaje_id: tripId, p_texto: text.trim() })
  if (error) throw new Error(error.message.toLowerCase().includes('todavia no hay chofer') ? 'El chat se habilita cuando haya un conductor asignado.' : 'No se pudo enviar el mensaje.')
}

export async function markMessagesRead(tripId: string): Promise<void> { await supabase.rpc('marcar_mensajes_leidos', { p_viaje_id: tripId }) }

export function watchMessages(tripId: string, refresh: () => void): () => void {
  const channel = supabase.channel(`chat-web-${tripId}-${Date.now()}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes', filter: `viaje_id=eq.${tripId}` }, refresh).subscribe()
  return () => { void supabase.removeChannel(channel) }
}
