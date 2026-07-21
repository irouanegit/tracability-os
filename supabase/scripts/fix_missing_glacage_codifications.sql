-- Adds missing production codifications for existing imported glaçage products.
-- Run manually in Supabase SQL editor.
--
-- The lot generator can now also resolve these in app code, but updating the DB
-- product code keeps the catalog codification explicit.

begin;

with codification(product_name, product_type, product_category, official_code) as (
  values
    ('Glaçage mangue', 'semi_finished'::product_type, 'patisserie', 'GMA'),
    ('Glaçage vanille', 'semi_finished'::product_type, 'patisserie', 'GV')
),
matched as (
  select
    product.id,
    product.name,
    product.code as old_code,
    'SF-' || upper(product.category) || '-CODE-' || codification.official_code || '-' || upper(substr(md5(product.name), 1, 6)) as new_code
  from products product
  join codification
    on lower(trim(product.name)) = lower(trim(codification.product_name))
   and product.type = codification.product_type
   and product.category = codification.product_category
  where product.is_active = true
),
conflicts as (
  select matched.*
  from matched
  join products existing
    on existing.code = matched.new_code
   and existing.id <> matched.id
),
updated as (
  update products product
  set
    code = matched.new_code,
    updated_at = now()
  from matched
  where product.id = matched.id
    and not exists (select 1 from conflicts)
    and product.code is distinct from matched.new_code
  returning product.name, matched.old_code, product.code as new_code
)
select *
from updated
order by name;

do $$
declare
  v_conflicts text[];
begin
  with codification(product_name, product_type, product_category, official_code) as (
    values
      ('Glaçage mangue', 'semi_finished'::product_type, 'patisserie', 'GMA'),
      ('Glaçage vanille', 'semi_finished'::product_type, 'patisserie', 'GV')
  ),
  matched as (
    select
      product.id,
      product.name,
      'SF-' || upper(product.category) || '-CODE-' || codification.official_code || '-' || upper(substr(md5(product.name), 1, 6)) as new_code
    from products product
    join codification
      on lower(trim(product.name)) = lower(trim(codification.product_name))
     and product.type = codification.product_type
     and product.category = codification.product_category
    where product.is_active = true
  )
  select array_agg(matched.name || ' -> ' || matched.new_code)
  into v_conflicts
  from matched
  join products existing
    on existing.code = matched.new_code
   and existing.id <> matched.id;

  if coalesce(array_length(v_conflicts, 1), 0) > 0 then
    raise exception 'Codification code conflict. Review manually: %', v_conflicts;
  end if;
end $$;

commit;
