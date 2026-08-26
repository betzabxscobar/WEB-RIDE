-- Metodos de pago del pasajero y eleccion automatica de tarifa.

-- ---------------------------------------------------------------------------
-- Registrar un metodo de pago
--
-- El efectivo no lleva token; la tarjeta exige uno de la pasarela. Aqui NUNCA
-- entra un numero de tarjeta real: el CHECK metodos_pago_token_segun_tipo ya lo
-- exige, y esta funcion rechaza cualquier cosa que parezca un PAN.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_metodo_pago(
  p_tipo text,
  p_token text default null,
  p_predeterminado boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesion' using errcode = '28000';
  end if;
  if p_tipo not in ('tarjeta','efectivo') then
    raise exception 'Tipo de pago no valido' using errcode = 'check_violation';
  end if;

  if p_tipo = 'efectivo' then
    v_token := null;
  elsif v_token is null then
    raise exception 'La tarjeta necesita el token de la pasarela'
      using errcode = 'check_violation';
  else
    -- Barrera contra guardar un numero de tarjeta por error: 13-19 digitos
    -- seguidos, con o sin separadores, no es un token.
    if regexp_replace(v_token, '[\s-]', '', 'g') ~ '^[0-9]{13,19}$' then
      raise exception 'Eso parece un numero de tarjeta. Guarda solo el token de la pasarela'
        using errcode = 'check_violation';
    end if;
  end if;

  insert into public.pasajeros (id) values (v_uid) on conflict do nothing;

  -- Un solo predeterminado por pasajero: el indice parcial unico lo impone, asi
  -- que hay que apagar el anterior antes.
  if p_predeterminado then
    update public.metodos_pago set predeterminado = false
     where pasajero_id = v_uid and predeterminado;
  end if;

  insert into public.metodos_pago (pasajero_id, tipo, detalle_tokenizado, predeterminado)
  values (v_uid, p_tipo, v_token, p_predeterminado)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.elegir_metodo_predeterminado(p_metodo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if not exists (
    select 1 from public.metodos_pago where id = p_metodo_id and pasajero_id = v_uid
  ) then
    raise exception 'Ese metodo de pago no es tuyo' using errcode = '42501';
  end if;

  update public.metodos_pago set predeterminado = false
   where pasajero_id = v_uid and predeterminado;
  update public.metodos_pago set predeterminado = true where id = p_metodo_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tarifa segun el momento del dia
--
-- Las tres tarifas del informe ya existen; faltaba decidir cual aplica. Se
-- resuelve por franja horaria en la zona de Guayaquil, no en UTC: si se usara
-- la hora del servidor, la tarifa nocturna caeria a media tarde.
-- ---------------------------------------------------------------------------
alter table public.tarifas
  add column if not exists hora_desde int check (hora_desde between 0 and 23),
  add column if not exists hora_hasta int check (hora_hasta between 0 and 23);

update public.tarifas set hora_desde = 22, hora_hasta = 5  where nombre = 'Tarifa Nocturna'  and hora_desde is null;
update public.tarifas set hora_desde = 6,  hora_hasta = 9   where nombre = 'Tarifa Hora Pico' and hora_desde is null;

comment on column public.tarifas.hora_desde is
  'Inicio de la franja en hora local. Nulo = tarifa base, aplica cuando ninguna franja calza.';

create or replace function public.tarifa_vigente()
returns uuid
language sql
stable
set search_path = ''
as $$
  with h as (
    select extract(hour from (now() at time zone 'America/Guayaquil'))::int as hora
  )
  select t.id
  from public.tarifas t, h
  where t.activo
    and t.hora_desde is not null
    and (
      -- Franja que no cruza medianoche (06:00-09:00)
      (t.hora_desde <= t.hora_hasta and h.hora between t.hora_desde and t.hora_hasta)
      -- Franja que sí la cruza (22:00-05:00)
      or (t.hora_desde > t.hora_hasta and (h.hora >= t.hora_desde or h.hora <= t.hora_hasta))
    )
  order by t.tarifa_base desc
  limit 1;
$$;

grant execute on function public.tarifa_vigente() to authenticated;
revoke execute on function public.tarifa_vigente() from public, anon;

-- solicitar_viaje pasa a usarla cuando el cliente no indica tarifa.
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

  insert into public.pasajeros (id) values (v_uid) on conflict do nothing;

  if exists (
    select 1 from public.viajes
    where pasajero_id = v_uid
      and estado not in ('FINALIZADO', 'CANCELADO', 'SIN_CONDUCTOR')
  ) then
    raise exception 'Ya tienes un viaje en curso' using errcode = 'check_violation';
  end if;

  -- Primero la franja horaria; si ninguna calza, la mas barata activa.
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

  insert into public.viajes (pasajero_id, tarifa_id, estado, tarifa_estimada)
  values (v_uid, v_tarifa, 'SOLICITADO', v_total)
  returning id into v_viaje;

  insert into public.ubicaciones (viaje_id, tipo, latitud, longitud, direccion_texto)
  values
    (v_viaje, 'origen',  p_origen_lat,  p_origen_lng,  p_origen_texto),
    (v_viaje, 'destino', p_destino_lat, p_destino_lng, p_destino_texto);

  update public.viajes set estado = 'BUSCANDO_CONDUCTOR' where id = v_viaje;

  return v_viaje;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.registrar_metodo_pago(text,text,boolean)',
    'public.elegir_metodo_predeterminado(uuid)',
    'public.solicitar_viaje(float8,float8,text,float8,float8,text,uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
