import { supabase } from './supabase'

export type Role = 'passenger' | 'driver' | 'admin' | 'superadmin'

export type User = {
  id: string
  name: string
  email: string
  phone: string
  role: Role
  mustChangePassword: boolean
  createdAt: string
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
}

const PROFILE_COLUMNS = 'id, email, full_name, phone, role, must_change_password, created_at'

export function toUser(row: ProfileRow): User {
  return {
    id: row.id,
    name: row.full_name?.trim() || row.email.split('@')[0],
    email: row.email,
    phone: row.phone ?? '',
    role: row.role,
    mustChangePassword: row.must_change_password,
    createdAt: row.created_at,
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
      emailRedirectTo: window.location.origin,
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
    { redirectTo: window.location.origin },
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

function translateAuthError(message: string): string {
  const normalized = message.toLowerCase()
  if (normalized.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.'
  if (normalized.includes('email not confirmed')) return 'Debes confirmar tu correo antes de entrar.'
  if (normalized.includes('user already registered')) return 'Este correo ya tiene una cuenta.'
  if (normalized.includes('password should be at least')) return 'La contraseña es demasiado corta.'
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
