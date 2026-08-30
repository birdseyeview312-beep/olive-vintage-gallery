alter table public.products
  add column if not exists category_manual boolean not null default false;

create or replace function public.olive_curated_category(
  item_title text,
  item_maker text,
  item_category text,
  item_origin text,
  item_period text,
  item_medium text,
  item_description text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when concat_ws(' ', item_title, item_maker, item_category, item_origin, item_period, item_medium, item_description)
      ~* '\m(paper[[:space:]]*weight|paperweight|marble|millefiori orb|lampwork orb)\M'
      then 'Marbles & Paperweights'
    when concat_ws(' ', item_title, item_maker, item_category, item_origin, item_period, item_medium, item_description)
      ~* '\m(murano|italy|italian|venice|venetian|france|french|sweden|swedish|scandinavia|scandinavian|denmark|danish|finland|finnish|norway|norwegian|czech|czechoslovak|bohemia|bohemian|poland|polish|romania|romanian|germany|german|austria|austrian|belgium|belgian|netherlands|dutch|united kingdom|england|english|scotland|scottish|wales|welsh|ireland|irish|kosta boda|holmegaard|daum|loetz|lalique|saint louis|fratelli toso|cenedese|carlo moretti|ioan nemtoi|caithness|paul ysart|pallme|könig)\M'
      or coalesce(item_category, '') in ('European Art Glass', 'European & Italian Glass', 'Scandinavian Glass', 'Murano / Italian Glass', 'Bohemian Art Glass')
      then 'European & Italian Glass'
    when concat_ws(' ', item_title, item_maker, item_category, item_origin, item_period, item_medium, item_description)
      ~* '\m(united states|usa|american|california|steuben|fenton|durand|eickholt|rollin karg|karg glass|neptune hot glass|annieglass|correia|tiffany|st clair|cohn.stone)\M'
      or coalesce(item_category, '') in ('American Art Glass', 'American Studio Glass')
      then 'American Art Glass'
    when concat_ws(' ', item_title, item_maker, item_category, item_origin, item_period, item_medium, item_description)
      ~* '\m(vintage|antique|art nouveau|mid.century|early 19[0-9][0-9]s|circa 19[0-9][0-9]s)\M'
      then 'Vintage & Antique Glass'
    else 'Contemporary Studio Glass'
  end
$$;

create or replace function public.olive_set_curated_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not coalesce(new.category_manual, false) then
    new.category := public.olive_curated_category(
      new.title, new.maker, new.category, new.origin, new.date_period,
      new.medium, new.description
    );
  end if;
  return new;
end;
$$;

drop trigger if exists products_set_curated_category on public.products;
create trigger products_set_curated_category
before insert or update of title, maker, category, origin, date_period, medium, description, category_manual
on public.products
for each row execute function public.olive_set_curated_category();

update public.products
set category = public.olive_curated_category(
  title, maker, category, origin, date_period, medium, description
), category_manual = false;

comment on column public.products.category_manual is
  'True when the owner has overridden automatic Curated-section categorization.';
