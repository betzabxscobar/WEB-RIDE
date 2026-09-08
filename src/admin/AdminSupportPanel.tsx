import { useCallback, useEffect, useState } from 'react'
import { CircleHelp, MessageSquareReply, RefreshCw, Send } from 'lucide-react'
import { answerTicket, listAllTickets, type SupportTicket, type TicketStatus } from '../lib/support'

const statusLabels: Record<TicketStatus, string> = { abierto: 'Abierto', en_proceso: 'En proceso', resuelto: 'Resuelto', cerrado: 'Cerrado' }
const categoryLabels: Record<string, string> = { viaje: 'Viaje', pago: 'Cobro', cuenta: 'Cuenta', conductor: 'Conductor', otro: 'Otro' }

export default function AdminSupportPanel() {
  const [filter, setFilter] = useState<TicketStatus | ''>('abierto')
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [selected, setSelected] = useState<SupportTicket | null>(null)
  const [answer, setAnswer] = useState('')
  const [nextStatus, setNextStatus] = useState<TicketStatus>('resuelto')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setTickets(await listAllTickets(filter || undefined)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo cargar soporte.') }
    finally { setLoading(false) }
  }, [filter])

  useEffect(() => {
    let active = true
    listAllTickets(filter || undefined)
      .then((rows) => { if (active) { setTickets(rows); setError('') } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'No se pudo cargar soporte.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filter])

  const openAnswer = (ticket: SupportTicket) => {
    setSelected(ticket); setAnswer(ticket.answer ?? '')
    setNextStatus(ticket.status === 'cerrado' ? 'cerrado' : 'resuelto'); setError('')
  }

  const submit = async () => {
    if (!selected) return
    setSaving(true); setError('')
    try { await answerTicket(selected.id, answer, nextStatus); setSelected(null); await load() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo responder.') }
    finally { setSaving(false) }
  }

  return <div className="admin-content admin-tool-page">
    <section className="overview-heading"><small>ATENCIÓN AL USUARIO</small><h2>Bandeja de soporte</h2><p>Los casos con más tiempo aparecen primero para atenderlos en orden.</p></section>
    <section className="admin-card support-panel">
      <div className="admin-card-head"><div><h3>Casos registrados</h3><p>Responde sin salir del panel.</p></div><button type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} />Actualizar</button></div>
      <div className="tool-filters" role="group" aria-label="Filtrar casos">
        {([['abierto', 'Abiertos'], ['en_proceso', 'En proceso'], ['resuelto', 'Resueltos'], ['', 'Todos']] as const).map(([value, label]) => <button key={label} type="button" className={filter === value ? 'active' : ''} onClick={() => { setLoading(true); setFilter(value) }}>{label}</button>)}
      </div>
      {error && !selected && <p className="admin-error">{error}</p>}
      {loading && <p className="admin-empty">Cargando casos…</p>}
      {!loading && !error && tickets.length === 0 && <div className="tool-empty"><CircleHelp size={32} /><strong>No hay casos en este estado</strong><span>Cuando llegue uno aparecerá aquí.</span></div>}
      {!loading && tickets.map((ticket) => <article className="support-row" key={ticket.id}>
        <div className="support-row-top"><span className={`ticket-state ${ticket.status}`}>{statusLabels[ticket.status]}</span><small>{categoryLabels[ticket.category] ?? ticket.category} · {new Date(ticket.createdAt).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' })}</small></div>
        <h4>{ticket.subject}</h4><p>{ticket.message}</p>
        <div className="support-author"><strong>{ticket.authorName || 'Usuario'}</strong><span>{ticket.authorEmail || 'Correo no disponible'}{ticket.tripId ? ` · Viaje ${ticket.tripId.slice(0, 8)}` : ''}</span></div>
        {ticket.answer && <blockquote><strong>Respuesta enviada</strong>{ticket.answer}</blockquote>}
        <button className="tool-primary" type="button" onClick={() => openAnswer(ticket)}><MessageSquareReply size={16} />{ticket.answer ? 'Editar respuesta' : 'Responder'}</button>
      </article>)}
    </section>
    {selected && <div className="account-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setSelected(null) }}>
      <section className="account-dialog support-dialog" role="dialog" aria-modal="true" aria-labelledby="support-dialog-title">
        <h2 id="support-dialog-title">Responder: {selected.subject}</h2><p>La persona verá este mensaje en sus casos de soporte.</p>
        <label>Respuesta<textarea autoFocus maxLength={2000} rows={6} value={answer} onChange={(event) => setAnswer(event.target.value)} /></label>
        <label>Estado<select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as TicketStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {error && <span className="account-form-error">{error}</span>}
        <footer><button type="button" onClick={() => setSelected(null)} disabled={saving}>Cancelar</button><button type="button" onClick={() => void submit()} disabled={saving || !answer.trim()}><Send size={15} />{saving ? 'Guardando…' : 'Enviar respuesta'}</button></footer>
      </section>
    </div>}
  </div>
}
