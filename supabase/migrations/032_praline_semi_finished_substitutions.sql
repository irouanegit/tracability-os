-- Allow operator-selected substitutions between praline semi-finished products.
-- Keep this exact-name based so praline-containing parent products are not grouped.

create or replace function public.resolve_semi_finished_substitution_group(p_name text)
returns text
language sql
stable
set search_path = public
as $$
  with normalized as (
    select regexp_replace(lower(coalesce(p_name, '')), '\s+', ' ', 'g') as name
  )
  select case
    when name like '%biscuit%' then 'biscuit'
    when name like '%pistolet%' then 'pistolet'
    when name like '%coulis%' then 'coulis'
    when name like '%croquant%' then 'croquant'
    when name like '%ganache%' then 'ganache'
    when name like '%gla_age%' then 'glacage'
    when name like '%insert%' then 'insert'
    when name like '%mousse%' then 'mousse'
    when name like '%silicone%' then 'silicone'
    when name like '%sirop%' then 'sirop'
    when name in ('praline amande', 'praline arachide', 'praline noisette', 'praline pistache') then 'praline'
    else null
  end
  from normalized;
$$;

update products
set substitution_group = public.resolve_semi_finished_substitution_group(name),
    updated_at = now()
where type = 'semi_finished'
  and is_active = true
  and public.resolve_semi_finished_substitution_group(name) is not null
  and coalesce(substitution_group, '') <> public.resolve_semi_finished_substitution_group(name);
