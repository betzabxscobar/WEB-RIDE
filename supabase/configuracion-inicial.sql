-- =====================================================================
-- ARCHIVO HISTORICO - NO EJECUTAR
-- =====================================================================
-- Este script NO corresponde al esquema realmente desplegado en Supabase.
-- Diferencias con la base real (proyecto jnnesfafbrlbycfkruph):
--   * aqui el enum se llama app_role; en la base real es user_role
--   * aqui la PK de profiles es user_id; en la base real es id
--   * aqui existen phone y password_changed_at; la base real no los tenia
--     (phone se agrego despues en migraciones/01)
--   * las politicas RLS reales leen el rol desde la tabla via
--     current_user_role(), no desde el JWT app_metadata
--
-- El esquema vigente esta en supabase/migraciones/. Ver el README de esa
-- carpeta. Este archivo se conserva solo como referencia del diseno inicial.
-- =====================================================================

create type public.app_role as enum ('passenger','driver','admin','superadmin');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique check (email = lower(email)),
  full_name text not null default '',
  phone text,
  role public.app_role not null default 'passenger',
  must_change_password boolean not null default false,
  password_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles(role);
create index profiles_created_at_idx on public.profiles(created_at desc);

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name, phone) on table public.profiles to authenticated;

create policy "El usuario consulta su propio perfil"
on public.profiles for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Administracion consulta perfiles"
on public.profiles for select to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','superadmin')
  and coalesce((select (auth.jwt() -> 'app_metadata' ->> 'must_change_password')::boolean), true) = false
  and (
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin'
    or role <> 'superadmin'
  )
);

create policy "El usuario actualiza datos permitidos de su perfil"
on public.profiles for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare requested_role public.app_role;
begin
  requested_role := case
    when new.raw_user_meta_data ->> 'role' = 'driver' then 'driver'::public.app_role
    else 'passenger'::public.app_role
  end;
  insert into public.profiles (user_id,email,full_name,phone,role,must_change_password)
  values (new.id,lower(new.email),coalesce(new.raw_user_meta_data ->> 'full_name',''),new.raw_user_meta_data ->> 'phone',requested_role,false)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
