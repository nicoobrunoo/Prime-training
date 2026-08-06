-- Prime Training 3.2 - estructura y permisos necesarios
-- Ejecutar completo en Supabase > SQL Editor.

create table if not exists public.prime_shared_state (
  id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.prime_shared_state
  alter column state set default '{}'::jsonb,
  alter column updated_at set default now();

alter table public.prime_shared_state enable row level security;

drop policy if exists "prime_shared_state_select" on public.prime_shared_state;
drop policy if exists "prime_shared_state_insert" on public.prime_shared_state;
drop policy if exists "prime_shared_state_update" on public.prime_shared_state;
drop policy if exists "prime_shared_state_delete" on public.prime_shared_state;

create policy "prime_shared_state_select"
on public.prime_shared_state for select
to anon, authenticated
using (true);

create policy "prime_shared_state_insert"
on public.prime_shared_state for insert
to anon, authenticated
with check (id = 'main');

create policy "prime_shared_state_update"
on public.prime_shared_state for update
to anon, authenticated
using (id = 'main')
with check (id = 'main');

create policy "prime_shared_state_delete"
on public.prime_shared_state for delete
to anon, authenticated
using (id = 'main');

insert into public.prime_shared_state (id, state, updated_at)
values ('main', '{}'::jsonb, now())
on conflict (id) do nothing;

-- Agrega la tabla a Realtime solamente si todavía no pertenece a la publicación.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'prime_shared_state'
  ) then
    alter publication supabase_realtime add table public.prime_shared_state;
  end if;
end $$;

-- Prime Training 6.0: almacenamiento de fotos de evolución física.
-- Bucket público porque la app actual funciona sin inicio de sesión.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prime-physique', 'prime-physique', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "prime_physique_read" on storage.objects;
drop policy if exists "prime_physique_insert" on storage.objects;
drop policy if exists "prime_physique_update" on storage.objects;
drop policy if exists "prime_physique_delete" on storage.objects;

create policy "prime_physique_read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'prime-physique');

create policy "prime_physique_insert"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'prime-physique');

create policy "prime_physique_update"
on storage.objects for update
to anon, authenticated
using (bucket_id = 'prime-physique')
with check (bucket_id = 'prime-physique');

create policy "prime_physique_delete"
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'prime-physique');
