-- Execute no SQL Editor do Supabase antes de publicar.
-- Pedidos e registros financeiros existentes sao preservados.
begin;
drop trigger if exists sync_paid_order_income_after_write on public.orders;
create or replace function public.sync_paid_order_income()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.paid and new.value > 0 then
    insert into public.transactions (
      user_id, group_id, client_id, product_id, order_id,
      date, description, category, type, value, payment_method,
      status, observation, recurring
    )
    values (
      new.user_id, new.group_id, new.client_id, new.product_id, new.id,
      current_date, new.title, 'Pedidos', 'income', new.value, 'Não informado',
      'paid', 'Ganho gerado automaticamente pelo pedido.', false
    )
    on conflict (order_id) where order_id is not null
    do update set
      user_id = excluded.user_id,
      group_id = excluded.group_id,
      client_id = excluded.client_id,
      product_id = excluded.product_id,
      description = excluded.description,
      value = excluded.value,
      status = 'paid',
      observation = excluded.observation,
      updated_at = now();
  else
    delete from public.transactions where order_id = new.id;
  end if;

  return null;
end;
$$;

drop trigger if exists sync_paid_order_income_after_write on public.orders;
create trigger sync_paid_order_income_after_write
after insert or update of paid, status, value, title, client_id, product_id, group_id
on public.orders
for each row execute function public.sync_paid_order_income();
create or replace function public.delete_owned_group(target_group uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.groups where id=target_group and owner_id=auth.uid()) then
    raise exception 'Você não é o proprietário deste grupo.';
  end if;
  if exists(select 1 from public.groups where id=target_group and is_default) then
    raise exception 'O grupo padrão não pode ser excluído.';
  end if;
  delete from public.transactions where group_id=target_group;
  delete from public.orders where group_id=target_group;
  delete from public.colors where group_id=target_group;
  delete from public.clients where group_id=target_group;
  delete from public.products where group_id=target_group;
  delete from public.companies where group_id=target_group;
  delete from public.groups where id=target_group;
end;
$$;
alter table public.transactions drop column if exists source_id;
alter table public.orders drop column if exists source_id;
drop table if exists public.income_sources;
commit;
