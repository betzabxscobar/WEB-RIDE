import { supabase } from './supabase'

export type TicketStatus = 'abierto' | 'en_proceso' | 'resuelto' | 'cerrado'
export type SupportTicket = {
  id: string
  userId?: string
  tripId?: string | null
  category: string
  subject: string
  message: string
  status: TicketStatus
  answer: string | null
  answeredAt?: string | null
  createdAt: string
  authorName?: string | null
  authorEmail?: string | null
}

type TicketRow = {
  id: string
  usuario_id?: string
  viaje_id?: string | null
  categoria: string
  asunto: string
  mensaje: string
  estado: TicketStatus
  respuesta: string | null
  respondido_en?: string | null
  created_at: string
  profiles?: { full_name?: string | null; email?: string | null } | null
}

const mapTicket = (row: TicketRow): SupportTicket => ({
  id: row.id,
  userId: row.usuario_id,
  tripId: row.viaje_id,
  category: row.categoria,
  subject: row.asunto,
  message: row.mensaje,
  status: row.estado,
  answer: row.respuesta,
  answeredAt: row.respondido_en,
  createdAt: row.created_at,
  authorName: row.profiles?.full_name,
  authorEmail: row.profiles?.email,
})

export async function listMyTickets(userId: string): Promise<SupportTicket[]> {
  const { data, error } = await supabase.from('tickets_soporte').select('id, categoria, asunto, mensaje, estado, respuesta, created_at').eq('usuario_id', userId).order('created_at', { ascending: false })
  if (error) throw new Error('No se pudieron cargar tus casos de soporte.')
  return (data ?? []).map((row) => mapTicket(row as TicketRow))
}

export async function openTicket(subject: string, message: string, category: string, tripId?: string): Promise<void> {
  const { error } = await supabase.rpc('abrir_ticket', { p_asunto: subject.trim(), p_mensaje: message.trim(), p_categoria: category, p_viaje_id: tripId ?? null })
  if (error) throw new Error(error.message.toLowerCase().includes('5 casos') ? 'Ya tienes cinco casos abiertos.' : 'No se pudo abrir el caso de soporte.')
}

export async function listAllTickets(status?: TicketStatus): Promise<SupportTicket[]> {
  let query = supabase
    .from('tickets_soporte')
    .select('id, usuario_id, viaje_id, categoria, asunto, mensaje, estado, respuesta, respondido_en, created_at, profiles!tickets_soporte_usuario_id_fkey(full_name, email)')
  if (status) query = query.eq('estado', status)
  const { data, error } = await query.order('created_at', { ascending: true })
  if (error) throw new Error('No se pudo cargar la bandeja de soporte.')
  return (data ?? []).map((row) => mapTicket(row as unknown as TicketRow))
}

export async function answerTicket(ticketId: string, answer: string, status: TicketStatus): Promise<void> {
  const cleanAnswer = answer.trim()
  if (!cleanAnswer) throw new Error('Escribe una respuesta antes de enviarla.')
  const { error } = await supabase.rpc('responder_ticket', {
    p_ticket_id: ticketId,
    p_respuesta: cleanAnswer,
    p_estado: status,
  })
  if (error) throw new Error('No se pudo guardar la respuesta. Comprueba tus permisos e inténtalo otra vez.')
}
