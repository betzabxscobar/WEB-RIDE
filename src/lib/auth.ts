import { supabase } from './supabase'
import { AVATAR_PHOTO, preparePhoto } from './image-upload'


/**
 * A dónde vuelven los enlaces de los correos de acceso.
 *
 * Con el origen solo, en GitHub Pages el enlace perdía `/WEB-RIDE/` y terminaba
 * en un 404. Cada dirección tiene que estar además en Supabase → Authentication
 * → URL Configuration → Redirect URLs, o Supabase manda al Site URL. Los
 * correos salen por Brevo, pero esa lista la sigue decidiendo Supabase.
 */
const vueltaDeCorreo = () => `${window.location.origin}${import.meta.env.BASE_URL}`
export type Role = 'passenger' | 'driver' | 'admin' | 'superadmin'

/**
 * Vistas a las que puede entrar una cuenta con ese rol.
 *
 * Es la regla central del cambio de panel:
 *
 * - `superadmin`: su panel, administración, pasajero y conductor.
 * - `admin`: administración, pasajero y conductor. **Nunca** superadmin.
 * - `driver`: chofer y usuario.
 * - `passenger`: solo usuario.
 *
 * Decide qué se ofrece en pantalla. Los permisos sobre los datos los sigue
 * resolviendo RLS con el rol real de la cuenta: alguien que abre la vista de
 * pasajero no obtiene permisos de pasajero, solo ve esa interfaz con sus
 * propios datos.
 */
export function viewsAllowed(role: Role): Role[] {
  switch (role) {
    case 'superadmin':
      return ['superadmin', 'admin', 'passenger', 'driver']
    case 'admin':
      return ['admin', 'passenger', 'driver']
    case 'driver':
      return ['driver', 'passenger']
    default:
      return ['passenger']
  }
}

/** Nombre de la vista. Nombra la pantalla, no la cuenta. */
export function panelLabel(view: Role): string {
  switch (view) {
    case 'superadmin':
      return 'Panel de superadmin'
    case 'admin':
      return 'Panel de administración'
    case 'driver':
      return 'Vista de chofer'
    default:
      return 'Vista de usuario'
  }
}

export type User = {
  id: string
  name: string
  email: string
  phone: string
  role: Role
  mustChangePassword: boolean
  createdAt: string
  avatarUrl: string | null
}

/**
 * El rol se lee de `public.profiles`, no de `app_metadata` del JWT.
 *
 * El diseño original (docs/CONEXION_SUPABASE.md) planeaba leerlo del token,
 * pero en la base real `app_metadata.role` está vacío en las cinco cuentas y
 * las políticas RLS resuelven el rol con `current_user_role()`, que consulta
 * la tabla. Leerlo del token daría `undefined` y dejaría a todos sin permisos.
 */
type ProfileRow = {
  id: string
  email: string
  full_name: string | null
  phone: string | null
  role: Role
  must_change_password: boolean
  created_at: string
  foto_url: string | null
}

const PROFILE_COLUMNS = 'id, email, full_name, phone, role, must_change_password, created_at, foto_url'

export function toUser(row: ProfileRow): User {
  return {
    id: row.id,
    name: row.full_name?.trim() || row.email.split('@')[0],
    email: row.email,
    phone: row.phone ?? '',
    role: row.role,
    mustChangePassword: row.must_change_password,
    createdAt: row.created_at,
    avatarUrl: row.foto_url ?? null,
  }
}

/** Perfil del usuario de la sesión actual. `null` si no hay sesión. */
export async function loadCurrentUser(): Promise<User | null> {
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user.id
  if (!userId) return null

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle<ProfileRow>()

  if (error) throw new Error('No pudimos cargar tu perfil.')
  if (!data) throw new Error('Tu cuenta no tiene un perfil asociado.')
  return toUser(data)
}

export async function signIn(email: string, password: string): Promise<User> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })
  if (error) throw new Error(translateAuthError(error.message))

  const user = await loadCurrentUser()
  if (!user) throw new Error('No pudimos iniciar tu sesión.')
  return user
}

