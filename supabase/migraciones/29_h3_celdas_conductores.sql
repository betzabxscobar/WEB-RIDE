-- Busqueda por cercania con H3, para compararla contra PostGIS.
--
-- H3 no esta entre las extensiones de Supabase, asi que la celda la calcula el
-- cliente y la envia ya resuelta. Aqui solo se guarda y se compara por
-- igualdad de texto, que es lo que hace rapida a esta via.
--
-- Se guardan dos resoluciones porque sirven a cosas distintas y el servidor no
-- puede convertir entre ellas sin H3:
--   res 7 (~1.4 km de arista) -> difusion de solicitudes
--   res 9 (~0.2 km de arista) -> agrupacion por zonas y mapas de calor
alter table public.conductores
  add column if not exists celda_h3_7 text,
  add column if not exists celda_h3_9 text;

-- Indice B-tree normal: la comparacion es por igualdad de cadena, no espacial.
create index if not exists conductores_celda7_idx
  on public.conductores (celda_h3_7)
  where disponible and estado_aprobacion = 'aprobado';

create index if not exists conductores_celda9_idx
  on public.conductores (celda_h3_9);

comment on column public.conductores.celda_h3_7 is
  'Celda H3 res 7 calculada en el cliente. El servidor no puede verificarla: H3 no esta disponible en Postgres.';

-- ---------------------------------------------------------------------------
-- Reportar posicion con celda
--
-- Se acepta la celda ademas de las coordenadas. Mantener lat/lng no es
-- redundancia: es lo unico que el servidor sabe verificar por su cuenta.
-- ---------------------------------------------------------------------------
create or replace function public.reportar_posicion(
  p_lat float8, p_lng float8,
  p_viaje_id uuid default null,
  p_celda_h3_7 text default null,
  p_celda_h3_9 text default null
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

  -- Una celda H3 es hexadecimal de 15 caracteres. No prueba que corresponda a
  -- estas coordenadas —eso exigiria H3 aqui dentro— pero al menos descarta
  -- basura.
  if p_celda_h3_7 is not null and p_celda_h3_7 !~ '^[0-9a-f]{15}$' then
    raise exception 'Celda H3 con formato invalido' using errcode = 'check_violation';
  end if;

  update public.conductores
  set ultima_posicion = extensions.ST_SetSRID(
        extensions.ST_MakePoint(p_lng, p_lat), 4326
      )::extensions.geography,
      posicion_actualizada_en = now(),
      celda_h3_7 = coalesce(p_celda_h3_7, celda_h3_7),
      celda_h3_9 = coalesce(p_celda_h3_9, celda_h3_9)
  where id = v_uid;

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

drop function if exists public.reportar_posicion(float8, float8, uuid);

-- ---------------------------------------------------------------------------
-- Choferes cuya celda esta en el conjunto que manda el cliente
--
-- Es el equivalente H3 de conductores_cercanos(). El cliente calcula el disco
-- de celdas alrededor del origen y lo envia entero.
-- ---------------------------------------------------------------------------
create or replace function public.conductores_en_celdas(p_celdas text[])
returns table (
  conductor_id uuid,
  nombre text,
  celda text,
  calificacion numeric,
  vista_hace_min int
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id,
         p.full_name,
         c.celda_h3_7,
         c.calificacion_promedio,
         (extract(epoch from (now() - c.posicion_actualizada_en)) / 60)::int
  from public.conductores c
  join public.profiles p on p.id = c.id
  where c.disponible
    and c.estado_aprobacion = 'aprobado'
    and c.celda_h3_7 = any (p_celdas)
    and c.posicion_actualizada_en > now()
        - make_interval(mins => public.posicion_vigente_minutos())
    and not exists (
      select 1 from public.viajes v
      where v.conductor_id = c.id
        and v.estado not in ('FINALIZADO','CANCELADO','SIN_CONDUCTOR')
    );
  -- Sin ORDER BY por distancia: H3 no la conoce. Ordenar por cercania exige
  -- calcular Haversine igual, que es lo que PostGIS ya hacia gratis.
$$;

-- ---------------------------------------------------------------------------
-- Difusion por celda
-- ---------------------------------------------------------------------------
alter table public.viajes
  add column if not exists origen_celda_h3_7 text;

create index if not exists viajes_origen_celda_idx
  on public.viajes (origen_celda_h3_7)
  where estado = 'BUSCANDO_CONDUCTOR';

comment on column public.viajes.origen_celda_h3_7 is
  'Celda H3 res 7 del punto de recogida, calculada en el cliente al solicitar.';

do $$
declare f text;
begin
  foreach f in array array[
    'public.reportar_posicion(float8,float8,uuid,text,text)',
    'public.conductores_en_celdas(text[])'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
