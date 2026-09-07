import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { browserNotificationState, disableBrowserNotifications, enableBrowserNotifications, showBrowserNotification } from './browser-notifications'

const created: FakeNotification[] = []

class FakeNotification {
  static permission: NotificationPermission = 'default'
  static requestPermission = vi.fn(async () => FakeNotification.permission)
  onclick: (() => void) | null = null
  title: string
  options?: NotificationOptions
  constructor(title: string, options?: NotificationOptions) {
    this.title = title
    this.options = options
    created.push(this)
  }
}

beforeEach(() => {
  created.length = 0
  FakeNotification.permission = 'default'
  FakeNotification.requestPermission.mockClear()
  vi.stubGlobal('Notification', FakeNotification)
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('avisos del navegador', () => {
  it('solo se activa después del permiso explícito', async () => {
    expect(browserNotificationState()).toBe('prompt')
    FakeNotification.permission = 'granted'
    expect(await enableBrowserNotifications()).toBe('enabled')
    expect(localStorage.getItem('ride-browser-notifications')).toBe('true')
  })

  it('respeta cuando el usuario los desactiva', () => {
    FakeNotification.permission = 'granted'
    localStorage.setItem('ride-browser-notifications', 'true')
    expect(disableBrowserNotifications()).toBe('disabled')
    expect(showBrowserNotification({ titulo: 'Viaje aceptado' })).toBe(false)
  })

  it('muestra un aviso real con una etiqueta estable', () => {
    FakeNotification.permission = 'granted'
    localStorage.setItem('ride-browser-notifications', 'true')
    expect(showBrowserNotification({ id: 'aviso-1', titulo: 'Chofer en camino', mensaje: 'Ya va hacia ti.' })).toBe(true)
    expect(created[0].title).toBe('Chofer en camino')
    expect(created[0].options).toMatchObject({ body: 'Ya va hacia ti.', tag: 'ride-aviso-1' })
  })
})
