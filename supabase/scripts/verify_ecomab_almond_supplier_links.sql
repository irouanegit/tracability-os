-- Verifies cleanup_ecomab_almond_supplier_links.sql.
-- Read-only. Run after the cleanup script.

with expected(product_id, material_label) as (
  values
    ('e7575d08-32ca-4706-82f0-58795a23237b'::uuid, 'Amande effilee'),
    ('5aecef5b-1684-40d7-b379-e33d3ddde825'::uuid, 'Amande hachee'),
    ('f3f9df25-8269-4f49-8fbb-afdfd3b9db5d'::uuid, 'Amande poudre')
),
ecomab as (
  select id
  from suppliers
  where is_active = true
    and lower(trim(name)) = lower('ECOMAB')
  limit 1
),
links as (
  select
    expected.product_id,
    expected.material_label,
    product.name as material_name,
    array_agg(supplier.name order by supplier.name) filter (where supplier.id is not null) as linked_suppliers,
    count(*) filter (where supplier.id = ecomab.id) as ecomab_link_count,
    count(*) filter (where supplier.id is not null and supplier.id <> ecomab.id) as non_ecomab_link_count
  from expected
  left join products product on product.id = expected.product_id
  left join supplier_raw_materials supplier_link on supplier_link.product_id = expected.product_id
  left join suppliers supplier on supplier.id = supplier_link.supplier_id
  cross join ecomab
  group by expected.product_id, expected.material_label, product.name
)
select
  material_label,
  material_name,
  coalesce(linked_suppliers, array[]::text[]) as linked_suppliers,
  ecomab_link_count,
  non_ecomab_link_count,
  case
    when ecomab_link_count <> 1 then 'MISSING_ECOMAB_LINK'
    when non_ecomab_link_count <> 0 then 'WRONG_SUPPLIER_STILL_LINKED'
    else 'OK'
  end as status
from links
order by material_label;