export type SignUpResult =
  | { status: 'active'; user: User }
  | { status: 'needs_email_confirmation' }

export async function signUp(input: {
  name: string
  email: string
  phone: string
  password: string
  role: 'passenger' | 'driver'
}): Promise<SignUpResult> {
  // El trigger handle_new_user() descarta cualquier rol administrativo que
  // llegue desde aquí, así que el formulario público no puede escalar.
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: {
      // Devuelve al usuario al mismo origen desde el que se registró, así el
      // enlace del correo funciona igual en desarrollo y en producción sin
      // tocar código. Cada origen debe estar en Authentication → URL
      // Configuration → Redirect URLs, o Supabase lo rechaza.
      emailRedirectTo: vueltaDeCorreo(),
      data: {
        full_name: input.name.trim(),
        phone: input.phone.trim(),
        role: input.role,
      },
    },
  })
  if (error) throw new Error(translateAuthError(error.message))

  // Sin sesión = el proyecto exige confirmar el correo antes de entrar.
  if (!data.session) return { status: 'needs_email_confirmation' }

  const user = await loadCurrentUser()
  if (!user) throw new Error('Creamos la cuenta pero no pudimos cargar tu perfil.')
  return { status: 'active', user }
}

export async function signOut() {
  await supabase.auth.signOut()
}

/**
 * Cambio de contraseña del primer acceso administrativo.
 *
 * Se hace con la sesión del propio usuario: `updateUser` cambia la clave en
 * Auth y la política `profiles_update_own` permite bajar la bandera. No hace
 * falta la Edge Function ni la clave service_role.
 */
export async function changeInitialPassword(newPassword: string): Promise<User> {
  const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword })
  if (passwordError) throw new Error(translateAuthError(passwordError.message))

  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user.id
  if (!userId) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.')

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ must_change_password: false, updated_at: new Date().toISOString() })
    .eq('id', userId)

  if (profileError) throw new Error('Cambiamos la contraseña pero no pudimos actualizar tu cuenta.')

  const user = await loadCurrentUser()
  if (!user) throw new Error('No pudimos recargar tu perfil.')
  return user
}

/**
 * Pide el correo con el enlace para restablecer la contraseña.
 *
 * No revela si el correo existe: Supabase responde igual en ambos casos y la
 * pantalla muestra siempre el mismo aviso, para no filtrar qué cuentas hay.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    { redirectTo: vueltaDeCorreo() },
  )
  if (error) throw new Error(translateAuthError(error.message))
}

/**
 * Fija la contraseña nueva al volver desde el enlace del correo.
 *
 * Cuando la persona abre ese enlace, Supabase deja una sesión de recuperación
 * activa; `updateUser` la usa para cambiar la clave. Por eso no hace falta
 * pedir la contraseña anterior.
 */
export async function completePasswordReset(newPassword: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) {
    throw new Error(
      'El enlace expiró o ya se usó. Pide uno nuevo desde «¿Olvidaste tu contraseña?».',
    )
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw new Error(translateAuthError(error.message))
}

/**
 * Convierte la cuenta de pasajero actual en cuenta de chofer.
 *
 * El servidor conserva el historial y crea la ficha del conductor pendiente
 * de revisión. La interfaz nunca cambia el rol por su cuenta: vuelve a leer
 * `profiles` después del RPC para respetar la decisión de la base de datos.
 */
export async function convertPassengerToDriver(): Promise<User> {
  const { error } = await supabase.rpc('quiero_ser_chofer')
  if (error) throw new Error(translateDriverConversionError(error.message))

  const user = await loadCurrentUser()
  if (!user) throw new Error('Actualizamos tu cuenta, pero no pudimos recargar el perfil.')
  return user
}

