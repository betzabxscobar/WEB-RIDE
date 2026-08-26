-- Cierra los avisos del linter de seguridad de Supabase.
-- Las funciones de trigger no necesitan EXECUTE publico: corren con el dueno
-- de la tabla, no con quien dispara la sentencia.
revoke execute on function public.handle_new_user()        from public, anon, authenticated;
revoke execute on function public.prevent_role_self_edit() from public, anon, authenticated;
revoke execute on function public.set_updated_at()         from public, anon, authenticated;

-- participa_en_viaje y los helpers de rol solo tienen sentido con sesion iniciada.
revoke execute on function public.participa_en_viaje(uuid) from public, anon;
revoke execute on function public.es_administrativo()      from public, anon;
revoke execute on function public.current_user_role()      from public, anon;
revoke execute on function public.current_user_must_change_password() from public, anon;
grant  execute on function public.current_user_role()      to authenticated;
grant  execute on function public.current_user_must_change_password() to authenticated;

-- search_path fijo: evita que un schema en el path secuestre la resolucion de nombres.
create or replace function public.is_bootstrap_admin_email(p_email text)
returns boolean language sql stable set search_path = '' as $$
  select lower(coalesce(p_email, '')) = any (array[
    'betzabxscobar@gmail.com',
    'dandreszurtaf23@gmail.com',
    'alexyanez1119@gmail.com',
    'mayuriremache0@gmail.com',
    'javierconforme18@gmail.com'
  ]);
$$;

create or replace function public.can_view_role(target_role public.user_role)
returns boolean language sql stable set search_path = '' as $$
  select case public.current_user_role()
    when 'superadmin' then true
    when 'admin'      then target_role in ('passenger','driver','admin')
    when 'driver'     then target_role = 'driver'
    when 'passenger'  then target_role = 'passenger'
    else false
  end;
$$;

create or replace function public.can_manage_role(target_role public.user_role)
returns boolean language sql stable set search_path = '' as $$
  select case public.current_user_role()
    when 'superadmin' then true
    when 'admin'      then target_role in ('passenger','driver','admin')
    else false
  end;
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
