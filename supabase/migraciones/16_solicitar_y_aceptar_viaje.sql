-- Operaciones del ciclo de viaje que no pueden dejarse al cliente.

-- ---------------------------------------------------------------------------
-- Solicitar un viaje
--
-- Crea el viaje y sus dos ubicaciones en una sola transaccion, y calcula el
-- precio aqui: el cliente solo dice a donde va, nunca cuanto cuesta.
-- ---------------------------------------------------------------------------
create or replace function public.solicitar_viaje(
  p_origen_lat float8, p_origen_lng float8, p_origen_texto text,
  p_destino_lat float8, p_destino_lng float8, p_destino_texto text,
  p_tarifa_id uuid default null
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

  -- Alta perezosa: un usuario administrativo que prueba la app todavia no
  -- tiene fila en pasajeros.
  insert into public.pasajeros (id) values (v_uid) on conflict do nothing;

  -- Un viaje abierto a la vez. Evita que un toque doble cree dos solicitudes.
  if exists (
    select 1 from public.viajes
    where pasajero_id = v_uid
      and estado not in ('FINALIZADO', 'CANCELADO', 'SIN_CONDUCTOR')
  ) then
    raise exception 'Ya tienes un viaje en curso' using errcode = 'check_violation';
  end if;

  v_tarifa := coalesce(
    p_tarifa_id,
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

  insert into public.viajes (pasajero_id, tarifa_id, estado, tarifa_estimada)
  values (v_uid, v_tarifa, 'SOLICITADO', v_total)
  returning id into v_viaje;

  insert into public.ubicaciones (viaje_id, tipo, latitud, longitud, direccion_texto)
  values
    (v_viaje, 'origen',  p_origen_lat,  p_origen_lng,  p_origen_texto),
    (v_viaje, 'destino', p_destino_lat, p_destino_lng, p_destino_texto);

  -- Pasa de inmediato a difusion: el informe separa los dos estados, pero no
  -- hay nada que hacer entre uno y otro.
  update public.viajes set estado = 'BUSCANDO_CONDUCTOR' where id = v_viaje;

  return v_viaje;
end;
$$;

-- ---------------------------------------------------------------------------
-- Aceptar un viaje
--
-- El UPDATE condicional es lo que evita que dos conductores se queden con la
-- misma solicitud: solo gana quien encuentre la fila todavia libre. Hacerlo
-- con un SELECT y luego un UPDATE dejaria una carrera abierta.
-- ---------------------------------------------------------------------------
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

  -- No puede tomar dos viajes a la vez.
  if exists (
    select 1 from public.viajes
    where conductor_id = v_uid
      and estado not in ('FINALIZADO', 'CANCELADO', 'SIN_CONDUCTOR')
  ) then
    raise exception 'Ya tienes un viaje asignado' using errcode = 'check_violation';
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

revoke execute on function public.solicitar_viaje(float8,float8,text,float8,float8,text,uuid) from public, anon;
revoke execute on function public.aceptar_viaje(uuid) from public, anon;
grant execute on function public.solicitar_viaje(float8,float8,text,float8,float8,text,uuid) to authenticated;
grant execute on function public.aceptar_viaje(uuid) to authenticated;
