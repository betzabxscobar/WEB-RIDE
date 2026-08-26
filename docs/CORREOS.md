# Correos y verificación de cuenta

## Decisión

**La verificación de correo se queda activada, usando solo Supabase.** Sin
proveedores externos.

## Cómo funciona

Con **Confirm email** activado en
**Authentication → Sign In / Providers → Email**:

1. La persona se registra. La cuenta se crea, pero **sin sesión**.
2. Supabase envía el correo con el enlace de confirmación.
3. Al abrir el enlace, la cuenta queda confirmada.
4. Recién ahí puede iniciar sesión.

Las dos apps ya distinguen ese caso y avisan que revise el correo, en vez de
mostrarlo como un fallo:

- **React** — `signUp` devuelve `{ status: 'needs_email_confirmation' }`, la
  pantalla salta al login y muestra el aviso en verde (`.notice`).
- **Flutter** — `AuthService.register` lanza `EmailConfirmationRequired`, que la
  pantalla de registro pinta con `NoticeBanner` (verde), no con `ErrorBanner`.

## El límite real: volumen por hora

Supabase incluye su propio servicio de correo, pero está pensado para
desarrollo y trae un tope bajo de envíos por hora. Al probar el registro se
llegó al tope al segundo intento:

```
email rate limit exceeded
```

**Cómo subirlo:** panel → **Authentication → Rate Limits** → *Rate limit for
sending emails*. Ahí se ve el valor vigente del proyecto y hasta dónde deja
subirlo. Conviene mirarlo antes de una demo o de una jornada de pruebas con
varias personas registrándose seguidas.

Ese tope es el techo que impone Supabase por usar su servicio incluido; la
única forma oficial de levantarlo del todo es un SMTP propio, que implica un
proveedor externo y quedó descartado.

## Qué hacer si el tope estorba

Sin salir de Supabase:

1. **Subir el límite** en Rate Limits hasta donde permita el proyecto.
2. **Espaciar los registros** en pruebas y demos, en vez de crear diez cuentas
   seguidas.
3. **Confirmar a mano** cuando haga falta: panel → **Authentication → Users** →
   la cuenta → confirmar el correo directamente, sin esperar el envío. Sirve
   para desbloquear a alguien en una demo.
4. **Crear las cuentas de prueba desde el panel**, ya confirmadas, en vez de
   registrarlas por la app.

## Recuperación de contraseña

También depende del correo, así que hereda el mismo tope. Todavía no está
implementada: falta una página pública para pedir el enlace y otra para definir
la contraseña nueva, con el flujo oficial de Supabase.

Mientras tanto, un superadmin la restablece desde
**Authentication → Users → … → Reset password**.

## URLs permitidas

Sin esto el enlace del correo lleva a una página de error.

**Authentication → URL Configuration**:

- **Site URL**: la URL de producción. Mientras no exista, `http://localhost:5173`.
- **Redirect URLs**: todos los orígenes desde los que alguien pueda registrarse:
  ```
  http://localhost:5173
  http://localhost:5173/**
  ```

El código manda `emailRedirectTo: window.location.origin` (`src/lib/auth.ts`),
así que funciona igual en desarrollo y en producción — pero cada origen tiene
que estar en esa lista.

## Plantillas

Se usan las de Supabase por defecto. No hay nada que configurar.

## En la app móvil

El enlace de confirmación abre el navegador, no la app. La cuenta queda
confirmada igual y la persona vuelve a la app a iniciar sesión.

Para que el enlace abra la app directamente harían falta *deep links* (un
esquema propio en `AndroidManifest.xml` y en iOS, más `emailRedirectTo`
apuntando a ese esquema). No es necesario para que la verificación funcione, así
que quedó fuera.
