-- Execute uma vez no SQL Editor do Supabase, depois do schema principal.
-- Estrutura independente: nao altera transactions, orders ou o dashboard.
begin;
create table if not exists public.consignments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  store_name text not null check(length(trim(store_name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists consignments_group_store_unique on public.consignments(group_id,lower(trim(store_name)));
create table if not exists public.consignment_items (
  id uuid primary key default gen_random_uuid(),
  consignment_id uuid not null references public.consignments(id) on delete cascade,
  style text not null check(length(trim(style)) between 1 and 100),
  unit_price numeric(12,2) not null check(unit_price>0 and unit_price<=999999.99),
  quantity integer not null check(quantity between 0 and 100000),
  created_at timestamptz not null default now()
);
create unique index if not exists consignment_items_style_unique on public.consignment_items(consignment_id,lower(trim(style)));
alter table public.consignments enable row level security;
alter table public.consignment_items enable row level security;
revoke all on public.consignments,public.consignment_items from anon;
grant select,insert,update,delete on public.consignments,public.consignment_items to authenticated;

drop policy if exists consignment_select on public.consignments;
create policy consignment_select on public.consignments for select to authenticated using(public.is_group_member(group_id));
drop policy if exists consignment_insert on public.consignments;
create policy consignment_insert on public.consignments for insert to authenticated with check(public.is_group_member(group_id) and user_id=auth.uid());
drop policy if exists consignment_update on public.consignments;
create policy consignment_update on public.consignments for update to authenticated using(public.is_group_member(group_id)) with check(public.is_group_member(group_id));
drop policy if exists consignment_delete on public.consignments;
create policy consignment_delete on public.consignments for delete to authenticated using(public.is_group_member(group_id));

drop policy if exists consignment_items_access on public.consignment_items;
create policy consignment_items_access on public.consignment_items for all to authenticated
using(exists(select 1 from public.consignments c where c.id=consignment_id and public.is_group_member(c.group_id)))
with check(exists(select 1 from public.consignments c where c.id=consignment_id and public.is_group_member(c.group_id)));

create or replace function public.protect_consignment_identity()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.group_id is distinct from old.group_id or new.user_id is distinct from old.user_id then
    raise exception 'O grupo e o autor do consignado nao podem ser alterados.';
  end if;
  new.updated_at:=clock_timestamp();
  return new;
end;
$$;
drop trigger if exists protect_consignment_before_update on public.consignments;
create trigger protect_consignment_before_update before update on public.consignments
for each row execute function public.protect_consignment_identity();

-- Security invoker: todas as operacoes respeitam as politicas RLS do usuario.
-- Qualquer erro reverte a loja e todos os estilos na mesma transacao.
create or replace function public.save_consignment(
  target_group uuid, target_id uuid, partner_name text, styles jsonb,
  expected_updated_at timestamptz default null
) returns uuid language plpgsql security invoker set search_path=public as $$
declare saved_id uuid; item jsonb;
begin
  if auth.uid() is null or not public.is_group_member(target_group) then
    raise exception 'Sem permissao para este grupo.';
  end if;
  if partner_name is null or length(trim(partner_name)) not between 1 and 120 then
    raise exception 'Informe um nome de loja valido.';
  end if;
  if styles is null or jsonb_typeof(styles)<>'array' then
    raise exception 'Informe os estilos da loja.';
  end if;
  if jsonb_array_length(styles) not between 1 and 100 then
    raise exception 'Informe de 1 a 100 estilos.';
  end if;
  for item in select value from jsonb_array_elements(styles) loop
    if jsonb_typeof(item)<>'object'
       or coalesce(jsonb_typeof(item->'style'),'null')<>'string'
       or length(trim(item->>'style')) not between 1 and 100
       or coalesce(jsonb_typeof(item->'unit_price'),'null')<>'number'
       or coalesce(jsonb_typeof(item->'quantity'),'null')<>'number' then
      raise exception 'Estilo, valor ou quantidade invalido.';
    end if;
    if (item->>'unit_price')::numeric<=0 or (item->>'unit_price')::numeric>999999.99
       or round((item->>'unit_price')::numeric,2)<>(item->>'unit_price')::numeric
       or (item->>'quantity')::numeric not between 0 and 100000
       or trunc((item->>'quantity')::numeric)<>(item->>'quantity')::numeric then
      raise exception 'Valor ou quantidade fora do limite.';
    end if;
  end loop;
  if target_id is null then
    insert into public.consignments(group_id,user_id,store_name)
    values(target_group,auth.uid(),trim(partner_name)) returning id into saved_id;
  else
    update public.consignments set store_name=trim(partner_name)
    where id=target_id and group_id=target_group and updated_at=expected_updated_at
    returning id into saved_id;
    if saved_id is null then
      raise exception 'A loja foi alterada ou excluida. Feche o cadastro e atualize a pagina antes de editar novamente.';
    end if;
    delete from public.consignment_items where consignment_id=saved_id;
  end if;
  insert into public.consignment_items(consignment_id,style,unit_price,quantity)
  select saved_id,trim(value->>'style'),(value->>'unit_price')::numeric,(value->>'quantity')::integer
  from jsonb_array_elements(styles);
  return saved_id;
end;
$$;
revoke all on function public.save_consignment(uuid,uuid,text,jsonb,timestamptz) from public,anon;
grant execute on function public.save_consignment(uuid,uuid,text,jsonb,timestamptz) to authenticated;
commit;
