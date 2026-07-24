-- Execute no SQL Editor do Supabase para habilitar imagem e link de modelo nos produtos.
alter table public.products add column if not exists image_url text not null default '';
alter table public.products add column if not exists model_file_url text not null default '';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product_images_public_read" on storage.objects;
create policy "product_images_public_read" on storage.objects
for select to public using (bucket_id = 'product-images');

drop policy if exists "product_images_authenticated_insert" on storage.objects;
create policy "product_images_authenticated_insert" on storage.objects
for insert to authenticated with check (
  bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "product_images_owner_update" on storage.objects;
create policy "product_images_owner_update" on storage.objects
for update to authenticated using (
  bucket_id = 'product-images' and owner_id = auth.uid()::text
) with check (
  bucket_id = 'product-images' and owner_id = auth.uid()::text
);
