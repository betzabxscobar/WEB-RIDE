-- Correccion de la migracion 15.
--
-- Ahi se hizo `revoke execute ... from anon`, que no basta: Postgres concede
-- EXECUTE a PUBLIC por defecto en cada funcion nueva, y `anon` hereda de ahi.
-- Quitarselo solo a `anon` deja el permiso de PUBLIC intacto.
--
-- Efecto real: cualquiera con la clave publishable podia cotizar viajes sin
-- iniciar sesion, es decir consultar el tarifario y la distancia entre puntos
-- arbitrarios. Detectado con una prueba que llamaba a la RPC sin sesion.
--
-- Hay que revocar de PUBLIC y volver a conceder solo a quien corresponde.
revoke execute on function public.cotizar_viaje(uuid,float8,float8,float8,float8) from public, anon;
revoke execute on function public.distancia_km(float8,float8,float8,float8) from public, anon;
revoke execute on function public.factor_trayecto_urbano() from public, anon;
revoke execute on function public.velocidad_media_kmh() from public, anon;

grant execute on function public.cotizar_viaje(uuid,float8,float8,float8,float8) to authenticated;
grant execute on function public.distancia_km(float8,float8,float8,float8) to authenticated;
grant execute on function public.factor_trayecto_urbano() to authenticated;
grant execute on function public.velocidad_media_kmh() to authenticated;
