create table if not exists public.page_visits (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null,
  ip_address inet,
  visited_at timestamptz not null default now()
);

alter table public.page_visits
  add column if not exists ip_address inet;

create index if not exists page_visits_user_visited_at_idx
  on public.page_visits (user_id, visited_at desc);

alter table public.page_visits enable row level security;

grant insert, select on public.page_visits to authenticated;

drop policy if exists page_visits_insert_own on public.page_visits;
create policy page_visits_insert_own
  on public.page_visits
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists page_visits_select_own_or_admin on public.page_visits;
create policy page_visits_select_own_or_admin
  on public.page_visits
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.admins
      where user_id = auth.uid()
    )
  );