-- Normalize the old Cake category into Patisserie.
-- This script only updates products.category. It does not delete products,
-- recipes, schema components, lots, suppliers, receptions, or production rows.

begin;

do $$
declare
  v_before_total integer;
  v_before_cake integer;
  v_after_total integer;
  v_after_cake integer;
  v_updated integer;
begin
  select count(*) into v_before_total
  from public.products;

  select count(*) into v_before_cake
  from public.products
  where category = 'cake';

  update public.products
  set category = 'patisserie'
  where category = 'cake';

  get diagnostics v_updated = row_count;

  select count(*) into v_after_total
  from public.products;

  select count(*) into v_after_cake
  from public.products
  where category = 'cake';

  if v_after_total <> v_before_total then
    raise exception
      'Safety check failed: product count changed from % to %',
      v_before_total,
      v_after_total;
  end if;

  if v_updated <> v_before_cake then
    raise exception
      'Safety check failed: expected to update % cake products, updated %',
      v_before_cake,
      v_updated;
  end if;

  if v_after_cake <> 0 then
    raise exception
      'Safety check failed: % products still have category cake',
      v_after_cake;
  end if;

  raise notice
    'Cake category normalization complete. Products before: %, updated: %, products after: %, remaining cake: %',
    v_before_total,
    v_updated,
    v_after_total,
    v_after_cake;
end $$;

alter table public.products drop constraint if exists products_category_check;
alter table public.products add constraint products_category_check
  check (
    category is null
    or category in ('beldi', 'boulangerie', 'patisserie', 'viennoiserie')
  );

commit;

select
  count(*) filter (where category = 'cake') as remaining_cake_products,
  count(*) filter (where category = 'patisserie') as patisserie_products,
  count(*) as total_products
from public.products;
