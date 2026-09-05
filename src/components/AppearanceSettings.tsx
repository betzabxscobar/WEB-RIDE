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

import { Monitor, PersonStanding, Sun, Moon } from 'lucide-react'

export function AppearanceSettings({ theme, reducedMotion, onTheme, onReducedMotion }: { theme: ThemePreference; reducedMotion: boolean; onTheme: (value: ThemePreference) => void; onReducedMotion: (value: boolean) => void }) {
  const options: { value: ThemePreference; icon: ReactElement; title: string; text: string }[] = [{ value: 'system', icon: <Monitor size={16} />, title: 'Usar el sistema', text: 'Cambia con tu dispositivo.' }, { value: 'light', icon: <Sun size={16} />, title: 'Modo claro', text: 'Fondo luminoso.' }, { value: 'dark', icon: <Moon size={16} />, title: 'Modo oscuro', text: 'Reduce el brillo.' }]
  return <div className="settings-shared"><section className="settings-card"><div className="settings-card-head"><span>◐</span><div><h3>Apariencia</h3><p>Elige el tema visual de toda la web.</p></div></div><div className="theme-options">{options.map((item) => <button key={item.value} className={theme === item.value ? 'selected' : ''} onClick={() => onTheme(item.value)}><b>{item.icon}</b><span><strong>{item.title}</strong><small>{item.text}</small></span><i>{theme === item.value ? '✓' : ''}</i></button>)}</div></section><section className="settings-card accessibility-settings"><div className="settings-card-head"><span><PersonStanding size={20} aria-hidden /></span><div><h3>Accesibilidad</h3><p>Preferencias para una experiencia cómoda.</p></div></div><label className="settings-toggle"><span><strong>Reducir movimiento</strong><small>Desactiva animaciones decorativas.</small></span><input type="checkbox" checked={reducedMotion} onChange={(event) => onReducedMotion(event.target.checked)}/><i/></label></section><small className="settings-storage">Estas preferencias se guardan en este navegador y se aplican a todos los paneles.</small></div>
}
