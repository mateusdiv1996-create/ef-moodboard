-- =====================================================================
-- Engenharia Filmes · Moodboard
-- Rode este arquivo inteiro no Supabase: SQL Editor > New query > Run
-- =====================================================================

create extension if not exists pgcrypto;

-- Quadros (moodboards)
create table if not exists public.boards (
  id            uuid primary key default gen_random_uuid(),
  title         text not null default 'Novo moodboard',
  created_by    uuid references auth.users(id) on delete set null default auth.uid(),
  share_token   text unique,
  share_enabled boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Itens dentro do quadro (imagem, nota, link)
create table if not exists public.items (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards(id) on delete cascade,
  type       text not null check (type in ('image', 'note', 'link')),
  x          double precision not null default 0,
  y          double precision not null default 0,
  w          double precision not null default 240,
  h          double precision not null default 160,
  z          integer not null default 0,
  content    jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists items_board_id_idx on public.items(board_id);

-- Atualiza "updated_at" do quadro sempre que algo muda dentro dele
create or replace function public.touch_board() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.boards set updated_at = now()
  where id = coalesce(new.board_id, old.board_id);
  return null;
end $$;

drop trigger if exists items_touch_board on public.items;
create trigger items_touch_board
  after insert or update or delete on public.items
  for each row execute function public.touch_board();

-- ---------------------------------------------------------------------
-- Acesso: qualquer pessoa LOGADA (equipe) vê e edita todos os quadros.
-- O cadastro público fica desligado; só entra quem vocês convidarem.
-- ---------------------------------------------------------------------
alter table public.boards enable row level security;
alter table public.items  enable row level security;

drop policy if exists "equipe acessa boards" on public.boards;
create policy "equipe acessa boards" on public.boards
  for all to authenticated using (true) with check (true);

drop policy if exists "equipe acessa items" on public.items;
create policy "equipe acessa items" on public.items
  for all to authenticated using (true) with check (true);

-- Tempo real: todo mundo vê as mudanças no quadro na hora
alter table public.items replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.items;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Armazenamento das imagens (bucket público para leitura, 15 MB por arquivo)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('moodboard', 'moodboard', true, 15728640,
        array['image/jpeg','image/png','image/gif','image/webp','image/avif'])
on conflict (id) do nothing;

drop policy if exists "equipe sobe imagens" on storage.objects;
create policy "equipe sobe imagens" on storage.objects
  for insert to authenticated with check (bucket_id = 'moodboard');

drop policy if exists "equipe apaga imagens" on storage.objects;
create policy "equipe apaga imagens" on storage.objects
  for delete to authenticated using (bucket_id = 'moodboard');
