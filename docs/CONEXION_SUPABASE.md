# Entrega para conectar Ride con Supabase

## Resultado esperado

- El registro público solo permite `passenger` o `driver`.
- `admin` y `superadmin` se crean únicamente con el script privado.
- Las cuentas administrativas reciben una contraseña temporal aleatoria.
- En el primer acceso, `admin` y `superadmin` deben cambiarla antes de consultar datos administrativos.
- Pasajeros y conductores nunca pasan por ese cambio obligatorio.

## Cuentas administrativas autorizadas

| Correo | Rol |
|---|---|
| betzabxscobar@gmail.com | superadmin |
| dandreszurtaf23@gmail.com | superadmin |
| alexyanez1119@gmail.com | admin |
| mayuriremache0@gmail.com | admin |
| javierconforme18@gmail.com | admin |

No se debe permitir que el formulario público asigne estos roles.

## Pasos de conexión

1. Crear el proyecto de Supabase.
2. Abrir SQL Editor y ejecutar `supabase/configuracion-inicial.sql` una sola vez.
3. Revisar en **Project Settings → Data API** que `public.profiles` esté expuesta solamente si la aplicación va a consultarla mediante la API. Mantener RLS habilitado.
4. Copiar `.env.example` como `.env` y completar las variables. Nunca subir `.env`.
5. La clave `SUPABASE_SERVICE_ROLE_KEY` solo puede usarse en servidor, consola privada o CI. Nunca debe aparecer en código React, Flutter ni variables `VITE_*`.
6. Ejecutar `npm run provisionar:supabase` desde un entorno privado.
7. El script crea o actualiza las cinco cuentas, asigna `app_metadata.role`, activa `must_change_password` y genera contraseñas temporales.
8. Las credenciales quedan en `data/credenciales-supabase.txt`, archivo ignorado por Git. Entregar cada contraseña de forma individual y eliminar el archivo cuando todos completen el primer acceso.
9. Desplegar `supabase/functions/cambiar-contrasena-inicial`. Esta función actualiza la contraseña y desactiva el bloqueo inicial en Auth y `public.profiles`.
10. Configurar las URLs permitidas de autenticación para desarrollo y producción.
11. Configurar SMTP propio antes de activar confirmación de correo o recuperación de contraseña en producción.

## Cambios que debe realizar la persona integradora

1. Crear un cliente público de Supabase usando únicamente `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.
2. Reemplazar `/api/register`, `/api/login` y `/api/me` por `supabase.auth.signUp`, `signInWithPassword` y `getUser`/`getSession`.
3. Durante el registro, enviar únicamente `role: passenger` o `role: driver` dentro de `user_metadata`. El trigger SQL descarta cualquier intento de registrarse como administrador.
4. Después del login, leer `user.app_metadata.role` y `user.app_metadata.must_change_password`.
5. Si el rol es administrativo y `must_change_password` es `true`, mostrar la pantalla de primer acceso y llamar a la Edge Function.
6. Tras completar el cambio, refrescar la sesión para recibir los nuevos claims antes de abrir el panel.
7. Eliminar `server.mjs` y los scripts locales únicamente después de verificar registro, login, primer acceso y permisos en Supabase.

## Verificaciones obligatorias

- Un pasajero puede registrarse y entrar sin cambio obligatorio.
- Un conductor puede registrarse y entrar sin cambio obligatorio.
- Un usuario público no puede asignarse `admin` o `superadmin`.
- Un admin con contraseña temporal no puede consultar perfiles.
- Después del cambio inicial, el admin puede entrar al panel.
- Un admin no puede modificar roles.
- La clave `service_role` no aparece en el paquete compilado ni en el repositorio.
- Las políticas RLS y los permisos de tabla están activos.

## Recuperación de contraseña

Implementarla después de conectar Supabase usando su flujo oficial de correo. Debe tener una página pública para solicitar el enlace y otra protegida para definir la contraseña nueva. La recuperación normal es independiente del cambio obligatorio del primer acceso administrativo.
