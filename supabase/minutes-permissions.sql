create or replace function public.is_minutes_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_minutes_admin() from public;
grant execute on function public.is_minutes_admin() to authenticated;

grant update (file_url) on public.minutes to authenticated;
grant delete on public.minutes to authenticated;

alter table public.minutes enable row level security;

drop policy if exists minutes_owner_update on public.minutes;
create policy minutes_owner_update
on public.minutes
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists minutes_owner_update_guard on public.minutes;
create policy minutes_owner_update_guard
on public.minutes
as restrictive
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists minutes_owner_or_admin_delete on public.minutes;
create policy minutes_owner_or_admin_delete
on public.minutes
for delete
to authenticated
using (
  auth.uid() = user_id
  or public.is_minutes_admin()
);

drop policy if exists minutes_owner_or_admin_delete_guard on public.minutes;
create policy minutes_owner_or_admin_delete_guard
on public.minutes
as restrictive
for delete
to authenticated
using (
  auth.uid() = user_id
  or public.is_minutes_admin()
);

-- All authenticated office users may create signed links for shared minutes.
drop policy if exists minutes_storage_select on storage.objects;
create policy minutes_storage_select
on storage.objects
for select
to authenticated
using (bucket_id = 'minutes');

-- Uploads and replacement objects must stay under the uploading user's folder.
drop policy if exists minutes_storage_insert_owner on storage.objects;
create policy minutes_storage_insert_owner
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'minutes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists minutes_storage_insert_owner_guard on storage.objects;
create policy minutes_storage_insert_owner_guard
on storage.objects
as restrictive
for insert
to authenticated
with check (
  bucket_id <> 'minutes'
  or (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists minutes_storage_update_owner on storage.objects;
create policy minutes_storage_update_owner
on storage.objects
for update
to authenticated
using (
  bucket_id = 'minutes'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'minutes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists minutes_storage_update_owner_guard on storage.objects;
create policy minutes_storage_update_owner_guard
on storage.objects
as restrictive
for update
to authenticated
using (
  bucket_id <> 'minutes'
  or (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id <> 'minutes'
  or (storage.foldername(name))[1] = auth.uid()::text
);

-- File cleanup may be done by the uploader or an admin, but never replacement
-- or metadata updates by admins on another user's object.
drop policy if exists minutes_storage_delete_owner_or_admin on storage.objects;
create policy minutes_storage_delete_owner_or_admin
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'minutes'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_minutes_admin()
  )
);

drop policy if exists minutes_storage_delete_guard on storage.objects;
create policy minutes_storage_delete_guard
on storage.objects
as restrictive
for delete
to authenticated
using (
  bucket_id <> 'minutes'
  or (storage.foldername(name))[1] = auth.uid()::text
  or public.is_minutes_admin()
);

notify pgrst, 'reload schema';
