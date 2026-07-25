-- Execute este script no SQL Editor do Supabase.
-- O tempo de impressão é armazenado em minutos.
alter table public.products
  add column if not exists printing_time_minutes integer not null default 0;

alter table public.products
  drop constraint if exists products_printing_time_minutes_nonnegative;

alter table public.products
  add constraint products_printing_time_minutes_nonnegative
  check (printing_time_minutes >= 0);
