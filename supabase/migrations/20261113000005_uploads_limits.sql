-- uploads bucket: cap originals per user per rolling 24 h, and let owners
-- (and admins) delete them, so failed or withdrawn submits leave no orphans.

-- Counts every original under "<uid>/" stored in the last 24 h. Security
-- definer because a user cannot select their own uploads under RLS.
create function public.uploads_last_day(uid uuid) returns integer
language sql stable security definer
set search_path = ''
as $$
  select count(*)::integer
  from storage.objects o
  where o.bucket_id = 'uploads'
    and (storage.foldername(o.name))[1] = uid::text
    and o.created_at > now() - interval '24 hours'
$$;
revoke execute on function public.uploads_last_day(uuid) from public, anon;
grant execute on function public.uploads_last_day(uuid) to authenticated;

drop policy uploads_insert_own_folder on storage.objects;
create policy uploads_insert_own_folder on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.uploads_last_day(auth.uid()) < 30
  );

-- Storage's remove() needs select as well as delete on the object.
create policy uploads_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);
create policy uploads_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);
create policy uploads_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'uploads' and public.is_admin());
