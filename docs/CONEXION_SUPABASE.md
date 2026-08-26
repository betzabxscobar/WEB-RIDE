# Conexión de Ride con Supabase

**Estado: conectado.** Las dos apps usan Supabase Auth. Este documento describe
cómo quedó, no cómo se planeó — el plan original cambió en tres puntos que se
explican al final.

Proyecto: `jnnesfafbrlbycfkruph`.
Esquema de la base: ver [`supabase/migraciones/README.md`](../supabase/migraciones/README.md).

## Cómo funciona el acceso

| Flujo | Implementación |
|---|---|
| Registro | `supabase.auth.signUp` con `full_name`, `phone` y `role` en `user_metadata` |
| Login | `supabase.auth.signInWithPassword` |
| Sesión | Se guarda y refresca sola (`persistSession`, `autoRefreshToken`) |
| Perfil y rol | `select` sobre `public.profiles` |
| Primer acceso admin | `supabase.auth.updateUser` + bajar `must_change_password` |
| Lista de usuarios | `select` sobre `public.profiles`; **RLS decide qué filas llegan** |
| Cierre de sesión | `supabase.auth.signOut` |

## Dónde vive cada cosa

**WEB-RIDE (React)**
- `src/lib/supabase.ts` — cliente, lee `.env`
- `src/lib/auth.ts` — `signIn`, `signUp`, `loadCurrentUser`, `changeInitialPassword`, `listUsers`
- `src/App.tsx` — pantallas de acceso y restauración de sesión
- `src/AdminDashboard.tsx` — panel, consulta `profiles`

**APPRIDE (Flutter)**
- `lib/core/supabase_config.dart` — URL y clave publishable
- `lib/services/auth_service.dart` — mismo contrato de antes, ahora sobre Supabase
- `lib/main.dart` — `Supabase.initialize()` y `bootstrap()` antes del primer frame

## Cuentas administrativas

| Correo | Rol |
|---|---|
| betzabxscobar@gmail.com | superadmin |
| dandreszurtaf23@gmail.com | superadmin |
| alexyanez1119@gmail.com | admin |
| mayuriremache0@gmail.com | admin |
| javierconforme18@gmail.com | admin |

Esta lista está además dentro de la base, en `public.is_bootstrap_admin_email()`.
El trigger `handle_new_user()` solo acepta crear un `admin` o `superadmin` si el
correo está ahí; cualquier otro intento falla. El formulario público no puede
asignar esos roles ni manipulando el cliente.

## Barreras contra escalada de privilegios

Son tres, independientes:

1. **Cliente** — el formulario solo ofrece `passenger` y `driver`.
2. **Trigger `handle_new_user()`** — un rol desconocido cae a `passenger`; un rol
   administrativo con correo fuera de la lista blanca aborta el registro.
3. **Trigger `prevent_role_self_edit()`** — nadie puede cambiarse el rol a sí
   mismo, ni siquiera un superadmin.

Verificado: un registro pidiendo `role: superadmin` con un correo cualquiera es
rechazado, y un `update` de `profiles.role` sobre la propia fila también.

## Variables de entorno

`.env` en WEB-RIDE (ignorado por git, copiar de `.env.example`):

