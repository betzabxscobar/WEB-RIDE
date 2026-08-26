-- Mismo defecto que corrigio la 19, en funciones anteriores al modulo de
-- viajes: Postgres concede EXECUTE a PUBLIC por defecto y nunca se revoco.

-- is_bootstrap_admin_email revelaba si un correo esta en la lista blanca de
-- cuentas administrativas: bastaba llamarla con la clave publishable para
-- enumerar quien es admin. Solo la usa handle_new_user(), que es SECURITY
-- DEFINER y corre como propietario, asi que nadie mas necesita ejecutarla.
revoke execute on function public.is_bootstrap_admin_email(text) from public, anon, authenticated;

-- can_view_role y can_manage_role SI se evaluan dentro de las politicas RLS de
-- public.profiles, que aplican a `public` (anon incluido). Se les quita el
-- permiso implicito de PUBLIC pero se conservan los explicitos: revocarlos del
-- todo haria que una consulta anonima fallara con error de permisos en vez de
-- devolver cero filas.
revoke execute on function public.can_view_role(public.user_role) from public;
revoke execute on function public.can_manage_role(public.user_role) from public;
grant execute on function public.can_view_role(public.user_role) to anon, authenticated;
grant execute on function public.can_manage_role(public.user_role) to anon, authenticated;
