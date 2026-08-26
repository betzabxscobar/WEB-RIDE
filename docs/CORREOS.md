# Correos y verificación de cuenta

## Decisión

**La verificación de correo está activada**, y el envío pasa por **Brevo** como
SMTP propio.

El resto de la plataforma se apoya en Supabase. El correo es la excepción: su
servicio incluido está pensado para desarrollo y tiene un tope de envíos por
hora que no se levanta cambiando de plan. Al probar el registro se llegó al
límite al segundo intento (`email rate limit exceeded`), así que hacía falta un
SMTP de verdad.

Pasos de configuración: [`SMTP.md`](SMTP.md).

## Cómo funciona

Con **Confirm email** activado en
**Authentication → Sign In / Providers → Email**:

1. La persona se registra. La cuenta se crea, pero **sin sesión**.
2. Supabase envía el correo con el enlace de confirmación, ya vía Brevo.
3. Al abrir el enlace, la cuenta queda confirmada.
4. Recién ahí puede iniciar sesión.

Las dos apps distinguen ese caso y avisan que revise el correo, en vez de
mostrarlo como un fallo:

- **React** — `signUp` devuelve `{ status: 'needs_email_confirmation' }`, la
  pantalla salta al login y muestra el aviso en verde (`.notice`).
- **Flutter** — `AuthService.register` lanza `EmailConfirmationRequired`, que la
  pantalla de registro pinta con `NoticeBanner` (verde), no con `ErrorBanner`.

## Qué correos se envían hoy

| Correo | Cuándo |
|---|---|
| Confirmación de cuenta | Al registrarse |
| Restablecer contraseña | Desde «¿Olvidaste tu contraseña?» |

Ambos usan las plantillas por defecto de Supabase.

El módulo de viajes todavía no manda correos. Con Brevo hay margen para
agregarlos (comprobante al finalizar, aviso de chofer asignado) sin chocar con
ningún tope.

## Límites del plan gratuito de Brevo

- **300 correos al día.**
- Un solo remitente verificado, porque el equipo no tiene dominio propio.
- El límite por hora de Supabase se configura aparte, en
  **Authentication → Rate Limits**. Si se deja en el valor del servicio
  incluido, el SMTP nuevo no sirve de nada.

Con dominio propio se podría verificar el dominio en Brevo (mejor
entregabilidad, sin remitente único) o migrar a otro proveedor.

## Recuperación de contraseña

Implementada en las dos apps. Ver la sección correspondiente en
[`CONEXION_SUPABASE.md`](CONEXION_SUPABASE.md).

**El enlace es de un solo uso.** Abrirlo dos veces devuelve
`403: One-time token not found` — hay que pedir uno nuevo.

## En la app móvil

**Brevo cubre la app igual que la web, sin cambios de código.** Flutter usa los
mismos dos endpoints (`signUp` y `resetPasswordForEmail`); las apps nunca tocan
el SMTP, solo le piden a Supabase que envíe.

Pero hay un límite práctico mientras la web solo exista en `localhost`:

Ninguna llamada de Flutter pasa `emailRedirectTo`, así que el enlace del correo
usa el **Site URL** del proyecto. Es lo correcto —la app no tiene deep links y el
enlace debe abrir la web—, pero significa que **quien se registre desde el
teléfono recibirá un enlace a `localhost`, que en un teléfono no abre nada.**

Mientras tanto:

1. Abrir el correo desde la computadora donde corre `npm run dev`.
2. O confirmar la cuenta a mano en **Authentication → Users**.
3. La solución de fondo es publicar la web en una URL real y ponerla como Site
   URL. De paso resuelve el dominio para el correo.

Para que el enlace abriera la app directamente harían falta *deep links* (un
esquema propio en `AndroidManifest.xml` y en iOS), que no están configurados.
