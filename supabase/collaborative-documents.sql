create extension if not exists pgcrypto;

create table if not exists public.collaborative_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 180),
  document_type text not null check (
    document_type in ('memo', 'minutes', 'report', 'correspondence', 'other')
  ),
  created_by uuid not null references auth.users(id) on delete restrict,
  source_type text check (source_type in ('memo', 'minutes')),
  source_id bigint,
  status text not null default 'draft' check (
    status in ('draft', 'in_review', 'approved', 'archived')
  ),
  yjs_state bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((source_type is null) = (source_id is null))
);

create index if not exists collaborative_documents_owner_updated_idx
  on public.collaborative_documents (created_by, updated_at desc);

create index if not exists collaborative_documents_source_idx
  on public.collaborative_documents (source_type, source_id)
  where source_type is not null;

create table if not exists public.collaborative_document_members (
  document_id uuid not null references public.collaborative_documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null check (
    permission in ('owner', 'editor', 'commenter', 'viewer')
  ),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (document_id, user_id)
);

create index if not exists collaborative_document_members_user_idx
  on public.collaborative_document_members (user_id, document_id);

create table if not exists public.collaborative_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.collaborative_documents(id) on delete cascade,
  version_number integer not null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  snapshot bytea not null,
  content_json jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, version_number)
);

create index if not exists collaborative_document_versions_latest_idx
  on public.collaborative_document_versions (document_id, version_number desc);

alter table public.collaborative_document_versions
  add column if not exists content_json jsonb;

