-- Distancia y cotizacion, calculadas en el servidor.
--
-- El precio NUNCA puede venir del cliente: si el formulario mandara
-- `tarifa_estimada`, cualquiera podria pedir un viaje por un centavo editando
-- la peticion. Estas funciones son la unica fuente del monto.

-- Haversine puro, sin extensiones: distancia en linea recta entre dos puntos.
--
-- No es la distancia por calles (eso exigiria un servicio de rutas externo).
-- Para compensar, `cotizar_viaje` aplica un factor de trayecto urbano.
create or replace function public.distancia_km(
  lat1 float8, lng1 float8, lat2 float8, lng2 float8
)
returns float8
language sql
immutable
set search_path = ''
as $$
  select 2 * 6371 * asin(
    sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians(lng2 - lng1) / 2), 2)
    )
  );
$$;

-- Cuanto mas largo es el recorrido real que la linea recta. 1.35 es un valor
-- habitual para trama urbana; se ajusta aqui, en un solo lugar.
create or replace function public.factor_trayecto_urbano()
returns float8 language sql immutable set search_path = '' as $$ select 1.35::float8 $$;

-- Velocidad media supuesta para estimar la duracion, en km/h.
create or replace function public.velocidad_media_kmh()
returns float8 language sql immutable set search_path = '' as $$ select 24::float8 $$;

-- Cotizacion segun el tarifario vigente (paso 3 del flujo 1.5 del informe).
create or replace function public.cotizar_viaje(
  p_tarifa_id uuid,
  p_origen_lat float8, p_origen_lng float8,
  p_destino_lat float8, p_destino_lng float8
)
returns table (
  tarifa_id uuid,
  tarifa_nombre text,
  distancia_km numeric,
  minutos_estimados int,
  total numeric
)
language sql
stable
set search_path = ''
as $$
  with t as (
    select * from public.tarifas where id = p_tarifa_id and activo
  ),
  d as (
    select public.distancia_km(p_origen_lat, p_origen_lng, p_destino_lat, p_destino_lng)
           * public.factor_trayecto_urbano() as km
  ),
  m as (
    select d.km, greatest(1, ceil(d.km / public.velocidad_media_kmh() * 60))::int as mins
    from d
  )
  select
    t.id,
    t.nombre,
    round(m.km::numeric, 2),
    m.mins,
    round((t.tarifa_base + t.costo_por_km * m.km + t.costo_por_minuto * m.mins)::numeric, 2)
  from t, m;
$$;

-- OJO: estos revoke son insuficientes. Postgres concede EXECUTE a PUBLIC por
-- defecto y `anon` hereda de ahi, asi que quitarselo solo a `anon` no cierra
-- nada. Se corrigio en la migracion 19; se deja aqui tal como se aplico para
-- que el historial sea fiel.
grant execute on function public.distancia_km(float8,float8,float8,float8) to authenticated;
grant execute on function public.cotizar_viaje(uuid,float8,float8,float8,float8) to authenticated;
revoke execute on function public.distancia_km(float8,float8,float8,float8) from anon;
revoke execute on function public.cotizar_viaje(uuid,float8,float8,float8,float8) from anon;
