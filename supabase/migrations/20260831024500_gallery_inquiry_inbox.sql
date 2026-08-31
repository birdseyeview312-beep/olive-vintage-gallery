create table if not exists public.gallery_inquiries (
  id uuid primary key default gen_random_uuid(),
  inquiry_type text not null check (inquiry_type in ('buyer','seller','general')),
  product_id uuid references public.products(id) on delete set null,
  product_title text,
  name text not null check (char_length(name) between 1 and 160),
  email text not null check (char_length(email) between 3 and 320),
  phone text,
  location text,
  message text not null check (char_length(message) between 1 and 5000),
  image_paths text[] not null default '{}',
  status text not null default 'new' check (status in ('new','reviewing','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(image_paths) <= 5)
);
alter table public.gallery_inquiries enable row level security;
grant insert on public.gallery_inquiries to anon, authenticated;
grant select, update, delete on public.gallery_inquiries to authenticated;
drop policy if exists "public can submit gallery inquiries" on public.gallery_inquiries;
create policy "public can submit gallery inquiries" on public.gallery_inquiries for insert to anon, authenticated with check (status='new' and cardinality(image_paths)<=5);
drop policy if exists "olive admin can read gallery inquiries" on public.gallery_inquiries;
create policy "olive admin can read gallery inquiries" on public.gallery_inquiries for select to authenticated using (((select auth.jwt())->'app_metadata'->>'olive_role')='admin');
drop policy if exists "olive admin can update gallery inquiries" on public.gallery_inquiries;
create policy "olive admin can update gallery inquiries" on public.gallery_inquiries for update to authenticated using (((select auth.jwt())->'app_metadata'->>'olive_role')='admin') with check (((select auth.jwt())->'app_metadata'->>'olive_role')='admin');
drop policy if exists "olive admin can delete gallery inquiries" on public.gallery_inquiries;
create policy "olive admin can delete gallery inquiries" on public.gallery_inquiries for delete to authenticated using (((select auth.jwt())->'app_metadata'->>'olive_role')='admin');

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('inquiry-uploads','inquiry-uploads',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists "public can upload inquiry images" on storage.objects;
create policy "public can upload inquiry images" on storage.objects for insert to anon, authenticated with check (bucket_id='inquiry-uploads');
drop policy if exists "olive admin can read inquiry images" on storage.objects;
create policy "olive admin can read inquiry images" on storage.objects for select to authenticated using (bucket_id='inquiry-uploads' and ((select auth.jwt())->'app_metadata'->>'olive_role')='admin');
drop policy if exists "olive admin can delete inquiry images" on storage.objects;
create policy "olive admin can delete inquiry images" on storage.objects for delete to authenticated using (bucket_id='inquiry-uploads' and ((select auth.jwt())->'app_metadata'->>'olive_role')='admin');
