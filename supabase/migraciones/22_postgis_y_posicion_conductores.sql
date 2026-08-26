-- PostGIS para la busqueda por cercania.
--
-- Se evaluo H3 (la rejilla hexagonal de Uber), pero no esta entre las 78
-- extensiones disponibles en Supabase: habria que correrla en el cliente y
-- repartir la logica entre Flutter y React. PostGIS ya esta aqui y resuelve la
-- busqueda por radio dentro de la base, que es donde viven el resto de las
-- decisiones del proyecto.
--
-- H3 sigue teniendo sentido mas adelante para agrupar por zonas (tarifa
-- dinamica, mapas de calor); son problemas distintos y no se estorban.
create extension if not exists postgis with schema extensions;

-- Ultima posicion conocida del conductor.
--
-- Se guarda desnormalizada aqui, y no se deduce de public.ubicaciones, porque
-- la busqueda de choferes cercanos corre en cada solicitud de viaje y no puede
-- recorrer el historial GPS completo.
alter table public.conductores
  add column if not exists ultima_posicion extensions.geography(Point, 4326),
  add column if not exists posicion_actualizada_en timestamptz;

-- Indice espacial: sin el, ST_DWithin recorreria toda la tabla.
create index if not exists conductores_posicion_idx
  on public.conductores using gist (ultima_posicion);

comment on column public.conductores.ultima_posicion is
  'Ultima posicion reportada. Alimenta la busqueda por cercania; el historial completo va en public.ubicaciones.';

-- ---------------------------------------------------------------------------
-- Reportar posicion
--
-- Reemplaza a la version de la migracion 17: ademas de dejar el rastro en
-- ubicaciones, actualiza la posicion del conductor. Y ahora se puede llamar sin
-- viaje activo, para que un chofer en linea sea localizable antes de que le
-- asignen uno.
-- ---------------------------------------------------------------------------
create or replace function public.reportar_posicion(
  p_lat float8, p_lng float8, p_viaje_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesion' using errcode = '28000';
  end if;

  if p_lat is null or p_lng is null
     or p_lat not between -90 and 90
     or p_lng not between -180 and 180 then
    raise exception 'Coordenadas invalidas' using errcode = 'check_violation';
  end if;

  update public.conductores
  set ultima_posicion = extensions.ST_SetSRID(
        extensions.ST_MakePoint(p_lng, p_lat), 4326
      )::extensions.geography,
      posicion_actualizada_en = now()
  where id = v_uid;

  -- El rastro por viaje solo se guarda si hay un viaje activo suyo.
  if p_viaje_id is not null then
    if not exists (
      select 1 from public.viajes
      where id = p_viaje_id
        and conductor_id = v_uid
        and estado in ('ACEPTADO','CONDUCTOR_EN_CAMINO','CONDUCTOR_EN_ORIGEN','EN_CURSO')
    ) then
      raise exception 'Ese viaje no esta activo para ti' using errcode = '42501';
    end if;

    insert into public.ubicaciones (viaje_id, tipo, latitud, longitud)
    values (p_viaje_id, 'posicion_actual', p_lat, p_lng);
  end if;
end;
$$;

-- La firma vieja (viaje primero) queda huerfana: se elimina para no dejar dos
-- versiones conviviendo.
drop function if exists public.reportar_posicion(uuid, float8, float8);

revoke execute on function public.reportar_posicion(float8,float8,uuid) from public, anon;
grant execute on function public.reportar_posicion(float8,float8,uuid) to authenticated;
