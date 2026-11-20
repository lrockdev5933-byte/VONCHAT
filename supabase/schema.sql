-- ============================================================================
-- vonChat Supabase Schema & Row-Level Security (Firebase Third-Party Auth)
-- ============================================================================
-- Setup instructions:
-- 1. In your Supabase Dashboard, go to Authentication -> Third-Party Auth
--    and add "Firebase" with Project ID: lrockchat
-- 2. Run this entire script in the Supabase SQL Editor.
-- 3. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.
-- ============================================================================

create extension if not exists pgcrypto;

-- 1. Profiles table (keyed by Firebase Auth UID from JWT `sub`)
create table if not exists public.profiles (
  id text primary key,
  email text not null unique,
  display_name text not null,
  avatar_color text not null default '#166534',
  is_online boolean not null default false,
  status_message text not null default '' check (char_length(status_message) <= 120),
  bio text not null default '' check (char_length(bio) <= 240),
  chat_wallpaper text not null default 'meadow_mist',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotent column additions if upgrading an existing profiles table
alter table public.profiles
  add column if not exists is_online boolean not null default false;

alter table public.profiles
  add column if not exists status_message text not null default '';

alter table public.profiles
  add column if not exists bio text not null default '';

alter table public.profiles
  add column if not exists chat_wallpaper text not null default 'meadow_mist';

alter table public.profiles
  add column if not exists last_seen_at timestamptz not null default now();

create index if not exists profiles_email_lower_idx
  on public.profiles (lower(email));

-- 2. Conversations table
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_by text not null references public.profiles(id) on delete cascade,
  last_message_preview text,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists conversations_last_message_at_idx
  on public.conversations (last_message_at desc);

-- 3. Conversation participants table
create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  archived boolean not null default false,
  primary key (conversation_id, user_id)
);

alter table public.conversation_participants
  add column if not exists last_read_at timestamptz not null default now();

alter table public.conversation_participants
  add column if not exists archived boolean not null default false;

create index if not exists conversation_participants_user_idx
  on public.conversation_participants (user_id, conversation_id);

create index if not exists conversation_participants_archived_idx
  on public.conversation_participants (user_id, archived, conversation_id);

-- 4. Messages table (text and sticker messages)
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id text not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) > 0 and char_length(content) <= 4000),
  message_type text not null default 'text' check (message_type in ('text', 'sticker')),
  sticker_id text,
  created_at timestamptz not null default now()
);

alter table public.messages
  add column if not exists message_type text not null default 'text';

alter table public.messages
  add column if not exists sticker_id text;

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at asc);

-- 4b. Message reactions table
create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(trim(emoji)) > 0 and char_length(emoji) <= 16),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index if not exists message_reactions_conversation_idx
  on public.message_reactions (conversation_id, message_id, created_at asc);

alter table public.message_reactions replica identity full;

-- 5. Security-definer helper for non-recursive RLS membership checks
create or replace function public.is_conversation_member(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = target_conversation_id
      and cp.user_id = (auth.jwt() ->> 'sub')
  );
$$;

