do $$ begin
  alter table products add column category text;
exception when duplicate_column then null;
end $$;

alter table products drop constraint if exists products_category_check;
alter table products add constraint products_category_check
  check (
    category is null
    or category in ('beldi', 'boulangerie', 'cake', 'patisserie', 'viennoiserie')
  );

alter table production_batches alter column quantity_produced drop not null;
alter table production_batches alter column unit drop not null;
alter table production_batches drop constraint if exists production_batches_quantity_produced_check;
alter table production_batches drop constraint if exists production_batches_quantity_produced_optional;
alter table production_batches add constraint production_batches_quantity_produced_optional
  check (quantity_produced is null or quantity_produced > 0);

alter table production_consumptions alter column quantity_used drop not null;
alter table production_consumptions alter column unit drop not null;
alter table production_consumptions drop constraint if exists production_consumptions_quantity_used_check;
alter table production_consumptions drop constraint if exists production_consumptions_quantity_used_optional;
alter table production_consumptions add constraint production_consumptions_quantity_used_optional
  check (quantity_used is null or quantity_used > 0);

create or replace view production_batch_history as
select
  pb.id,
  pb.production_date,
  pb.product_id,
  p.code as product_code,
  p.name as product_name,
  p.type as product_type,
  p.category as product_category,
  pb.generated_lot,
  pb.responsible_name,
  pb.operation,
  pb.status,
  pb.observations,
  count(pc.id)::integer as consumed_lot_count,
  pb.created_at
from production_batches pb
join products p on p.id = pb.product_id
left join production_consumptions pc on pc.production_batch_id = pb.id
group by
  pb.id,
  pb.production_date,
  pb.product_id,
  p.code,
  p.name,
  p.type,
  p.category,
  pb.generated_lot,
  pb.responsible_name,
  pb.operation,
  pb.status,
  pb.observations,
  pb.created_at
order by pb.production_date desc, pb.created_at desc;

create or replace view production_consumption_details as
select
  pc.id,
  pc.production_batch_id,
  l.id as lot_id,
  l.lot_number,
  l.product_id as consumed_product_id,
  p.code as consumed_product_code,
  p.name as consumed_product_name,
  p.type as consumed_product_type,
  p.category as consumed_product_category,
  l.supplier_lot,
  l.source_type,
  l.created_at as lot_created_at,
  pc.created_at as linked_at
from production_consumptions pc
join lots l on l.id = pc.consumed_lot_id
join products p on p.id = l.product_id;

create or replace function create_production_with_traceability(
  p_production_date timestamptz,
  p_product_id uuid,
  p_generated_lot text,
  p_responsible_name text,
  p_operation text,
  p_observations text,
  p_consumed_lot_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product products;
  v_recipe_id uuid;
  v_batch_id uuid;
  v_consumed_lot_ids uuid[] := coalesce(p_consumed_lot_ids, array[]::uuid[]);
  v_missing_count integer;
  v_invalid_count integer;
begin
  select *
  into v_product
  from products
  where id = p_product_id
    and is_active = true
    and type in ('finished', 'semi_finished');

  if not found then
    raise exception 'Production product does not exist or is not manufactured.';
  end if;

  select id
  into v_recipe_id
  from recipes
  where product_id = p_product_id
    and is_active = true
  limit 1;

  if v_recipe_id is null then
    raise exception 'Production product must have an active blueprint.';
  end if;

  if nullif(trim(coalesce(p_generated_lot, '')), '') is null then
    raise exception 'Generated lot is required.';
  end if;

  if array_length(v_consumed_lot_ids, 1) is null then
    raise exception 'At least one consumed lot is required.';
  end if;

  with required_components as (
    select rc.component_product_id
    from recipe_components rc
    where rc.recipe_id = v_recipe_id
  ),
  selected_lots as (
    select distinct l.id, l.product_id
    from unnest(v_consumed_lot_ids) as selected(lot_id)
    join lots l on l.id = selected.lot_id
    where l.lot_status = 'available'
      and l.quality_status = 'conforme'
  )
  select count(*)
  into v_missing_count
  from required_components rc
  where not exists (
    select 1
    from selected_lots sl
    where sl.product_id = rc.component_product_id
  );

  if v_missing_count > 0 then
    raise exception 'Every blueprint component must have a confirmed lot.';
  end if;

  with required_components as (
    select rc.component_product_id
    from recipe_components rc
    where rc.recipe_id = v_recipe_id
  ),
  selected_lots as (
    select distinct selected.lot_id, l.product_id
    from unnest(v_consumed_lot_ids) as selected(lot_id)
    left join lots l on l.id = selected.lot_id
      and l.lot_status = 'available'
      and l.quality_status = 'conforme'
  )
  select count(*)
  into v_invalid_count
  from selected_lots sl
  left join required_components rc on rc.component_product_id = sl.product_id
  where sl.product_id is null
     or rc.component_product_id is null;

  if v_invalid_count > 0 then
    raise exception 'Selected lots must be available lots for the active blueprint components.';
  end if;

  insert into production_batches (
    production_date,
    product_id,
    generated_lot,
    quantity_produced,
    unit,
    responsible_name,
    operation,
    observations,
    status
  )
  values (
    coalesce(p_production_date, now()),
    p_product_id,
    trim(p_generated_lot),
    null,
    null,
    nullif(trim(coalesce(p_responsible_name, '')), ''),
    nullif(trim(coalesce(p_operation, '')), ''),
    nullif(trim(coalesce(p_observations, '')), ''),
    'validated'
  )
  returning id into v_batch_id;

  insert into lots (
    product_id,
    lot_number,
    quantity_initial,
    quantity_available,
    unit,
    quality_status,
    lot_status,
    source_type,
    source_id
  )
  values (
    p_product_id,
    trim(p_generated_lot),
    0,
    0,
    v_product.unit,
    'conforme',
    'available',
    'fabrication',
    v_batch_id
  );

  insert into production_consumptions (
    production_batch_id,
    consumed_lot_id,
    quantity_used,
    unit
  )
  select distinct
    v_batch_id,
    selected.lot_id,
    null,
    null
  from unnest(v_consumed_lot_ids) as selected(lot_id);

  return v_batch_id;
end;
$$;

grant select on production_batch_history, production_consumption_details to anon, authenticated;
grant execute on function create_production_with_traceability(timestamptz, uuid, text, text, text, text, uuid[]) to anon, authenticated;
