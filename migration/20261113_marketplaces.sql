-- Execute no SQL Editor do mesmo projeto Supabase utilizado pelo aplicativo.
begin;
create schema if not exists marketplace_private;
revoke all on schema marketplace_private from public, anon, authenticated;

create table if not exists public.marketplaces (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 100),
  provider text not null check(provider in ('shopee','mercado_livre')),
  seller_id text not null default '' check(length(seller_id)<=200),
  app_id text not null default '' check(length(app_id)<=200),
  redirect_url text not null default '' check(length(redirect_url)<=2048),
  notes text not null default '' check(length(notes)<=2000),
  enabled boolean not null default true,
  credentials_saved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,group_id)
);
create unique index if not exists marketplaces_group_name on public.marketplaces(group_id,lower(name));
create table if not exists marketplace_private.credentials (
  marketplace_id uuid primary key references public.marketplaces(id) on delete cascade,
  app_secret text not null default '',
  access_token text not null default '',
  refresh_token text not null default ''
);
revoke all on marketplace_private.credentials from public,anon,authenticated;
alter table marketplace_private.credentials enable row level security;

create table if not exists public.marketplace_events (
  id uuid primary key default gen_random_uuid(),
  marketplace_id uuid not null,
  group_id uuid not null,
  message text not null,
  created_at timestamptz not null default now(),
  foreign key(marketplace_id,group_id) references public.marketplaces(id,group_id) on delete cascade
);
create index if not exists marketplace_events_group_time on public.marketplace_events(group_id,created_at desc);
alter table public.marketplaces enable row level security;
alter table public.marketplace_events enable row level security;
revoke all on public.marketplaces,public.marketplace_events from anon,authenticated;
grant select on public.marketplaces,public.marketplace_events to authenticated;
drop policy if exists marketplaces_read on public.marketplaces;
create policy marketplaces_read on public.marketplaces for select to authenticated using(public.is_group_member(group_id));
drop policy if exists marketplace_events_read on public.marketplace_events;
create policy marketplace_events_read on public.marketplace_events for select to authenticated using(public.is_group_member(group_id));

create or replace function public.save_marketplace(target_group uuid,target_id uuid,details jsonb,secrets jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_id uuid; credential_present boolean;
begin
  if auth.uid() is null or not exists(select 1 from public.groups where id=target_group and owner_id=auth.uid()) then
    raise exception 'Somente o propriet?rio do grupo pode alterar conex?es.' using errcode='42501';
  end if;
  if details is null or jsonb_typeof(details)<>'object' or secrets is null or jsonb_typeof(secrets)<>'object' then raise exception 'Dados inv?lidos.'; end if;
  if length(coalesce(secrets->>'app_secret',''))>8192 or length(coalesce(secrets->>'access_token',''))>8192 or length(coalesce(secrets->>'refresh_token',''))>8192 then raise exception 'Credencial excede o limite permitido.'; end if;
  if target_id is null then
    insert into public.marketplaces(group_id,name,provider,seller_id,app_id,redirect_url,notes,enabled)
    values(target_group,trim(details->>'name'),details->>'provider',coalesce(details->>'seller_id',''),coalesce(details->>'app_id',''),coalesce(details->>'redirect_url',''),coalesce(details->>'notes',''),coalesce((details->>'enabled')::boolean,true)) returning id into saved_id;
  else
    -- Lock the row before changing metadata or preserving existing secrets.
    perform 1 from public.marketplaces where id=target_id and group_id=target_group for update;
    if not found then raise exception 'Marketplace n?o encontrado.'; end if;
    update public.marketplaces set name=trim(details->>'name'),provider=details->>'provider',seller_id=coalesce(details->>'seller_id',''),app_id=coalesce(details->>'app_id',''),redirect_url=coalesce(details->>'redirect_url',''),notes=coalesce(details->>'notes',''),enabled=coalesce((details->>'enabled')::boolean,true),updated_at=now() where id=target_id and group_id=target_group;
    saved_id:=target_id;
  end if;
  insert into marketplace_private.credentials(marketplace_id,app_secret,access_token,refresh_token)
  values(saved_id,coalesce(secrets->>'app_secret',''),coalesce(secrets->>'access_token',''),coalesce(secrets->>'refresh_token',''))
  on conflict(marketplace_id) do update set
    app_secret=coalesce(nullif(excluded.app_secret,''),marketplace_private.credentials.app_secret),
    access_token=coalesce(nullif(excluded.access_token,''),marketplace_private.credentials.access_token),
    refresh_token=coalesce(nullif(excluded.refresh_token,''),marketplace_private.credentials.refresh_token);
  select app_secret<>'' or access_token<>'' or refresh_token<>'' into credential_present from marketplace_private.credentials where marketplace_id=saved_id;
  update public.marketplaces set credentials_saved=credential_present where id=saved_id;
  insert into public.marketplace_events(marketplace_id,group_id,message) values(saved_id,target_group,case when target_id is null then 'Cadastro criado. Autentica??o com o provedor pendente.' else 'Configura??o atualizada. Autentica??o com o provedor pendente.' end);
  return saved_id;
end;
$$;
revoke all on function public.save_marketplace(uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.save_marketplace(uuid,uuid,jsonb,jsonb) to authenticated;
commit;
