-- Execute no SQL Editor do Supabase para permitir que integrantes editem
-- registros compartilhados sem alterar o usuário que criou cada registro.
create or replace function public.keep_row_author()
returns trigger language plpgsql as $$
begin
  new.user_id = old.user_id;
  return new;
end;
$$;

do $$ declare table_name text;
begin
  foreach table_name in array array['income_sources','companies','colors','clients','products','transactions','orders'] loop
    execute format('drop policy if exists own_rows on public.%I',table_name);
    execute format('drop policy if exists group_rows on public.%I',table_name);
    execute format('drop policy if exists group_select on public.%I',table_name);
    execute format('drop policy if exists group_insert on public.%I',table_name);
    execute format('drop policy if exists group_update on public.%I',table_name);
    execute format('drop policy if exists group_delete on public.%I',table_name);
    execute format('create policy group_select on public.%I for select to authenticated using (public.is_group_member(group_id))',table_name);
    execute format('create policy group_insert on public.%I for insert to authenticated with check (public.is_group_member(group_id) and user_id=auth.uid())',table_name);
    execute format('create policy group_update on public.%I for update to authenticated using (public.is_group_member(group_id)) with check (public.is_group_member(group_id))',table_name);
    execute format('create policy group_delete on public.%I for delete to authenticated using (public.is_group_member(group_id))',table_name);
    execute format('drop trigger if exists keep_row_author_before_update on public.%I',table_name);
    execute format('create trigger keep_row_author_before_update before update on public.%I for each row execute function public.keep_row_author()',table_name);
  end loop;
end $$;

alter table public.orders add column if not exists updated_by uuid references public.profiles(id) on delete set null;
alter table public.orders add column if not exists updated_by_name text not null default '';
update public.orders o set updated_by=o.user_id, updated_by_name=coalesce(p.name,'')
from public.profiles p where p.id=o.user_id and o.updated_by is null;

create or replace function public.set_order_last_editor()
returns trigger language plpgsql security definer set search_path=public as $$
declare editor_id uuid;
begin
  editor_id := auth.uid();
  if editor_id is null and tg_op='INSERT' then editor_id := new.user_id; end if;
  if editor_id is not null then
    new.updated_by := editor_id;
    select coalesce(name,'') into new.updated_by_name from public.profiles where id=editor_id;
  end if;
  return new;
end;
$$;
drop trigger if exists set_order_last_editor_before_write on public.orders;
create trigger set_order_last_editor_before_write before insert or update on public.orders
for each row execute function public.set_order_last_editor();
