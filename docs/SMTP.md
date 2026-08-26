# Configurar el envío de correos con Brevo

## Por qué

Supabase incluye un servicio de correo pensado para desarrollo, con un tope bajo
de envíos por hora. Al probar el registro se llegó al límite al segundo intento:

```
email rate limit exceeded
```

Ese tope no se levanta cambiando de plan: la vía oficial es configurar un SMTP
propio. Con Brevo el margen pasa a **300 correos al día** en el plan gratuito.

## Por qué Brevo

Ride no tiene dominio propio. Brevo es de los pocos proveedores gratuitos que
permite verificar **un solo correo remitente** (por ejemplo un Gmail del equipo)
sin exigir dominio. Los demás lo piden para producción.

Cuando consigan dominio, conviene verificarlo: la entregabilidad mejora mucho y
los correos dejan de caer en spam con tanta facilidad.

## Paso 1 — Crear la cuenta

1. Entrar a https://www.brevo.com y crear una cuenta gratuita.
2. Confirmar el correo de registro.
3. Brevo pide datos de la organización y **suele revisar la cuenta antes de
   habilitar el envío**; puede tardar unas horas. Si preguntan el caso de uso,
   es correo transaccional: confirmación de cuenta y recuperación de contraseña.

## Paso 2 — Verificar el remitente

1. **Settings → Senders, Domains & Dedicated IPs → Senders**.
2. **Add a sender** con el correo que será el remitente.
   Conviene uno del equipo, no el personal de alguien que pueda irse.
3. Brevo manda un correo de verificación a esa dirección. Abrirlo y confirmar.

Hasta que verifiquen un dominio, ese es el único remitente posible.

## Paso 3 — Obtener la clave SMTP

1. **Settings → SMTP & API → SMTP**.
2. Generar una **SMTP key**.
3. Anotar el **login** (un correo tipo `xxxxx@smtp-brevo.com`) y la **clave**.

La clave es un secreto: no va al repositorio, ni al chat, ni a ningún archivo
del proyecto. Solo se pega en el panel de Supabase.

## Paso 4 — Cargarla en Supabase

Proyecto `jnnesfafbrlbycfkruph` →
**Authentication → Emails → SMTP Settings** → activar **Enable Custom SMTP**.

| Campo | Valor |
|---|---|
| Host | `smtp-relay.brevo.com` |
| Port | `587` |
| Username | El login de Brevo (`xxxxx@smtp-brevo.com`) |
| Password | La SMTP key |
| Sender email | El correo verificado en el paso 2 |
| Sender name | `Ride` |

Supabase valida la conexión al guardar: si algo está mal, lo dice ahí mismo.

## Paso 5 — Subir el límite

En la misma pantalla, **Rate Limits** → *Rate limit for sending emails*. Sigue
en el valor del servicio incluido. Con Brevo se puede subir a unos **200 por
hora**, que cabe dentro del tope diario de 300 del plan gratuito.

Sin este paso el SMTP nuevo no sirve de nada: Supabase seguiría frenando los
envíos con el límite viejo.

## Paso 6 — URLs permitidas

**Authentication → URL Configuration**. Ya está configurado, pero conviene
revisarlo:

- **Site URL**: `http://localhost:5173` mientras no haya producción.
- **Redirect URLs**: `http://localhost:5173` y `http://localhost:5173/**`.

El código manda `emailRedirectTo: window.location.origin` (`src/lib/auth.ts`),
así que funciona igual en desarrollo y en producción — pero cada origen tiene
que estar en esa lista.

## Paso 7 — Plantillas

Se usan las de Supabase por defecto. No hay nada que hacer.

Si más adelante quieren personalizarlas: **Authentication → Emails → Templates**.

## Comprobar que funcionó

1. `npm run dev` en WEB-RIDE.
2. Registrar una cuenta con un correo real al que tengan acceso.
3. El correo debe llegar en menos de un minuto.
4. Al abrir el enlace la cuenta queda confirmada y ya se puede iniciar sesión.
5. Probar también **¿Olvidaste tu contraseña?**, que usa el mismo canal.

Si no llega: revisar spam y luego el registro de Brevo en
**Transactional → Logs**, que dice si el correo salió y qué pasó con él.

## Qué gana Ride con esto

- El registro público deja de chocar con el tope al segundo intento.
- La recuperación de contraseña funciona para cualquiera, no solo en pruebas
  espaciadas.
- Queda margen para correos del módulo de viajes (comprobante al finalizar,
  aviso de chofer asignado), que hoy no existen pero ya no estarían bloqueados
  por el límite.

## Sobre la app móvil

El enlace de confirmación abre el navegador, no la app. La cuenta queda
confirmada igual y la persona vuelve a la app a iniciar sesión.

Para que abriera la app directamente harían falta *deep links* (un esquema
propio en `AndroidManifest.xml` y en iOS, más `emailRedirectTo` apuntando a ese
esquema). No es necesario para que el correo funcione.
