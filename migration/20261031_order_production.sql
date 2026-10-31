-- Etapa vinculada ao próprio pedido: a conclusão usa orders.status = 'delivered'.
begin;
alter table public.orders add column if not exists production_stage text
  check (production_stage in ('modeling','printing','painting','delivery'));
commit;
