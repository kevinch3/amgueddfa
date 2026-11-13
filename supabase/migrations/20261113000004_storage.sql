-- Storage buckets and object policies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('uploads', 'uploads', false, 20971520,
   array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('restricted', 'restricted', false, null, null),
  ('media', 'media', true, null, null)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- uploads: a signed-in user writes only under "<uid>/..."; admins read.
create policy uploads_insert_own_folder on storage.objects
  for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);
create policy uploads_select_admin on storage.objects
  for select to authenticated
  using (bucket_id = 'uploads' and public.is_admin());

-- restricted: admins only (the local build writes with the service key).
create policy restricted_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'restricted' and public.is_admin());
create policy restricted_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'restricted' and public.is_admin());
create policy restricted_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'restricted' and public.is_admin())
  with check (bucket_id = 'restricted' and public.is_admin());
create policy restricted_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'restricted' and public.is_admin());

-- media: anyone reads; admins write.
create policy media_public_select on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'media');
create policy media_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and public.is_admin());
create policy media_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and public.is_admin())
  with check (bucket_id = 'media' and public.is_admin());
create policy media_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and public.is_admin());
