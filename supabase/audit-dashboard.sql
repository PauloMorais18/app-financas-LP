-- Somente leitura. Execute no SQL Editor do Supabase.
-- Compara registros reais com a projecao de recorrencias usada pelo dashboard.
-- Uma linha por grupo: compare o grupo selecionado na aplicacao.
with ledger as (
  select t.*, (t.order_id is null or coalesce(o.paid,false) or o.status='delivered') as included
  from public.transactions t left join public.orders o on o.id=t.order_id
), projected as (
  select t.*, case when recurring then greatest(0,
    (extract(year from timezone('America/Sao_Paulo',now()))::int-extract(year from date)::int)*12
    +extract(month from timezone('America/Sao_Paulo',now()))::int-extract(month from date)::int+1
  ) else 1 end as copies
  from ledger t
)
select g.id as group_id, g.name as grupo,
  count(t.id) as registros,
  coalesce(sum(t.value) filter(where t.included and t.status='paid' and t.type='income'),0) as ganhos_registrados,
  coalesce(sum(t.value) filter(where t.included and t.status='paid' and t.type='expense'),0) as despesas_registradas,
  coalesce(sum(case when t.type='income' then t.value else -t.value end) filter(where t.included and t.status='paid'),0) as saldo_registrado,
  coalesce(sum((case when t.type='income' then t.value else -t.value end)*t.copies) filter(where t.included and t.status='paid'),0) as saldo_com_recorrencias,
  coalesce(sum(t.value) filter(where t.included and t.status='pending' and t.type='expense'),0) as despesas_a_pagar,
  coalesce(sum(t.value) filter(where t.included and t.status='pending' and t.type='income'),0) as ganhos_a_receber,
  coalesce(sum(t.value) filter(where not t.included and t.type='income'),0) as ganhos_excluidos_por_pedido_nao_pago
from public.groups g left join projected t on t.group_id=g.id
group by g.id,g.name order by g.name;
