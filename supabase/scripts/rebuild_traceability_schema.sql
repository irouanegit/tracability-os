-- Full destructive rebuild for the traceability app schema.
-- Run this in the Supabase SQL editor when test data/schema can be wiped.
-- It drops app schema objects, recreates migrations 001-011, and ends with authenticated-only access.


-- ============================================================
-- reset_traceability_schema.sql
-- ============================================================
-- Destructive schema reset for the traceability app.
-- This drops app tables, views, functions, policies, sequences, and enum types.
-- It keeps Supabase Auth users, storage, and Supabase-managed schemas intact.
-- After running this, rerun migrations 001 through 011 in order.

begin;

drop view if exists
  production_consumption_details,
  production_batch_history,
  reception_batch_lines,
  reception_batch_history,
  supplier_raw_material_catalog,
  product_lot_stock,
  product_schema_components,
  recent_raw_material_receptions,
  product_catalog
cascade;

drop function if exists create_production_with_traceability(timestamptz, uuid, text, text, text, text, uuid[]) cascade;
drop function if exists update_raw_material_reception_batch(uuid, uuid[], uuid, timestamptz, text, jsonb) cascade;
drop function if exists create_raw_material_reception_batch(uuid, timestamptz, text, jsonb) cascade;
drop function if exists save_product_schema(uuid, uuid[], jsonb, jsonb, jsonb) cascade;
drop function if exists save_product_schema(uuid, uuid[]) cascade;
drop function if exists create_raw_material_reception(
  timestamptz,
  uuid,
  uuid,
  text,
  numeric,
  text,
  date,
  numeric,
  quality_status,
  quality_status,
  text,
  text,
  text
) cascade;
drop function if exists enforce_supplier_raw_material_product_type() cascade;

drop table if exists
  production_consumptions,
  production_batches,
  raw_material_receptions,
  reception_batches,
  supplier_raw_materials,
  recipe_components,
  recipes,
  lots,
  suppliers,
  products
cascade;

drop sequence if exists reception_batch_sequence cascade;
drop sequence if exists raw_material_lot_sequence cascade;

drop type if exists lot_status cascade;
drop type if exists quality_status cascade;
drop type if exists recipe_status cascade;
drop type if exists product_type cascade;

commit;


-- ============================================================
-- 001_initial_traceability_schema.sql
-- ============================================================
create extension if not exists pgcrypto;

do $$ begin
  create type product_type as enum ('raw', 'semi_finished', 'finished');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type recipe_status as enum ('active', 'missing', 'not_required');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type quality_status as enum ('conforme', 'non_conforme');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type lot_status as enum ('available', 'reserved', 'consumed', 'quarantine', 'rejected');
exception when duplicate_object then null;
end $$;

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  type product_type not null,
  unit text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  contact_name text,
  phone text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  version integer not null default 1,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  unique (product_id, version)
);

create table if not exists recipe_components (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  component_product_id uuid not null references products(id),
  quantity numeric(12, 3) not null check (quantity > 0),
  unit text not null,
  mandatory boolean not null default true,
  created_at timestamptz not null default now(),
  check (recipe_id is not null)
);

create table if not exists lots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  lot_number text not null,
  supplier_id uuid references suppliers(id),
  supplier_lot text,
  quantity_initial numeric(12, 3) not null check (quantity_initial >= 0),
  quantity_available numeric(12, 3) not null check (quantity_available >= 0),
  unit text not null,
  expiry_date date,
  quality_status quality_status not null default 'conforme',
  lot_status lot_status not null default 'available',
  source_type text not null check (source_type in ('reception', 'fabrication')),
  source_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists raw_material_receptions (
  id uuid primary key default gen_random_uuid(),
  reception_date timestamptz not null default now(),
  product_id uuid not null references products(id),
  supplier_id uuid not null references suppliers(id),
  supplier_lot text not null,
  internal_lot text not null unique,
  quantity numeric(12, 3) not null check (quantity > 0),
  unit text not null,
  expiry_date date,
  transport_temperature_c numeric(6, 2),
  temperature_status quality_status not null default 'conforme',
  hygiene_status quality_status not null default 'conforme',
  status quality_status not null default 'conforme',
  nonconformity_reason text,
  corrective_action text,
  observations text,
  created_at timestamptz not null default now()
);

create table if not exists production_batches (
  id uuid primary key default gen_random_uuid(),
  production_date timestamptz not null default now(),
  product_id uuid not null references products(id),
  generated_lot text not null,
  quantity_produced numeric(12, 3) not null check (quantity_produced > 0),
  unit text not null,
  responsible_name text,
  operation text,
  status text not null default 'draft' check (status in ('draft', 'validated', 'cancelled')),
  observations text,
  traceability_snapshot jsonb,
  created_at timestamptz not null default now()
);

create table if not exists production_consumptions (
  id uuid primary key default gen_random_uuid(),
  production_batch_id uuid not null references production_batches(id) on delete cascade,
  consumed_lot_id uuid not null references lots(id),
  quantity_used numeric(12, 3) not null check (quantity_used > 0),
  unit text not null,
  created_at timestamptz not null default now()
);

create sequence if not exists raw_material_lot_sequence start 1024;

create or replace view product_catalog as
select
  p.id,
  p.code,
  p.name,
  p.type,
  p.unit,
  case
    when p.type = 'raw' then 'not_required'::recipe_status
    when exists (
      select 1 from recipes r
      where r.product_id = p.id and r.is_active = true
    ) then 'active'::recipe_status
    else 'missing'::recipe_status
  end as recipe_status,
  coalesce((
    select count(*)::integer
    from recipes r
    join recipe_components rc on rc.recipe_id = r.id
    where r.product_id = p.id and r.is_active = true
  ), 0) as component_count,
  p.updated_at
from products p
where p.is_active = true;

create or replace view recent_raw_material_receptions as
select
  r.id,
  r.reception_date,
  p.name as product_name,
  s.name as supplier_name,
  r.supplier_lot,
  r.internal_lot,
  r.quantity,
  r.unit,
  r.expiry_date,
  r.status
from raw_material_receptions r
join products p on p.id = r.product_id
join suppliers s on s.id = r.supplier_id
order by r.reception_date desc;

