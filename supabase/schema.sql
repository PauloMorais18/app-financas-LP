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
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid, name text not null, place text not null default '',
  phone text not null default '', active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists clients_group_name_ci on public.clients(group_id,lower(name));
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid, name text not null,
  cost_per_meter numeric(14,4) not null default 0 check(cost_per_meter>=0),
  filament_meters numeric(14,2) not null default 0 check(filament_meters>=0),
  sale_value numeric(14,2) not null default 0 check(sale_value>=0),
  total_cost numeric(14,2) generated always as (round(cost_per_meter*filament_meters,2)) stored,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists products_group_name_ci on public.products(group_id,lower(name));
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
alter table public.transactions add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.transactions add column if not exists product_id uuid references public.products(id) on delete set null;
alter table public.orders add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.orders add column if not exists product_id uuid references public.products(id) on delete set null;

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
  foreach table_name in array array['profiles','income_sources','companies','colors','clients','products','transactions','orders'] loop
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
alter table public.clients enable row level security;
alter table public.products enable row level security;

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

-- Grupos compartilhados (migração idempotente)
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null, code text not null unique, is_default boolean not null default false,
  member_count integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists groups_one_default_per_owner on public.groups(owner_id) where is_default;
create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(group_id,user_id)
);
create index if not exists group_members_user_idx on public.group_members(user_id);

alter table public.income_sources add column if not exists group_id uuid references public.groups(id) on delete restrict;
alter table public.companies add column if not exists group_id uuid references public.groups(id) on delete restrict;
alter table public.colors add column if not exists group_id uuid references public.groups(id) on delete restrict;
alter table public.transactions add column if not exists group_id uuid references public.groups(id) on delete restrict;
alter table public.orders add column if not exists group_id uuid references public.groups(id) on delete restrict;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='clients_group_fk') then alter table public.clients add constraint clients_group_fk foreign key(group_id) references public.groups(id) on delete restrict; end if;
  if not exists(select 1 from pg_constraint where conname='products_group_fk') then alter table public.products add constraint products_group_fk foreign key(group_id) references public.groups(id) on delete restrict; end if;
end $$;

do $$ declare profile_row record; default_group_id uuid; default_code text;
begin
  for profile_row in select id,name from public.profiles loop
    select id into default_group_id from public.groups where owner_id=profile_row.id and is_default limit 1;
    if default_group_id is null then
      loop
        default_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
        begin
          insert into public.groups(owner_id,name,code,is_default) values(profile_row.id,'Grupo de '||profile_row.name,default_code,true) returning id into default_group_id;
          exit;
        exception when unique_violation then end;
      end loop;
    end if;
    insert into public.group_members(group_id,user_id) values(default_group_id,profile_row.id) on conflict do nothing;
    update public.income_sources set group_id=default_group_id where user_id=profile_row.id and group_id is null;
    update public.companies set group_id=default_group_id where user_id=profile_row.id and group_id is null;
    update public.colors set group_id=default_group_id where user_id=profile_row.id and group_id is null;
    update public.transactions set group_id=default_group_id where user_id=profile_row.id and group_id is null;
    update public.orders set group_id=default_group_id where user_id=profile_row.id and group_id is null;
    update public.clients set group_id=default_group_id where user_id=profile_row.id and group_id is null;
    update public.products set group_id=default_group_id where user_id=profile_row.id and group_id is null;
  end loop;
end $$;

alter table public.income_sources alter column group_id set not null;
alter table public.companies alter column group_id set not null;
alter table public.colors alter column group_id set not null;
alter table public.transactions alter column group_id set not null;
alter table public.orders alter column group_id set not null;
alter table public.clients alter column group_id set not null;
alter table public.products alter column group_id set not null;

create or replace function public.is_group_member(target_group uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.group_members where group_id=target_group and user_id=auth.uid());
$$;
create or replace function public.join_group_by_code(group_code text)
returns setof public.groups language plpgsql security definer set search_path=public as $$
declare target public.groups;
begin
  select * into target from public.groups where code=upper(trim(group_code));
  if target.id is null then raise exception 'Código de grupo não encontrado.'; end if;
  insert into public.group_members(group_id,user_id) values(target.id,auth.uid()) on conflict do nothing;
  update public.groups set member_count=(select count(*) from public.group_members where group_id=target.id) where id=target.id returning * into target;
  return next target;
end $$;

create or replace function public.create_default_group_for_user()
returns trigger language plpgsql security definer set search_path=public as $$
declare new_group_id uuid; new_code text;
begin
  loop
    new_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
    begin
      insert into public.groups(owner_id,name,code,is_default) values(new.id,'Grupo de '||new.name,new_code,true) returning id into new_group_id;
      exit;
    exception when unique_violation then end;
  end loop;
  insert into public.group_members(group_id,user_id) values(new_group_id,new.id);
  return new;
end $$;
drop trigger if exists create_default_group_after_profile on public.profiles;
create trigger create_default_group_after_profile after insert on public.profiles for each row execute function public.create_default_group_for_user();

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
drop policy if exists groups_member_select on public.groups;
create policy groups_member_select on public.groups for select to authenticated using(owner_id=auth.uid() or public.is_group_member(id));
drop policy if exists groups_owner_insert on public.groups;
create policy groups_owner_insert on public.groups for insert to authenticated with check(owner_id=auth.uid());
drop policy if exists groups_owner_update on public.groups;
create policy groups_owner_update on public.groups for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
drop policy if exists members_group_select on public.group_members;
create policy members_group_select on public.group_members for select to authenticated using(user_id=auth.uid() or public.is_group_member(group_id));
drop policy if exists members_self_insert on public.group_members;
create policy members_self_insert on public.group_members for insert to authenticated with check(user_id=auth.uid() and (exists(select 1 from public.groups where id=group_id and owner_id=auth.uid())));

do $$ declare table_name text;
begin
  foreach table_name in array array['income_sources','companies','colors','clients','products','transactions','orders'] loop
    execute format('drop policy if exists own_rows on public.%I',table_name);
    execute format('drop policy if exists group_rows on public.%I',table_name);
    execute format('create policy group_rows on public.%I for all to authenticated using (public.is_group_member(group_id)) with check (public.is_group_member(group_id) and user_id=auth.uid())',table_name);
  end loop;
end $$;
grant select,insert,update,delete on public.groups,public.group_members to authenticated;
grant execute on function public.join_group_by_code(text) to authenticated;
