import { supabase } from './supabase'

export type TicketStatus = 'abierto' | 'en_proceso' | 'resuelto' | 'cerrado'
export type SupportTicket = { id: string; category: string; subject: string; message: string; status: TicketStatus; answer: string | null; createdAt: string }

export async function listMyTickets(userId: string): Promise<SupportTicket[]> {
  const { data, error } = await supabase.from('tickets_soporte').select('id, categoria, asunto, mensaje, estado, respuesta, created_at').eq('usuario_id', userId).order('created_at', { ascending: false })
  if (error) throw new Error('No se pudieron cargar tus casos de soporte.')
  return (data ?? []).map((row) => ({ id: row.id as string, category: row.categoria as string, subject: row.asunto as string, message: row.mensaje as string, status: row.estado as TicketStatus, answer: (row.respuesta as string) ?? null, createdAt: row.created_at as string }))
}

export async function openTicket(subject: string, message: string, category: string, tripId?: string): Promise<void> {
  const { error } = await supabase.rpc('abrir_ticket', { p_asunto: subject.trim(), p_mensaje: message.trim(), p_categoria: category, p_viaje_id: tripId ?? null })
  if (error) throw new Error(error.message.toLowerCase().includes('5 casos') ? 'Ya tienes cinco casos abiertos.' : 'No se pudo abrir el caso de soporte.')
}
