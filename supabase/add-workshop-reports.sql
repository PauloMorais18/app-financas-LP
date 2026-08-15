-- Campos opcionais usados pelo modo Oficina e seus relatórios.
-- Migração idempotente: pode ser executada mais de uma vez.
alter table public.groups
  add column if not exists workshop_enabled boolean not null default false,
  add column if not exists workshop_contracted boolean not null default false;

update public.groups set workshop_enabled=false where not workshop_contracted;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='groups_workshop_requires_contract') then
    alter table public.groups add constraint groups_workshop_requires_contract
      check (not workshop_enabled or workshop_contracted);
  end if;
end $$;

-- A contratação é uma permissão comercial: usuários comuns não podem liberá-la.
create or replace function public.protect_module_contracts()
returns trigger language plpgsql as $$
begin
  if new.workshop_contracted is distinct from old.workshop_contracted
     and coalesce(auth.jwt()->>'role','') <> 'service_role'
     and current_user not in ('postgres','supabase_admin') then
    raise exception 'A contratação de módulos só pode ser alterada pelo administrador da plataforma.';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_module_contracts_before_update on public.groups;
create trigger protect_module_contracts_before_update before update on public.groups
for each row execute function public.protect_module_contracts();

alter table public.transactions
  add column if not exists vehicle text not null default '',
  add column if not exists counterparty text not null default '',
  add column if not exists account text not null default '',
  add column if not exists due_date date,
  add column if not exists payment_date date;

create index if not exists transactions_group_due_date_idx
  on public.transactions(group_id, due_date)
  where status = 'pending' and type = 'income';