create or replace function create_raw_material_reception(
  p_reception_date timestamptz,
  p_product_id uuid,
  p_supplier_id uuid,
  p_supplier_lot text,
  p_quantity numeric,
  p_unit text,
  p_expiry_date date,
  p_transport_temperature_c numeric,
  p_temperature_status quality_status,
  p_hygiene_status quality_status,
  p_nonconformity_reason text,
  p_corrective_action text,
  p_observations text
)
returns raw_material_receptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_internal_lot text;
  v_status quality_status;
  v_reception raw_material_receptions;
begin
  v_internal_lot := 'MP-' || to_char(coalesce(p_reception_date, now()), 'YYYY') || '-' || lpad(nextval('raw_material_lot_sequence')::text, 5, '0');
  v_status := case
    when p_temperature_status = 'non_conforme' or p_hygiene_status = 'non_conforme' then 'non_conforme'::quality_status
    else 'conforme'::quality_status
  end;

  insert into raw_material_receptions (
    reception_date,
    product_id,
    supplier_id,
    supplier_lot,
    internal_lot,
    quantity,
    unit,
    expiry_date,
    transport_temperature_c,
    temperature_status,
    hygiene_status,
    status,
    nonconformity_reason,
    corrective_action,
    observations
  )
  values (
    coalesce(p_reception_date, now()),
    p_product_id,
    p_supplier_id,
    p_supplier_lot,
    v_internal_lot,
    p_quantity,
    p_unit,
    p_expiry_date,
    p_transport_temperature_c,
    coalesce(p_temperature_status, 'conforme'::quality_status),
    coalesce(p_hygiene_status, 'conforme'::quality_status),
    v_status,
    p_nonconformity_reason,
    p_corrective_action,
    p_observations
  )
  returning * into v_reception;

  insert into lots (
    product_id,
    lot_number,
    supplier_id,
    supplier_lot,
    quantity_initial,
    quantity_available,
    unit,
    expiry_date,
    quality_status,
    lot_status,
    source_type,
    source_id
  )
  values (
    p_product_id,
    v_internal_lot,
    p_supplier_id,
    p_supplier_lot,
    p_quantity,
    p_quantity,
    p_unit,
    p_expiry_date,
    v_status,
    case when v_status = 'non_conforme' then 'quarantine'::lot_status else 'available'::lot_status end,
    'reception',
    v_reception.id
  );

  return v_reception;
end;
$$;

alter table products enable row level security;
alter table suppliers enable row level security;
alter table recipes enable row level security;
alter table recipe_components enable row level security;
alter table lots enable row level security;
alter table raw_material_receptions enable row level security;
alter table production_batches enable row level security;
alter table production_consumptions enable row level security;

do $$ begin
  create policy "prototype_products_read_write" on products for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "prototype_suppliers_read_write" on suppliers for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "prototype_recipes_read" on recipes for select to anon, authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "prototype_recipe_components_read" on recipe_components for select to anon, authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "prototype_lots_read_write" on lots for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "prototype_receptions_read_write" on raw_material_receptions for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "prototype_batches_read_write" on production_batches for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "prototype_consumptions_read_write" on production_consumptions for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

grant usage on schema public to anon, authenticated;
grant select on product_catalog to anon, authenticated;
grant select on recent_raw_material_receptions to anon, authenticated;
grant select, insert, update on products, suppliers to anon, authenticated;
grant select on recipes, recipe_components to anon, authenticated;
grant select, insert, update on lots, raw_material_receptions, production_batches, production_consumptions to anon, authenticated;
grant usage, select on sequence raw_material_lot_sequence to anon, authenticated;
grant execute on function create_raw_material_reception(
  timestamptz,
  uuid,
  uuid,
  text,
  numeric,
  text,
  date,
  numeric,
  quality_status,
  quality_status,
  text,
  text,
  text
) to anon, authenticated;


-- ============================================================
-- 002_allow_testing_free_text_catalog_insert.sql
-- ============================================================
drop policy if exists "prototype_products_read" on products;
drop policy if exists "prototype_suppliers_read" on suppliers;

do $$ begin
  create policy "prototype_products_read_write" on products for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "prototype_suppliers_read_write" on suppliers for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

grant select, insert, update on products, suppliers to anon, authenticated;


-- ============================================================
-- 003_remove_demo_seed_catalog.sql
-- ============================================================
delete from recipe_components rc
using recipes r
join products rp on rp.id = r.product_id
where rc.recipe_id = r.id
  and rp.code in ('SF-PFER', 'SF-BGTR-PATE', 'PF-BGTR')
  and not exists (
    select 1 from production_batches pb where pb.product_id = rp.id
  );

delete from recipe_components rc
using products cp
where rc.component_product_id = cp.id
  and cp.code in (
    'MP-FAR-T65',
    'MP-EAU',
    'MP-LEV',
    'MP-BTR',
    'MP-SEL',
    'SF-PFER',
    'SF-BGTR-PATE',
    'SF-CRPAT',
    'PF-BGTR',
    'PF-CRPB'
  )
  and not exists (
    select 1 from production_consumptions pc
    join lots l on l.id = pc.consumed_lot_id
    where l.product_id = cp.id
  );

delete from recipes r
using products p
where r.product_id = p.id
  and p.code in ('SF-PFER', 'SF-BGTR-PATE', 'PF-BGTR')
  and r.notes = 'Recette initiale prototype'
  and not exists (
    select 1 from production_batches pb where pb.product_id = p.id
  );

delete from products p
where p.code in (
    'MP-FAR-T65',
    'MP-EAU',
    'MP-LEV',
    'MP-BTR',
    'MP-SEL',
    'SF-PFER',
    'SF-BGTR-PATE',
    'SF-CRPAT',
    'PF-BGTR',
    'PF-CRPB'
  )
  and not exists (select 1 from lots l where l.product_id = p.id)
  and not exists (select 1 from raw_material_receptions r where r.product_id = p.id)
  and not exists (select 1 from production_batches pb where pb.product_id = p.id)
  and not exists (select 1 from recipe_components rc where rc.component_product_id = p.id);

delete from suppliers s
where s.name in ('Grands Moulins', 'Laiterie Centrale', 'BioYeast', 'Salines Pro')
  and not exists (select 1 from lots l where l.supplier_id = s.id)
  and not exists (select 1 from raw_material_receptions r where r.supplier_id = s.id);


-- ============================================================
-- 004_fabrication_schema_workspace.sql
-- ============================================================
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

