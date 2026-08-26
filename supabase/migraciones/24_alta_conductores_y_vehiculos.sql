-- Alta de chofer y su flota desde la app.
--
-- Hasta ahora un conductor solo existia si alguien lo insertaba a mano en la
-- base. Estas funciones cierran ese hueco sin abrir la puerta a que nadie se
-- auto-apruebe: el alta siempre nace en 'pendiente'.

-- ---------------------------------------------------------------------------
-- Registrar o actualizar el vehiculo propio
-- ---------------------------------------------------------------------------
create or replace function public.registrar_vehiculo(
  p_placa text, p_marca text, p_modelo text, p_anio int,
  p_color text default null,
  p_vehiculo_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_placa text := upper(trim(coalesce(p_placa, '')));
  v_id uuid;
  v_primero boolean;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesion' using errcode = '28000';
  end if;
  if v_placa = '' or length(v_placa) < 5 then
    raise exception 'La placa no es valida' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_marca), '') = '' or coalesce(trim(p_modelo), '') = '' then
    raise exception 'Marca y modelo son obligatorios' using errcode = 'check_violation';
  end if;

  -- Alta perezosa del conductor. Nace pendiente: la aprobacion es de la
  -- administracion, nunca del propio interesado.
  insert into public.conductores (id) values (v_uid) on conflict do nothing;

  -- La placa no puede estar en uso por otro conductor.
  if exists (
    select 1 from public.vehiculos
    where placa = v_placa
      and (p_vehiculo_id is null or id <> p_vehiculo_id)
  ) then
    raise exception 'Esa placa ya esta registrada' using errcode = 'unique_violation';
  end if;

  select not exists (select 1 from public.vehiculos where conductor_id = v_uid)
    into v_primero;

  if p_vehiculo_id is null then
    insert into public.vehiculos (conductor_id, placa, marca, modelo, anio, color, activo)
    values (v_uid, v_placa, trim(p_marca), trim(p_modelo), p_anio, nullif(trim(p_color), ''),
            v_primero)  -- el primero queda en servicio automaticamente
    returning id into v_id;
  else
    update public.vehiculos
    set placa = v_placa, marca = trim(p_marca), modelo = trim(p_modelo),
        anio = p_anio, color = nullif(trim(p_color), '')
    where id = p_vehiculo_id and conductor_id = v_uid
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese vehiculo no es tuyo' using errcode = '42501';
    end if;
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Elegir cual vehiculo esta en servicio
--
-- El indice parcial unico impide dos activos a la vez, asi que hay que apagar
-- el anterior antes de encender el nuevo. En una sola transaccion.
-- ---------------------------------------------------------------------------
create or replace function public.activar_vehiculo(p_vehiculo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if not exists (
    select 1 from public.vehiculos where id = p_vehiculo_id and conductor_id = v_uid
  ) then
    raise exception 'Ese vehiculo no es tuyo' using errcode = '42501';
  end if;

  -- Cambiar de auto con un viaje en marcha dejaria el viaje apuntando a un
  -- vehiculo que ya no esta en servicio.
  if exists (
    select 1 from public.viajes
    where conductor_id = v_uid
      and estado not in ('FINALIZADO','CANCELADO','SIN_CONDUCTOR')
  ) then
    raise exception 'No puedes cambiar de vehiculo con un viaje en curso'
      using errcode = 'check_violation';
  end if;

  update public.vehiculos set activo = false
   where conductor_id = v_uid and activo and id <> p_vehiculo_id;
  update public.vehiculos set activo = true where id = p_vehiculo_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Subir o reemplazar un documento
--
-- Cada carga vuelve el documento a 'pendiente': si alguien pudiera reemplazar
-- el archivo dejando el sello de aprobado, la revision no serviria de nada.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_documento(
  p_tipo text, p_url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesion' using errcode = '28000';
  end if;
  if p_tipo not in ('licencia','SOAT','matricula') then
    raise exception 'Tipo de documento no valido' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_url), '') = '' then
    raise exception 'Falta el archivo' using errcode = 'check_violation';
  end if;

  insert into public.conductores (id) values (v_uid) on conflict do nothing;

  insert into public.documentos_conductor (conductor_id, tipo_documento, url_archivo, estado)
  values (v_uid, p_tipo, trim(p_url), 'pendiente')
  on conflict (conductor_id, tipo_documento) do update
    set url_archivo = excluded.url_archivo,
        estado = 'pendiente',
        fecha_subida = now()
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Revisar un documento (solo administracion)
-- ---------------------------------------------------------------------------
create or replace function public.revisar_documento(
  p_documento_id uuid, p_aprobado boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_administrativo() then
    raise exception 'Solo la administracion revisa documentos' using errcode = '42501';
  end if;

  update public.documentos_conductor
  set estado = case when p_aprobado then 'aprobado' else 'rechazado' end
  where id = p_documento_id;

  if not found then
    raise exception 'Documento no encontrado' using errcode = 'no_data_found';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Aprobar o rechazar a un chofer (solo administracion)
--
-- Exige los tres documentos aprobados y un vehiculo registrado: aprobar sin eso
-- dejaria circular a alguien sin licencia ni matricula.
-- ---------------------------------------------------------------------------
create or replace function public.revisar_conductor(
  p_conductor_id uuid, p_aprobado boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_docs int; v_autos int;
begin
  if not public.es_administrativo() then
    raise exception 'Solo la administracion aprueba conductores' using errcode = '42501';
  end if;

  if not p_aprobado then
    update public.conductores
    set estado_aprobacion = 'rechazado'
    where id = p_conductor_id;
    return 'rechazado';
  end if;

  select count(*) into v_docs
  from public.documentos_conductor
  where conductor_id = p_conductor_id and estado = 'aprobado';

  select count(*) into v_autos
  from public.vehiculos where conductor_id = p_conductor_id;

  if v_docs < 3 then
    raise exception 'Faltan documentos aprobados (% de 3)', v_docs
      using errcode = 'check_violation';
  end if;
  if v_autos = 0 then
    raise exception 'El conductor no tiene ningun vehiculo registrado'
      using errcode = 'check_violation';
  end if;

  update public.conductores
  set estado_aprobacion = 'aprobado'
  where id = p_conductor_id;

  return 'aprobado';
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.registrar_vehiculo(text,text,text,int,text,uuid)',
    'public.activar_vehiculo(uuid)',
    'public.registrar_documento(text,text)',
    'public.revisar_documento(uuid,boolean)',
    'public.revisar_conductor(uuid,boolean)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
