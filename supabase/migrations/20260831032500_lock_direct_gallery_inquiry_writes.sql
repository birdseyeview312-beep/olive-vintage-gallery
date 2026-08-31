drop policy if exists "public can submit gallery inquiries" on public.gallery_inquiries;
revoke insert on public.gallery_inquiries from anon, authenticated;

drop policy if exists "public can upload inquiry images" on storage.objects;
