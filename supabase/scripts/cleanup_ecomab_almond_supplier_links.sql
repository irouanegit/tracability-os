-- Makes ECOMAB the only active supplier link for its almond variants.
-- Run manually in Supabase SQL editor.
--
-- Included because user confirmed ECOMAB supplies:
-- - Amande effilee
-- - Amande hachee
-- - Amande poudre
--
-- Not included:
-- - Amande noire. It needs a separate business decision because it is linked to
--   BELDI, DIVERS, and MANARA PRODUCTS in the review output.

begin;

do $$
declare
  v_missing text[];
begin
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
  )
  select array_agg(expected.material_label order by expected.material_label)
  into v_missing
  from expected
  left join products product
    on product.id = expected.product_id
   and product.type = 'raw'
   and product.is_active = true
  where product.id is null
     or not exists (select 1 from ecomab);

  if coalesce(array_length(v_missing, 1), 0) > 0 then
    raise exception 'Missing active almond product(s), or active ECOMAB supplier not found. Aborting: %', v_missing;
  end if;
end $$;

-- Ensure the ECOMAB link exists.
with expected(product_id) as (
  values
    ('e7575d08-32ca-4706-82f0-58795a23237b'::uuid),
    ('5aecef5b-1684-40d7-b379-e33d3ddde825'::uuid),
    ('f3f9df25-8269-4f49-8fbb-afdfd3b9db5d'::uuid)
),
ecomab as (
  select id
  from suppliers
  where is_active = true
    and lower(trim(name)) = lower('ECOMAB')
  limit 1
)
insert into supplier_raw_materials (supplier_id, product_id)
select ecomab.id, expected.product_id
from expected
cross join ecomab
on conflict (supplier_id, product_id) do nothing;

-- Remove wrong supplier links for these ECOMAB-owned materials.
with expected(product_id) as (
  values
    ('e7575d08-32ca-4706-82f0-58795a23237b'::uuid),
    ('5aecef5b-1684-40d7-b379-e33d3ddde825'::uuid),
    ('f3f9df25-8269-4f49-8fbb-afdfd3b9db5d'::uuid)
),
ecomab as (
  select id
  from suppliers
  where is_active = true
    and lower(trim(name)) = lower('ECOMAB')
  limit 1
),
removed as (
  delete from supplier_raw_materials supplier_link
  using expected, ecomab
  where supplier_link.product_id = expected.product_id
    and supplier_link.supplier_id <> ecomab.id
  returning supplier_link.product_id, supplier_link.supplier_id
)
select
  product.name as material,
  supplier.name as removed_supplier
from removed
join products product on product.id = removed.product_id
join suppliers supplier on supplier.id = removed.supplier_id
order by product.name, supplier.name;

commit;

-- Review only: historical receptions/lots from non-ECOMAB suppliers for these
-- product IDs are not changed automatically because changing a reception's
-- supplier can affect historical traceability.
with expected(product_id) as (
  values
    ('e7575d08-32ca-4706-82f0-58795a23237b'::uuid),
    ('5aecef5b-1684-40d7-b379-e33d3ddde825'::uuid),
    ('f3f9df25-8269-4f49-8fbb-afdfd3b9db5d'::uuid)
),
ecomab as (
  select id
  from suppliers
  where is_active = true
    and lower(trim(name)) = lower('ECOMAB')
  limit 1
)
select
  product.name as material,
  supplier.name as historical_supplier,
  count(distinct reception.id) as reception_count
from raw_material_receptions reception
join expected on expected.product_id = reception.product_id
join products product on product.id = reception.product_id
join suppliers supplier on supplier.id = reception.supplier_id
cross join ecomab
where reception.supplier_id <> ecomab.id
group by product.name, supplier.name
order by product.name, supplier.name;
