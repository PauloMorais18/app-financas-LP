alter table public.order_products add column if not exists unit_sale_value numeric(14,2);

update public.order_products op
set unit_sale_value = p.sale_value
from public.products p
where p.id = op.product_id and op.unit_sale_value is null;

alter table public.order_products alter column unit_sale_value set not null;
alter table public.order_products alter column unit_sale_value set default 0;

create or replace function public.refresh_order_products_total()
returns trigger language plpgsql security definer set search_path=public as $$
declare target_order uuid;
begin
  target_order := case when tg_op='DELETE' then old.order_id else new.order_id end;
  update public.orders set value=coalesce((
    select sum(op.unit_sale_value*op.quantity)
    from public.order_products op
    where op.order_id=target_order
  ),0) where id=target_order;
  return null;
end;
$$;

update public.orders o set value=coalesce((
  select sum(op.unit_sale_value*op.quantity)
  from public.order_products op
  where op.order_id=o.id
),0) where exists(select 1 from public.order_products op where op.order_id=o.id);