```
VITE_SUPABASE_URL=https://jnnesfafbrlbycfkruph.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

La clave *publishable* es pública por diseño: va compilada en el paquete del
navegador y en el APK. Lo que protege los datos es RLS. La que **nunca** puede
salir del servidor es `service_role`.

En Flutter los valores están en `lib/core/supabase_config.dart` y se pueden
sobreescribir con `--dart-define` para apuntar a otro proyecto.

## Tres cambios respecto al plan original

1. **El rol se lee de `profiles`, no del JWT.** El plan decía leer
   `user.app_metadata.role`. En la base real ese campo está vacío en las cinco
   cuentas, y las políticas RLS resuelven el rol con `current_user_role()`, que
   consulta la tabla. Leerlo del token habría dado `undefined` para todos.

2. **El primer acceso no usa la Edge Function.** Se hace con la sesión del
   propio usuario: `updateUser` cambia la clave y la política
   `profiles_update_own` permite bajar la bandera. No hace falta `service_role`.
   Ver la advertencia de abajo.

3. **`switchRole` en Flutter es solo un cambio de modo local.** No toca
   `profiles.role`, porque `prevent_role_self_edit()` lo impide — y esa
   prohibición es justo lo que evita la escalada. Para que una persona sea
   pasajera y conductora a la vez, el modelo ya tiene las extensiones 1:1
   `pasajeros` y `conductores`; falta la interfaz que las use.

## Pendientes

1. **Borrar del todo la Edge Function `cambiar-contrasena-inicial`.** La
   puerta trasera ya está cerrada: el 2026-08-26 se desplegó una versión inerte
   (v9) que responde 410 a todo, verificado con un intento real de explotación.
   Pero la función sigue existiendo en el proyecto. Borrarla desde
   **Edge Functions → cambiar-contrasena-inicial → Delete**; el MCP de Supabase
   no expone borrado. Contexto:
   [`../supabase/functions/cambiar-contrasena-inicial/ELIMINADA.md`](../supabase/functions/cambiar-contrasena-inicial/ELIMINADA.md).

2. **Configurar Brevo como SMTP.** La verificación de correo está activada,
   pero el servicio de correo incluido en Supabase tiene un tope bajo por hora
   y el registro choca con él al segundo intento. Se decidió usar Brevo (300
   correos/día, remitente único verificado porque no hay dominio propio).
   Falta cargar las credenciales en **Authentication → Emails → SMTP Settings**
   y subir el valor en **Rate Limits**. Pasos exactos: [`SMTP.md`](SMTP.md).
   Las dos apps ya avisan correctamente que hay que confirmar el correo.

3. **`server.mjs` quedó sin uso.** Ninguna pantalla lo llama. Borrarlo junto con
   `data/users.json` y el script `dev:api` cuando se confirme que no hace falta.

4. **Scripts `scripts/*.mjs`.** Fueron escritos contra el esquema viejo
   (`user_id`, `app_metadata.role`). Revisarlos antes de volver a usarlos.

5. **Recuperación de contraseña: implementada** (2026-08-26). Ver la sección
   más abajo.

6. **Protección de contraseñas filtradas** desactivada en Auth.

## Cambio de panel

Una cuenta administrativa puede moverse entre paneles sin cerrar sesión.

| Rol real | Vistas disponibles |
|---|---|
| `superadmin` | Panel de superadmin · Panel de administración · Vista de usuario · Vista de chofer |
| `admin` | Panel de administración · Vista de usuario · Vista de chofer |
| `driver` | Vista de chofer · Vista de usuario |
| `passenger` | Vista de usuario (y de chofer si ya registró un vehículo) |

**Un `admin` nunca puede abrir la vista de superadmin.**

### Cambia la vista, no los permisos

El rol real sale de `public.profiles` y **no se toca**. Un admin que abre la
vista de usuario sigue siendo admin para la base de datos: ve esa interfaz con
sus propios datos, no con los de otra persona.

No podría ser de otro modo. Las políticas RLS resuelven los permisos con
`current_user_role()`, que lee la tabla, y `prevent_role_self_edit()` impide que
nadie se cambie el rol a sí mismo — que es justo la barrera que evita una
escalada de privilegios. Conceder permisos reales de otro rol exigiría
desmontar eso.

Antes de este cambio, `switchRole` en Flutter modificaba `user.role` en memoria,
así que la app mentía sobre quién eras. Ahora el rol real y la vista activa son
cosas distintas: `AuthService.activeView` y `AuthService.switchView()`.

### Dónde vive la regla

- **Flutter** — `UserRole.viewsAllowed()` en `lib/models/user_role.dart`
- **React** — `viewsAllowed()` en `src/lib/auth.ts`

Está aparte de la sesión a propósito, para poder probarla sin red. Las pruebas
de Flutter cubren los cuatro roles.

### Detalle de presentación

Cuando un superadmin mira el panel *como admin*, RLS le sigue enviando a los
superadmin porque su rol real no cambió. La lista los oculta en el cliente para
que la previsualización sea fiel. Es filtrado de presentación, no de seguridad:
la barrera real son las políticas RLS, que sí aplican a un admin auténtico.

## Recuperación de contraseña

Implementada con el flujo oficial de Supabase, en las dos apps.

**Web (React)** — el flujo completo:

1. En el login, el enlace **¿Olvidaste tu contraseña?** abre una pantalla que
   pide el correo (`requestPasswordReset` → `resetPasswordForEmail`).
2. Llega el correo con el enlace.
3. Al abrirlo, Supabase deja una sesión de recuperación activa y emite el
   evento `PASSWORD_RECOVERY`. `App.tsx` lo escucha y muestra
   `ResetPasswordForm`, que comparte el aspecto de `FirstAccessForm`.
4. Se fija la contraseña (`completePasswordReset` → `updateUser`) y se entra
   directo, sin volver a iniciar sesión.

Detalle de implementación: el listener de `onAuthStateChange` se registra
**antes** de restaurar la sesión. Al abrir el enlace, Supabase consume el token
de la URL y emite `PASSWORD_RECOVERY` de inmediato; si el listener se
registrara después, ese evento se perdería y la persona entraría al home sin
pasar por el cambio de contraseña. Fue exactamente el síntoma que se vio el
2026-08-26: los logs mostraban `/verify` correcto y `Login`, pero la app no
tenía dónde recibir esa sesión.

**Móvil (Flutter)** — solo el paso 1: `ForgotPasswordBox` pide el correo con
`requestPasswordReset`. El enlace abre el navegador, no la app, así que la
contraseña nueva se fija ahí y luego se vuelve a la app a iniciar sesión. Para
que el enlace abriera la app harían falta *deep links* (esquema propio en
`AndroidManifest.xml` y en iOS), que no están configurados.

**El enlace es de un solo uso.** Abrirlo dos veces devuelve
`403: One-time token not found` — hay que pedir uno nuevo.

## Verificaciones hechas

- La web compila (`npm run build`) y `service_role` no aparece en el paquete.
- Login con credenciales incorrectas: la petición llega a
  `auth/v1/token` y la app muestra «Correo o contraseña incorrectos.»
- Un cliente anónimo no lee ninguna fila de `profiles`, `viajes`, `tarifas` ni
  `metodos_pago`.
- Registro de pasajero y de conductor: crean el perfil con teléfono, el rol
  correcto y la fila en `pasajeros` / `conductores` automáticamente (probado
  sobre el trigger, sin pasar por el envío de correo).
- Flutter: `flutter analyze` sin avisos y 15 pruebas en verde.
- La puerta trasera de la Edge Function está cerrada: un POST con
  `x-test-email` apuntando a una cuenta superadmin devuelve 410.
- Las cinco cuentas del equipo tienen el correo confirmado y pueden entrar.
- El envío de correos funciona: `/recover` responde 200 y los logs registran
  `mail.send`, `/verify` correcto y `Login`.
- La pantalla «¿Olvidaste tu contraseña?» aparece en el login de ambas apps.
- **Flujo completo probado de punta a punta el 2026-08-26** con una cuenta real:
  enlace de recuperación → pantalla de contraseña nueva → guardado → login con
  la contraseña nueva → panel administrativo cargando. Los logs registran
  `/verify` + `Login`, dos `/user`, `/token` correcto y `/rest/v1/profiles` en
  200 tanto para el perfil propio como para la lista de usuarios.