-- 6. Atomic 1-on-1 conversation lookup or creation RPC
create or replace function public.find_or_create_conversation(target_user_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_uid text := auth.jwt() ->> 'sub';
  existing_conv_id uuid;
  new_conv_id uuid;
begin
  if current_uid is null then
    raise exception 'Authentication required';
  end if;

  if target_user_id is null or target_user_id = '' or target_user_id = current_uid then
    raise exception 'Invalid recipient user';
  end if;

  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'Recipient profile not found';
  end if;

  select cp1.conversation_id
  into existing_conv_id
  from public.conversation_participants cp1
  join public.conversation_participants cp2
    on cp1.conversation_id = cp2.conversation_id
  where cp1.user_id = current_uid
    and cp2.user_id = target_user_id
    and (
      select count(*)
      from public.conversation_participants cp3
      where cp3.conversation_id = cp1.conversation_id
    ) = 2
  limit 1;

  if existing_conv_id is not null then
    return existing_conv_id;
  end if;

  insert into public.conversations (created_by)
  values (current_uid)
  returning id into new_conv_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values
    (new_conv_id, current_uid),
    (new_conv_id, target_user_id);

  return new_conv_id;
end;
$$;

-- 7. Trigger to keep conversation preview, timestamp, and sender read position updated on new messages
create or replace function public.handle_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set
    last_message_preview = left(new.content, 120),
    last_message_at = new.created_at
  where id = new.conversation_id;

  update public.conversation_participants
  set last_read_at = greatest(last_read_at, new.created_at)
  where conversation_id = new.conversation_id
    and user_id = new.sender_id;

  return new;
end;
$$;

drop trigger if exists on_message_inserted on public.messages;
create trigger on_message_inserted
  after insert on public.messages
  for each row
  execute function public.handle_new_message();

-- 7b. Fetch unread message counts per conversation for the authenticated user
create or replace function public.get_unread_counts()
returns table (conversation_id uuid, unread_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    cp.conversation_id,
    count(m.id)::bigint as unread_count
  from public.conversation_participants cp
  left join public.messages m
    on m.conversation_id = cp.conversation_id
    and m.sender_id <> (auth.jwt() ->> 'sub')
    and m.created_at > cp.last_read_at
  where cp.user_id = (auth.jwt() ->> 'sub')
  group by cp.conversation_id;
$$;

-- 7c. Mark a conversation as read up to now for the authenticated user
create or replace function public.mark_conversation_read(target_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_uid text := auth.jwt() ->> 'sub';
begin
  if current_uid is null then
    raise exception 'Authentication required';
  end if;

  update public.conversation_participants
  set last_read_at = greatest(last_read_at, now())
  where conversation_id = target_conversation_id
    and user_id = current_uid;
end;
$$;

-- 8. Enable Row-Level Security on all tables
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;

-- Profiles policies
drop policy if exists "Authenticated users can search and read profiles" on public.profiles;
create policy "Authenticated users can search and read profiles"
  on public.profiles
  for select
  to authenticated
  using ((auth.jwt() ->> 'sub') is not null);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles
  for insert
  to authenticated
  with check ((auth.jwt() ->> 'sub') = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using ((auth.jwt() ->> 'sub') = id)
  with check ((auth.jwt() ->> 'sub') = id);

-- Conversations policies (users can only read chats they belong to)
drop policy if exists "Users can read conversations they belong to" on public.conversations;
create policy "Users can read conversations they belong to"
  on public.conversations
  for select
  to authenticated
  using (
    created_by = (auth.jwt() ->> 'sub')
    or public.is_conversation_member(id)
  );

drop policy if exists "Users can create conversations as creator" on public.conversations;
create policy "Users can create conversations as creator"
  on public.conversations
  for insert
  to authenticated
  with check (created_by = (auth.jwt() ->> 'sub'));

-- Conversation participants policies
drop policy if exists "Users can read participants of their conversations" on public.conversation_participants;
create policy "Users can read participants of their conversations"
  on public.conversation_participants
  for select
  to authenticated
  using (
    user_id = (auth.jwt() ->> 'sub')
    or public.is_conversation_member(conversation_id)
  );

drop policy if exists "Conversation creators can add participants" on public.conversation_participants;
create policy "Conversation creators can add participants"
  on public.conversation_participants
  for insert
  to authenticated
  with check (
    user_id = (auth.jwt() ->> 'sub')
    or exists (
      select 1
      from public.conversations c
      where c.id = conversation_id
        and c.created_by = (auth.jwt() ->> 'sub')
    )
  );

drop policy if exists "Users can update their own read receipt" on public.conversation_participants;
create policy "Users can update their own read receipt"
  on public.conversation_participants
  for update
  to authenticated
  using (user_id = (auth.jwt() ->> 'sub'))
  with check (user_id = (auth.jwt() ->> 'sub'));

-- Messages policies (users can only read/send messages in chats they belong to)
drop policy if exists "Users can read messages in their conversations" on public.messages;
create policy "Users can read messages in their conversations"
  on public.messages
  for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "Users can send messages to their conversations" on public.messages;
create policy "Users can send messages to their conversations"
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = (auth.jwt() ->> 'sub')
    and public.is_conversation_member(conversation_id)
  );

-- Message reactions policies
drop policy if exists "Users can read reactions in their conversations" on public.message_reactions;
create policy "Users can read reactions in their conversations"
  on public.message_reactions
  for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "Users can add reactions in their conversations" on public.message_reactions;
create policy "Users can add reactions in their conversations"
  on public.message_reactions
  for insert
  to authenticated
  with check (
    user_id = (auth.jwt() ->> 'sub')
    and public.is_conversation_member(conversation_id)
  );

drop policy if exists "Users can remove their own reactions" on public.message_reactions;
create policy "Users can remove their own reactions"
  on public.message_reactions
  for delete
  to authenticated
  using (
    user_id = (auth.jwt() ->> 'sub')
    and public.is_conversation_member(conversation_id)
  );

-- 9. Grants
grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.conversations to authenticated;
grant select, insert, update on public.conversation_participants to authenticated;
grant select, insert on public.messages to authenticated;
grant select, insert, delete on public.message_reactions to authenticated;
grant execute on function public.find_or_create_conversation(text) to authenticated;
grant execute on function public.is_conversation_member(uuid) to authenticated;
grant execute on function public.get_unread_counts() to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- 10. Enable Supabase Realtime for live messages, conversations, profile status, and reactions
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.conversation_participants;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.message_reactions;

-- 11. User Statuses (Pics, Videos, Text, Stickers) & Status Views
create table if not exists public.statuses (
  id uuid primary key default gen_random_uuid(),
  author_id text not null references public.profiles(id) on delete cascade,
  media_type text not null default 'text' check (media_type in ('text', 'image', 'video', 'sticker')),
  caption text not null default '' check (char_length(caption) <= 300),
  media_url text not null default '',
  sticker_id text not null default '',
  background_theme text not null default 'forest',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists statuses_author_expires_idx
  on public.statuses (author_id, expires_at desc);

create table if not exists public.status_views (
  status_id uuid not null references public.statuses(id) on delete cascade,
  viewer_id text not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (status_id, viewer_id)
);

alter table public.statuses enable row level security;
alter table public.status_views enable row level security;

drop policy if exists "Users can read active statuses from contacts or themselves" on public.statuses;
create policy "Users can read active statuses from contacts or themselves"
  on public.statuses
  for select
  to authenticated
  using (
    author_id = (auth.jwt() ->> 'sub')
    or exists (
      select 1
      from public.conversation_participants cp1
      join public.conversation_participants cp2
        on cp1.conversation_id = cp2.conversation_id
      where cp1.user_id = (auth.jwt() ->> 'sub')
        and cp2.user_id = author_id
    )
  );

drop policy if exists "Users can create their own statuses" on public.statuses;
create policy "Users can create their own statuses"
  on public.statuses
  for insert
  to authenticated
  with check (author_id = (auth.jwt() ->> 'sub'));

drop policy if exists "Users can delete their own statuses" on public.statuses;
create policy "Users can delete their own statuses"
  on public.statuses
  for delete
  to authenticated
  using (author_id = (auth.jwt() ->> 'sub'));

drop policy if exists "Status authors and viewers can read status views" on public.status_views;
create policy "Status authors and viewers can read status views"
  on public.status_views
  for select
  to authenticated
  using (
    viewer_id = (auth.jwt() ->> 'sub')
    or exists (
      select 1 from public.statuses s
      where s.id = status_id and s.author_id = (auth.jwt() ->> 'sub')
    )
  );

drop policy if exists "Users can mark statuses viewed" on public.status_views;
create policy "Users can mark statuses viewed"
  on public.status_views
  for insert
  to authenticated
  with check (viewer_id = (auth.jwt() ->> 'sub'));

grant select, insert, delete on public.statuses to authenticated;
grant select, insert on public.status_views to authenticated;
alter publication supabase_realtime add table public.statuses;

