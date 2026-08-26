# `cambiar-contrasena-inicial` — eliminada el 2026-08-26

Esta Edge Function fue **borrada del proyecto Supabase**. No la reimplantes sin
leer esto.

## Por qué se eliminó

La versión que estaba desplegada (v8) **no era la de este repositorio** y tenía
una puerta trasera.

En vez de validar la sesión de quien llamaba, autenticaba con dos headers:

```
x-test-email:  correo de la cuenta a modificar
x-test-secret: debía coincidir con la variable TEST_SECRET
```

Es decir: cualquiera que conociera `TEST_SECRET` podía **cambiar la contraseña
de cualquier cuenta administrativa** que tuviera `must_change_password = true`,
sin ser el dueño de esa cuenta. El `verify_jwt: true` no protegía, porque la
propia clave publishable es un JWT válido.

No era explotable en ese momento porque las cinco cuentas tenían
`must_change_password = false` y la función corta ahí. Pero se habría armado
sola en cuanto se activara esa bandera.

Era andamiaje de pruebas que se desplegó por error y quedó pisando a la versión
del repositorio.

## Qué la reemplaza

Nada: ya no hace falta. El cambio de contraseña del primer acceso se resuelve
con la sesión del propio usuario, sin `service_role` y sin función de servidor.

- **React** — `changeInitialPassword` en `src/lib/auth.ts`
- **Flutter** — `AuthService.changeInitialPassword`

Ambos hacen lo mismo: `auth.updateUser({ password })` y luego bajan
`must_change_password` en `public.profiles`. La política `profiles_update_own`
permite ese update, y el trigger `prevent_role_self_edit()` impide que de paso
alguien se toque el rol.

## Si alguna vez hace falta una función de servidor aquí

Requisitos mínimos, para no repetir el error:

1. Sacar la identidad del **JWT del llamante** (`auth.getUser(jwt)`), nunca de
   un header con el correo.
2. Verificar que ese usuario es el dueño de la cuenta que se va a modificar.
3. Nada de secretos compartidos tipo `TEST_SECRET` como único control de acceso.
4. Revisar que lo desplegado coincida con lo que está en el repositorio.

El archivo `index.ts` original de este repo también estaba desactualizado
respecto al esquema real: usaba `.eq('user_id', ...)` cuando la columna es `id`,
y escribía `password_changed_at`, que no existe en la tabla.