alter table recipe_components alter column quantity drop not null;
alter table recipe_components alter column unit drop not null;
alter table recipe_components drop constraint if exists recipe_components_quantity_check;
alter table recipe_components drop constraint if exists recipe_components_quantity_positive;
alter table recipe_components add constraint recipe_components_quantity_positive
  check (quantity is null or quantity > 0);

create unique index if not exists recipe_components_recipe_component_idx
  on recipe_components (recipe_id, component_product_id);

drop view if exists product_catalog cascade;

create or replace view product_catalog as
select
  p.id,
  p.code,
  p.name,
  p.type,
  p.category,
  p.unit,
  case
    when p.type = 'raw' then 'not_required'::recipe_status
    when exists (
      select 1 from recipes r
      where r.product_id = p.id and r.is_active = true
    ) then 'active'::recipe_status
    else 'missing'::recipe_status
  end as recipe_status,
  coalesce((
    select count(*)::integer
    from recipes r
    join recipe_components rc on rc.recipe_id = r.id
    where r.product_id = p.id and r.is_active = true
  ), 0) as component_count,
  p.updated_at
from products p
where p.is_active = true;

create or replace view product_schema_components as
select
  r.product_id as target_product_id,
  r.id as recipe_id,
  r.version,
  rc.component_product_id,
  p.code as component_code,
  p.name as component_name,
  p.type as component_type,
  p.category as component_category,
  p.unit as component_unit,
  case
    when p.type = 'raw' then 'not_required'::recipe_status
    when exists (
      select 1 from recipes child_recipe
      where child_recipe.product_id = p.id and child_recipe.is_active = true
    ) then 'active'::recipe_status
    else 'missing'::recipe_status
  end as component_recipe_status,
  coalesce((
    select count(*)::integer
    from recipes child_recipe
    join recipe_components child_component on child_component.recipe_id = child_recipe.id
    where child_recipe.product_id = p.id and child_recipe.is_active = true
  ), 0) as component_count
from recipes r
join recipe_components rc on rc.recipe_id = r.id
join products p on p.id = rc.component_product_id
where r.is_active = true
  and p.is_active = true;

create or replace view product_lot_stock as
select
  p.id as product_id,
  count(l.id)::integer as available_lot_count,
  coalesce(sum(l.quantity_available), 0)::numeric(12, 3) as total_available,
  p.unit
from products p
left join lots l on l.product_id = p.id
  and l.lot_status = 'available'
  and l.quality_status = 'conforme'
  and l.quantity_available > 0
where p.is_active = true
group by p.id, p.unit;

