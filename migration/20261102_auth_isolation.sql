-- Apply after supabase/schema.sql. Existing UUIDs are the immutable chaveusuario.
begin;
create index if not exists group_members_user_group_idx on public.group_members(user_id,group_id);
create index if not exists transactions_group_date_idx on public.transactions(group_id,date desc,id);
create index if not exists transactions_group_user_date_idx on public.transactions(group_id,user_id,date desc);
create index if not exists orders_group_created_idx on public.orders(group_id,created_at,id);
create index if not exists orders_group_status_due_idx on public.orders(group_id,status,due_date);
create index if not exists order_products_product_idx on public.order_products(product_id);
do $$ declare t text; begin
 foreach t in array array['income_sources','companies','colors','clients','products'] loop
  execute format('create index if not exists %I on public.%I(group_id,name)',t||'_group_name_idx',t);
 end loop;
end $$;

-- Membership, never a client-provided key, decides authorization.
create or replace function public.is_group_member(target_group uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.group_members m join public.profiles p on p.id=m.user_id
 where m.group_id=target_group and m.user_id=(select auth.uid()) and p.active);
$$;
revoke all on function public.is_group_member(uuid) from public,anon;
grant execute on function public.is_group_member(uuid) to authenticated;

-- Authors and group identity cannot be changed, even by members of both groups.
create or replace function public.keep_row_author()
returns trigger language plpgsql set search_path=public as $$
begin
 if new.group_id is distinct from old.group_id then
  raise exception 'O grupo do registro nao pode ser alterado.' using errcode='23514';
 end if;
 new.user_id=old.user_id;
 return new;
end;
$$;

-- Check relations in the database, including writes made by definer triggers.
create or replace function public.validate_group_relations()
returns trigger language plpgsql security definer set search_path=public as $$
declare field_name text; target_table text; relation_id uuid; relation_group uuid;
begin
 foreach field_name in array array['source_id','client_id','product_id','color_id','order_id'] loop
  relation_id=nullif(to_jsonb(new)->>field_name,'')::uuid;
  if relation_id is null then continue; end if;
  target_table=case field_name when 'source_id' then 'income_sources' when 'client_id' then 'clients'
    when 'product_id' then 'products' when 'color_id' then 'colors' when 'order_id' then 'orders' end;
  execute format('select group_id from public.%I where id=$1',target_table) into relation_group using relation_id;
  if relation_group is distinct from new.group_id then
   raise exception 'Referencia fora do grupo do registro.' using errcode='23514';
  end if;
 end loop;
 return new;
end;
$$;
do $$ declare t text; begin
 foreach t in array array['orders','transactions'] loop
  execute format('drop trigger if exists validate_group_relations on public.%I',t);
  execute format('create trigger validate_group_relations before insert or update on public.%I for each row execute function public.validate_group_relations()',t);
 end loop;
end $$;

create or replace function public.validate_order_product_group()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.orders o join public.products p on p.group_id=o.group_id
 where o.id=new.order_id and p.id=new.product_id) then
  raise exception 'Produto e pedido devem pertencer ao mesmo grupo.' using errcode='23514';
 end if;
 return new;
end;
$$;
drop trigger if exists validate_order_product_group on public.order_products;
create trigger validate_order_product_group before insert or update on public.order_products
for each row execute function public.validate_order_product_group();

-- Profiles may edit display data, never their active flag or identity.
revoke insert,update,delete on public.profiles from authenticated;
grant update(name,email) on public.profiles to authenticated;
revoke update on public.group_members from authenticated;
revoke all on function public.validate_group_relations() from public,anon,authenticated;
revoke all on function public.validate_order_product_group() from public,anon,authenticated;
commit;
