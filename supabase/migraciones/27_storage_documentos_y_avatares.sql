-- Almacenamiento de archivos.
--
-- Dos buckets con criterios distintos:
--   documentos -> privado. Guarda licencias, SOAT y matriculas: datos
--                 personales que solo debe ver su dueno y la administracion.
--   avatares   -> publico. Son fotos de perfil que se muestran en la app; si
--                 fueran privadas habria que firmar una URL en cada render.
--
-- La ruta siempre empieza por el id del usuario: documentos/<uid>/licencia.pdf
-- Eso es lo que permite que la politica compare el primer segmento con
-- auth.uid() y nadie pueda escribir en la carpeta de otro.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documentos', 'documentos', false, 5242880,
   array['image/jpeg','image/png','image/webp','application/pdf']),
  ('avatares',   'avatares',   true,  2097152,
   array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- --------------------------- documentos (privado) --------------------------
drop policy if exists documentos_sube_su_dueno on storage.objects;
create policy documentos_sube_su_dueno on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists documentos_reemplaza_su_dueno on storage.objects;
create policy documentos_reemplaza_su_dueno on storage.objects for update to authenticated
  using (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- El dueno ve lo suyo; la administracion ve todo, porque tiene que revisarlo.
drop policy if exists documentos_lectura on storage.objects;
create policy documentos_lectura on storage.objects for select to authenticated
  using (
    bucket_id = 'documentos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.es_administrativo()
    )
  );

drop policy if exists documentos_borra_su_dueno on storage.objects;
create policy documentos_borra_su_dueno on storage.objects for delete to authenticated
  using (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- --------------------------- avatares (publico) ----------------------------
-- El bucket publico permite leer sin sesion, pero escribir sigue restringido a
-- la carpeta propia.
drop policy if exists avatares_sube_su_dueno on storage.objects;
create policy avatares_sube_su_dueno on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists avatares_actualiza_su_dueno on storage.objects;
create policy avatares_actualiza_su_dueno on storage.objects for update to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists avatares_borra_su_dueno on storage.objects;
create policy avatares_borra_su_dueno on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
