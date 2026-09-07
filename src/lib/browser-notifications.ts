import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const STORAGE_KEY = 'ride-browser-notifications'
const CHANGE_EVENT = 'ride-browser-notifications-change'

export type BrowserNotificationState = 'unsupported' | 'disabled' | 'prompt' | 'blocked' | 'enabled'

type NotificationRow = {
  id?: string
  titulo?: string
  mensaje?: string
}

export function browserNotificationState(): BrowserNotificationState {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  if (Notification.permission !== 'granted') return 'prompt'
  return localStorage.getItem(STORAGE_KEY) === 'true' ? 'enabled' : 'disabled'
}

function announceChange() {
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export async function enableBrowserNotifications(): Promise<BrowserNotificationState> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'unsupported'
  const permission = Notification.permission === 'default'
    ? await Notification.requestPermission()
    : Notification.permission
  localStorage.setItem(STORAGE_KEY, String(permission === 'granted'))
  announceChange()
  return browserNotificationState()
}

export function disableBrowserNotifications(): BrowserNotificationState {
  localStorage.setItem(STORAGE_KEY, 'false')
  announceChange()
  return browserNotificationState()
}

export function showBrowserNotification(row: NotificationRow): boolean {
  const title = row.titulo?.trim()
  if (!title || browserNotificationState() !== 'enabled') return false
  const notification = new Notification(title, {
    body: row.mensaje?.trim() || undefined,
    tag: row.id ? `ride-${row.id}` : undefined,
    icon: '/favicon.ico',
  })
  notification.onclick = () => window.focus()
  return true
}

/** Escucha avisos reales mientras la pestaña de Ride continúa abierta. */
export function useRideBrowserNotifications(userId?: string) {
  const [state, setState] = useState<BrowserNotificationState>(browserNotificationState)

  useEffect(() => {
    const update = () => setState(browserNotificationState())
    window.addEventListener(CHANGE_EVENT, update)
    return () => window.removeEventListener(CHANGE_EVENT, update)
  }, [])

  useEffect(() => {
    if (!userId || state !== 'enabled') return
    const channel = supabase
      .channel(`avisos-navegador-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `usuario_id=eq.${userId}` },
        (payload) => showBrowserNotification(payload.new as NotificationRow),
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [state, userId])

  return state
}