export function translateDriverConversionError(message: string): string {
  const normalized = message.toLowerCase()
  if (normalized.includes('termina tu viaje')) return 'Termina o cancela tu viaje activo antes de pasarte a chofer.'
  if (normalized.includes('solo una cuenta de pasajero')) return 'Solo una cuenta de pasajero puede solicitar el cambio a chofer.'
  if (normalized.includes('debes iniciar sesion')) return 'Tu sesión expiró. Vuelve a iniciar sesión.'
  if (normalized.includes('no encontramos tu perfil')) return 'No encontramos el perfil de tu cuenta.'
  return 'No pudimos cambiar tu cuenta a chofer. Intenta nuevamente.'
}

/** Actualiza los datos editables del perfil de la sesión actual. */
export async function updateOwnProfile(input: { name: string; phone: string }): Promise<User> {
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user.id
  if (!userId) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.')

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: input.name.trim(),
      phone: input.phone.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (error) throw new Error('No pudimos actualizar tu perfil.')
  const user = await loadCurrentUser()
  if (!user) throw new Error('Actualizamos tus datos, pero no pudimos recargar el perfil.')
  return user
}

async function reauthenticate(email: string, password: string): Promise<void> {
  if (!password) throw new Error('Ingresa tu contraseña actual.')
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
  if (error) {
    if (error.message.toLowerCase().includes('invalid login credentials')) throw new Error('Tu contraseña actual no es correcta.')
    throw new Error(translateAuthError(error.message))
  }
}

/** Solicita el cambio de correo después de comprobar la contraseña actual. */
export async function changeOwnEmail(user: User, email: string, currentPassword: string): Promise<void> {
  const normalized = email.trim().toLowerCase()
  if (normalized === user.email.trim().toLowerCase()) throw new Error('Ese ya es tu correo actual.')
  await reauthenticate(user.email, currentPassword)
  const { error } = await supabase.auth.updateUser(
    { email: normalized },
    { emailRedirectTo: vueltaDeCorreo() },
  )
  if (error) throw new Error(translateAuthError(error.message))
}

/** Cambia la contraseña después de comprobar que la actual pertenece al usuario. */
export async function changeOwnPassword(user: User, currentPassword: string, newPassword: string): Promise<void> {
  // La misma regla que Supabase para todos los roles: con 8 para pasajeros y
  // choferes, el formulario dejaba pasar una que el servidor rechazaba.
  const debil = validatePassword(newPassword)
  if (debil) throw new Error(debil)
  if (newPassword === currentPassword) throw new Error('Elige una contraseña distinta a la actual.')
  await reauthenticate(user.email, currentPassword)
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw new Error(translateAuthError(error.message))
}

/** Guarda una foto pública, pero restringe la escritura a la carpeta del usuario mediante RLS. */
export async function uploadOwnAvatar(user: User, file: File): Promise<User> {
  // Reducida y sin EXIF: el bucket es público, y una foto tal cual sale del
  // móvil lleva las coordenadas de donde se tomó. Ver image-upload.ts.
  const photo = await preparePhoto(file, AVATAR_PHOTO, 'perfil')
  const path = `${user.id}/perfil.jpg`
  const { error: uploadError } = await supabase.storage.from('avatares').upload(path, photo, { upsert: true, contentType: photo.type })
  if (uploadError) throw new Error('No pudimos subir la foto. Revisa el archivo e inténtalo nuevamente.')
  const { data } = supabase.storage.from('avatares').getPublicUrl(path)
  const avatarUrl = `${data.publicUrl}?v=${Date.now()}`
  const { error } = await supabase.from('profiles').update({ foto_url: avatarUrl, updated_at: new Date().toISOString() }).eq('id', user.id)
  if (error) throw new Error('Subimos la foto, pero no pudimos guardarla en tu perfil.')
  const updated = await loadCurrentUser()
  if (!updated) throw new Error('No pudimos recargar tu perfil.')
  return updated
}

export async function removeOwnAvatar(user: User): Promise<User> {
  await supabase.storage.from('avatares').remove([`${user.id}/perfil.jpg`])
  const { error } = await supabase.from('profiles').update({ foto_url: null, updated_at: new Date().toISOString() }).eq('id', user.id)
  if (error) throw new Error('No pudimos quitar tu foto.')
  const updated = await loadCurrentUser()
  if (!updated) throw new Error('No pudimos recargar tu perfil.')
  return updated
}

