-- Audit the raw materials required by the boulangerie import against the live DB.
-- Run this before inserting/fixing raw materials so we can see exact matches,
-- close candidates, and supplier links.

with required_materials(name) as (
  values
    ('Améliorant de Panification IBIS'),
    ('Beurre'),
    ('Farine d''orge'),
    ('Semoule'),
    ('Semoule d''orge'),
    ('SESAME BLANC')
),
raw_products as (
  select
    products.id,
    products.name,
    products.unit,
    products.is_active
  from products
  where products.type = 'raw'
),
exact_matches as (
  select
    required_materials.name as required_name,
    raw_products.id as product_id,
    raw_products.name as existing_name,
    raw_products.unit,
    raw_products.is_active
  from required_materials
  left join raw_products
    on lower(trim(raw_products.name)) = lower(trim(required_materials.name))
),
supplier_links as (
  select
    raw_products.id as product_id,
    coalesce(
      jsonb_agg(distinct suppliers.name order by suppliers.name)
        filter (where suppliers.id is not null),
      '[]'::jsonb
    ) as suppliers
  from raw_products
  left join supplier_raw_materials
    on supplier_raw_materials.product_id = raw_products.id
  left join suppliers
    on suppliers.id = supplier_raw_materials.supplier_id
  group by raw_products.id
),
close_candidates as (
  select
    required_materials.name as required_name,
    coalesce(
      jsonb_agg(
        distinct jsonb_build_object(
          'name', raw_products.name,
          'unit', raw_products.unit,
          'active', raw_products.is_active,
          'suppliers', supplier_links.suppliers
        )
        order by jsonb_build_object(
          'name', raw_products.name,
          'unit', raw_products.unit,
          'active', raw_products.is_active,
          'suppliers', supplier_links.suppliers
        )::text
      ) filter (where raw_products.id is not null),
      '[]'::jsonb
    ) as candidates
  from required_materials
  left join raw_products
    on lower(raw_products.name) like '%' || split_part(lower(required_materials.name), ' ', 1) || '%'
    or lower(required_materials.name) like '%' || split_part(lower(raw_products.name), ' ', 1) || '%'
  left join supplier_links
    on supplier_links.product_id = raw_products.id
  group by required_materials.name
)
select
  exact_matches.required_name,
  case
    when exact_matches.product_id is null then 'missing'
    when exact_matches.is_active is false then 'inactive'
    else 'found'
  end as status,
  exact_matches.existing_name,
  exact_matches.unit,
  coalesce(supplier_links.suppliers, '[]'::jsonb) as linked_suppliers,
  close_candidates.candidates as close_candidates
from exact_matches
left join supplier_links
  on supplier_links.product_id = exact_matches.product_id
join close_candidates
  on close_candidates.required_name = exact_matches.required_name
order by exact_matches.required_name;

-- Full active raw-material list, grouped with suppliers.
select
  products.name,
  products.unit,
  coalesce(
    jsonb_agg(distinct suppliers.name order by suppliers.name)
      filter (where suppliers.id is not null),
    '[]'::jsonb
  ) as linked_suppliers
from products
left join supplier_raw_materials
  on supplier_raw_materials.product_id = products.id
left join suppliers
  on suppliers.id = supplier_raw_materials.supplier_id
where products.type = 'raw'
  and products.is_active = true
group by products.id, products.name, products.unit
order by products.name;
