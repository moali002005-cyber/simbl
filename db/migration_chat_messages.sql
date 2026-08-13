-- محادثة مباشرة بين الشركة والمعلن، مربوطة بالتقديم (application)
-- طُبّقت على قاعدة البيانات عبر Supabase migration: create_chat_messages_direct_chat
create table if not exists public.chat_messages (
  id uuid default gen_random_uuid() not null,
  application_id uuid not null,
  sender_id uuid not null,
  sender_role text not null,
  message text not null,
  created_at timestamptz default now(),
  read_at timestamptz,
  constraint chat_messages_pkey primary key (id),
  constraint chat_messages_role_check check (sender_role in ('brand','creator')),
  constraint chat_messages_application_fkey foreign key (application_id) references public.applications(id) on delete cascade,
  constraint chat_messages_sender_fkey foreign key (sender_id) references public.users(id) on delete cascade
);
create index if not exists chat_messages_application_idx on public.chat_messages (application_id, created_at);
alter table public.chat_messages enable row level security;

drop policy if exists parties_read_chat on public.chat_messages;
create policy parties_read_chat on public.chat_messages as permissive for select to authenticated
using (application_id in (
  select a.id from public.applications a
  where a.creator_id in (select u.id from public.users u where u.auth_id = auth.uid())
     or a.campaign_id in (select c.id from public.campaigns c
        where c.brand_id in (select u.id from public.users u where u.auth_id = auth.uid()))
));

drop policy if exists parties_insert_chat on public.chat_messages;
create policy parties_insert_chat on public.chat_messages as permissive for insert to authenticated
with check (
  sender_id in (select u.id from public.users u where u.auth_id = auth.uid())
  and exists (
    select 1 from public.applications a join public.campaigns c on c.id = a.campaign_id
    where a.id = chat_messages.application_id
      and (a.creator_id in (select u.id from public.users u where u.auth_id = auth.uid())
        or c.brand_id in (select u.id from public.users u where u.auth_id = auth.uid()))
  )
);

drop policy if exists parties_update_chat on public.chat_messages;
create policy parties_update_chat on public.chat_messages as permissive for update to authenticated
using (application_id in (
  select a.id from public.applications a
  where a.creator_id in (select u.id from public.users u where u.auth_id = auth.uid())
     or a.campaign_id in (select c.id from public.campaigns c
        where c.brand_id in (select u.id from public.users u where u.auth_id = auth.uid()))
));
