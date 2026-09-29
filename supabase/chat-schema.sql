create extension if not exists pgcrypto;

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  direct_key text unique,
  conversation_type text not null default 'direct',
  title text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

alter table public.chat_conversations
  alter column direct_key drop not null;

alter table public.chat_conversations
  add column if not exists conversation_type text not null default 'direct';

alter table public.chat_conversations
  add column if not exists title text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chat_conversations_type_check'
      and conrelid = 'public.chat_conversations'::regclass
  ) then
    alter table public.chat_conversations
      add constraint chat_conversations_type_check
      check (conversation_type in ('direct', 'group'));
  end if;
end;
$$;

create table if not exists public.chat_participants (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text,
  attachment_path text,
  attachment_name text,
  attachment_mime_type text,
  attachment_size bigint,
  created_at timestamptz not null default now()
);

alter table public.chat_messages alter column body drop not null;
alter table public.chat_messages add column if not exists attachment_path text;
alter table public.chat_messages add column if not exists attachment_name text;
alter table public.chat_messages add column if not exists attachment_mime_type text;
alter table public.chat_messages add column if not exists attachment_size bigint;

alter table public.chat_messages drop constraint if exists chat_messages_body_check;
alter table public.chat_messages drop constraint if exists chat_messages_body_or_attachment_check;
alter table public.chat_messages
  add constraint chat_messages_body_or_attachment_check
  check (
    (char_length(trim(coalesce(body, ''))) between 1 and 5000)
    or attachment_path is not null
  );

alter table public.chat_messages drop constraint if exists chat_messages_attachment_metadata_check;
alter table public.chat_messages
  add constraint chat_messages_attachment_metadata_check
  check (
    (attachment_path is null and attachment_name is null and attachment_mime_type is null and attachment_size is null)
    or (
      attachment_path is not null
      and attachment_name is not null
      and attachment_mime_type is not null
      and attachment_size between 1 and 20971520
      and attachment_mime_type in (
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png',
        'image/webp',
        'text/plain'
      )
    )
  );

create table if not exists public.chat_message_receipts (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  read_at timestamptz,
  primary key (message_id, user_id)
);

create index if not exists chat_participants_user_conversation_idx
  on public.chat_participants (user_id, conversation_id);

create index if not exists chat_messages_conversation_created_idx
  on public.chat_messages (conversation_id, created_at desc);

create index if not exists chat_message_receipts_conversation_user_idx
  on public.chat_message_receipts (conversation_id, user_id, message_id);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'chat-attachments',
  'chat-attachments',
  false,
  20971520,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.is_chat_approved()
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

create or replace function public.is_chat_participant(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.chat_participants cp
    where cp.conversation_id = target_conversation_id
      and cp.user_id = (select auth.uid())
  );
$$;

create or replace view public.chat_staff_directory
with (security_barrier = true)
as
  select p.id, p.full_name, p.position
  from public.profilec p
  where p.is_approved is true
    and p.id <> (select auth.uid());

grant select on public.chat_staff_directory to authenticated;
grant select on public.chat_conversations to authenticated;
grant select on public.chat_participants to authenticated;
grant select, insert on public.chat_messages to authenticated;
grant select on public.chat_message_receipts to authenticated;
grant update (last_read_at) on public.chat_participants to authenticated;
grant insert on public.chat_messages to authenticated;

drop policy if exists chat_attachments_read_participant on storage.objects;
create policy chat_attachments_read_participant
on storage.objects
for select
to authenticated
using (
  bucket_id = 'chat-attachments'
  and array_length(storage.foldername(name), 1) = 2
  and public.is_chat_approved()
  and public.is_chat_participant((storage.foldername(name))[1]::uuid)
);

drop policy if exists chat_attachments_insert_uploader on storage.objects;
create policy chat_attachments_insert_uploader
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chat-attachments'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and public.is_chat_approved()
  and public.is_chat_participant((storage.foldername(name))[1]::uuid)
);

drop policy if exists chat_attachments_delete_uploader on storage.objects;
create policy chat_attachments_delete_uploader
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'chat-attachments'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and public.is_chat_approved()
  and public.is_chat_participant((storage.foldername(name))[1]::uuid)
);

alter table public.chat_conversations enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_message_receipts enable row level security;

drop policy if exists chat_conversations_read_participant on public.chat_conversations;
create policy chat_conversations_read_participant
on public.chat_conversations
for select
to authenticated
using (
  public.is_chat_approved()
  and public.is_chat_participant(id)
);

drop policy if exists chat_conversations_delete_group_creator on public.chat_conversations;
create policy chat_conversations_delete_group_creator
on public.chat_conversations
for delete
to authenticated
using (
  conversation_type = 'group'
  and created_by = (select auth.uid())
  and public.is_chat_approved()
);

