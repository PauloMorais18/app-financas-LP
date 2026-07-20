-- Execute no SQL Editor do Supabase para permitir vários produtos por pedido.
create table if not exists public.order_products (
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null default 1 check(quantity > 0),
  created_at timestamptz not null default now(),
  primary key(order_id,product_id)
);

alter table public.order_products add column if not exists quantity integer not null default 1;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='order_products_quantity_positive') then
    alter table public.order_products add constraint order_products_quantity_positive check(quantity > 0);
  end if;
end $$;

insert into public.order_products(order_id,product_id)
select id,product_id from public.orders where product_id is not null on conflict do nothing;

alter table public.order_products enable row level security;
drop policy if exists order_products_group_access on public.order_products;
create policy order_products_group_access on public.order_products for all to authenticated
using (exists(select 1 from public.orders o where o.id=order_id and public.is_group_member(o.group_id)))
with check (exists(select 1 from public.orders o where o.id=order_id and public.is_group_member(o.group_id)));

grant select,insert,update,delete on public.order_products to authenticated;

create or replace function public.refresh_order_products_total()
returns trigger language plpgsql security definer set search_path=public as $$
declare target_order uuid;
begin
  target_order := case when tg_op='DELETE' then old.order_id else new.order_id end;
  update public.orders set value=coalesce((
    select sum(p.sale_value*op.quantity)
    from public.order_products op join public.products p on p.id=op.product_id
    where op.order_id=target_order
  ),0) where id=target_order;
  return null;
end;
$$;
drop trigger if exists refresh_order_products_total_after_write on public.order_products;
create trigger refresh_order_products_total_after_write after insert or update or delete on public.order_products
for each row execute function public.refresh_order_products_total();

update public.orders o set value=coalesce((
  select sum(p.sale_value*op.quantity)
  from public.order_products op join public.products p on p.id=op.product_id
  where op.order_id=o.id
),0) where exists(select 1 from public.order_products op where op.order_id=o.id);
