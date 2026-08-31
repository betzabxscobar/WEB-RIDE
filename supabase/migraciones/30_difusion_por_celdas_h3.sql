-- Difusion de solicitudes usando H3.
--
-- El problema a resolver: una politica RLS se evalua fila por fila dentro de
-- Postgres y no puede pedirle al cliente que calcule nada. Como H3 no esta
-- disponible aqui, el servidor no puede generar el disco de celdas alrededor
-- del origen.
--
-- La salida es invertir el orden: al solicitar el viaje, el cliente calcula el
-- disco completo y lo guarda en la fila. Despues la politica solo comprueba si
-- la celda del chofer esta en ese arreglo.
--
-- Coste: unas 61 celdas de 15 caracteres por viaje (~900 bytes) frente a un
-- unico numero de radio con PostGIS.
alter table public.viajes
  add column if not exists celdas_difusion text[];

comment on column public.viajes.celdas_difusion is
  'Disco de celdas H3 alrededor del origen, calculado en el cliente al solicitar. Sustituye al radio de PostGIS porque el servidor no puede generarlo.';

-- ---------------------------------------------------------------------------
-- Solicitar viaje guardando las celdas
-- ---------------------------------------------------------------------------
create or replace function public.solicitar_viaje(
  p_origen_lat float8, p_origen_lng float8, p_origen_texto text,
  p_destino_lat float8, p_destino_lng float8, p_destino_texto text,
  p_tarifa_id uuid default null,
  p_origen_celda_h3_7 text default null,
  p_celdas_difusion text[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tarifa uuid;
  v_total numeric;
  v_viaje uuid;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesion' using errcode = '28000';
  end if;

  insert into public.pasajeros (id) values (v_uid) on conflict do nothing;

  if exists (
    select 1 from public.viajes
    where pasajero_id = v_uid
      and estado not in ('FINALIZADO', 'CANCELADO', 'SIN_CONDUCTOR')
  ) then
    raise exception 'Ya tienes un viaje en curso' using errcode = 'check_violation';
  end if;

  v_tarifa := coalesce(
    p_tarifa_id,
    public.tarifa_vigente(),
    (select id from public.tarifas where activo order by tarifa_base limit 1)
  );
  if v_tarifa is null then
    raise exception 'No hay tarifas disponibles' using errcode = 'check_violation';
  end if;

  select c.total into v_total
  from public.cotizar_viaje(
    v_tarifa, p_origen_lat, p_origen_lng, p_destino_lat, p_destino_lng
  ) c;

  if v_total is null then
    raise exception 'No se pudo cotizar el viaje' using errcode = 'check_violation';
  end if;

  insert into public.viajes (
    pasajero_id, tarifa_id, estado, tarifa_estimada,
    origen_celda_h3_7, celdas_difusion
  )
  values (
    v_uid, v_tarifa, 'SOLICITADO', v_total,
    p_origen_celda_h3_7, p_celdas_difusion
  )
  returning id into v_viaje;

  insert into public.ubicaciones (viaje_id, tipo, latitud, longitud, direccion_texto)
  values
    (v_viaje, 'origen',  p_origen_lat,  p_origen_lng,  p_origen_texto),
    (v_viaje, 'destino', p_destino_lat, p_destino_lng, p_destino_texto);

  update public.viajes set estado = 'BUSCANDO_CONDUCTOR' where id = v_viaje;

  return v_viaje;
end;
$$;

-- ---------------------------------------------------------------------------
-- Estoy en el area de difusion de este viaje?
--
-- Version H3 de viaje_esta_cerca_de_mi(). Compara cadenas en vez de calcular
-- distancias.
--
-- ATENCION: la celda del chofer la calculo su propio dispositivo. El servidor
-- no puede comprobar que corresponda a sus coordenadas, porque eso exigiria H3
-- dentro de Postgres. Con PostGIS la posicion se verificaba aqui.
-- ---------------------------------------------------------------------------
create or replace function public.viaje_en_mi_celda(p_viaje_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conductores c
    join public.viajes v on v.id = p_viaje_id
    where c.id = (select auth.uid())
      and c.disponible
      and c.estado_aprobacion = 'aprobado'
      and c.celda_h3_7 is not null
      and v.celdas_difusion is not null
      and c.celda_h3_7 = any (v.celdas_difusion)
      and c.posicion_actualizada_en > now()
          - make_interval(mins => public.posicion_vigente_minutos())
  );
$$;

revoke execute on function public.viaje_en_mi_celda(uuid) from public, anon;
grant execute on function public.viaje_en_mi_celda(uuid) to authenticated;

-- La difusion pasa a H3. Se deja PostGIS como respaldo con OR: si el viaje
-- viene de un cliente sin H3 (movil), sigue funcionando por radio.
drop policy if exists viajes_difusion_conductores on public.viajes;
create policy viajes_difusion_conductores on public.viajes for select to authenticated
  using (
    estado = 'BUSCANDO_CONDUCTOR'
    and conductor_id is null
    and (
      public.viaje_en_mi_celda(id)
      or (celdas_difusion is null and public.viaje_esta_cerca_de_mi(id))
    )
  );

-- Aceptar tambien acepta cualquiera de las dos vias.
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

  if not (public.viaje_en_mi_celda(p_viaje_id)
          or public.viaje_esta_cerca_de_mi(p_viaje_id)) then
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

do $$
declare f text;
begin
  foreach f in array array[
    'public.solicitar_viaje(float8,float8,text,float8,float8,text,uuid,text,text[])',
    'public.aceptar_viaje(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- La firma vieja de solicitar_viaje queda huerfana.
drop function if exists public.solicitar_viaje(float8,float8,text,float8,float8,text,uuid);
