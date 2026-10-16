drop policy if exists product_images_public_read on public.product_images;
create policy product_images_public_read on public.product_images for select to anon,authenticated
using(exists(select 1 from public.products p
 where p.id=product_images.product_id
 and (p.status=any(array['available','active','sold']) or is_owner_or_admin())));