create table if not exists public.collaborative_document_activity (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.collaborative_documents(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (
    event_type in (
      'created',
      'shared',
      'permission_changed',
      'member_removed',
      'version_created',
      'version_restored',
      'submitted',
      'approved',
      'archived'
    )
  ),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists collaborative_document_activity_latest_idx
  on public.collaborative_document_activity (document_id, created_at desc);

create table if not exists public.collaborative_document_comments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.collaborative_documents(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists collaborative_document_comments_latest_idx
  on public.collaborative_document_comments (document_id, created_at);

create or replace function public.is_collaborative_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.profilec p
    where p.id = (select auth.uid())
      and p.is_approved is true
  );
$$;

create or replace function public.can_view_collaborative_document(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.collaborative_documents d
    where d.id = target_document_id
      and (
        d.created_by = (select auth.uid())
        or exists (
          select 1
          from public.collaborative_document_members m
          where m.document_id = d.id
            and m.user_id = (select auth.uid())
        )
      )
  );
$$;

create or replace function public.owns_collaborative_document(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.collaborative_documents d
    where d.id = target_document_id
      and d.created_by = (select auth.uid())
  );
$$;

create or replace function public.can_edit_collaborative_document(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.collaborative_documents d
    where d.id = target_document_id
      and d.status in ('draft', 'in_review')
      and (
        d.created_by = (select auth.uid())
        or exists (
          select 1
          from public.collaborative_document_members m
          where m.document_id = d.id
            and m.user_id = (select auth.uid())
            and m.permission = 'editor'
        )
      )
  );
$$;

create or replace function public.can_comment_collaborative_document(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.collaborative_documents d
    where d.id = target_document_id
      and d.status in ('draft', 'in_review')
      and (
        d.created_by = (select auth.uid())
        or exists (
          select 1
          from public.collaborative_document_members m
          where m.document_id = d.id
            and m.user_id = (select auth.uid())
            and m.permission in ('owner', 'editor', 'commenter')
        )
      )
  );
$$;

create or replace function public.is_collaborative_document_owner(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select public.owns_collaborative_document(target_document_id)
    or exists (
      select 1
      from public.collaborative_document_members m
      where m.document_id = target_document_id
        and m.user_id = (select auth.uid())
        and m.permission = 'owner'
    );
$$;

create or replace function public.list_collaborative_document_members(
  target_document_id uuid
)
returns table (
  user_id uuid,
  full_name text,
  "position" text,
  permission text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select m.user_id, p.full_name, p.position, m.permission, m.created_at
  from public.collaborative_document_members m
  join public.profilec p on p.id = m.user_id
  where m.document_id = target_document_id
    and public.is_collaborative_staff()
    and public.can_view_collaborative_document(target_document_id)
  order by case m.permission when 'owner' then 0 when 'editor' then 1 else 2 end,
    p.full_name nulls last;
$$;

create or replace function public.list_collaborative_document_comments(
  target_document_id uuid
)
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select c.id, c.author_id, coalesce(p.full_name, 'Staff member'), c.body, c.created_at
  from public.collaborative_document_comments c
  join public.profilec p on p.id = c.author_id
  where c.document_id = target_document_id
    and public.is_collaborative_staff()
    and public.can_view_collaborative_document(target_document_id)
  order by c.created_at;
$$;

create or replace function public.touch_collaborative_document_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists collaborative_documents_touch_updated_at
  on public.collaborative_documents;
create trigger collaborative_documents_touch_updated_at
  before update on public.collaborative_documents
  for each row execute function public.touch_collaborative_document_updated_at();

create or replace function public.add_collaborative_document_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  insert into public.collaborative_document_members (
    document_id, user_id, permission, invited_by
  ) values (
    new.id, new.created_by, 'owner', new.created_by
  );
  insert into public.collaborative_document_activity (
    document_id, actor_id, event_type, details
  ) values (
    new.id, new.created_by, 'created',
    jsonb_build_object('document_type', new.document_type)
  );
  return new;
end;
$$;

drop trigger if exists collaborative_documents_add_owner
  on public.collaborative_documents;
create trigger collaborative_documents_add_owner
  after insert on public.collaborative_documents
  for each row execute function public.add_collaborative_document_owner();

alter table public.collaborative_documents enable row level security;
alter table public.collaborative_document_members enable row level security;
alter table public.collaborative_document_versions enable row level security;
alter table public.collaborative_document_activity enable row level security;
alter table public.collaborative_document_comments enable row level security;

grant select (
  id, title, document_type, created_by, source_type, source_id, status,
  created_at, updated_at
) on public.collaborative_documents to authenticated;
grant insert (title, document_type, created_by, source_type, source_id, status)
  on public.collaborative_documents to authenticated;
grant update (title, status)
  on public.collaborative_documents to authenticated;
grant select, insert, update, delete
  on public.collaborative_document_members to authenticated;
grant select (
  id, document_id, version_number, name, created_by, created_at
) on public.collaborative_document_versions to authenticated;
grant select, insert on public.collaborative_document_activity to authenticated;
grant select, insert, delete
  on public.collaborative_document_comments to authenticated;
grant update (body)
  on public.collaborative_document_comments to authenticated;

grant all on public.collaborative_documents to service_role;
grant all on public.collaborative_document_members to service_role;
grant all on public.collaborative_document_versions to service_role;
grant all on public.collaborative_document_activity to service_role;
grant all on public.collaborative_document_comments to service_role;
grant usage, select on sequence public.collaborative_document_activity_id_seq to authenticated, service_role;

create or replace function public.load_collaborative_document_state(
  target_document_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select encode(d.yjs_state, 'base64')
  from public.collaborative_documents d
  where d.id = target_document_id;
$$;

create or replace function public.store_collaborative_document_state(
  target_document_id uuid,
  state_base64 text
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service access required' using errcode = '42501';
  end if;
  if state_base64 is null or length(state_base64) > 30000000 then
    raise exception 'Invalid collaborative state' using errcode = '22023';
  end if;

  update public.collaborative_documents
  set yjs_state = decode(state_base64, 'base64')
  where id = target_document_id
    and status in ('draft', 'in_review');

  if not found then
    raise exception 'Document is missing or read-only' using errcode = '55000';
  end if;
end;
$$;

drop policy if exists collaborative_documents_select_member
  on public.collaborative_documents;
create policy collaborative_documents_select_member
  on public.collaborative_documents
  for select to authenticated
  using (public.is_collaborative_staff() and public.can_view_collaborative_document(id));

drop policy if exists collaborative_documents_insert_owner
  on public.collaborative_documents;
create policy collaborative_documents_insert_owner
  on public.collaborative_documents
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.is_collaborative_staff()
  );

drop policy if exists collaborative_documents_update_editor
  on public.collaborative_documents;
create policy collaborative_documents_update_editor
  on public.collaborative_documents
  for update to authenticated
  using (
    public.is_collaborative_staff()
    and public.can_edit_collaborative_document(id)
  )
  with check (
    public.is_collaborative_staff()
    and (
      public.is_collaborative_document_owner(id)
      or public.can_edit_collaborative_document(id)
    )
  );

drop policy if exists collaborative_members_select_document
  on public.collaborative_document_members;
create policy collaborative_members_select_document
  on public.collaborative_document_members
  for select to authenticated
  using (
    public.is_collaborative_staff()
    and public.can_view_collaborative_document(document_id)
  );

drop policy if exists collaborative_members_insert_owner
  on public.collaborative_document_members;
create policy collaborative_members_insert_owner
  on public.collaborative_document_members
  for insert to authenticated
  with check (
    invited_by = (select auth.uid())
    and permission <> 'owner'
    and public.is_collaborative_staff()
    and public.is_collaborative_document_owner(document_id)
    and exists (
      select 1 from public.profilec p
      where p.id = user_id and p.is_approved is true
    )
  );

drop policy if exists collaborative_members_update_owner
  on public.collaborative_document_members;
create policy collaborative_members_update_owner
  on public.collaborative_document_members
  for update to authenticated
  using (
    permission <> 'owner'
    and public.is_collaborative_staff()
    and public.is_collaborative_document_owner(document_id)
  )
  with check (
    permission <> 'owner'
    and public.is_collaborative_staff()
    and public.is_collaborative_document_owner(document_id)
  );

drop policy if exists collaborative_members_delete_owner
  on public.collaborative_document_members;
create policy collaborative_members_delete_owner
  on public.collaborative_document_members
  for delete to authenticated
  using (
    permission <> 'owner'
    and public.is_collaborative_staff()
    and public.is_collaborative_document_owner(document_id)
  );

drop policy if exists collaborative_versions_select_member
  on public.collaborative_document_versions;
create policy collaborative_versions_select_member
  on public.collaborative_document_versions
  for select to authenticated
  using (
    public.is_collaborative_staff()
    and public.can_view_collaborative_document(document_id)
  );

drop policy if exists collaborative_versions_insert_editor
  on public.collaborative_document_versions;
create policy collaborative_versions_insert_editor
  on public.collaborative_document_versions
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.is_collaborative_staff()
    and public.can_edit_collaborative_document(document_id)
  );

drop policy if exists collaborative_activity_select_member
  on public.collaborative_document_activity;
create policy collaborative_activity_select_member
  on public.collaborative_document_activity
  for select to authenticated
  using (
    public.is_collaborative_staff()
    and public.can_view_collaborative_document(document_id)
  );

drop policy if exists collaborative_activity_insert_member
  on public.collaborative_document_activity;
create policy collaborative_activity_insert_member
  on public.collaborative_document_activity
  for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and public.is_collaborative_staff()
    and public.can_view_collaborative_document(document_id)
  );

drop policy if exists collaborative_comments_select_member
  on public.collaborative_document_comments;
create policy collaborative_comments_select_member
  on public.collaborative_document_comments
  for select to authenticated
  using (
    public.is_collaborative_staff()
    and public.can_view_collaborative_document(document_id)
  );

drop policy if exists collaborative_comments_insert_author
  on public.collaborative_document_comments;
create policy collaborative_comments_insert_author
  on public.collaborative_document_comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.is_collaborative_staff()
    and public.can_comment_collaborative_document(document_id)
  );

drop policy if exists collaborative_comments_update_author_or_owner
  on public.collaborative_document_comments;
create policy collaborative_comments_update_author_or_owner
  on public.collaborative_document_comments
  for update to authenticated
  using (
    public.is_collaborative_staff()
    and (
      author_id = (select auth.uid())
      or public.is_collaborative_document_owner(document_id)
    )
  )
  with check (
    public.is_collaborative_staff()
    and (
      author_id = (select auth.uid())
      or public.is_collaborative_document_owner(document_id)
    )
  );

drop policy if exists collaborative_comments_delete_author_or_owner
  on public.collaborative_document_comments;
create policy collaborative_comments_delete_author_or_owner
  on public.collaborative_document_comments
  for delete to authenticated
  using (
    public.is_collaborative_staff()
    and (
      author_id = (select auth.uid())
      or public.is_collaborative_document_owner(document_id)
    )
  );

create or replace function public.create_collaborative_document_version(
  target_document_id uuid,
  version_name text,
  snapshot_base64 text,
  content_json jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  next_version integer;
  created_version_id uuid;
begin
  if not public.is_collaborative_staff()
     or not public.can_edit_collaborative_document(target_document_id) then
    raise exception 'Not authorized to create a version' using errcode = '42501';
  end if;

  if snapshot_base64 is null or length(snapshot_base64) > 30000000
     or content_json is null or jsonb_typeof(content_json) <> 'object' then
    raise exception 'Invalid document snapshot' using errcode = '22023';
  end if;

  perform 1 from public.collaborative_documents d
    where d.id = target_document_id for update;

  select coalesce(max(v.version_number), 0) + 1
    into next_version
    from public.collaborative_document_versions v
    where v.document_id = target_document_id;

  insert into public.collaborative_document_versions (
    document_id, version_number, name, created_by, snapshot, content_json
  ) values (
    target_document_id, next_version, trim(version_name), (select auth.uid()),
    decode(snapshot_base64, 'base64'), content_json
  ) returning id into created_version_id;

  insert into public.collaborative_document_activity (
    document_id, actor_id, event_type, details
  ) values (
    target_document_id, (select auth.uid()), 'version_restored',
    jsonb_build_object('version_id', created_version_id, 'version_number', next_version)
  );

  return created_version_id;
end;
$$;

create or replace function public.restore_collaborative_document_version(
  target_document_id uuid,
  target_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  restored_content jsonb;
  restored_version integer;
begin
  if not public.is_collaborative_staff()
     or not public.can_edit_collaborative_document(target_document_id) then
    raise exception 'Not authorized to restore a version' using errcode = '42501';
  end if;

  select v.content_json, v.version_number
    into restored_content, restored_version
    from public.collaborative_document_versions v
    where v.id = target_version_id
      and v.document_id = target_document_id;

  if restored_content is null then
    raise exception 'Version not found' using errcode = 'P0002';
  end if;

  insert into public.collaborative_document_activity (
    document_id, actor_id, event_type, details
  ) values (
    target_document_id, (select auth.uid()), 'version_created',
    jsonb_build_object('restored_version_number', restored_version)
  );

  return restored_content;
end;
$$;

revoke all on function public.is_collaborative_staff() from public;
revoke all on function public.can_view_collaborative_document(uuid) from public;
revoke all on function public.owns_collaborative_document(uuid) from public;
revoke all on function public.can_edit_collaborative_document(uuid) from public;
revoke all on function public.can_comment_collaborative_document(uuid) from public;
revoke all on function public.is_collaborative_document_owner(uuid) from public;
revoke all on function public.list_collaborative_document_members(uuid) from public;
revoke all on function public.list_collaborative_document_comments(uuid) from public;
revoke all on function public.create_collaborative_document_version(uuid, text, text, jsonb) from public;
revoke all on function public.restore_collaborative_document_version(uuid, uuid) from public;

grant execute on function public.is_collaborative_staff() to authenticated, service_role;
grant execute on function public.can_view_collaborative_document(uuid) to authenticated, service_role;
grant execute on function public.owns_collaborative_document(uuid) to authenticated, service_role;
grant execute on function public.can_edit_collaborative_document(uuid) to authenticated, service_role;
grant execute on function public.can_comment_collaborative_document(uuid) to authenticated, service_role;
grant execute on function public.is_collaborative_document_owner(uuid) to authenticated, service_role;
grant execute on function public.list_collaborative_document_members(uuid) to authenticated;
grant execute on function public.list_collaborative_document_comments(uuid) to authenticated;
grant execute on function public.create_collaborative_document_version(uuid, text, text, jsonb) to authenticated;
grant execute on function public.restore_collaborative_document_version(uuid, uuid) to authenticated;
revoke all on function public.load_collaborative_document_state(uuid) from public, anon, authenticated;
revoke all on function public.store_collaborative_document_state(uuid, text) from public, anon, authenticated;
grant execute on function public.load_collaborative_document_state(uuid) to service_role;
grant execute on function public.store_collaborative_document_state(uuid, text) to service_role;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'collaborative_document_members'
    ) then
      alter publication supabase_realtime
        add table public.collaborative_document_members;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'collaborative_documents'
    ) then
      alter publication supabase_realtime
        add table public.collaborative_documents;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'collaborative_document_comments'
    ) then
      alter publication supabase_realtime
        add table public.collaborative_document_comments;
    end if;
  end if;
end;
$$;

notify pgrst, 'reload schema';