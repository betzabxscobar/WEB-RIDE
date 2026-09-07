/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState, type ReactElement } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'

export function useAppearance() {
  const [theme, setThemeState] = useState<ThemePreference>(() => (localStorage.getItem('ride-theme') as ThemePreference | null) ?? 'system')
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  const [reducedMotion, setReducedMotionState] = useState(() => localStorage.getItem('ride-reduced-motion') === 'true')
  useEffect(() => { const media = matchMedia('(prefers-color-scheme: dark)'); const update = (event: MediaQueryListEvent) => setSystemDark(event.matches); media.addEventListener('change', update); return () => media.removeEventListener('change', update) }, [])
  const darkMode = theme === 'dark' || (theme === 'system' && systemDark)
  useEffect(() => { document.documentElement.dataset.rideTheme = darkMode ? 'dark' : 'light' }, [darkMode])
  const setTheme = (value: ThemePreference) => { setThemeState(value); localStorage.setItem('ride-theme', value) }
  const setReducedMotion = (value: boolean) => { setReducedMotionState(value); localStorage.setItem('ride-reduced-motion', String(value)) }
  return { theme, darkMode, reducedMotion, setTheme, setReducedMotion }
}

import { Bell, Contrast, Monitor, PersonStanding, Sun } from 'lucide-react'
import { disableBrowserNotifications, enableBrowserNotifications, useRideBrowserNotifications } from '../lib/browser-notifications'

export function AppearanceSettings({ theme, reducedMotion, onTheme, onReducedMotion }: { theme: ThemePreference; reducedMotion: boolean; onTheme: (value: ThemePreference) => void; onReducedMotion: (value: boolean) => void }) {
  const options: { value: ThemePreference; icon: ReactElement; title: string; text: string }[] = [{ value: 'system', icon: <Monitor size={16} />, title: 'Usar el sistema', text: 'Cambia con tu dispositivo.' }, { value: 'light', icon: <Sun size={16} />, title: 'Modo claro', text: 'Mayor luminosidad.' }, { value: 'dark', icon: <Contrast size={16} />, title: 'Modo oscuro', text: 'Menor emisión de luz.' }]
  return <div className="settings-shared"><section className="settings-card"><div className="settings-card-head"><span>◐</span><div><h3>Apariencia</h3><p>Elige el tema visual de toda la web.</p></div></div><div className="theme-options">{options.map((item) => <button key={item.value} className={theme === item.value ? 'selected' : ''} onClick={() => onTheme(item.value)}><b>{item.icon}</b><span><strong>{item.title}</strong><small>{item.text}</small></span><i>{theme === item.value ? '✓' : ''}</i></button>)}</div></section><section className="settings-card accessibility-settings"><div className="settings-card-head"><span><PersonStanding size={20} aria-hidden /></span><div><h3>Accesibilidad</h3><p>Preferencias para una experiencia cómoda.</p></div></div><label className="settings-toggle"><span><strong>Reducir movimiento</strong><small>Desactiva animaciones decorativas.</small></span><input type="checkbox" checked={reducedMotion} onChange={(event) => onReducedMotion(event.target.checked)}/><i/></label></section><BrowserNotificationSettings/><small className="settings-storage">Estas preferencias se guardan en este navegador y se aplican a todos los paneles.</small></div>
}

export function BrowserNotificationSettings() {
  const state = useRideBrowserNotifications()
  const copy = state === 'enabled' ? 'Recibirás avisos aunque estés en otra pestaña.' : state === 'blocked' ? 'El navegador bloqueó los avisos. Debes habilitarlos desde sus permisos.' : state === 'unsupported' ? 'Este navegador no permite avisos del sistema.' : 'Activa los avisos de viajes y de tu cuenta.'
  const action = state === 'enabled' ? 'Desactivar' : state === 'blocked' || state === 'unsupported' ? null : 'Activar avisos'
  return <section className="settings-card browser-notification-settings"><div className="settings-card-head"><span><Bell size={20} aria-hidden /></span><div><h3>Avisos del navegador</h3><p>{copy}</p></div></div><div className={`notification-permission ${state}`}><div><strong>{state === 'enabled' ? 'Avisos activados' : state === 'blocked' ? 'Permiso bloqueado' : state === 'unsupported' ? 'No disponible' : 'Avisos desactivados'}</strong><small>Funcionan mientras Ride permanezca abierto, incluso en segundo plano.</small></div>{action && <button type="button" onClick={() => state === 'enabled' ? disableBrowserNotifications() : void enableBrowserNotifications()}>{action}</button>}</div></section>
}
