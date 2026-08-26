-- El registro de las dos apps envia el telefono en user_metadata, pero
-- handle_new_user() no lo estaba guardando: la columna phone quedaba nula.
--
-- De paso da de alta la extension 1:1 que corresponde al rol elegido, para que
-- un pasajero recien registrado ya pueda pedir viajes y un conductor quede
-- listo para que la administracion lo apruebe.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_email text;
  v_full_name text;
  v_phone text;
begin
  v_email := lower(coalesce(new.email, ''));
  v_full_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    null
  );
  v_phone := nullif(trim(coalesce(new.raw_user_meta_data->>'phone', '')), '');
  v_role := lower(coalesce(new.raw_user_meta_data->>'role', 'passenger'));

  if v_role not in ('passenger', 'driver', 'admin', 'superadmin') then
    v_role := 'passenger';
  end if;

  -- Registro publico: solo pasajero o conductor.
  if v_role in ('passenger', 'driver') then
    insert into public.profiles (id, email, full_name, phone, role, must_change_password)
    values (new.id, v_email, v_full_name, v_phone, v_role::public.user_role, false);

    -- Alta automatica de la extension 1:1 que corresponde al rol elegido.
    if v_role = 'passenger' then
      insert into public.pasajeros (id) values (new.id) on conflict do nothing;
    else
      insert into public.conductores (id) values (new.id) on conflict do nothing;
    end if;

    return new;
  end if;

  -- Roles administrativos: solo la lista blanca definida en is_bootstrap_admin_email.
  if not public.is_bootstrap_admin_email(v_email) then
    raise exception 'not allowed';
  end if;

  insert into public.profiles (id, email, full_name, phone, role, must_change_password)
  values (
    new.id,
    v_email,
    v_full_name,
    v_phone,
    v_role::public.user_role,
    coalesce((new.raw_app_meta_data->>'must_change_password')::boolean, true)
  );

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
