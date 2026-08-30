import { createClient } from '@supabase/supabase-js'

// La clave publishable está diseñada para incluirse en clientes públicos.
// Las variables permiten apuntar a otro proyecto sin modificar el código,
// mientras estos valores mantienen WEB-RIDE y APPRIDE conectados al mismo
// proyecto de Ride al ejecutar un clon recién descargado.
const url =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://jnnesfafbrlbycfkruph.supabase.co'
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_49iWrfaCbMnmC2x1xgOnFA_ZT2rFmpV'

export const supabase = createClient(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
