-- Execute no SQL Editor para permitir alternar entre os usuários de um mesmo grupo.

drop policy if exists profiles_group_select on public.profiles;
create policy profiles_group_select on public.profiles
for select to authenticated using (
  id = auth.uid() or exists (
    select 1
    from public.group_members selected_membership
    join public.group_members my_membership
      on my_membership.group_id = selected_membership.group_id
    where selected_membership.user_id = profiles.id
      and my_membership.user_id = auth.uid()
  )
);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'income_sources','companies','colors','clients',
    'products','transactions','orders'
  ] loop
    execute format('drop policy if exists group_insert on public.%I', table_name);
    execute format(
      'create policy group_insert on public.%1$I for insert to authenticated
       with check (
         public.is_group_member(group_id)
         and exists (
           select 1 from public.group_members
           where group_members.group_id = public.%1$I.group_id
             and group_members.user_id = public.%1$I.user_id
         )
       )',
      table_name
    );
  end loop;
end $$;
