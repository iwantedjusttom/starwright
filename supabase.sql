-- One row per crew world. Only the game server (using the service key) touches it.
create table if not exists public.rooms (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.rooms enable row level security; -- no policies: the public anon key can't read or write
