import { useState, type FormEvent } from 'react'
import { Check, Clock, Landmark, MapPinned, Pencil, Plus, Trash2, WalletCards } from 'lucide-react'
import type { Bank, BankAccount, WorkZone } from '../lib/driver-account'
import { hasExpired, hasUnfinishedPayment, isCourtesy, isExpiringSoon, type DriverSubscription } from '../lib/subscription'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** «hasta el 9 de octubre» */
function fecha(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} de ${MESES[d.getMonth()]}`
}

/** «Te quedan 12 días (hasta el 9 de octubre).» */
function restante(subscription: DriverSubscription): string {
  if (subscription.daysLeft == null || subscription.validUntil == null) return ''
  const dias = subscription.daysLeft === 1 ? 'Te queda 1 día' : `Te quedan ${subscription.daysLeft} días`
  return `${dias} (hasta el ${fecha(subscription.validUntil)}).`
}

/**
 * La cuota mensual del chofer: 15 USD para poder recibir viajes.
 *
 * Lo que se ve aquí es un espejo de lo que dice Postgres, no la verdad. El
 * corte de verdad está en `aceptar_viaje()`: aunque alguien parchee esta
 * pantalla, el servidor le sigue rebotando los viajes.
 *
 * Volver de PayPal **no** activa nada: quien da la cuota por pagada es el
 * webhook. Por eso al volver se ofrece «Ya pagué» en vez de darlo por hecho.
 */
export function SubscriptionPage({ subscription, busy, reviewOnly, returned, onPay, onRefresh }: { subscription: DriverSubscription; busy: boolean; reviewOnly: boolean; returned: boolean; onPay: () => void; onRefresh: () => void }) {
  const cortesia = isCourtesy(subscription)
  const aMedias = hasUnfinishedPayment(subscription)
  const vencida = hasExpired(subscription)

  const [tono, titulo, detalle] = subscription.active && cortesia
    ? ['info', 'Mes de cortesía', `Te regalamos el primer mes por ya estar con nosotros. ${restante(subscription)} Después son $15 al mes.`]
    : isExpiringSoon(subscription)
      ? ['danger', 'Se te acaba pronto', `${restante(subscription)} Renuévala para no quedarte sin recibir viajes.`]
      : subscription.active
        ? ['ok', 'Al día', `${restante(subscription)} Puedes recibir viajes con normalidad.`]
        : vencida
          ? ['danger', 'Se te venció', 'Mientras no la renueves no te llegan solicitudes ni puedes ponerte en línea.']
          : ['danger', 'Sin pagar', 'Necesitas la cuota mensual para empezar a recibir viajes.']

  // Al que ya está al día no se le ofrece pagar otra vez: pagaría doble. Salvo
  // que tenga un pago a medias, que sí conviene que termine.
  const soloRevisar = subscription.active && !cortesia && !aMedias

  return <div className="driver-page"><section className="driver-section-head"><span>CUOTA MENSUAL</span><h2>Tu cuota</h2><p>15 USD al mes para recibir viajes. Se cobra solo, y puedes darla de baja desde PayPal cuando quieras.</p></section>
    <section className={`driver-tool-card subscription-state ${tono}`}><small>TU CUOTA</small><h3>{titulo}</h3><p>{detalle}</p></section>
    <section className="driver-tool-card"><div className="driver-tool-card-title"><WalletCards size={22} aria-hidden /><div><h3>$15 USD al mes</h3><p>Lo que incluye mientras esté al día.</p></div></div>
      <ul className="subscription-perks"><li><Check size={16} aria-hidden /> Recibes las solicitudes de tu zona</li><li><Check size={16} aria-hidden /> Te puedes poner en línea cuando quieras</li><li><Check size={16} aria-hidden /> Sin límite de viajes: lo que ganes es tuyo</li></ul>
      <p className="subscription-note">Se cobra solo cada mes. Si la das de baja, sigues trabajando hasta que termine el mes que ya pagaste.</p>
      {aMedias && <p className="subscription-warning"><Clock size={15} aria-hidden /> Dejaste un pago a medias en PayPal ({subscription.unfinishedPayment}). Mientras no lo apruebes no cuenta como pagado.</p>}
      {returned && !subscription.active && <p className="subscription-warning"><Clock size={15} aria-hidden /> PayPal puede tardar unos segundos en confirmarnos el pago. Si acabas de pagar, toca «Ya pagué».</p>}
      <footer>{subscription.reference && <small>Referencia de PayPal: {subscription.reference}</small>}
        {soloRevisar
          ? <button className="primary" disabled={busy} onClick={onRefresh}>Actualizar estado</button>
          : returned
            ? <button className="primary" disabled={busy} onClick={onRefresh}>Ya pagué</button>
            : <button className="primary" disabled={busy || reviewOnly} onClick={onPay}>{busy ? 'Abriendo PayPal…' : aMedias ? 'Terminar el pago' : cortesia ? 'Pagar por adelantado' : vencida ? 'Renovar por $15' : 'Pagar $15 con PayPal'}</button>}
      </footer>
    </section>
  </div>
}

export function WorkZonesPage({ zones, busy, reviewOnly, onSave }: { zones: WorkZone[]; busy: boolean; reviewOnly: boolean; onSave: (ids: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>(zones.filter((zone) => zone.selected).map((zone) => zone.id))
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  return <div className="driver-page"><section className="driver-section-head"><span>ZONAS DE TRABAJO</span><h2>¿Dónde quieres recibir viajes?</h2><p>Marca las zonas que prefieres. Si no eliges ninguna, Ride seguirá mostrándote solicitudes cercanas sin restringirlas por zona.</p></section><section className="driver-tool-card"><div className="driver-tool-card-title"><MapPinned size={22} aria-hidden /><div><h3>Zonas disponibles</h3><p>Solo recibirás viajes cuyo origen y tu ubicación estén dentro de una zona elegida.</p></div></div><div className="work-zone-grid">{zones.map((zone) => <button type="button" key={zone.id} className={selected.includes(zone.id) ? 'selected' : ''} disabled={busy || reviewOnly} onClick={() => toggle(zone.id)}><span>{selected.includes(zone.id) ? <Check size={17} aria-hidden /> : <MapPinned size={17} aria-hidden />}</span><strong>{zone.name}</strong></button>)}</div>{zones.length === 0 && <p className="driver-tool-empty">No hay zonas configuradas en la base de datos.</p>}<footer><small>{selected.length ? `${selected.length} ${selected.length === 1 ? 'zona elegida' : 'zonas elegidas'}` : 'Sin restricciones por zona'}</small><button className="primary" disabled={busy || reviewOnly || zones.length === 0} onClick={() => onSave(selected)}>{busy ? 'Guardando…' : 'Guardar zonas'}</button></footer></section></div>
}

export function BankAccountsPage({ banks, accounts, busy, reviewOnly, onSave, onDelete }: { banks: Bank[]; accounts: BankAccount[]; busy: boolean; reviewOnly: boolean; onSave: (input: { id?: string; bank: string; type: BankAccount['type']; number: string; holder: string; holderId?: string; preferred: boolean }) => void; onDelete: (id: string) => void }) {
  const [editing, setEditing] = useState<BankAccount | null>(null)
  const [showForm, setShowForm] = useState(accounts.length === 0)
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget))
    onSave({ id: editing?.id, bank: String(values.bank), type: String(values.type) as BankAccount['type'], number: String(values.number), holder: String(values.holder), holderId: String(values.holderId), preferred: values.preferred === 'on' })
    setShowForm(false); setEditing(null)
  }
  return <div className="driver-page"><section className="driver-section-head with-action"><div><span>DATOS PARA COBRAR</span><h2>Cuentas bancarias</h2><p>El pasajero solo puede ver estos datos después de compartir un viaje contigo.</p></div><button disabled={reviewOnly} onClick={() => { setEditing(null); setShowForm(true) }}><Plus size={15} aria-hidden />Agregar cuenta</button></section>{showForm && <form className="bank-account-form" onSubmit={submit}><h3>{editing ? 'Editar cuenta' : 'Nueva cuenta'}</h3><div><label>Banco<select required name="bank" defaultValue={editing?.bank ?? ''}><option value="" disabled>Selecciona un banco</option>{banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name}</option>)}</select></label><label>Tipo<select required name="type" defaultValue={editing?.type ?? 'ahorros'}><option value="ahorros">Ahorros</option><option value="corriente">Corriente</option></select></label><label>Número de cuenta<input required name="number" inputMode="numeric" pattern="[0-9 -]{6,24}" defaultValue={editing?.number ?? ''}/></label><label>Titular<input required name="holder" minLength={3} defaultValue={editing?.holder ?? ''}/></label><label>Cédula del titular <small>opcional</small><input name="holderId" inputMode="numeric" pattern="[0-9]{10}" defaultValue={editing?.holderId ?? ''}/></label><label className="bank-preferred"><input type="checkbox" name="preferred" defaultChecked={editing?.preferred ?? true}/><span>Usar como cuenta principal</span></label></div><footer><button type="button" onClick={() => { setShowForm(false); setEditing(null) }}>Cancelar</button><button className="primary" disabled={busy || reviewOnly || banks.length === 0}>Guardar cuenta</button></footer></form>}<div className="bank-account-list">{accounts.map((account) => <article key={account.id}><span style={{ background: account.bankColor ?? '#164758' }}><Landmark size={20} aria-hidden /></span><div><h3>{account.bankName}{account.preferred && <b>Principal</b>}</h3><p>Cuenta de {account.type} · {account.number}</p><small>{account.holder}{account.holderId ? ` · C.I. ${account.holderId}` : ''}</small></div><div><button aria-label={`Editar cuenta ${account.number}`} disabled={reviewOnly} onClick={() => { setEditing(account); setShowForm(true) }}><Pencil size={15} aria-hidden /></button><button aria-label={`Eliminar cuenta ${account.number}`} disabled={busy || reviewOnly} onClick={() => onDelete(account.id)}><Trash2 size={15} aria-hidden /></button></div></article>)}</div>{accounts.length === 0 && !showForm && <p className="driver-tool-empty">Todavía no registraste una cuenta para recibir transferencias.</p>}</div>
}