/** Usuarios visibles para el panel. RLS decide qué filas devuelve. */
export async function listUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .order('created_at', { ascending: false })
    .returns<ProfileRow[]>()

  if (error) throw new Error('No se pudieron cargar los usuarios.')
  return (data ?? []).map(toUser)
}

/** El mismo que exige Supabase Auth. Si se cambia alli, se cambia aqui. */
export const LARGO_MINIMO_PASSWORD = 10

/** Los símbolos que Supabase da por buenos. La lista es suya, no nuestra. */
export const SIMBOLOS_PASSWORD = String.raw`!@#$%^&*()_+-=[]{};'\:"|<>?,./` + '`~'

/**
 * Las cuatro condiciones de Supabase Auth, comprobadas por separado para poder
 * decir **cuál** falta.
 *
 * Esto no es la seguridad: la de verdad la aplica el servidor. Sirve para no
 * mandar al usuario a que le rechacen la contraseña con un mensaje que no
 * explica nada. Devuelve null cuando la contraseña vale.
 */
export function validatePassword(value: string): string | null {
  if (!value) return 'Escribe una contraseña.'
  // El largo primero: si además es corta, decirle las cinco cosas a la vez no
  // ayuda a nadie.
  if (value.length < LARGO_MINIMO_PASSWORD) return `Usa al menos ${LARGO_MINIMO_PASSWORD} caracteres.`

  const faltan = [
    /[a-z]/.test(value) ? null : 'una minúscula',
    /[A-Z]/.test(value) ? null : 'una mayúscula',
    /[0-9]/.test(value) ? null : 'un número',
    value.split('').some((char) => SIMBOLOS_PASSWORD.includes(char)) ? null : 'un símbolo',
  ].filter((item): item is string => item != null)

  if (faltan.length === 0) return null
  if (faltan.length === 1) return `Falta ${faltan[0]}.`
  return `Faltan ${faltan.slice(0, -1).join(', ')} y ${faltan[faltan.length - 1]}.`
}

function translateAuthError(message: string): string {
  const normalized = message.toLowerCase()
  if (normalized.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.'
  if (normalized.includes('email not confirmed')) return 'Debes confirmar tu correo antes de entrar.'
  if (normalized.includes('user already registered')) return 'Este correo ya tiene una cuenta.'
  // Supabase manda las dos quejas de contrasena juntas y en ingles, con la
  // lista entera de caracteres permitidos pegada detras. Eso, tal cual, es
  // ilegible para quien solo quiere entrar. Se traducen por separado porque
  // pueden venir las dos a la vez.
  if (normalized.includes('password should be at least') || normalized.includes('password should contain at least')) {
    const corta = normalized.includes('password should be at least')
    const tipos = normalized.includes('password should contain at least')
    if (corta && tipos) return `Tu contraseña necesita ${LARGO_MINIMO_PASSWORD} caracteres e incluir mayúscula, minúscula, número y símbolo.`
    if (corta) return `Tu contraseña necesita al menos ${LARGO_MINIMO_PASSWORD} caracteres.`
    return 'Tu contraseña necesita una mayúscula, una minúscula, un número y un símbolo.'
  }
  if (normalized.includes('for security purposes')) return 'Espera unos segundos antes de reintentar.'
  if (normalized.includes('not allowed')) return 'Este correo no puede registrarse con ese rol.'
  if (normalized.includes('should be different from the old password')) {
    return 'Elige una contraseña distinta a la anterior.'
  }
  if (normalized.includes('email rate limit exceeded')) {
    return 'Se alcanzó el límite de correos por hora. Intenta más tarde.'
  }
  if (normalized.includes('token has expired') || normalized.includes('invalid token')) {
    return 'El enlace expiró o ya se usó. Pide uno nuevo.'
  }
  return message
}
