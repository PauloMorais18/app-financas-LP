-- Execute depois de 20261031_consignment_movements.sql.
-- Custo ausente continua desconhecido: nao assume zero nem cria lucro ficticio.
-- Nao altera registros existentes nem o financeiro geral.
begin;
alter table public.consignment_movements alter column unit_cost drop not null;
alter table public.consignment_movements alter column profit drop not null;
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
   if sale_price is null or store_commission is null
     or sale_price not between 0.01 and 999999.99
     or (production_cost is not null and production_cost not between 0 and 999999.99)
     or sale_price<>round(sale_price,2) or (production_cost is not null and production_cost<>round(production_cost,2)) then raise exception 'Informe preco valido e, se informado, custo valido.'; end if;
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


commit;
