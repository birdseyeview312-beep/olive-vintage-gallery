-- `featured` is the owner's manual Object of the Week override. With no
-- featured row, the storefront automatically rotates available works weekly.
create unique index if not exists products_single_object_of_week
on public.products (featured)
where featured is true;

comment on column public.products.featured is
'Manual Object of the Week override. At most one product may be true; no true row enables automatic weekly rotation.';