create or replace function save_product_schema(
  p_target_product_id uuid,
  p_component_product_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target products;
  v_component_ids uuid[] := coalesce(p_component_product_ids, array[]::uuid[]);
  v_component_count integer;
  v_distinct_component_count integer;
  v_invalid_component_count integer;
  v_cycle_exists boolean;
  v_next_version integer;
  v_recipe_id uuid;
begin
  select *
  into v_target
  from products
  where id = p_target_product_id
    and is_active = true;

  if not found then
    raise exception 'Target product does not exist or is inactive.';
  end if;

  if v_target.type = 'raw' then
    raise exception 'Raw materials cannot have fabrication schemas.';
  end if;

  select count(*), count(distinct component_id)
  into v_component_count, v_distinct_component_count
  from unnest(v_component_ids) as component(component_id);

  if v_component_count = 0 then
    raise exception 'A schema must contain at least one component.';
  end if;

  if v_component_count <> v_distinct_component_count then
    raise exception 'Schema components cannot contain duplicates.';
  end if;

  if exists (
    select 1
    from unnest(v_component_ids) as component(component_id)
    where component.component_id is null
  ) then
    raise exception 'Schema components cannot contain null values.';
  end if;

  if p_target_product_id = any(v_component_ids) then
    raise exception 'A product cannot be linked to itself.';
  end if;

  select count(*)
  into v_invalid_component_count
  from unnest(v_component_ids) as component(component_id)
  left join products p on p.id = component.component_id and p.is_active = true
  where p.id is null
    or p.type not in ('raw', 'semi_finished');

  if v_invalid_component_count > 0 then
    raise exception 'Components must be active raw materials or semi-finished products.';
  end if;

  with recursive downstream(product_id, path) as (
    select component_id, array[component_id]
    from unnest(v_component_ids) as component(component_id)
    union all
    select rc.component_product_id, downstream.path || rc.component_product_id
    from downstream
    join recipes r on r.product_id = downstream.product_id and r.is_active = true
    join recipe_components rc on rc.recipe_id = r.id
    where not rc.component_product_id = any(downstream.path)
  )
  select exists (
    select 1
    from downstream
    where product_id = p_target_product_id
  )
  into v_cycle_exists;

  if v_cycle_exists then
    raise exception 'This schema would create a circular semi-finished dependency.';
  end if;

  update recipes
  set is_active = false
  where product_id = p_target_product_id
    and is_active = true;

  select coalesce(max(version), 0) + 1
  into v_next_version
  from recipes
  where product_id = p_target_product_id;

  insert into recipes (product_id, version, is_active, notes)
  values (p_target_product_id, v_next_version, true, 'Schema workspace')
  returning id into v_recipe_id;

  insert into recipe_components (recipe_id, component_product_id, quantity, unit)
  select v_recipe_id, component_id, null, null
  from unnest(v_component_ids) as component(component_id);

  update products
  set updated_at = now()
  where id = p_target_product_id;

  return v_recipe_id;
end;
$$;

grant select on product_catalog to anon, authenticated;
grant select on product_schema_components to anon, authenticated;
grant select on product_lot_stock to anon, authenticated;
grant execute on function save_product_schema(uuid, uuid[]) to anon, authenticated;


-- ============================================================
-- 005_recipe_diagram_editor.sql
-- ============================================================
do $$ begin
  alter table recipes add column diagram_nodes jsonb not null default '[]'::jsonb;
exception when duplicate_column then null;
end $$;

do $$ begin
  alter table recipes add column diagram_edges jsonb not null default '[]'::jsonb;
exception when duplicate_column then null;
end $$;

do $$ begin
  alter table recipes add column diagram_viewport jsonb;
exception when duplicate_column then null;
end $$;

drop function if exists save_product_schema(uuid, uuid[]);
drop function if exists save_product_schema(uuid, uuid[], jsonb, jsonb, jsonb);

create or replace function save_product_schema(
  p_target_product_id uuid,
  p_component_product_ids uuid[],
  p_diagram_nodes jsonb default '[]'::jsonb,
  p_diagram_edges jsonb default '[]'::jsonb,
  p_diagram_viewport jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target products;
  v_component_ids uuid[] := coalesce(p_component_product_ids, array[]::uuid[]);
  v_component_count integer;
  v_distinct_component_count integer;
  v_invalid_component_count integer;
  v_cycle_exists boolean;
  v_next_version integer;
  v_recipe_id uuid;
begin
  select *
  into v_target
  from products
  where id = p_target_product_id
    and is_active = true;

  if not found then
    raise exception 'Target product does not exist or is inactive.';
  end if;

  if v_target.type = 'raw' then
    raise exception 'Raw materials cannot have fabrication schemas.';
  end if;

  select count(*), count(distinct component_id)
  into v_component_count, v_distinct_component_count
  from unnest(v_component_ids) as component(component_id);

  if v_component_count = 0 then
    raise exception 'A schema must contain at least one component.';
  end if;

  if v_component_count <> v_distinct_component_count then
    raise exception 'Schema components cannot contain duplicates.';
  end if;

  if exists (
    select 1
    from unnest(v_component_ids) as component(component_id)
    where component.component_id is null
  ) then
    raise exception 'Schema components cannot contain null values.';
  end if;

  if p_target_product_id = any(v_component_ids) then
    raise exception 'A product cannot be linked to itself.';
  end if;

  select count(*)
  into v_invalid_component_count
  from unnest(v_component_ids) as component(component_id)
  left join products p on p.id = component.component_id and p.is_active = true
  where p.id is null
    or p.type not in ('raw', 'semi_finished');

  if v_invalid_component_count > 0 then
    raise exception 'Components must be active raw materials or semi-finished products.';
  end if;

  with recursive downstream(product_id, path) as (
    select component_id, array[component_id]
    from unnest(v_component_ids) as component(component_id)
    union all
    select rc.component_product_id, downstream.path || rc.component_product_id
    from downstream
    join recipes r on r.product_id = downstream.product_id and r.is_active = true
    join recipe_components rc on rc.recipe_id = r.id
    where not rc.component_product_id = any(downstream.path)
  )
  select exists (
    select 1
    from downstream
    where product_id = p_target_product_id
  )
  into v_cycle_exists;

  if v_cycle_exists then
    raise exception 'This schema would create a circular semi-finished dependency.';
  end if;

  update recipes
  set is_active = false
  where product_id = p_target_product_id
    and is_active = true;

  select coalesce(max(version), 0) + 1
  into v_next_version
  from recipes
  where product_id = p_target_product_id;

  insert into recipes (
    product_id,
    version,
    is_active,
    notes,
    diagram_nodes,
    diagram_edges,
    diagram_viewport
  )
  values (
    p_target_product_id,
    v_next_version,
    true,
    'Diagram editor',
    coalesce(p_diagram_nodes, '[]'::jsonb),
    coalesce(p_diagram_edges, '[]'::jsonb),
    p_diagram_viewport
  )
  returning id into v_recipe_id;

  insert into recipe_components (recipe_id, component_product_id, quantity, unit)
  select v_recipe_id, component_id, null, null
  from unnest(v_component_ids) as component(component_id);

  update products
  set updated_at = now()
  where id = p_target_product_id;

  return v_recipe_id;
end;
$$;

grant execute on function save_product_schema(uuid, uuid[], jsonb, jsonb, jsonb) to anon, authenticated;


-- ============================================================
-- 006_allow_schema_components_without_quantities.sql
-- ============================================================
alter table recipe_components alter column quantity drop not null;
alter table recipe_components alter column unit drop not null;

alter table recipe_components drop constraint if exists recipe_components_quantity_check;
alter table recipe_components drop constraint if exists recipe_components_quantity_positive;

alter table recipe_components add constraint recipe_components_quantity_positive
  check (quantity is null or quantity > 0);


-- ============================================================
-- 007_reception_batches_and_supplier_materials.sql
-- ============================================================
create sequence if not exists reception_batch_sequence start 1001;

create table if not exists supplier_raw_materials (
  supplier_id uuid not null references suppliers(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (supplier_id, product_id)
);

create table if not exists reception_batches (
  id uuid primary key default gen_random_uuid(),
  batch_number text not null unique,
  supplier_id uuid not null references suppliers(id),
  reception_date timestamptz not null default now(),
  status quality_status not null default 'conforme',
  observations text,
  created_at timestamptz not null default now()
);

do $$ begin
  alter table raw_material_receptions add column batch_id uuid references reception_batches(id);
exception when duplicate_column then null;
end $$;

create or replace function enforce_supplier_raw_material_product_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from products p
    where p.id = new.product_id
      and p.type = 'raw'
      and p.is_active = true
  ) then
    raise exception 'Supplier materials must be active raw-material products.';
  end if;

  return new;
end;
$$;

drop trigger if exists supplier_raw_materials_product_type_trigger on supplier_raw_materials;
create trigger supplier_raw_materials_product_type_trigger
before insert or update on supplier_raw_materials
for each row execute function enforce_supplier_raw_material_product_type();

create or replace view supplier_raw_material_catalog as
select
  srm.supplier_id,
  p.id as product_id,
  p.code,
  p.name,
  p.type,
  p.unit,
  p.updated_at
from supplier_raw_materials srm
join products p on p.id = srm.product_id
where p.is_active = true
  and p.type = 'raw';

create or replace view reception_batch_history as
select
  b.id,
  b.batch_number,
  b.reception_date,
  b.supplier_id,
  s.name as supplier_name,
  b.status,
  b.observations,
  count(r.id)::integer as article_count,
  coalesce(
    string_agg(distinct trim(to_char(r.quantity, 'FM999999990.###') || ' ' || r.unit), ', '),
    '--'
  ) as quantity_summary,
  b.created_at
from reception_batches b
join suppliers s on s.id = b.supplier_id
left join raw_material_receptions r on r.batch_id = b.id
group by b.id, s.name
order by b.reception_date desc, s.name;

create or replace view reception_batch_lines as
select
  r.id,
  r.batch_id,
  r.reception_date,
  r.product_id,
  p.code as product_code,
  p.name as product_name,
  r.supplier_id,
  s.name as supplier_name,
  r.supplier_lot,
  r.internal_lot,
  r.quantity,
  r.unit,
  r.expiry_date,
  r.transport_temperature_c,
  r.temperature_status,
  r.hygiene_status,
  r.status,
  r.observations
from raw_material_receptions r
join products p on p.id = r.product_id
join suppliers s on s.id = r.supplier_id
where r.batch_id is not null
order by r.created_at, p.name;

create or replace function create_raw_material_reception_batch(
  p_supplier_id uuid,
  p_reception_date timestamptz,
  p_observations text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_batch_number text;
  v_reception_date timestamptz := coalesce(p_reception_date, now());
  v_line jsonb;
  v_internal_lot text;
  v_line_status quality_status;
  v_batch_status quality_status := 'conforme'::quality_status;
  v_reception raw_material_receptions;
  v_product_id uuid;
  v_supplier_lot text;
  v_quantity numeric;
  v_unit text;
  v_expiry_date date;
  v_transport_temperature_c numeric;
  v_temperature_status quality_status;
  v_hygiene_status quality_status;
  v_line_observations text;
begin
  if p_supplier_id is null then
    raise exception 'Supplier is required.';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one reception line is required.';
  end if;

  v_batch_number := 'REC-' || to_char(v_reception_date, 'YYYYMMDD') || '-' || lpad(nextval('reception_batch_sequence')::text, 5, '0');

  insert into reception_batches (
    batch_number,
    supplier_id,
    reception_date,
    status,
    observations
  )
  values (
    v_batch_number,
    p_supplier_id,
    v_reception_date,
    'conforme'::quality_status,
    nullif(trim(coalesce(p_observations, '')), '')
  )
  returning id into v_batch_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_product_id := nullif(v_line->>'product_id', '')::uuid;
    v_supplier_lot := nullif(trim(coalesce(v_line->>'supplier_lot', '')), '');
    v_quantity := nullif(v_line->>'quantity', '')::numeric;
    v_unit := nullif(trim(coalesce(v_line->>'unit', '')), '');
    v_expiry_date := nullif(v_line->>'expiry_date', '')::date;
    v_transport_temperature_c := nullif(v_line->>'transport_temperature_c', '')::numeric;
    v_temperature_status := coalesce(nullif(v_line->>'temperature_status', '')::quality_status, 'conforme'::quality_status);
    v_hygiene_status := coalesce(nullif(v_line->>'hygiene_status', '')::quality_status, 'conforme'::quality_status);
    v_line_observations := nullif(trim(coalesce(v_line->>'observations', '')), '');

    if v_product_id is null then
      raise exception 'Line product is required.';
    end if;

    if not exists (
      select 1
      from supplier_raw_materials srm
      where srm.supplier_id = p_supplier_id
        and srm.product_id = v_product_id
    ) then
      raise exception 'Product is not assigned to this supplier.';
    end if;

    if v_supplier_lot is null then
      raise exception 'Supplier lot is required.';
    end if;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantity must be greater than zero.';
    end if;

    if v_unit is null then
      raise exception 'Unit is required.';
    end if;

    v_internal_lot := 'MP-' || to_char(v_reception_date, 'YYYY') || '-' || lpad(nextval('raw_material_lot_sequence')::text, 5, '0');
    v_line_status := case
      when v_temperature_status = 'non_conforme' or v_hygiene_status = 'non_conforme' then 'non_conforme'::quality_status
      else 'conforme'::quality_status
    end;

    if v_line_status = 'non_conforme' then
      v_batch_status := 'non_conforme'::quality_status;
    end if;

    insert into raw_material_receptions (
      batch_id,
      reception_date,
      product_id,
      supplier_id,
      supplier_lot,
      internal_lot,
      quantity,
      unit,
      expiry_date,
      transport_temperature_c,
      temperature_status,
      hygiene_status,
      status,
      observations
    )
    values (
      v_batch_id,
      v_reception_date,
      v_product_id,
      p_supplier_id,
      v_supplier_lot,
      v_internal_lot,
      v_quantity,
      v_unit,
      v_expiry_date,
      v_transport_temperature_c,
      v_temperature_status,
      v_hygiene_status,
      v_line_status,
      v_line_observations
    )
    returning * into v_reception;

    insert into lots (
      product_id,
      lot_number,
      supplier_id,
      supplier_lot,
      quantity_initial,
      quantity_available,
      unit,
      expiry_date,
      quality_status,
      lot_status,
      source_type,
      source_id
    )
    values (
      v_product_id,
      v_internal_lot,
      p_supplier_id,
      v_supplier_lot,
      v_quantity,
      v_quantity,
      v_unit,
      v_expiry_date,
      v_line_status,
      case when v_line_status = 'non_conforme' then 'quarantine'::lot_status else 'available'::lot_status end,
      'reception',
      v_reception.id
    );
  end loop;

  update reception_batches
  set status = v_batch_status
  where id = v_batch_id;

  return v_batch_id;
end;
$$;

alter table supplier_raw_materials enable row level security;
alter table reception_batches enable row level security;

do $$ begin
  create policy "prototype_supplier_raw_materials_read_write" on supplier_raw_materials for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "prototype_reception_batches_read_write" on reception_batches for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

grant select, insert, update, delete on supplier_raw_materials to anon, authenticated;
grant select, insert, update on reception_batches to anon, authenticated;
grant select on supplier_raw_material_catalog to anon, authenticated;
grant select on reception_batch_history to anon, authenticated;
grant select on reception_batch_lines to anon, authenticated;
grant usage, select on sequence reception_batch_sequence to anon, authenticated;
grant execute on function create_raw_material_reception_batch(uuid, timestamptz, text, jsonb) to anon, authenticated;


-- ============================================================
-- 008_production_traceability.sql
-- ============================================================
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
  pb.created_at,
  pb.traceability_snapshot
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
  pb.created_at,
  pb.traceability_snapshot
order by pb.created_at desc;

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
  v_required_traceable_count integer;
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

  with recursive required_components(component_product_id) as (
    select rc.component_product_id
    from recipe_components rc
    where rc.recipe_id = v_recipe_id
    union
    select child_rc.component_product_id
    from required_components parent
    join recipes child_recipe on child_recipe.product_id = parent.component_product_id
      and child_recipe.is_active = true
    join recipe_components child_rc on child_rc.recipe_id = child_recipe.id
  )
  select count(*)
  into v_required_traceable_count
  from required_components rc
  join products p on p.id = rc.component_product_id
  where not (p.type = 'raw' and lower(trim(p.name)) = 'eau');

  if array_length(v_consumed_lot_ids, 1) is null and v_required_traceable_count > 0 then
    raise exception 'At least one consumed lot is required.';
  end if;

  with recursive required_components(component_product_id) as (
    select rc.component_product_id
    from recipe_components rc
    where rc.recipe_id = v_recipe_id
    union
    select child_rc.component_product_id
    from required_components parent
    join recipes child_recipe on child_recipe.product_id = parent.component_product_id
      and child_recipe.is_active = true
    join recipe_components child_rc on child_rc.recipe_id = child_recipe.id
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
  join products p on p.id = rc.component_product_id
  where not (p.type = 'raw' and lower(trim(p.name)) = 'eau')
    and not exists (
    select 1
    from selected_lots sl
    where sl.product_id = rc.component_product_id
  );

  if v_missing_count > 0 then
    raise exception 'Every blueprint component must have a confirmed lot.';
  end if;

  with recursive required_components(component_product_id) as (
    select rc.component_product_id
    from recipe_components rc
    where rc.recipe_id = v_recipe_id
    union
    select child_rc.component_product_id
    from required_components parent
    join recipes child_recipe on child_recipe.product_id = parent.component_product_id
      and child_recipe.is_active = true
    join recipe_components child_rc on child_rc.recipe_id = child_recipe.id
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
    null::numeric,
    null::text
  from unnest(v_consumed_lot_ids) as selected(lot_id);

  return v_batch_id;
end;
$$;

grant select on production_batch_history, production_consumption_details to anon, authenticated;
grant execute on function create_production_with_traceability(timestamptz, uuid, text, text, text, text, uuid[]) to anon, authenticated;


-- ============================================================
-- 009_harden_supabase_access.sql
-- ============================================================
-- Harden prototype access: the desktop app now requires Supabase Auth.
-- The public anon key may still be used to sign in, but it must not read or
-- mutate bakery traceability data directly.

do $$ begin
  if to_regclass('public.products') is null then
    raise exception 'Traceability base schema is missing. Run migrations 001 through 008 before 009_harden_supabase_access.sql.';
  end if;
end $$;

revoke all on schema public from anon;
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;

grant usage on schema public to authenticated;

drop policy if exists "prototype_products_read_write" on products;
drop policy if exists "prototype_suppliers_read_write" on suppliers;
drop policy if exists "prototype_recipes_read" on recipes;
drop policy if exists "prototype_recipe_components_read" on recipe_components;
drop policy if exists "prototype_lots_read_write" on lots;
drop policy if exists "prototype_receptions_read_write" on raw_material_receptions;
drop policy if exists "prototype_batches_read_write" on production_batches;
drop policy if exists "prototype_consumptions_read_write" on production_consumptions;

do $$ begin
  if to_regclass('public.supplier_raw_materials') is not null then
    drop policy if exists "prototype_supplier_raw_materials_read_write" on supplier_raw_materials;
  end if;

  if to_regclass('public.reception_batches') is not null then
    drop policy if exists "prototype_reception_batches_read_write" on reception_batches;
  end if;
end $$;

do $$ begin
  create policy "authenticated_products_read_write" on products
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "authenticated_suppliers_read_write" on suppliers
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "authenticated_recipes_read" on recipes
    for select to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "authenticated_recipe_components_read" on recipe_components
    for select to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "authenticated_lots_read_write" on lots
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "authenticated_receptions_read_write" on raw_material_receptions
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "authenticated_batches_read_write" on production_batches
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "authenticated_consumptions_read_write" on production_consumptions
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  if to_regclass('public.supplier_raw_materials') is not null then
    create policy "authenticated_supplier_raw_materials_read_write" on supplier_raw_materials
      for all to authenticated using (true) with check (true);
  end if;
exception when duplicate_object then null;
end $$;

do $$ begin
  if to_regclass('public.reception_batches') is not null then
    create policy "authenticated_reception_batches_read_write" on reception_batches
      for all to authenticated using (true) with check (true);
  end if;
exception when duplicate_object then null;
end $$;

grant select, insert, update on products, suppliers to authenticated;
grant select on recipes, recipe_components to authenticated;
grant select, insert, update on lots, raw_material_receptions, production_batches, production_consumptions to authenticated;

do $$ begin
  if to_regclass('public.supplier_raw_materials') is not null then
    grant select, insert, update, delete on supplier_raw_materials to authenticated;
  end if;

  if to_regclass('public.reception_batches') is not null then
    grant select, insert, update on reception_batches to authenticated;
  end if;
end $$;

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'product_catalog',
    'recent_raw_material_receptions',
    'product_schema_components',
    'product_lot_stock',
    'supplier_raw_material_catalog',
    'reception_batch_history',
    'reception_batch_lines',
    'production_batch_history',
    'production_consumption_details'
  ]
  loop
    if to_regclass('public.' || relation_name) is not null then
      execute format('grant select on public.%I to authenticated', relation_name);
    end if;
  end loop;
end $$;

do $$
declare
  sequence_name text;
begin
  foreach sequence_name in array array[
    'raw_material_lot_sequence',
    'reception_batch_sequence'
  ]
  loop
    if to_regclass('public.' || sequence_name) is not null then
      execute format('grant usage, select on sequence public.%I to authenticated', sequence_name);
    end if;
  end loop;
end $$;

do $$ begin
  grant execute on function create_raw_material_reception(
    timestamptz,
    uuid,
    uuid,
    text,
    numeric,
    text,
    date,
    numeric,
    quality_status,
    quality_status,
    text,
    text,
    text
  ) to authenticated;
exception when undefined_function then null;
end $$;

do $$ begin
  grant execute on function save_product_schema(uuid, uuid[], jsonb, jsonb, jsonb) to authenticated;
exception when undefined_function then null;
end $$;

do $$ begin
  grant execute on function create_raw_material_reception_batch(uuid, timestamptz, text, jsonb) to authenticated;
exception when undefined_function then null;
end $$;

do $$ begin
  grant execute on function update_raw_material_reception_batch(uuid, uuid[], uuid, timestamptz, text, jsonb) to authenticated;
exception when undefined_function then null;
end $$;

do $$ begin
  grant execute on function create_production_with_traceability(timestamptz, uuid, text, text, text, text, uuid[]) to authenticated;
exception when undefined_function then null;
end $$;

-- ============================================================
-- 010_production_traceability_snapshots.sql
-- ============================================================
create or replace function build_production_traceability_snapshot(p_batch_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with recursive batch_context as (
    select
      pb.id,
      pb.product_id,
      pb.generated_lot,
      p.name as product_name,
      p.type as product_type,
      r.id as recipe_id,
      r.diagram_nodes,
      r.diagram_edges,
      r.diagram_viewport
    from production_batches pb
    join products p on p.id = pb.product_id
    left join lateral (
      select recipes.id, recipes.diagram_nodes, recipes.diagram_edges, recipes.diagram_viewport
      from recipes
      where recipes.product_id = pb.product_id
        and recipes.is_active = true
      order by recipes.version desc, recipes.created_at desc
      limit 1
    ) r on true
    where pb.id = p_batch_id
  ),
  schema_tree as (
    select
      bc.product_id as parent_product_id,
      rc.component_product_id,
      array[bc.product_id, rc.component_product_id]::uuid[] as product_path,
      1 as depth
    from batch_context bc
    join recipe_components rc on rc.recipe_id = bc.recipe_id

    union all

    select
      tree.component_product_id,
      child_rc.component_product_id,
      tree.product_path || child_rc.component_product_id,
      tree.depth + 1
    from schema_tree tree
    join recipes child_recipe on child_recipe.product_id = tree.component_product_id
      and child_recipe.is_active = true
    join recipe_components child_rc on child_rc.recipe_id = child_recipe.id
    where not child_rc.component_product_id = any(tree.product_path)
  ),
  component_nodes as (
    select
      array_to_string(tree.product_path, '__') as node_id,
      case
        when tree.depth = 1 then tree.product_path[1]::text
        else array_to_string(tree.product_path[1:cardinality(tree.product_path) - 1], '__')
      end as parent_node_id,
      tree.component_product_id as product_id,
      product.name as product_name,
      product.type as product_type,
      tree.depth,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'lotId', lot.id,
            'lotNumber', lot.lot_number,
            'supplierLot', lot.supplier_lot,
            'sourceType', lot.source_type,
            'lotCreatedAt', lot.created_at
          )
          order by lot.created_at desc, lot.id
        )
        from production_consumptions consumption
        join lots lot on lot.id = consumption.consumed_lot_id
        where consumption.production_batch_id = p_batch_id
          and lot.product_id = tree.component_product_id
      ), '[]'::jsonb) as lots
    from schema_tree tree
    join products product on product.id = tree.component_product_id
  )
  select jsonb_build_object(
    'version', 1,
    'root', jsonb_build_object(
      'productId', bc.product_id,
      'productName', bc.product_name,
      'productType', bc.product_type,
      'lotNumber', bc.generated_lot
    ),
    'components', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'nodeId', node.node_id,
          'parentNodeId', node.parent_node_id,
          'productId', node.product_id,
          'productName', node.product_name,
          'productType', node.product_type,
          'depth', node.depth,
          'lots', node.lots
        )
        order by node.depth, node.node_id
      )
      from component_nodes node
    ), '[]'::jsonb),
    'diagram', jsonb_build_object(
      'nodes', coalesce(bc.diagram_nodes, '[]'::jsonb),
      'edges', coalesce(bc.diagram_edges, '[]'::jsonb),
      'viewport', bc.diagram_viewport
    )
  )
  from batch_context bc;
