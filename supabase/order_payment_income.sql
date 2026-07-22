-- Pagamento de pedidos e ganho automático (migração idempotente)
alter table public.orders
  add column if not exists paid boolean not null default false;

alter table public.transactions
  add column if not exists order_id uuid references public.orders(id) on delete cascade;

create unique index if not exists transactions_order_id_unique
  on public.transactions(order_id)
  where order_id is not null;

create or replace function public.normalize_order_payment()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'delivered' then
    new.paid := true;
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_order_payment_before_write on public.orders;
create trigger normalize_order_payment_before_write
before insert or update on public.orders
for each row execute function public.normalize_order_payment();

create or replace function public.sync_paid_order_income()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.paid and new.value > 0 then
    insert into public.transactions (
      user_id, group_id, source_id, client_id, product_id, order_id,
      date, description, category, type, value, payment_method,
      status, observation, recurring
    )
    values (
      new.user_id, new.group_id, new.source_id, new.client_id, new.product_id, new.id,
      current_date, new.title, 'Pedidos', 'income', new.value, 'Não informado',
      'paid', 'Ganho gerado automaticamente pelo pedido.', false
    )
    on conflict (order_id) where order_id is not null
    do update set
      user_id = excluded.user_id,
      group_id = excluded.group_id,
      source_id = excluded.source_id,
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
after insert or update of paid, status, value, title, source_id, client_id, product_id, group_id
on public.orders
for each row execute function public.sync_paid_order_income();

-- Pedidos já entregues passam a ser pagos e recebem o ganho uma única vez.
update public.orders
set paid = true
where status = 'delivered' and paid = false;

