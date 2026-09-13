-- Run once in the Supabase SQL Editor for this application's project.
create table if not exists public.grocery_documents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  document jsonb not null check (
    document->>'version' = '1'
    and jsonb_typeof(document->'categories') = 'array'
    and jsonb_typeof(document->'items') = 'array'
    and jsonb_typeof(document->'list') = 'array'
    and jsonb_typeof(document->'todos') = 'array'
  ),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

alter table public.grocery_documents enable row level security;
revoke all on public.grocery_documents from anon, authenticated;
grant select on public.grocery_documents to authenticated;

drop policy if exists "Read own document" on public.grocery_documents;
create policy "Read own document" on public.grocery_documents
  for select to authenticated using ((select auth.uid()) = user_id);

-- All writes use this atomic revision check. There is deliberately no user_id argument.
create or replace function public.save_grocery_document(payload jsonb, expected_revision bigint)
returns setof public.grocery_documents
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if expected_revision < 0 or expected_revision is null then
    raise exception 'Invalid revision';
  end if;
  if payload is null or octet_length(payload::text) > 2097152
    or (payload->>'version') is distinct from '1'
    or jsonb_typeof(payload->'categories') is distinct from 'array'
    or jsonb_typeof(payload->'items') is distinct from 'array'
    or jsonb_typeof(payload->'list') is distinct from 'array'
    or jsonb_typeof(payload->'todos') is distinct from 'array' then
    raise exception 'Invalid document';
  end if;
  if expected_revision = 0 then
    return query insert into public.grocery_documents(user_id, document)
      values (owner_id, payload) on conflict (user_id) do nothing returning *;
  else
    return query update public.grocery_documents
      set document = payload, revision = revision + 1, updated_at = now()
      where user_id = owner_id and revision = expected_revision returning *;
  end if;
end;
$$;

revoke all on function public.save_grocery_document(jsonb, bigint) from public, anon;
grant execute on function public.save_grocery_document(jsonb, bigint) to authenticated;
