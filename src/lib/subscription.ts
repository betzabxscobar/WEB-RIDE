import { supabase } from './supabase'

/**
 * La cuota mensual que paga el chofer para poder recibir viajes.
 *
 * Es un espejo de `mi_suscripcion()`. Quien decide es Postgres: aunque esto
 * dijera «al día», el servidor le sigue rebotando los viajes. El corte está en
 * tres sitios —ponerse disponible, ver solicitudes y aceptar—, y el que de
 * verdad protege el dinero es el tercero.
 */
export type DriverSubscription = {
  /** `pendiente`, `activa`, `vencida` o `cancelada`. */
  status: string
  /** Si hoy puede trabajar. Mira la fecha, no solo el estado. */
  active: boolean
  amount: number
  currency: string
  /** `paypal`, o `cortesia` para el mes de arranque que se regaló. */
  provider: string
  validUntil: string | null
  daysLeft: number | null
  /** El id de la suscripción en PayPal (`I-…`). Sirve para dar soporte. */
  reference: string | null
  /**
   * Una suscripción que se abrió en PayPal y nadie llegó a aprobar.
   *
   * No sirve para trabajar, pero hay que decirlo: si no, el chofer se queda
   * creyendo que pagó.
   */
  unfinishedPayment: string | null
}

/** Lo que se asume cuando no hay respuesta: no ha pagado. Nunca al revés. */
export const UNPAID: DriverSubscription = {
  status: 'pendiente',
  active: false,
  amount: 15,
  currency: 'USD',
  provider: 'paypal',
  validUntil: null,
  daysLeft: null,
  reference: null,
  unfinishedPayment: null,
}

/** Tiene un pago a medias y no es lo que le está dejando trabajar. */
export function hasUnfinishedPayment(subscription: DriverSubscription): boolean {
  return subscription.unfinishedPayment != null && subscription.unfinishedPayment !== subscription.reference
}

/** El mes de arranque que se regaló a los choferes que ya estaban. */
export function isCourtesy(subscription: DriverSubscription): boolean {
  return subscription.provider === 'cortesia'
}

/** Le quedan pocos días: el aviso sale antes de que se quede sin trabajar. */
export function isExpiringSoon(subscription: DriverSubscription): boolean {
  return subscription.active && (subscription.daysLeft ?? 99) <= 5
}

/**
 * Pagó alguna vez y se le acabó, que no es lo mismo que no haber pagado nunca:
 * al que ya pagó se le habla de renovar, no de empezar.
 */
export function hasExpired(subscription: DriverSubscription): boolean {
  return !subscription.active && subscription.validUntil != null
}

export async function getMySubscription(): Promise<DriverSubscription> {
  const { data, error } = await supabase.rpc('mi_suscripcion')
  // Sin conexión no se le da por pagada a nadie: se enseña el panel de cobro y
  // el servidor sigue siendo quien decide.
  if (error) return UNPAID

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined
  if (!row) return UNPAID

  return {
    status: (row.estado as string) ?? 'pendiente',
    active: row.vigente === true,
    amount: Number(row.monto ?? 15),
    currency: (row.moneda as string) ?? 'USD',
    provider: (row.proveedor as string) ?? 'paypal',
    validUntil: (row.vigente_hasta as string | null) ?? null,
    daysLeft: row.dias_restantes == null ? null : Number(row.dias_restantes),
    reference: (row.referencia_externa as string | null) ?? null,
    unfinishedPayment: (row.pago_sin_terminar as string | null) ?? null,
  }
}

/**
 * Abre la suscripción en PayPal y devuelve dónde se aprueba.
 *
 * Ni el importe ni el plan viajan desde aquí: los pone la Edge Function desde
 * sus variables de entorno. Y volver de PayPal **no** activa nada — quien da
 * por pagada la cuota es el webhook, que es lo único que la base deja escribir.
 */
export async function openSubscriptionCheckout(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('suscripcion-paypal')
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status
    if (status === 403) throw new Error('Solo un chofer paga la cuota mensual.')
    if (status === 404 || status === 503) throw new Error('El cobro con PayPal todavía no está configurado.')
    throw new Error('No pudimos abrir el pago. Inténtalo de nuevo en un momento.')
  }
  const row = data as Record<string, unknown>
  const url = typeof row?.aprobar_en === 'string' ? row.aprobar_en : ''
  if (!url) throw new Error('PayPal respondió algo que no entendemos.')
  return url
}
