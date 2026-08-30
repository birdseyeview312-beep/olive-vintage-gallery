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
      ~* '\m(vintage|antique|art nouveau|mid.century|early 19[0-9][0-9]s|circa 19[0-9][0-9]s)\M'
      then 'Vintage & Antique Glass'
    when concat_ws(' ', item_title, item_maker, item_category, item_origin, item_period, item_medium, item_description)
      ~* '\m(murano|italy|italian|venice|venetian|france|french|sweden|swedish|scandinavia|scandinavian|denmark|danish|finland|finnish|norway|norwegian|czech|czechoslovak|bohemia|bohemian|poland|polish|romania|romanian|germany|german|austria|austrian|belgium|belgian|netherlands|dutch|united kingdom|england|english|scotland|scottish|wales|welsh|ireland|irish|kosta boda|holmegaard|daum|loetz|lalique|saint louis|fratelli toso|cenedese|carlo moretti|ioan nemtoi|caithness|paul ysart|pallme|könig)\M'
      or coalesce(item_category, '') = 'European & Italian Glass'
      then 'European & Italian Glass'
    when concat_ws(' ', item_title, item_maker, item_category, item_origin, item_period, item_medium, item_description)
      ~* '\m(united states|usa|american|california|steuben|fenton|durand|eickholt|rollin karg|karg glass|neptune hot glass|annieglass|correia|tiffany|st clair|cohn.stone)\M'
      or coalesce(item_category, '') = 'American Art Glass'
      then 'American Art Glass'
    else 'Contemporary Studio Glass'
  end
$$;

update public.products
set category = public.olive_curated_category(
  title, maker, category, origin, date_period, medium, description
)
where not category_manual;
