-- Impide que una previsualizacion administrativa opere viajes reales.
update public.conductores c
set disponible = false
where disponible
  and not exists (
    select 1 from public.profiles p
    where p.id = c.id and p.role = 'driver'
  );

create or replace function public.validar_disponibilidad_conductor_real()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.disponible and not exists (
    select 1 from public.profiles p
    where p.id = new.id and p.role = 'driver'
  ) then
    raise exception 'Solo una cuenta con rol conductor puede ponerse disponible'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists conductores_solo_rol_driver_disponible on public.conductores;
create trigger conductores_solo_rol_driver_disponible
before insert or update of disponible on public.conductores
for each row execute function public.validar_disponibilidad_conductor_real();

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
    select 1
    from public.profiles p
    join public.conductores c on c.id = p.id
    where p.id = v_uid
      and p.role = 'driver'
      and p.activo
      and c.estado_aprobacion = 'aprobado'
      and c.disponible
  ) then
    raise exception 'Solo un conductor aprobado y disponible puede aceptar viajes'
      using errcode = 'check_violation';
  end if;

  select id into v_vehiculo
  from public.vehiculos
  where conductor_id = v_uid and activo
  limit 1;

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

  if not (
    public.viaje_en_mi_celda(p_viaje_id)
    or public.viaje_esta_cerca_de_mi(p_viaje_id)
  ) then
    raise exception 'Ese viaje esta fuera de tu zona'
      using errcode = 'check_violation';
  end if;

  update public.viajes
  set estado = 'ACEPTADO', conductor_id = v_uid, vehiculo_id = v_vehiculo
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

revoke execute on function public.preparar_chofer_superadmin() from public, anon, authenticated;
revoke execute on function public.aceptar_viaje(uuid) from public, anon;
grant execute on function public.aceptar_viaje(uuid) to authenticated;
revoke execute on function public.validar_disponibilidad_conductor_real() from public, anon, authenticated;