$$;

revoke all on function build_production_traceability_snapshot(uuid) from public;

create or replace function refresh_production_traceability_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update production_batches batch
  set traceability_snapshot = build_production_traceability_snapshot(batch.id)
  where batch.id in (
    select distinct inserted.production_batch_id
    from inserted_production_consumptions inserted
  );

  return null;
end;
$$;

revoke all on function refresh_production_traceability_snapshot() from public;

drop trigger if exists production_consumptions_refresh_traceability_snapshot on production_consumptions;
create trigger production_consumptions_refresh_traceability_snapshot
after insert on production_consumptions
referencing new table as inserted_production_consumptions
for each statement
execute function refresh_production_traceability_snapshot();



-- ============================================================
-- 011_update_reception_batch_edit.sql
-- ============================================================
create or replace function update_raw_material_reception_batch(
  p_batch_id uuid,
  p_merged_batch_ids uuid[],
  p_supplier_id uuid,
  p_reception_date timestamptz,
  p_observations text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_ids uuid[] := array_prepend(p_batch_id, coalesce(p_merged_batch_ids, array[]::uuid[]));
  v_line jsonb;
  v_line_ids uuid[] := array[]::uuid[];
  v_line_id uuid;
  v_internal_lot text;
  v_line_status quality_status;
  v_batch_status quality_status := 'conforme'::quality_status;
  v_reception_date timestamptz := coalesce(p_reception_date, now());
  v_reception raw_material_receptions;
  v_removed_reception raw_material_receptions;
  v_product_id uuid;
  v_old_product_id uuid;
  v_supplier_lot text;
  v_quantity numeric;
  v_unit text;
  v_expiry_date date;
  v_transport_temperature_c numeric;
  v_temperature_status quality_status;
  v_hygiene_status quality_status;
  v_line_observations text;
  v_lot_id uuid;
  v_old_quantity_initial numeric;
  v_old_quantity_available numeric;
  v_consumed_quantity numeric;
begin
  if p_batch_id is null then
    raise exception 'Reception batch is required.';
  end if;

  if p_supplier_id is null then
    raise exception 'Supplier is required.';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one reception line is required.';
  end if;

  if not exists (select 1 from reception_batches where id = p_batch_id) then
    raise exception 'Reception batch does not exist.';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_merged_batch_ids, array[]::uuid[])) as merged(batch_id)
    where merged.batch_id is not null
      and not exists (select 1 from reception_batches b where b.id = merged.batch_id)
  ) then
    raise exception 'One of the grouped reception batches does not exist.';
  end if;

  update reception_batches
  set supplier_id = p_supplier_id,
      reception_date = v_reception_date,
      observations = nullif(trim(coalesce(p_observations, '')), '')
  where id = p_batch_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_line_id := nullif(v_line->>'id', '')::uuid;
    v_product_id := nullif(v_line->>'product_id', '')::uuid;
    v_supplier_lot := nullif(trim(coalesce(v_line->>'supplier_lot', '')), '');
    v_quantity := nullif(v_line->>'quantity', '')::numeric;
    v_unit := nullif(trim(coalesce(v_line->>'unit', '')), '');
    v_expiry_date := nullif(v_line->>'expiry_date', '')::date;
    v_transport_temperature_c := nullif(v_line->>'transport_temperature_c', '')::numeric;
    v_temperature_status := coalesce(nullif(v_line->>'temperature_status', '')::quality_status, 'conforme'::quality_status);
    v_hygiene_status := coalesce(nullif(v_line->>'hygiene_status', '')::quality_status, 'conforme'::quality_status);
    v_line_observations := nullif(trim(coalesce(v_line->>'observations', '')), '');

    if v_product_id is null then
      raise exception 'Line product is required.';
    end if;

    if not exists (
      select 1
      from supplier_raw_materials srm
      where srm.supplier_id = p_supplier_id
        and srm.product_id = v_product_id
    ) then
      raise exception 'Product is not assigned to this supplier.';
    end if;

    if v_supplier_lot is null then
      raise exception 'Supplier lot is required.';
    end if;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantity must be greater than zero.';
    end if;

    if v_unit is null then
      raise exception 'Unit is required.';
    end if;

    v_line_status := case
      when v_temperature_status = 'non_conforme' or v_hygiene_status = 'non_conforme' then 'non_conforme'::quality_status
      else 'conforme'::quality_status
    end;

    if v_line_status = 'non_conforme' then
      v_batch_status := 'non_conforme'::quality_status;
    end if;

    if v_line_id is not null then
      select r.product_id
      into v_old_product_id
      from raw_material_receptions r
      where r.id = v_line_id
        and r.batch_id = any(v_batch_ids)
      for update;

      if not found then
        raise exception 'Reception line does not belong to the selected reception.';
      end if;

      select l.id, l.quantity_initial, l.quantity_available
      into v_lot_id, v_old_quantity_initial, v_old_quantity_available
      from lots l
      where l.source_type = 'reception'
        and l.source_id = v_line_id
      for update;

      v_consumed_quantity := greatest(0, coalesce(v_old_quantity_initial, 0) - coalesce(v_old_quantity_available, 0));

      if v_consumed_quantity > 0 and v_old_product_id <> v_product_id then
        raise exception 'Cannot change product for a reception line with consumed lots.';
      end if;

      if v_quantity < v_consumed_quantity then
        raise exception 'Quantity cannot be lower than the quantity already consumed.';
      end if;

      update raw_material_receptions
      set batch_id = p_batch_id,
          reception_date = v_reception_date,
          product_id = v_product_id,
          supplier_id = p_supplier_id,
          supplier_lot = v_supplier_lot,
          quantity = v_quantity,
          unit = v_unit,
          expiry_date = v_expiry_date,
          transport_temperature_c = v_transport_temperature_c,
          temperature_status = v_temperature_status,
          hygiene_status = v_hygiene_status,
          status = v_line_status,
          observations = v_line_observations
      where id = v_line_id;

      if v_lot_id is not null then
        update lots
        set product_id = v_product_id,
            supplier_id = p_supplier_id,
            supplier_lot = v_supplier_lot,
            quantity_initial = v_quantity,
            quantity_available = v_quantity - v_consumed_quantity,
            unit = v_unit,
            expiry_date = v_expiry_date,
            quality_status = v_line_status,
            lot_status = case when v_line_status = 'non_conforme' then 'quarantine'::lot_status else 'available'::lot_status end
        where id = v_lot_id;
      end if;

      v_line_ids := array_append(v_line_ids, v_line_id);
    else
      v_internal_lot := 'MP-' || to_char(v_reception_date, 'YYYY') || '-' || lpad(nextval('raw_material_lot_sequence')::text, 5, '0');

      insert into raw_material_receptions (
        batch_id,
        reception_date,
        product_id,
        supplier_id,
        supplier_lot,
        internal_lot,
        quantity,
        unit,
        expiry_date,
        transport_temperature_c,
        temperature_status,
        hygiene_status,
        status,
        observations
      )
      values (
        p_batch_id,
        v_reception_date,
        v_product_id,
        p_supplier_id,
        v_supplier_lot,
        v_internal_lot,
        v_quantity,
        v_unit,
        v_expiry_date,
        v_transport_temperature_c,
        v_temperature_status,
        v_hygiene_status,
        v_line_status,
        v_line_observations
      )
      returning * into v_reception;

      insert into lots (
        product_id,
        lot_number,
        supplier_id,
        supplier_lot,
        quantity_initial,
        quantity_available,
        unit,
        expiry_date,
        quality_status,
        lot_status,
        source_type,
        source_id
      )
      values (
        v_product_id,
        v_internal_lot,
        p_supplier_id,
        v_supplier_lot,
        v_quantity,
        v_quantity,
        v_unit,
        v_expiry_date,
        v_line_status,
        case when v_line_status = 'non_conforme' then 'quarantine'::lot_status else 'available'::lot_status end,
        'reception',
        v_reception.id
      );

      v_line_ids := array_append(v_line_ids, v_reception.id);
    end if;
  end loop;

  for v_removed_reception in
    select *
    from raw_material_receptions r
    where r.batch_id = any(v_batch_ids)
      and not (r.id = any(v_line_ids))
  loop
    if exists (
      select 1
      from lots l
      join production_consumptions pc on pc.consumed_lot_id = l.id
      where l.source_type = 'reception'
        and l.source_id = v_removed_reception.id
    ) then
      raise exception 'Cannot remove a reception line with consumed lots.';
    end if;

    delete from lots
    where source_type = 'reception'
      and source_id = v_removed_reception.id;

    delete from raw_material_receptions
    where id = v_removed_reception.id;
  end loop;

  delete from reception_batches
  where id = any(coalesce(p_merged_batch_ids, array[]::uuid[]))
    and id <> p_batch_id;

  update reception_batches
  set status = v_batch_status
  where id = p_batch_id;

  return p_batch_id;
end;
$$;

grant execute on function update_raw_material_reception_batch(uuid, uuid[], uuid, timestamptz, text, jsonb) to anon, authenticated;