drop policy if exists chat_participants_read_participant on public.chat_participants;
create policy chat_participants_read_participant
on public.chat_participants
for select
to authenticated
using (
  public.is_chat_approved()
  and public.is_chat_participant(conversation_id)
);

drop policy if exists chat_participants_update_read_marker on public.chat_participants;
create policy chat_participants_update_read_marker
on public.chat_participants
for update
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_chat_approved()
  and public.is_chat_participant(conversation_id)
)
with check (
  user_id = (select auth.uid())
  and public.is_chat_approved()
  and public.is_chat_participant(conversation_id)
);

drop policy if exists chat_messages_read_participant on public.chat_messages;
create policy chat_messages_read_participant
on public.chat_messages
for select
to authenticated
using (
  public.is_chat_approved()
  and public.is_chat_participant(conversation_id)
);

drop policy if exists chat_messages_insert_as_approved_participant on public.chat_messages;
create policy chat_messages_insert_as_approved_participant
on public.chat_messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and public.is_chat_approved()
  and public.is_chat_participant(conversation_id)
  and (
    attachment_path is null
    or (
      attachment_path like conversation_id::text || '/' || (select auth.uid())::text || '/%'
      and attachment_name is not null
      and attachment_mime_type is not null
      and attachment_size between 1 and 20971520
    )
  )
);

drop policy if exists chat_message_receipts_read_participant on public.chat_message_receipts;
create policy chat_message_receipts_read_participant
on public.chat_message_receipts
for select
to authenticated
using (
  public.is_chat_approved()
  and public.is_chat_participant(conversation_id)
);

