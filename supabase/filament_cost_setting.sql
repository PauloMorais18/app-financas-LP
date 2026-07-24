-- Execute no SQL Editor para configurar o custo padrão do filamento por grupo.
alter table public.groups
add column if not exists filament_cost_per_meter numeric(14,4)
not null default 0.30 check(filament_cost_per_meter >= 0);

update public.groups
set filament_cost_per_meter = 0.30
where filament_cost_per_meter is null;
