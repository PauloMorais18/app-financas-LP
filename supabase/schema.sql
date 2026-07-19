-- Finanbase - execute este arquivo no SQL Editor do Supabase.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.income_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);

create table if not exists public.colors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists colors_user_name_ci on public.colors(user_id, lower(name));

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_id uuid references public.income_sources(id) on delete restrict,
  date date not null,
  description text not null,
  category text not null default 'Outros',
  type text not null check (type in ('income','expense')),
  value numeric(14,2) not null check (value > 0),
  payment_method text not null default 'Não informado',
  status text not null default 'paid' check (status in ('paid','pending','cancelled')),
  observation text not null default '',
  recurring boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_id uuid not null references public.income_sources(id) on delete restrict,
  color_id uuid references public.colors(id) on delete restrict,
  title text not null,
  customer text not null,
  due_date date not null,
  value numeric(14,2) not null default 0 check (value >= 0),
  status text not null default 'queued' check (status in ('queued','production','ready','delivered','cancelled')),
  observation text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists income_sources_user_idx on public.income_sources(user_id);
create index if not exists companies_user_idx on public.companies(user_id);
create index if not exists colors_user_idx on public.colors(user_id);
create index if not exists transactions_user_date_idx on public.transactions(user_id, date desc);
create index if not exists transactions_source_idx on public.transactions(source_id);
create index if not exists orders_user_due_idx on public.orders(user_id, due_date);
create index if not exists orders_source_idx on public.orders(source_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','income_sources','companies','colors','transactions','orders'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name);
  end loop;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, name, email)
  values(new.id, coalesce(nullif(new.raw_user_meta_data->>'name',''), split_part(coalesce(new.email,''),'@',1)), coalesce(new.email,''))
  on conflict(id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.income_sources enable row level security;
alter table public.companies enable row level security;
alter table public.colors enable row level security;
alter table public.transactions enable row level security;
alter table public.orders enable row level security;

drop policy if exists profiles_own on public.profiles;
create policy profiles_own on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

do $$
declare table_name text;
begin
  foreach table_name in array array['income_sources','companies','colors'] loop
    execute format('drop policy if exists own_rows on public.%I', table_name);
    execute format('create policy own_rows on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', table_name);
  end loop;
end $$;

drop policy if exists own_rows on public.transactions;
create policy own_rows on public.transactions for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid() and (source_id is null or exists (
  select 1 from public.income_sources s where s.id = source_id and s.user_id = auth.uid()
)));

drop policy if exists own_rows on public.orders;
create policy own_rows on public.orders for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid() and exists (
  select 1 from public.income_sources s where s.id = source_id and s.user_id = auth.uid()
) and (color_id is null or exists (
  select 1 from public.colors c where c.id = color_id and c.user_id = auth.uid()
)));

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
