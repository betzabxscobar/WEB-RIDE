import { useState, type FormEvent } from 'react'
import { Camera, KeyRound, Mail, UserRound } from 'lucide-react'
import {
  changeOwnEmail,
  changeOwnPassword,
  removeOwnAvatar,
  updateOwnProfile,
  uploadOwnAvatar,
  type User,
} from '../lib/auth'
import { initials } from '../dashboard/formatters'

type Props = { user: User; onUserUpdate: (user: User) => void }

export function AccountSettings({ user, onUserUpdate }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const run = async (operation: () => Promise<void>, success: string) => {
    setBusy(true); setError(''); setNotice('')
    try { await operation(); setNotice(success) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos completar el cambio.') }
    finally { setBusy(false) }
  }

  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget))
    void run(async () => onUserUpdate(await updateOwnProfile({ name: String(values.name), phone: String(values.phone) })), 'Tus datos quedaron actualizados.')
  }

  const saveEmail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form))
    void run(async () => { await changeOwnEmail(user, String(values.email), String(values.currentPassword)); form.reset() }, 'Revisa el correo nuevo y confirma el cambio desde el enlace.')
  }

  const savePassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form))
    if (values.newPassword !== values.confirmPassword) { setNotice(''); setError('Las contraseñas nuevas no coinciden.'); return }
    void run(async () => { await changeOwnPassword(user, String(values.currentPassword), String(values.newPassword)); form.reset() }, 'Tu contraseña quedó actualizada.')
  }

  const chooseAvatar = (file?: File) => {
    if (!file) return
    void run(async () => onUserUpdate(await uploadOwnAvatar(user, file)), 'Tu foto quedó actualizada.')
  }

  return <section className="account-settings" aria-label="Cuenta y seguridad">
    <div className="account-settings-head"><span><UserRound size={21} aria-hidden /></span><div><h3>Cuenta y seguridad</h3><p>Edita tus datos y protege el acceso a Ride.</p></div></div>
    {notice && <p className="account-settings-feedback success" role="status">{notice}</p>}
    {error && <p className="account-settings-feedback error" role="alert">{error}</p>}
    <div className="account-avatar-editor">
      {user.avatarUrl ? <img src={user.avatarUrl} alt={`Foto de ${user.name}`} /> : <span>{initials(user.name)}</span>}
      <div><strong>Foto de perfil</strong><small>JPG, PNG o WebP de hasta 2 MB.</small><div><label className={busy ? 'disabled' : ''}><Camera size={15} aria-hidden />Elegir foto<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => chooseAvatar(event.target.files?.[0])}/></label>{user.avatarUrl && <button type="button" disabled={busy} onClick={() => void run(async () => onUserUpdate(await removeOwnAvatar(user)), 'Quitamos tu foto.')}>Quitar</button>}</div></div>
    </div>
    <form className="account-settings-form" onSubmit={saveProfile}><h4>Datos personales</h4><div><label>Nombre completo<input name="name" required minLength={3} defaultValue={user.name} autoComplete="name" /></label><label>Teléfono<input name="phone" inputMode="tel" defaultValue={user.phone} autoComplete="tel" /></label></div><button disabled={busy}>Guardar datos</button></form>
    <form className="account-settings-form" onSubmit={saveEmail}><h4><Mail size={16} aria-hidden />Cambiar correo</h4><div><label>Correo nuevo<input name="email" required type="email" autoComplete="email" /></label><label>Contraseña actual<input name="currentPassword" required type="password" autoComplete="current-password" /></label></div><button disabled={busy}>Solicitar cambio</button><small>El correo cambia únicamente después de abrir el enlace de confirmación.</small></form>
    <form className="account-settings-form" onSubmit={savePassword}><h4><KeyRound size={16} aria-hidden />Cambiar contraseña</h4><div><label>Contraseña actual<input name="currentPassword" required type="password" autoComplete="current-password" /></label><label>Contraseña nueva<input name="newPassword" required type="password" minLength={user.role === 'admin' || user.role === 'superadmin' ? 10 : 8} autoComplete="new-password" /></label><label>Repetir contraseña<input name="confirmPassword" required type="password" minLength={user.role === 'admin' || user.role === 'superadmin' ? 10 : 8} autoComplete="new-password" /></label></div><button disabled={busy}>Actualizar contraseña</button></form>
  </section>
}
