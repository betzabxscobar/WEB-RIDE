// FUNCION RETIRADA - 2026-08-26
//
// La version anterior (v8) tenia una puerta trasera: autenticaba con los
// headers x-test-email / x-test-secret en vez de la sesion de quien llamaba,
// asi que cualquiera que conociera TEST_SECRET podia cambiar la contrasena de
// cualquier cuenta administrativa con must_change_password = true.
//
// Se reemplaza por esta version inerte, que no toca la base ni Auth y rechaza
// toda peticion. Es un paso intermedio: la funcion deberia borrarse del
// proyecto desde el panel (Edge Functions -> cambiar-contrasena-inicial ->
// Delete). El MCP de Supabase no expone borrado.
//
// Ya no hace falta: el cambio de contrasena del primer acceso se resuelve con
// la sesion del propio usuario.
//   - React   -> changeInitialPassword() en src/lib/auth.ts
//   - Flutter -> AuthService.changeInitialPassword()
// Ambos usan auth.updateUser({ password }) y luego bajan must_change_password
// en public.profiles, amparados por la politica profiles_update_own.
//
// Ver ELIMINADA.md en esta misma carpeta.

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers })

  return new Response(
    JSON.stringify({
      error: 'Esta funcion fue retirada.',
      detalle:
        'El cambio de contrasena del primer acceso se hace desde la app con la ' +
        'sesion del propio usuario (auth.updateUser). Esta funcion ya no se usa.',
    }),
    { status: 410, headers },
  )
})