create or replace function public.create_direct_chat(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  caller_id uuid := (select auth.uid());
  pair_key text;
  conversation_id uuid;
begin
  if caller_id is null then
    raise exception 'You must be signed in to start a chat.' using errcode = '28000';
  end if;

  if target_user_id is null or target_user_id = caller_id then
    raise exception 'Choose another staff member to start a chat.' using errcode = '22023';
  end if;

  if not public.is_chat_approved()
     or not exists (
       select 1
       from public.profilec p
       where p.id = target_user_id
         and p.is_approved is true
     ) then
    raise exception 'Only approved staff can start a chat.' using errcode = '42501';
  end if;

  pair_key := least(caller_id::text, target_user_id::text)
    || ':' || greatest(caller_id::text, target_user_id::text);

  insert into public.chat_conversations (direct_key, created_by)
  values (pair_key, caller_id)
  on conflict (direct_key) do nothing
  returning id into conversation_id;

  if conversation_id is null then
    select c.id into conversation_id
    from public.chat_conversations c
    where c.direct_key = pair_key;
  end if;

  insert into public.chat_participants (conversation_id, user_id)
  values (conversation_id, caller_id), (conversation_id, target_user_id)
  on conflict do nothing;

  return conversation_id;
end;
$$;

create or replace function public.create_group_chat(
  target_title text,
  target_user_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  caller_id uuid := (select auth.uid());
  conversation_id uuid;
  approved_member_count integer;
  requested_member_count integer;
begin
  if caller_id is null then
    raise exception 'You must be signed in to create a group.' using errcode = '28000';
  end if;

  if not public.is_chat_approved() then
    raise exception 'Only approved staff can create groups.' using errcode = '42501';
  end if;

  if target_title is null or char_length(trim(target_title)) not between 1 and 100 then
    raise exception 'Group name must be between 1 and 100 characters.' using errcode = '22023';
  end if;

  if target_user_ids is null or cardinality(target_user_ids) < 2 then
    raise exception 'Choose at least two approved staff members.' using errcode = '22023';
  end if;

  select count(distinct member_id)::integer
  into requested_member_count
  from unnest(target_user_ids) as member_id;

  select count(distinct requested.member_id)::integer
  into approved_member_count
  from unnest(target_user_ids) as requested(member_id)
  join public.profilec p on p.id = requested.member_id
  where p.is_approved is true
    and p.id <> caller_id;

  if requested_member_count <> cardinality(target_user_ids)
     or approved_member_count <> requested_member_count then
    raise exception 'Groups can include only unique, approved staff members other than yourself.'
      using errcode = '42501';
  end if;

  insert into public.chat_conversations (
    direct_key,
    conversation_type,
    title,
    created_by
  )
  values (null, 'group', trim(target_title), caller_id)
  returning id into conversation_id;

  insert into public.chat_participants (conversation_id, user_id)
  select conversation_id, caller_id
  union all
  select conversation_id, requested.member_id
  from unnest(target_user_ids) as requested(member_id);

  return conversation_id;
end;
$$;

create or replace function public.remove_group_member(
  target_conversation_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;

  if not public.is_chat_approved() then
    raise exception 'Only approved staff can manage group membership.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.chat_conversations c
    where c.id = target_conversation_id
      and c.conversation_type = 'group'
      and c.created_by = caller_id
  ) then
    raise exception 'Only the group creator can remove members.' using errcode = '42501';
  end if;

  if target_user_id = caller_id then
    raise exception 'The group creator cannot remove themselves.' using errcode = '22023';
  end if;

  delete from public.chat_participants cp
  where cp.conversation_id = target_conversation_id
    and cp.user_id = target_user_id;

  if not found then
    raise exception 'That user is not a member of this group.' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.delete_group_chat(target_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;

  if not public.is_chat_approved() then
    raise exception 'Only approved staff can manage groups.' using errcode = '42501';
  end if;

  delete from public.chat_conversations c
  where c.id = target_conversation_id
    and c.conversation_type = 'group'
    and c.created_by = caller_id;

  if not found then
    raise exception 'Only the group creator can delete this group.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.mark_chat_messages_delivered(
  target_conversation_id uuid,
  target_message_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null or not public.is_chat_approved()
     or not public.is_chat_participant(target_conversation_id) then
    raise exception 'Only approved chat participants can acknowledge delivery.'
      using errcode = '42501';
  end if;

  insert into public.chat_message_receipts as receipt (
    message_id, conversation_id, user_id, delivered_at
  )
  select m.id, m.conversation_id, caller_id, now()
  from public.chat_messages m
  join public.chat_participants recipient
    on recipient.conversation_id = m.conversation_id
   and recipient.user_id = caller_id
  where m.conversation_id = target_conversation_id
    and m.id = any(target_message_ids)
    and m.sender_id <> caller_id
  on conflict (message_id, user_id) do update
    set delivered_at = coalesce(
      receipt.delivered_at,
      excluded.delivered_at
    )
    where receipt.delivered_at is null;
end;
$$;

create or replace function public.mark_chat_messages_read(
  target_conversation_id uuid,
  target_message_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null or not public.is_chat_approved()
     or not public.is_chat_participant(target_conversation_id) then
    raise exception 'Only approved chat participants can mark messages read.'
      using errcode = '42501';
  end if;

  insert into public.chat_message_receipts as receipt (
    message_id, conversation_id, user_id, delivered_at, read_at
  )
  select m.id, m.conversation_id, caller_id, now(), now()
  from public.chat_messages m
  join public.chat_participants recipient
    on recipient.conversation_id = m.conversation_id
   and recipient.user_id = caller_id
  where m.conversation_id = target_conversation_id
    and m.id = any(target_message_ids)
    and m.sender_id <> caller_id
  on conflict (message_id, user_id) do update
    set delivered_at = coalesce(
          receipt.delivered_at,
          excluded.delivered_at
        ),
        read_at = coalesce(
          receipt.read_at,
          excluded.read_at
        )
    where receipt.read_at is null;
end;
$$;

revoke all on function public.is_chat_approved() from public;
revoke all on function public.is_chat_participant(uuid) from public;
revoke all on function public.create_direct_chat(uuid) from public;
revoke all on function public.create_group_chat(text, uuid[]) from public;
revoke all on function public.remove_group_member(uuid, uuid) from public;
revoke all on function public.delete_group_chat(uuid) from public;
revoke all on function public.mark_chat_messages_delivered(uuid, uuid[]) from public;
revoke all on function public.mark_chat_messages_read(uuid, uuid[]) from public;
grant execute on function public.is_chat_approved() to authenticated;
grant execute on function public.is_chat_participant(uuid) to authenticated;
grant execute on function public.create_direct_chat(uuid) to authenticated;
grant execute on function public.create_group_chat(text, uuid[]) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.delete_group_chat(uuid) to authenticated;
grant execute on function public.mark_chat_messages_delivered(uuid, uuid[]) to authenticated;
grant execute on function public.mark_chat_messages_read(uuid, uuid[]) to authenticated;

create or replace function public.set_chat_last_message_at()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  update public.chat_conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists chat_messages_update_conversation_time on public.chat_messages;
create trigger chat_messages_update_conversation_time
after insert on public.chat_messages
for each row execute function public.set_chat_last_message_at();

alter table public.chat_messages replica identity full;
alter table public.chat_conversations replica identity full;
alter table public.chat_participants replica identity full;
alter table public.chat_message_receipts replica identity full;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'chat_messages',
    'chat_conversations',
    'chat_participants',
    'chat_message_receipts'
  ] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        target_table
      );
    end if;
  end loop;
end;
$$;