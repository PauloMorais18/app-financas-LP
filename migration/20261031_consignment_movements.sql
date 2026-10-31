-- Execute DEPOIS de 20261031_create_consignments.sql.
-- Atua exclusivamente nos consignados. Nao altera o financeiro geral.
begin;
alter table public.consignment_items add column if not exists unit_cost numeric(12,2)
  check(unit_cost is null or (unit_cost>=0 and unit_cost<=999999.99));
alter table public.consignment_items add column if not exists store_value numeric(12,2) not null default 0
  check(store_value>=0 and store_value<=999999.99);
create table if not exists public.consignment_movements (
  id uuid primary key default gen_random_uuid(),
  consignment_id uuid not null references public.consignments(id) on delete restrict,
  item_id uuid not null references public.consignment_items(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  kind text not null check(kind in ('opening','sale','restock','withdrawal','reversal')),
  style text not null,
  quantity integer not null check(quantity between 0 and 100000),
  stock_delta integer not null,
  stock_before integer not null check(stock_before between 0 and 100000),
  stock_after integer not null check(stock_after between 0 and 100000),
  unit_price numeric(12,2) not null default 0,
  unit_cost numeric(12,2) not null default 0,
  commission numeric(18,2) not null default 0,
  revenue numeric(18,2) not null default 0,
  profit numeric(18,2) not null default 0,
  occurred_on date not null,
  notes text not null default '' check(length(notes)<=500),
  created_at timestamptz not null default now(),
  reverses_id uuid unique references public.consignment_movements(id) on delete restrict,
  check(stock_after=stock_before+stock_delta),
  check(abs(stock_delta)=quantity)
);
create index if not exists consignment_movements_store_date on public.consignment_movements(consignment_id,occurred_on,created_at);
create unique index if not exists consignment_movements_one_opening on public.consignment_movements(item_id) where kind='opening';
alter table public.consignment_movements enable row level security;
revoke all on public.consignment_movements from public,anon,authenticated;
grant select on public.consignment_movements to authenticated;
drop policy if exists consignment_history_select on public.consignment_movements;
create policy consignment_history_select on public.consignment_movements for select to authenticated
using(exists(select 1 from public.consignments c where c.id=consignment_id and public.is_group_member(c.group_id)));

-- A quantidade existente e o saldo de abertura, nunca uma venda retroativa.
insert into public.consignment_movements(
  consignment_id,item_id,user_id,kind,style,quantity,stock_delta,stock_before,stock_after,occurred_on,notes
)
select c.id,i.id,c.user_id,'opening',i.style,i.quantity,i.quantity,0,i.quantity,
  (now() at time zone 'America/Sao_Paulo')::date,'Saldo de abertura do controle de estoque.'
from public.consignment_items i join public.consignments c on c.id=i.consignment_id
where not exists(select 1 from public.consignment_movements m where m.item_id=i.id and m.kind='opening');

-- Escritas de estoque e historico passam somente pelas funcoes atomicas abaixo.
revoke insert,update,delete on public.consignment_items from authenticated;
revoke insert,update on public.consignments from authenticated;
create or replace function public.save_consignment(
 target_group uuid,target_id uuid,partner_name text,styles jsonb,expected_updated_at timestamptz default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare saved_id uuid; entry jsonb; existing public.consignment_items; new_item uuid; stamp timestamptz;
begin
 if auth.uid() is null or not public.is_group_member(target_group) then raise exception 'Sem permissao para este grupo.'; end if;
 if partner_name is null or length(trim(partner_name)) not between 1 and 120 then raise exception 'Informe o nome da loja.'; end if;
 if styles is null or jsonb_typeof(styles)<>'array' then raise exception 'Informe os estilos.'; end if;
 if jsonb_array_length(styles) not between 1 and 100 then raise exception 'Informe de 1 a 100 estilos.'; end if;
 for entry in select value from jsonb_array_elements(styles) loop
   if jsonb_typeof(entry)<>'object' or coalesce(jsonb_typeof(entry->'style'),'null')<>'string'
     or length(trim(entry->>'style')) not between 1 and 100
     or coalesce(jsonb_typeof(entry->'unit_price'),'null')<>'number'
     or coalesce(jsonb_typeof(entry->'quantity'),'null')<>'number' then raise exception 'Estilo invalido.'; end if;
   if (entry->>'unit_price')::numeric<=0 or (entry->>'unit_price')::numeric>999999.99
     or round((entry->>'unit_price')::numeric,2)<>(entry->>'unit_price')::numeric
     or (entry->>'quantity')::numeric not between 0 and 100000
     or trunc((entry->>'quantity')::numeric)<>(entry->>'quantity')::numeric then raise exception 'Valor ou quantidade invalido.'; end if;
   if entry->>'unit_cost' is not null then
     if jsonb_typeof(entry->'unit_cost')<>'number' or (entry->>'unit_cost')::numeric not between 0 and 999999.99
       or round((entry->>'unit_cost')::numeric,2)<>(entry->>'unit_cost')::numeric then raise exception 'Custo invalido.'; end if;
   end if;
   if entry->>'store_value' is not null then
     if jsonb_typeof(entry->'store_value')<>'number'
       or (entry->>'store_value')::numeric not between 0 and (entry->>'unit_price')::numeric
       or round((entry->>'store_value')::numeric,2)<>(entry->>'store_value')::numeric then raise exception 'Valor da loja invalido.'; end if;
   end if;
 end loop;
 if (select count(j.value->>'id') from jsonb_array_elements(styles) as j(value)) <>
    (select count(distinct j.value->>'id') from jsonb_array_elements(styles) as j(value)) then raise exception 'Estilo repetido.'; end if;
 if target_id is null then
   insert into public.consignments(group_id,user_id,store_name) values(target_group,auth.uid(),trim(partner_name)) returning id into saved_id;
 else
   select updated_at into stamp from public.consignments where id=target_id and group_id=target_group for update;
   if not found or stamp is distinct from expected_updated_at then raise exception 'Loja ou estoque atualizado por outro usuario. Atualize a pagina antes de editar.'; end if;
   saved_id:=target_id;
   if exists(select 1 from public.consignment_items i where i.consignment_id=saved_id
      and not exists(select 1 from jsonb_array_elements(styles) as j(value) where j.value->>'id'=i.id::text)) then
      raise exception 'Estilos com historico nao podem ser apagados. Registre uma retirada para zerar o estoque.'; end if;
   update public.consignments set store_name=trim(partner_name) where id=saved_id;
 end if;
 for entry in select value from jsonb_array_elements(styles) loop
   if entry->>'id' is not null then
     select * into existing from public.consignment_items where id=(entry->>'id')::uuid and consignment_id=saved_id for update;
     if not found then raise exception 'Estilo nao pertence a esta loja.'; end if;
     if existing.quantity<>(entry->>'quantity')::numeric then raise exception 'Use as movimentacoes da loja para alterar o estoque.'; end if;
     update public.consignment_items set style=trim(entry->>'style'),unit_price=(entry->>'unit_price')::numeric,
       unit_cost=(entry->>'unit_cost')::numeric,store_value=coalesce((entry->>'store_value')::numeric,0) where id=existing.id;
   else
     insert into public.consignment_items(consignment_id,style,unit_price,unit_cost,quantity,store_value)
     values(saved_id,trim(entry->>'style'),(entry->>'unit_price')::numeric,(entry->>'unit_cost')::numeric,(entry->>'quantity')::numeric::integer,coalesce((entry->>'store_value')::numeric,0))
     returning id into new_item;
     insert into public.consignment_movements(consignment_id,item_id,user_id,kind,style,quantity,stock_delta,stock_before,stock_after,occurred_on,notes)
     values(saved_id,new_item,auth.uid(),'opening',trim(entry->>'style'),(entry->>'quantity')::numeric::integer,
       (entry->>'quantity')::numeric::integer,0,(entry->>'quantity')::numeric::integer,
       (now() at time zone 'America/Sao_Paulo')::date,'Estoque inicial do estilo.');
   end if;
 end loop;
 return saved_id;
end; $$;
revoke all on function public.save_consignment(uuid,uuid,text,jsonb,timestamptz) from public,anon;
grant execute on function public.save_consignment(uuid,uuid,text,jsonb,timestamptz) to authenticated;

create or replace function public.record_consignment_movement(
 target_group uuid,target_store uuid,target_item uuid,movement_kind text,movement_quantity integer,
 expected_stock integer,movement_date date,movement_notes text,sale_price numeric,production_cost numeric,
 store_commission numeric,event_key uuid
) returns uuid language plpgsql security definer set search_path=public as $$
declare item public.consignment_items; delta integer; gross numeric:=0; earnings numeric:=0; fee numeric:=0;
 previous public.consignment_movements;
begin
 if auth.uid() is null or not public.is_group_member(target_group) then raise exception 'Sem permissao para este grupo.'; end if;
 perform 1 from public.consignments where id=target_store and group_id=target_group for update;
 if not found then raise exception 'Loja nao encontrada neste grupo.'; end if;
 if event_key is null then raise exception 'Identificador obrigatorio.'; end if;
 select * into previous from public.consignment_movements where id=event_key;
 if found then
   if previous.consignment_id=target_store and previous.item_id=target_item and previous.kind=movement_kind
     and previous.quantity=movement_quantity then return previous.id; end if;
   raise exception 'Identificador de movimentacao ja utilizado.';
 end if;
 if movement_kind is null or movement_kind not in ('sale','restock','withdrawal') or movement_quantity is null
   or movement_quantity not between 1 and 100000 then raise exception 'Movimentacao invalida.'; end if;
 if movement_date is null or movement_date>(now() at time zone 'America/Sao_Paulo')::date
   or movement_notes is null or length(movement_notes)>500 then raise exception 'Data ou observacao invalida.'; end if;
 select * into item from public.consignment_items where id=target_item and consignment_id=target_store for update;
 if not found then raise exception 'Estilo nao encontrado.'; end if;
 if item.quantity is distinct from expected_stock then raise exception 'Estoque atualizado por outro usuario. Atualize antes de registrar.'; end if;
 delta:=case when movement_kind='restock' then movement_quantity else -movement_quantity end;
 if item.quantity+delta not between 0 and 100000 then raise exception 'Estoque insuficiente ou acima do limite.'; end if;
 if movement_kind='sale' then
   if sale_price is null or production_cost is null or store_commission is null
     or sale_price not between 0.01 and 999999.99 or production_cost not between 0 and 999999.99
     or sale_price<>round(sale_price,2) or production_cost<>round(production_cost,2) then raise exception 'Informe preco e custo validos.'; end if;
   gross:=sale_price*movement_quantity;fee:=store_commission;
   if fee<0 or fee>gross or fee<>round(fee,2) then raise exception 'Comissao invalida.'; end if;
   earnings:=gross-production_cost*movement_quantity-fee;
 end if;
 update public.consignment_items set quantity=item.quantity+delta where id=item.id;
 update public.consignments set updated_at=clock_timestamp() where id=target_store;
 insert into public.consignment_movements(id,consignment_id,item_id,user_id,kind,style,quantity,stock_delta,stock_before,stock_after,unit_price,unit_cost,commission,revenue,profit,occurred_on,notes)
 values(event_key,target_store,item.id,auth.uid(),movement_kind,item.style,movement_quantity,delta,item.quantity,item.quantity+delta,
   case when movement_kind='sale' then sale_price else 0 end,case when movement_kind='sale' then production_cost else 0 end,
   fee,gross,earnings,movement_date,trim(movement_notes));
 return event_key;
end; $$;
revoke all on function public.record_consignment_movement(uuid,uuid,uuid,text,integer,integer,date,text,numeric,numeric,numeric,uuid) from public,anon;
grant execute on function public.record_consignment_movement(uuid,uuid,uuid,text,integer,integer,date,text,numeric,numeric,numeric,uuid) to authenticated;

create or replace function public.reverse_consignment_movement(target_group uuid,target_store uuid,target_movement uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare original public.consignment_movements; stock integer; reversal_id uuid;
begin
 if auth.uid() is null or not public.is_group_member(target_group) then raise exception 'Sem permissao para este grupo.'; end if;
 perform 1 from public.consignments where id=target_store and group_id=target_group for update;
 if not found then raise exception 'Loja nao encontrada.'; end if;
 select * into original from public.consignment_movements where id=target_movement and consignment_id=target_store;
 if not found or original.kind in ('opening','reversal') then raise exception 'Movimentacao nao pode ser estornada.'; end if;
 select id into reversal_id from public.consignment_movements where reverses_id=original.id;
 if found then return reversal_id; end if;
 select quantity into stock from public.consignment_items where id=original.item_id for update;
 if stock-original.stock_delta not between 0 and 100000 then raise exception 'O estoque atual nao permite este estorno.'; end if;
 update public.consignment_items set quantity=stock-original.stock_delta where id=original.item_id;
 update public.consignments set updated_at=clock_timestamp() where id=target_store;
 insert into public.consignment_movements(consignment_id,item_id,user_id,kind,style,quantity,stock_delta,stock_before,stock_after,unit_price,unit_cost,commission,revenue,profit,occurred_on,notes,reverses_id)
 values(target_store,original.item_id,auth.uid(),'reversal',original.style,original.quantity,-original.stock_delta,stock,stock-original.stock_delta,
   original.unit_price,original.unit_cost,-original.commission,-original.revenue,-original.profit,original.occurred_on,'Estorno da movimentacao original.',original.id)
 returning id into reversal_id;
 return reversal_id;
end; $$;
revoke all on function public.reverse_consignment_movement(uuid,uuid,uuid) from public,anon;
grant execute on function public.reverse_consignment_movement(uuid,uuid,uuid) to authenticated;
commit;
