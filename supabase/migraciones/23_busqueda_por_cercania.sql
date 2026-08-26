-- Busqueda de choferes por radio real.

-- Cuanto tiempo se considera vigente una posicion. Un chofer que dejo de
-- reportar hace media hora probablemente cerro la app.
create or replace function public.posicion_vigente_minutos()
returns int language sql immutable set search_path = '' as $$ select 10 $$;

-- Radio por defecto para difundir una solicitud.
create or replace function public.radio_busqueda_km()
returns float8 language sql immutable set search_path = '' as $$ select 5::float8 $$;

-- ---------------------------------------------------------------------------
-- Choferes disponibles cerca de un punto
--
-- ST_DWithin usa el indice GIST, asi que no recorre la tabla entera. Sirve
-- tanto para el panel de administracion como para saber a cuantos se les
-- difundio una solicitud.
-- ---------------------------------------------------------------------------
create or replace function public.conductores_cercanos(
  p_lat float8, p_lng float8, p_radio_km float8 default null
)
returns table (
  conductor_id uuid,
  nombre text,
  distancia_km numeric,
  calificacion numeric,
  vista_hace_min int
)
language sql
stable
security definer
set search_path = ''
as $$
  with punto as (
    select extensions.ST_SetSRID(
             extensions.ST_MakePoint(p_lng, p_lat), 4326
           )::extensions.geography as g
  )
  select c.id,
         p.full_name,
         round((extensions.ST_Distance(c.ultima_posicion, punto.g) / 1000)::numeric, 2),
         c.calificacion_promedio,
         (extract(epoch from (now() - c.posicion_actualizada_en)) / 60)::int
  from public.conductores c
  join public.profiles p on p.id = c.id
  cross join punto
  where c.disponible
    and c.estado_aprobacion = 'aprobado'
    and c.ultima_posicion is not null
    and c.posicion_actualizada_en > now()
        - make_interval(mins => public.posicion_vigente_minutos())
    and extensions.ST_DWithin(
          c.ultima_posicion, punto.g,
          coalesce(p_radio_km, public.radio_busqueda_km()) * 1000
        )
    -- Sin viaje en curso.
    and not exists (
      select 1 from public.viajes v
      where v.conductor_id = c.id
        and v.estado not in ('FINALIZADO','CANCELADO','SIN_CONDUCTOR')
    )
  order by extensions.ST_Distance(c.ultima_posicion, punto.g);
$$;

revoke execute on function public.conductores_cercanos(float8,float8,float8) from public, anon;
grant execute on function public.conductores_cercanos(float8,float8,float8) to authenticated;

-- ---------------------------------------------------------------------------
-- Difusion filtrada por cercania
--
-- Hasta ahora todo chofer disponible veia todas las solicitudes del pais. La
-- politica pasa a comparar la posicion del chofer con el origen del viaje.
--
-- Un chofer sin posicion reciente no ve nada: es la forma de exigir que la app
-- este reportando de verdad.
-- ---------------------------------------------------------------------------
create or replace function public.viaje_esta_cerca_de_mi(p_viaje_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conductores c
    join public.ubicaciones o
      on o.viaje_id = p_viaje_id and o.tipo = 'origen'
    where c.id = (select auth.uid())
      and c.disponible
      and c.estado_aprobacion = 'aprobado'
      and c.ultima_posicion is not null
      and c.posicion_actualizada_en > now()
          - make_interval(mins => public.posicion_vigente_minutos())
      and extensions.ST_DWithin(
            c.ultima_posicion,
            extensions.ST_SetSRID(
              extensions.ST_MakePoint(o.longitud, o.latitud), 4326
            )::extensions.geography,
            public.radio_busqueda_km() * 1000
          )
  );
$$;

revoke execute on function public.viaje_esta_cerca_de_mi(uuid) from public, anon;
grant execute on function public.viaje_esta_cerca_de_mi(uuid) to authenticated;

drop policy if exists viajes_difusion_conductores on public.viajes;
create policy viajes_difusion_conductores on public.viajes for select to authenticated
  using (
    estado = 'BUSCANDO_CONDUCTOR'
    and conductor_id is null
    and public.viaje_esta_cerca_de_mi(id)
  );

-- Y aceptar tambien exige estar cerca: la politica solo controla lo que se ve,
-- no impide que alguien invoque la funcion con un id que consiguio de otro modo.
create or replace function public.aceptar_viaje(p_viaje_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_vehiculo uuid;
  v_ok uuid;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesion' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.conductores
    where id = v_uid and estado_aprobacion = 'aprobado'
  ) then
    raise exception 'Tu cuenta de conductor no esta aprobada'
      using errcode = 'check_violation';
  end if;

  select id into v_vehiculo
  from public.vehiculos
  where conductor_id = v_uid and activo;

  if v_vehiculo is null then
    raise exception 'Necesitas un vehiculo activo para aceptar viajes'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.viajes
    where conductor_id = v_uid
      and estado not in ('FINALIZADO', 'CANCELADO', 'SIN_CONDUCTOR')
  ) then
    raise exception 'Ya tienes un viaje asignado' using errcode = 'check_violation';
  end if;

  if not public.viaje_esta_cerca_de_mi(p_viaje_id) then
    raise exception 'Ese viaje esta fuera de tu zona'
      using errcode = 'check_violation';
  end if;

  update public.viajes
  set estado = 'ACEPTADO',
      conductor_id = v_uid,
      vehiculo_id = v_vehiculo
  where id = p_viaje_id
    and estado = 'BUSCANDO_CONDUCTOR'
    and conductor_id is null
  returning id into v_ok;

  if v_ok is null then
    raise exception 'Ese viaje ya fue tomado por otro conductor'
      using errcode = 'check_violation';
  end if;

  return v_ok;
end;
$$;

revoke execute on function public.aceptar_viaje(uuid) from public, anon;
grant execute on function public.aceptar_viaje(uuid) to authenticated;
