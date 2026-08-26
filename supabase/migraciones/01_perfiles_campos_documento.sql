-- Seccion 2.2 - Tabla usuarios del documento = public.profiles existente.
-- Se agregan los campos del diccionario de datos que aun no existian.
-- Mapeo documento -> implementacion:
--   nombre + apellido -> full_name (ya en uso por Flutter y React)
--   es_admin          -> role in ('admin','superadmin') via enum user_role
--   telefono          -> phone
alter table public.profiles
  add column if not exists phone text,
  add column if not exists foto_url text,
  add column if not exists activo boolean not null default true;

-- Telefono unico solo cuando existe, para no chocar con los perfiles ya creados.
create unique index if not exists profiles_phone_key
  on public.profiles (phone)
  where phone is not null;

create index if not exists profiles_activo_idx on public.profiles (activo) where activo;

comment on column public.profiles.phone is 'Documento 2.2: telefono. Unico cuando no es nulo.';
comment on column public.profiles.foto_url is 'Documento 2.2: foto_url. Ruta en Supabase Storage.';
comment on column public.profiles.activo is 'Documento 2.2: activo. Permite suspender cuentas sin borrarlas.';
