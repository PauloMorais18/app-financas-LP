-- Preserve pedidos e movimentações ao excluir uma fonte de renda.
begin;
alter table public.orders alter column source_id drop not null;
alter table public.orders drop constraint if exists orders_source_id_fkey;
alter table public.orders add constraint orders_source_id_fkey
  foreign key (source_id) references public.income_sources(id) on delete set null;
alter table public.transactions drop constraint if exists transactions_source_id_fkey;
alter table public.transactions add constraint transactions_source_id_fkey
  foreign key (source_id) references public.income_sources(id) on delete set null;

-- Reconcile somente ganhos vinculados a pedidos não pagos.
delete from public.transactions t using public.orders o
where t.order_id=o.id and not o.paid and o.status <> 'delivered';
commit;