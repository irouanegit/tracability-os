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
    or category in ('beldi', 'boulangerie', 'patisserie', 'viennoiserie')
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
    or category in ('beldi', 'boulangerie', 'patisserie', 'viennoiserie')
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


-- 018_chocolate_component_substitutions.sql
alter table products
  add column if not exists substitution_group text;

with chocolate_materials(name) as (
  values
    ('Chocolat au lait Callebaut'),
    ('Chocolat au lait Lubeca'),
    ('Chocolat blanc Callebaut'),
    ('Chocolat blanc Lubeca'),
    ('Chocolat caramel'),
    ('Chocolat noir Callebaut'),
    ('Chocolat noir Lubeca'),
    ('Gala blanc'),
    ('Gala noir')
)
update products p
set substitution_group = 'chocolate'
from chocolate_materials c
where p.type = 'raw'
  and p.is_active = true
  and lower(trim(p.name)) = lower(trim(c.name));

do $$
declare
  v_missing text[];
  v_duplicates text[];
begin
  with chocolate_materials(name) as (
    values
      ('Chocolat au lait Callebaut'),
      ('Chocolat au lait Lubeca'),
      ('Chocolat blanc Callebaut'),
      ('Chocolat blanc Lubeca'),
      ('Chocolat caramel'),
      ('Chocolat noir Callebaut'),
      ('Chocolat noir Lubeca'),
      ('Gala blanc'),
      ('Gala noir')
  )
  select coalesce(array_agg(c.name order by c.name), array[]::text[])
  into v_missing
  from chocolate_materials c
  where not exists (
    select 1
    from products p
    where p.type = 'raw'
      and p.is_active = true
      and lower(trim(p.name)) = lower(trim(c.name))
  );

  with chocolate_materials(name) as (
    values
      ('Chocolat au lait Callebaut'),
      ('Chocolat au lait Lubeca'),
      ('Chocolat blanc Callebaut'),
      ('Chocolat blanc Lubeca'),
      ('Chocolat caramel'),
      ('Chocolat noir Callebaut'),
      ('Chocolat noir Lubeca'),
      ('Gala blanc'),
      ('Gala noir')
  ),
  matches as (
    select c.name, count(p.id) as match_count
    from chocolate_materials c
    left join products p on p.type = 'raw'
      and p.is_active = true
      and lower(trim(p.name)) = lower(trim(c.name))
    group by c.name
  )
  select coalesce(array_agg(name order by name), array[]::text[])
  into v_duplicates
  from matches
  where match_count > 1;

  if cardinality(v_missing) > 0 then
    raise exception 'Missing chocolate raw materials: %', v_missing;
  end if;

  if cardinality(v_duplicates) > 0 then
    raise exception 'Duplicate active chocolate raw materials: %', v_duplicates;
  end if;
end;
$$;

alter table production_consumptions
  add column if not exists expected_component_product_id uuid;

update production_consumptions pc
set expected_component_product_id = l.product_id
from lots l
where pc.consumed_lot_id = l.id
  and pc.expected_component_product_id is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_consumptions_expected_component_product_id_fkey'
      and conrelid = 'production_consumptions'::regclass
  ) then
    alter table production_consumptions
      add constraint production_consumptions_expected_component_product_id_fkey
      foreign key (expected_component_product_id) references products(id);
  end if;
end;
$$;

create index if not exists production_consumptions_expected_component_idx
  on production_consumptions(expected_component_product_id);

drop view if exists production_consumption_details;

create or replace view production_consumption_details as
select
  pc.id,
  pc.production_batch_id,
  coalesce(pc.expected_component_product_id, l.product_id) as expected_component_product_id,
  expected_product.code as expected_component_product_code,
  expected_product.name as expected_component_product_name,
  expected_product.type as expected_component_product_type,
  expected_product.category as expected_component_product_category,
  l.id as lot_id,
  l.lot_number,
  l.product_id as consumed_product_id,
  consumed_product.code as consumed_product_code,
  consumed_product.name as consumed_product_name,
  consumed_product.type as consumed_product_type,
  consumed_product.category as consumed_product_category,
  l.supplier_lot,
  l.source_type,
  l.created_at as lot_created_at,
  pc.created_at as linked_at
from production_consumptions pc
join lots l on l.id = pc.consumed_lot_id
join products consumed_product on consumed_product.id = l.product_id
join products expected_product on expected_product.id = coalesce(pc.expected_component_product_id, l.product_id);

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
            'lotCreatedAt', lot.created_at,
            'productId', lot_product.id,
            'productName', lot_product.name,
            'productType', lot_product.type,
            'productCategory', lot_product.category,
            'expectedProductId', tree.component_product_id,
            'expectedProductName', product.name
          )
          order by lot.created_at desc, lot.id
        )
        from production_consumptions consumption
        join lots lot on lot.id = consumption.consumed_lot_id
        join products lot_product on lot_product.id = lot.product_id
        where consumption.production_batch_id = p_batch_id
          and (
            consumption.expected_component_product_id = tree.component_product_id
            or (consumption.expected_component_product_id is null and lot.product_id = tree.component_product_id)
          )
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

create or replace function create_production_with_traceability_v2(
  p_production_date timestamptz,
  p_product_id uuid,
  p_generated_lot text,
  p_responsible_name text,
  p_operation text,
  p_observations text,
  p_consumed_lot_selections jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := ensure_traceability_profile();
  v_product products;
  v_recipe_id uuid;
  v_batch_id uuid;
  v_required_traceable_count integer;
  v_selected_count integer;
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

  with selected_lots as (
    select distinct
      nullif(coalesce(selected.value->>'expectedProductId', selected.value->>'expected_product_id'), '')::uuid as expected_product_id,
      nullif(coalesce(selected.value->>'consumedLotId', selected.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
    from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) as selected(value)
    where nullif(coalesce(selected.value->>'expectedProductId', selected.value->>'expected_product_id'), '') is not null
      and nullif(coalesce(selected.value->>'consumedLotId', selected.value->>'consumed_lot_id'), '') is not null
  )
  select count(*)
  into v_selected_count
  from selected_lots;

  if v_selected_count = 0 and v_required_traceable_count > 0 then
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
    select distinct
      nullif(coalesce(selected.value->>'expectedProductId', selected.value->>'expected_product_id'), '')::uuid as expected_product_id,
      nullif(coalesce(selected.value->>'consumedLotId', selected.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
    from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) as selected(value)
    where nullif(coalesce(selected.value->>'expectedProductId', selected.value->>'expected_product_id'), '') is not null
      and nullif(coalesce(selected.value->>'consumedLotId', selected.value->>'consumed_lot_id'), '') is not null
  )
  select count(*)
  into v_missing_count
  from required_components rc
  join products p on p.id = rc.component_product_id
  where not (p.type = 'raw' and lower(trim(p.name)) = 'eau')
    and not exists (
      select 1
      from selected_lots sl
      where sl.expected_product_id = rc.component_product_id
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
    select distinct
      nullif(coalesce(selected.value->>'expectedProductId', selected.value->>'expected_product_id'), '')::uuid as expected_product_id,
      nullif(coalesce(selected.value->>'consumedLotId', selected.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
    from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) as selected(value)
    where nullif(coalesce(selected.value->>'expectedProductId', selected.value->>'expected_product_id'), '') is not null
      and nullif(coalesce(selected.value->>'consumedLotId', selected.value->>'consumed_lot_id'), '') is not null
  ),
  validated_lots as (
    select
      sl.expected_product_id,
      sl.consumed_lot_id,
      expected_product.substitution_group as expected_group,
      consumed_product.substitution_group as consumed_group,
      l.product_id as consumed_product_id
    from selected_lots sl
    left join required_components rc on rc.component_product_id = sl.expected_product_id
    left join products expected_product on expected_product.id = sl.expected_product_id
      and expected_product.is_active = true
    left join lots l on l.id = sl.consumed_lot_id
      and l.lot_status = 'available'
      and l.quality_status = 'conforme'
    left join products consumed_product on consumed_product.id = l.product_id
      and consumed_product.is_active = true
    where rc.component_product_id is null
       or l.id is null
       or expected_product.id is null
       or consumed_product.id is null
       or (
         l.product_id <> sl.expected_product_id
         and not (
           expected_product.substitution_group is not null
           and expected_product.substitution_group = consumed_product.substitution_group
         )
       )
  )
  select count(*)
  into v_invalid_count
  from validated_lots;

  if v_invalid_count > 0 then
    raise exception 'Selected lots must be available lots for the active blueprint components or an allowed substitution group.';
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
    status,
    confirmed_by,
    confirmed_at,
    created_by,
    updated_by,
    updated_at
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
    'validated',
    v_actor_id,
    now(),
    v_actor_id,
    v_actor_id,
    now()
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
    source_id,
    created_by,
    updated_by,
    updated_at
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
    v_batch_id,
    v_actor_id,
    v_actor_id,
    now()
  );

  insert into production_consumptions (
    production_batch_id,
    expected_component_product_id,
    consumed_lot_id,
    quantity_used,
    unit,
    created_by,
    updated_by,
    updated_at
  )
  select distinct
    v_batch_id,
    selected.expected_product_id,
    selected.consumed_lot_id,
    null::numeric,
    null::text,
    v_actor_id,
    v_actor_id,
    now()
  from (
    select
      nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '')::uuid as expected_product_id,
      nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
    from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) as item(value)
    where nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '') is not null
      and nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '') is not null
  ) selected;

  perform log_traceability_event(
    'production_lots.confirmed',
    'production_batch',
    v_batch_id,
    jsonb_build_object(
      'productId', p_product_id,
      'productName', v_product.name,
      'generatedLot', trim(p_generated_lot),
      'consumedLotCount', v_selected_count,
      'supportsSubstitutions', true
    )
  );

  return v_batch_id;
end;
$$;

revoke all on function create_production_with_traceability_v2(timestamptz, uuid, text, text, text, text, jsonb) from public;
grant execute on function create_production_with_traceability_v2(timestamptz, uuid, text, text, text, text, jsonb) to authenticated;

grant select on production_consumption_details to authenticated;

-- 019_colorant_component_substitutions.sql
alter table products
  add column if not exists substitution_group text;

with colorant_materials(name) as (
  values
    ('Colorant'),
    ('Colorant blanc'),
    ('Colorant jaune'),
    ('Colorant noir'),
    ('Colorant orange'),
    ('Colorant pistache'),
    ('Colorant rouge'),
    ('Colorant rouge Tarabco'),
    ('Colorant vert')
)
update products p
set substitution_group = 'colorant'
from colorant_materials c
where p.type = 'raw'
  and p.is_active = true
  and lower(trim(p.name)) = lower(trim(c.name));

do $$
declare
  v_missing text[];
  v_duplicates text[];
begin
  with colorant_materials(name) as (
    values
      ('Colorant'),
      ('Colorant blanc'),
      ('Colorant jaune'),
      ('Colorant noir'),
      ('Colorant orange'),
      ('Colorant pistache'),
      ('Colorant rouge'),
      ('Colorant rouge Tarabco'),
      ('Colorant vert')
  )
  select coalesce(array_agg(c.name order by c.name), array[]::text[])
  into v_missing
  from colorant_materials c
  where not exists (
    select 1
    from products p
    where p.type = 'raw'
      and p.is_active = true
      and lower(trim(p.name)) = lower(trim(c.name))
  );

  with colorant_materials(name) as (
    values
      ('Colorant'),
      ('Colorant blanc'),
      ('Colorant jaune'),
      ('Colorant noir'),
      ('Colorant orange'),
      ('Colorant pistache'),
      ('Colorant rouge'),
      ('Colorant rouge Tarabco'),
      ('Colorant vert')
  ),
  counts as (
    select c.name, count(p.id) as product_count
    from colorant_materials c
    left join products p on p.type = 'raw'
      and p.is_active = true
      and lower(trim(p.name)) = lower(trim(c.name))
    group by c.name
  )
  select coalesce(array_agg(name order by name), array[]::text[])
  into v_duplicates
  from counts
  where product_count > 1;

  if cardinality(v_missing) > 0 then
    raise exception 'Missing colorant substitution raw materials: %', v_missing;
  end if;

  if cardinality(v_duplicates) > 0 then
    raise exception 'Duplicate colorant substitution raw materials must be merged first: %', v_duplicates;
  end if;
end;
$$;


-- 020_production_planification.sql
-- Date-only production planning with explicit raw-lot and semi-finished dependencies.
-- Run after 019_colorant_component_substitutions.sql.

create table if not exists production_plan_series (
  id uuid primary key default gen_random_uuid(),
  plan_name text not null default '',
  product_id uuid not null references products(id),
  frequency text not null check (frequency in ('once', 'daily', 'weekdays', 'every_n_days', 'specific_days')),
  interval_days integer not null default 1 check (interval_days between 1 and 90),
  days_of_week smallint[] not null default '{}'::smallint[],
  start_date date not null,
  end_date date not null,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_by uuid references profiles(user_id),
  updated_by uuid references profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (end_date - start_date <= 89),
  check (days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  check (frequency <> 'specific_days' or cardinality(days_of_week) > 0)
);

alter table production_plan_series add column if not exists plan_name text;
update production_plan_series series
set plan_name = coalesce(nullif(trim(series.plan_name), ''), product.name || ' - ' || to_char(series.start_date, 'DD/MM/YYYY'))
from products product
where product.id = series.product_id
  and (series.plan_name is null or trim(series.plan_name) = '');
alter table production_plan_series alter column plan_name set default '';
alter table production_plan_series alter column plan_name set not null;

create table if not exists production_plans (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references production_plan_series(id) on delete cascade,
  product_id uuid not null references products(id),
  planned_date date not null,
  recipe_id uuid not null references recipes(id),
  recipe_version integer not null,
  schema_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'planned' check (status in ('planned', 'completed', 'cancelled')),
  production_batch_id uuid unique references production_batches(id),
  responsible_name text,
  notes text,
  cancelled_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid references profiles(user_id),
  completed_at timestamptz,
  completed_by uuid references profiles(user_id),
  created_by uuid references profiles(user_id),
  updated_by uuid references profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists production_plan_dependencies (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references production_plans(id) on delete cascade,
  node_key text not null,
  parent_node_key text,
  depth integer not null default 0 check (depth >= 0),
  expected_product_id uuid not null references products(id),
  selected_product_id uuid not null references products(id),
  source_kind text not null check (source_kind in ('water', 'raw_lot', 'existing_production_lot', 'planned_production')),
  source_lot_id uuid references lots(id),
  source_plan_id uuid references production_plans(id),
  created_by uuid references profiles(user_id),
  updated_by uuid references profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, node_key),
  check (
    (source_kind = 'water' and source_lot_id is null and source_plan_id is null)
    or (source_kind in ('raw_lot', 'existing_production_lot') and source_lot_id is not null and source_plan_id is null)
    or (source_kind = 'planned_production' and source_lot_id is null and source_plan_id is not null)
  )
);

create index if not exists production_plans_date_idx on production_plans (planned_date, status);
create index if not exists production_plans_product_date_idx on production_plans (product_id, planned_date);
create index if not exists production_plan_dependencies_plan_idx on production_plan_dependencies (plan_id);
create index if not exists production_plan_dependencies_source_plan_idx
  on production_plan_dependencies (source_plan_id)
  where source_plan_id is not null;

drop function if exists create_production_with_traceability_v3(uuid, timestamptz, uuid, text, text, text, text, jsonb);
drop function if exists get_production_plan_confirmation_context(uuid);
drop function if exists refresh_production_plan(uuid, uuid, integer, jsonb, jsonb);
drop function if exists cancel_production_plan(uuid, text);
drop trigger if exists production_plan_dependency_validation on production_plan_dependencies;
drop function if exists validate_production_plan_dependency();
drop view if exists production_plan_dependency_details;
drop view if exists production_plan_overview;
drop view if exists planning_eligible_lots;

drop trigger if exists production_plan_series_audit_columns on production_plan_series;
create trigger production_plan_series_audit_columns
before insert or update on production_plan_series
for each row execute function set_traceability_audit_columns();

drop trigger if exists production_plans_audit_columns on production_plans;
create trigger production_plans_audit_columns
before insert or update on production_plans
for each row execute function set_traceability_audit_columns();

drop trigger if exists production_plan_dependencies_audit_columns on production_plan_dependencies;
create trigger production_plan_dependencies_audit_columns
before insert or update on production_plan_dependencies
for each row execute function set_traceability_audit_columns();

create or replace view planning_eligible_lots as
select
  l.id as lot_id,
  l.product_id,
  p.name as product_name,
  p.type as product_type,
  p.category as product_category,
  p.substitution_group,
  l.lot_number,
  l.supplier_lot,
  l.supplier_id,
  s.name as supplier_name,
  l.source_type,
  l.source_id,
  coalesce(rr.reception_date::date, pb.production_date::date, l.created_at::date) as effective_date,
  l.expiry_date,
  l.lot_status,
  l.quality_status,
  l.created_at
from lots l
join products p on p.id = l.product_id and p.is_active = true
left join suppliers s on s.id = l.supplier_id
left join raw_material_receptions rr on l.source_type = 'reception' and rr.id = l.source_id
left join production_batches pb on l.source_type = 'fabrication' and pb.id = l.source_id
where l.lot_status = 'available'
  and l.quality_status = 'conforme';

create or replace function validate_production_plan_dependency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan production_plans%rowtype;
  v_expected products%rowtype;
  v_selected products%rowtype;
  v_lot planning_eligible_lots%rowtype;
  v_source_plan production_plans%rowtype;
begin
  select * into v_plan from production_plans where id = new.plan_id;
  select * into v_expected from products where id = new.expected_product_id and is_active = true;
  select * into v_selected from products where id = new.selected_product_id and is_active = true;

  if v_plan.id is null or v_expected.id is null or v_selected.id is null then
    raise exception 'Planning dependency references an inactive or missing plan/product.';
  end if;

  if new.source_kind = 'water' then
    if v_expected.type <> 'raw' or lower(trim(v_expected.name)) <> 'eau' then
      raise exception 'Only Eau can use the water planning exception.';
    end if;
    return new;
  end if;

  if v_expected.id <> v_selected.id and not (
    v_expected.substitution_group is not null
    and v_expected.substitution_group = v_selected.substitution_group
  ) then
    raise exception 'Selected planning component is not an allowed substitution.';
  end if;

  if new.source_kind in ('raw_lot', 'existing_production_lot') then
    select * into v_lot from planning_eligible_lots where lot_id = new.source_lot_id;
    if v_lot.lot_id is null
      or v_lot.product_id <> new.selected_product_id
      or v_lot.effective_date > v_plan.planned_date
      or (v_lot.expiry_date is not null and v_lot.expiry_date < v_plan.planned_date)
    then
      raise exception 'Planning lot is unavailable, expired, or later than the production date.';
    end if;
    if new.source_kind = 'raw_lot' and v_selected.type <> 'raw' then
      raise exception 'Raw-lot planning sources must reference a raw material.';
    end if;
    if new.source_kind = 'existing_production_lot' and v_selected.type = 'raw' then
      raise exception 'Existing-production sources must reference a manufactured product.';
    end if;
  else
    select * into v_source_plan from production_plans where id = new.source_plan_id;
    if v_source_plan.id is null
      or v_source_plan.id = v_plan.id
      or v_source_plan.product_id <> new.selected_product_id
      or v_source_plan.planned_date > v_plan.planned_date
      or v_source_plan.status = 'cancelled'
    then
      raise exception 'Planned semi-finished dependency is missing, cancelled, or later than its parent.';
    end if;

    if exists (
      with recursive source_chain as (
        select
          new.source_plan_id as plan_id,
          array[new.source_plan_id]::uuid[] as plan_path
        union all
        select
          dependency.source_plan_id,
          chain.plan_path || dependency.source_plan_id
        from source_chain chain
        join production_plan_dependencies dependency on dependency.plan_id = chain.plan_id
        where dependency.source_kind = 'planned_production'
          and dependency.source_plan_id is not null
          and not dependency.source_plan_id = any(chain.plan_path)
      )
      select 1 from source_chain where plan_id = new.plan_id
    ) then
      raise exception 'Production planning dependencies cannot contain a cycle.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists production_plan_dependency_validation on production_plan_dependencies;
create trigger production_plan_dependency_validation
before insert or update on production_plan_dependencies
for each row execute function validate_production_plan_dependency();

create or replace view production_plan_overview as
with recursive dependency_walk as (
  select
    plan.id as root_plan_id,
    plan.id as owner_plan_id,
    plan.planned_date as owner_planned_date,
    dependency.id as dependency_id,
    dependency.source_kind,
    dependency.source_lot_id,
    dependency.source_plan_id,
    array[plan.id]::uuid[] as plan_path
  from production_plans plan
  left join production_plan_dependencies dependency on dependency.plan_id = plan.id

  union all

  select
    walk.root_plan_id,
    child.id,
    child.planned_date,
    child_dependency.id,
    child_dependency.source_kind,
    child_dependency.source_lot_id,
    child_dependency.source_plan_id,
    walk.plan_path || child.id
  from dependency_walk walk
  join production_plans child on child.id = walk.source_plan_id
  join production_plan_dependencies child_dependency on child_dependency.plan_id = child.id
  where walk.source_kind = 'planned_production'
    and not child.id = any(walk.plan_path)
),
dependency_state as (
  select
    walk.root_plan_id as plan_id,
    count(walk.dependency_id)::integer as dependency_count,
    count(*) filter (
      where walk.dependency_id is not null and (
        (walk.source_kind in ('raw_lot', 'existing_production_lot') and (
          eligible.lot_id is null
          or eligible.effective_date > walk.owner_planned_date
          or (eligible.expiry_date is not null and eligible.expiry_date < walk.owner_planned_date)
        ))
        or (walk.source_kind = 'planned_production' and (
          child.id is null
          or child.status = 'cancelled'
          or child.planned_date > walk.owner_planned_date
          or (
            child.status <> 'completed'
            and not exists (
            select 1 from recipes child_active_recipe
            where child_active_recipe.id = child.recipe_id
              and child_active_recipe.product_id = child.product_id
              and child_active_recipe.is_active = true
            )
          )
        ))
      )
    )::integer as blocker_count,
    count(*) filter (
      where walk.source_kind = 'planned_production' and child.status <> 'completed'
    )::integer as waiting_count
  from dependency_walk walk
  left join planning_eligible_lots eligible on eligible.lot_id = walk.source_lot_id
  left join production_plans child on child.id = walk.source_plan_id
  group by walk.root_plan_id
)
select
  p.id,
  p.series_id,
  p.product_id,
  product.code as product_code,
  product.name as product_name,
  product.type as product_type,
  product.category as product_category,
  p.planned_date,
  p.recipe_id,
  p.recipe_version,
  p.schema_snapshot,
  p.production_batch_id,
  p.responsible_name,
  p.notes,
  p.status as stored_status,
  case
    when p.status = 'completed' then 'completed'
    when p.status = 'cancelled' then 'cancelled'
    when active_recipe.id is distinct from p.recipe_id then 'recipe_changed'
    when coalesce(ds.blocker_count, 0) > 0 then 'blocked'
    when coalesce(ds.waiting_count, 0) > 0 and p.planned_date < current_date then 'overdue'
    when coalesce(ds.waiting_count, 0) > 0 then 'waiting'
    when p.planned_date < current_date then 'overdue'
    else 'ready'
  end as derived_status,
  coalesce(ds.dependency_count, 0) as dependency_count,
  coalesce(ds.blocker_count, 0) as blocker_count,
  coalesce(ds.waiting_count, 0) as waiting_count,
  series.frequency,
  series.interval_days,
  series.days_of_week,
  series.start_date,
  series.end_date,
  p.cancelled_reason,
  p.cancelled_at,
  p.completed_at,
  p.created_by,
  creator.display_name as created_by_name,
  creator.email as created_by_email,
  p.updated_by,
  updater.display_name as updated_by_name,
  updater.email as updated_by_email,
  p.created_at,
  p.updated_at,
  series.plan_name
from production_plans p
join production_plan_series series on series.id = p.series_id
join products product on product.id = p.product_id
left join lateral (
  select recipe.id
  from recipes recipe
  where recipe.product_id = p.product_id and recipe.is_active = true
  order by recipe.version desc
  limit 1
) active_recipe on true
left join dependency_state ds on ds.plan_id = p.id
left join profiles creator on creator.user_id = p.created_by
left join profiles updater on updater.user_id = p.updated_by;

create or replace view production_plan_dependency_details as
select
  d.id,
  d.plan_id,
  d.node_key,
  d.parent_node_key,
  d.depth,
  d.expected_product_id,
  expected.name as expected_product_name,
  expected.type as expected_product_type,
  d.selected_product_id,
  selected.name as selected_product_name,
  selected.type as selected_product_type,
  d.source_kind,
  d.source_lot_id,
  lot.lot_number,
  lot.supplier_lot,
  lot.supplier_name,
  lot.effective_date as lot_date,
  d.source_plan_id,
  child.product_id as source_plan_product_id,
  child_product.name as source_plan_product_name,
  child.planned_date as source_plan_date,
  child.status as source_plan_status
from production_plan_dependencies d
join products expected on expected.id = d.expected_product_id
join products selected on selected.id = d.selected_product_id
left join planning_eligible_lots lot on lot.lot_id = d.source_lot_id
left join production_plans child on child.id = d.source_plan_id
left join products child_product on child_product.id = child.product_id;

create or replace function create_production_plan_bundle(
  p_series jsonb,
  p_plans jsonb,
  p_dependencies jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := ensure_traceability_profile();
  v_item jsonb;
  v_series production_plan_series%rowtype;
  v_series_count integer := 0;
  v_plan_count integer := 0;
  v_dependency_count integer := 0;
  v_start date;
  v_end date;
  v_planned_date date;
  v_recipe_id uuid;
begin
  if jsonb_typeof(coalesce(p_series, 'null'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_plans, 'null'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_dependencies, 'null'::jsonb)) <> 'array'
  then
    raise exception 'Planning bundle payloads must be arrays.';
  end if;

  for v_item in select value from jsonb_array_elements(p_series)
  loop
    v_start := (v_item->>'startDate')::date;
    v_end := (v_item->>'endDate')::date;
    if v_end < v_start or v_end - v_start > 89 then
      raise exception 'Planning ranges must contain between 1 and 90 calendar days.';
    end if;

    insert into production_plan_series (
      id, plan_name, product_id, frequency, interval_days, days_of_week, start_date, end_date,
      status, created_by, updated_by
    )
    values (
      (v_item->>'id')::uuid,
      coalesce(nullif(trim(coalesce(v_item->>'planName', '')), ''), 'Plan ' || to_char(v_start, 'DD/MM/YYYY')),
      (v_item->>'productId')::uuid,
      v_item->>'frequency',
      coalesce((v_item->>'intervalDays')::integer, 1),
      coalesce(array(select jsonb_array_elements_text(coalesce(v_item->'daysOfWeek', '[]'::jsonb))::smallint), '{}'::smallint[]),
      v_start,
      v_end,
      'active',
      v_actor_id,
      v_actor_id
    );
    v_series_count := v_series_count + 1;
  end loop;

  for v_item in select value from jsonb_array_elements(p_plans)
  loop
    select *
    into v_series
    from production_plan_series
    where id = (v_item->>'seriesId')::uuid
      and product_id = (v_item->>'productId')::uuid;

    v_planned_date := (v_item->>'plannedDate')::date;
    if v_series.id is null
      or v_planned_date < v_series.start_date
      or v_planned_date > v_series.end_date
      or (v_series.frequency = 'once' and v_planned_date <> v_series.start_date)
      or (v_series.frequency = 'weekdays' and extract(isodow from v_planned_date)::integer > 5)
      or (
        v_series.frequency = 'every_n_days'
        and mod(v_planned_date - v_series.start_date, v_series.interval_days) <> 0
      )
      or (
        v_series.frequency = 'specific_days'
        and not (extract(dow from v_planned_date)::smallint = any(v_series.days_of_week))
      )
    then
      raise exception 'Planned occurrence does not match its series product, range, or recurrence.';
    end if;

    select id into v_recipe_id
    from recipes
    where id = (v_item->>'recipeId')::uuid
      and product_id = (v_item->>'productId')::uuid
      and is_active = true;

    if v_recipe_id is null then
      raise exception 'Every planned product must have the referenced active recipe.';
    end if;

    insert into production_plans (
      id, series_id, product_id, planned_date, recipe_id, recipe_version,
      schema_snapshot, responsible_name, notes, created_by, updated_by
    )
    values (
      (v_item->>'id')::uuid,
      (v_item->>'seriesId')::uuid,
      (v_item->>'productId')::uuid,
      v_planned_date,
      v_recipe_id,
      (v_item->>'recipeVersion')::integer,
      coalesce(v_item->'schemaSnapshot', '{}'::jsonb),
      nullif(trim(coalesce(v_item->>'responsibleName', '')), ''),
      nullif(trim(coalesce(v_item->>'notes', '')), ''),
      v_actor_id,
      v_actor_id
    );
    v_plan_count := v_plan_count + 1;
  end loop;

  for v_item in select value from jsonb_array_elements(p_dependencies)
  loop
    insert into production_plan_dependencies (
      id, plan_id, node_key, parent_node_key, depth,
      expected_product_id, selected_product_id, source_kind,
      source_lot_id, source_plan_id, created_by, updated_by
    )
    values (
      coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid()),
      (v_item->>'planId')::uuid,
      v_item->>'nodeKey',
      nullif(v_item->>'parentNodeKey', ''),
      coalesce((v_item->>'depth')::integer, 0),
      (v_item->>'expectedProductId')::uuid,
      (v_item->>'selectedProductId')::uuid,
      v_item->>'sourceKind',
      nullif(v_item->>'sourceLotId', '')::uuid,
      nullif(v_item->>'sourcePlanId', '')::uuid,
      v_actor_id,
      v_actor_id
    );
    v_dependency_count := v_dependency_count + 1;
  end loop;

  if exists (
    select 1
    from production_plans p
    join production_plan_series s on s.id = p.series_id
    left join production_plan_dependencies d on d.plan_id = p.id
    where s.id in (select (value->>'id')::uuid from jsonb_array_elements(p_series))
    group by p.id
    having count(d.id) = 0
  ) then
    raise exception 'Every planned production must have resolved component dependencies.';
  end if;

  if exists (
    select 1
    from production_plans planned
    join production_plan_series series on series.id = planned.series_id
    join recipe_components component on component.recipe_id = planned.recipe_id
    where series.id in (select (value->>'id')::uuid from jsonb_array_elements(p_series))
      and component.mandatory = true
      and not exists (
        select 1
        from production_plan_dependencies dependency
        where dependency.plan_id = planned.id
          and dependency.expected_product_id = component.component_product_id
      )
  ) then
    raise exception 'Every mandatory recipe component must have a planning source.';
  end if;

  if exists (
    select 1
    from production_plans planned
    join production_plan_series series on series.id = planned.series_id
    join production_plan_dependencies dependency on dependency.plan_id = planned.id
    where series.id in (select (value->>'id')::uuid from jsonb_array_elements(p_series))
      and not exists (
        select 1
        from recipe_components component
        where component.recipe_id = planned.recipe_id
          and component.component_product_id = dependency.expected_product_id
      )
  ) then
    raise exception 'Planning dependencies must belong to the stored recipe snapshot.';
  end if;

  perform log_traceability_event(
    'production_plan.created',
    'production_plan_series',
    null,
    jsonb_build_object('seriesCount', v_series_count, 'planCount', v_plan_count, 'dependencyCount', v_dependency_count)
  );

  return jsonb_build_object(
    'seriesCount', v_series_count,
    'planCount', v_plan_count,
    'dependencyCount', v_dependency_count
  );
end;
$$;

create or replace function cancel_production_plan(p_plan_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := ensure_traceability_profile();
  v_plan production_plans%rowtype;
begin
  select * into v_plan from production_plans where id = p_plan_id for update;
  if v_plan.id is null then raise exception 'Production plan not found.'; end if;
  if v_plan.status = 'completed' then raise exception 'Completed production plans are immutable.'; end if;
  if v_plan.status = 'cancelled' then return; end if;
  if exists (
    select 1
    from production_plan_dependencies d
    join production_plans parent on parent.id = d.plan_id
    where d.source_plan_id = p_plan_id and parent.status = 'planned'
  ) then
    raise exception 'This plan is required by another active production plan.';
  end if;

  update production_plans
  set status = 'cancelled',
      cancelled_reason = nullif(trim(coalesce(p_reason, '')), ''),
      cancelled_at = now(),
      cancelled_by = v_actor_id,
      updated_by = v_actor_id,
      updated_at = now()
  where id = p_plan_id;

  perform log_traceability_event('production_plan.cancelled', 'production_plan', p_plan_id, jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function refresh_production_plan(
  p_plan_id uuid,
  p_recipe_id uuid,
  p_recipe_version integer,
  p_schema_snapshot jsonb,
  p_dependencies jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := ensure_traceability_profile();
  v_plan production_plans%rowtype;
  v_item jsonb;
begin
  select * into v_plan from production_plans where id = p_plan_id for update;
  if v_plan.id is null then raise exception 'Production plan not found.'; end if;
  if v_plan.status <> 'planned' then raise exception 'Only pending production plans can be refreshed.'; end if;
  if not exists (
    select 1 from recipes where id = p_recipe_id and product_id = v_plan.product_id and is_active = true
  ) then
    raise exception 'The refreshed recipe must be active for this product.';
  end if;

  delete from production_plan_dependencies where plan_id = p_plan_id;
  update production_plans
  set recipe_id = p_recipe_id,
      recipe_version = p_recipe_version,
      schema_snapshot = coalesce(p_schema_snapshot, '{}'::jsonb),
      updated_by = v_actor_id,
      updated_at = now()
  where id = p_plan_id;

  for v_item in select value from jsonb_array_elements(p_dependencies)
  loop
    insert into production_plan_dependencies (
      plan_id, node_key, parent_node_key, depth, expected_product_id,
      selected_product_id, source_kind, source_lot_id, source_plan_id,
      created_by, updated_by
    )
    values (
      p_plan_id,
      v_item->>'nodeKey',
      nullif(v_item->>'parentNodeKey', ''),
      coalesce((v_item->>'depth')::integer, 0),
      (v_item->>'expectedProductId')::uuid,
      (v_item->>'selectedProductId')::uuid,
      v_item->>'sourceKind',
      nullif(v_item->>'sourceLotId', '')::uuid,
      nullif(v_item->>'sourcePlanId', '')::uuid,
      v_actor_id,
      v_actor_id
    );
  end loop;

  if not exists (
    select 1 from production_plan_dependencies where plan_id = p_plan_id
  ) then
    raise exception 'Every planned production must have resolved component dependencies.';
  end if;

  if exists (
    select 1
    from recipe_components component
    where component.recipe_id = p_recipe_id
      and component.mandatory = true
      and not exists (
        select 1
        from production_plan_dependencies dependency
        where dependency.plan_id = p_plan_id
          and dependency.expected_product_id = component.component_product_id
      )
  ) then
    raise exception 'Every mandatory recipe component must have a planning source.';
  end if;

  if exists (
    select 1
    from production_plan_dependencies dependency
    where dependency.plan_id = p_plan_id
      and not exists (
        select 1
        from recipe_components component
        where component.recipe_id = p_recipe_id
          and component.component_product_id = dependency.expected_product_id
      )
  ) then
    raise exception 'Planning dependencies must belong to the refreshed recipe.';
  end if;

  perform log_traceability_event('production_plan.refreshed', 'production_plan', p_plan_id, '{}'::jsonb);
end;
$$;

create or replace function get_production_plan_confirmation_context(p_plan_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with recursive dependency_walk as (
    select
      d.*,
      array[p_plan_id]::uuid[] as plan_path
    from production_plan_dependencies d
    where d.plan_id = p_plan_id
    union all
    select
      child.*,
      parent.plan_path || parent.source_plan_id
    from dependency_walk parent
    join production_plan_dependencies child on child.plan_id = parent.source_plan_id
    where parent.source_kind = 'planned_production'
      and parent.source_plan_id is not null
      and not parent.source_plan_id = any(parent.plan_path)
  ),
  resolved as (
    select distinct on (walk.expected_product_id)
      walk.expected_product_id,
      walk.selected_product_id,
      case
        when walk.source_kind in ('raw_lot', 'existing_production_lot') then walk.source_lot_id
        when walk.source_kind = 'planned_production' then produced.id
        else null
      end as lot_id
    from dependency_walk walk
    left join production_plans child on child.id = walk.source_plan_id
    left join lots produced
      on produced.source_type = 'fabrication'
      and produced.source_id = child.production_batch_id
      and produced.product_id = walk.selected_product_id
    where walk.source_kind <> 'water'
    order by walk.expected_product_id, walk.depth
  )
  select jsonb_build_object(
    'planId', plan.id,
    'productId', plan.product_id,
    'plannedDate', plan.planned_date,
    'responsibleName', plan.responsible_name,
    'status', overview.derived_status,
    'selections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'expectedProductId', resolved.expected_product_id,
        'selectedProductId', resolved.selected_product_id,
        'lotId', resolved.lot_id
      ))
      from resolved
    ), '[]'::jsonb)
  )
  from production_plans plan
  join production_plan_overview overview on overview.id = plan.id
  where plan.id = p_plan_id;
$$;

create or replace function create_production_with_traceability_v3(
  p_plan_id uuid,
  p_production_date timestamptz,
  p_product_id uuid,
  p_generated_lot text,
  p_responsible_name text,
  p_operation text,
  p_observations text,
  p_consumed_lot_selections jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := ensure_traceability_profile();
  v_plan production_plans%rowtype;
  v_status text;
  v_batch_id uuid;
  v_plan_lot_mismatch_count integer;
begin
  select p.*
  into v_plan
  from production_plans p
  where p.id = p_plan_id
  for update of p;

  if v_plan.id is null then raise exception 'Production plan not found.'; end if;
  select derived_status into v_status from production_plan_overview where id = p_plan_id;
  if v_plan.status <> 'planned' or v_status not in ('ready', 'overdue') then
    raise exception 'Only ready or overdue plans can be confirmed.';
  end if;
  if v_plan.product_id <> p_product_id or v_plan.planned_date <> p_production_date::date then
    raise exception 'Confirmed product and date must match the production plan.';
  end if;

  with recursive dependency_walk as (
    select
      d.*,
      array[p_plan_id]::uuid[] as plan_path
    from production_plan_dependencies d
    where d.plan_id = p_plan_id
    union all
    select
      child.*,
      parent.plan_path || parent.source_plan_id
    from dependency_walk parent
    join production_plan_dependencies child on child.plan_id = parent.source_plan_id
    where parent.source_kind = 'planned_production'
      and parent.source_plan_id is not null
      and not parent.source_plan_id = any(parent.plan_path)
  ),
  planned_selections as (
    select distinct on (walk.expected_product_id)
      walk.expected_product_id,
      case
        when walk.source_kind in ('raw_lot', 'existing_production_lot') then walk.source_lot_id
        when walk.source_kind = 'planned_production' then produced.id
        else null
      end as consumed_lot_id
    from dependency_walk walk
    left join production_plans child on child.id = walk.source_plan_id
    left join lots produced
      on produced.source_type = 'fabrication'
      and produced.source_id = child.production_batch_id
      and produced.product_id = walk.selected_product_id
    where walk.source_kind <> 'water'
    order by walk.expected_product_id, walk.depth
  ),
  submitted_selections as (
    select distinct
      nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '')::uuid as expected_product_id,
      nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
    from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) as item(value)
    where nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '') is not null
      and nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '') is not null
  ),
  missing_expected as (
    select expected_product_id, consumed_lot_id
    from planned_selections
    where consumed_lot_id is not null
    except
    select expected_product_id, consumed_lot_id
    from submitted_selections
  ),
  unexpected_submitted as (
    select expected_product_id, consumed_lot_id
    from submitted_selections
    except
    select expected_product_id, consumed_lot_id
    from planned_selections
    where consumed_lot_id is not null
  ),
  mismatches as (
    select expected_product_id, consumed_lot_id
    from missing_expected
    union all
    select expected_product_id, consumed_lot_id
    from unexpected_submitted
  )
  select count(*)
  into v_plan_lot_mismatch_count
  from mismatches;

  if v_plan_lot_mismatch_count > 0 then
    raise exception 'Confirmed lots must match the lots reserved by the production plan.';
  end if;

  v_batch_id := create_production_with_traceability_v2(
    p_production_date,
    p_product_id,
    p_generated_lot,
    p_responsible_name,
    p_operation,
    p_observations,
    p_consumed_lot_selections
  );

  update production_plans
  set status = 'completed',
      production_batch_id = v_batch_id,
      completed_at = now(),
      completed_by = v_actor_id,
      updated_by = v_actor_id,
      updated_at = now()
  where id = p_plan_id;

  perform log_traceability_event(
    'production_plan.completed',
    'production_plan',
    p_plan_id,
    jsonb_build_object('productionBatchId', v_batch_id)
  );

  return v_batch_id;
end;
$$;

alter table production_plan_series enable row level security;
alter table production_plans enable row level security;
alter table production_plan_dependencies enable row level security;

drop policy if exists production_plan_series_authenticated_read on production_plan_series;
create policy production_plan_series_authenticated_read on production_plan_series
for select to authenticated using (true);

drop policy if exists production_plans_authenticated_read on production_plans;
create policy production_plans_authenticated_read on production_plans
for select to authenticated using (true);

drop policy if exists production_plan_dependencies_authenticated_read on production_plan_dependencies;
create policy production_plan_dependencies_authenticated_read on production_plan_dependencies
for select to authenticated using (true);

revoke all on production_plan_series, production_plans, production_plan_dependencies from anon;
revoke all on production_plan_series, production_plans, production_plan_dependencies from authenticated;
grant select on production_plan_series, production_plans, production_plan_dependencies to authenticated;
grant select on planning_eligible_lots, production_plan_overview, production_plan_dependency_details to authenticated;

revoke all on function create_production_plan_bundle(jsonb, jsonb, jsonb) from public;
revoke all on function cancel_production_plan(uuid, text) from public;
revoke all on function refresh_production_plan(uuid, uuid, integer, jsonb, jsonb) from public;
revoke all on function get_production_plan_confirmation_context(uuid) from public;
revoke all on function create_production_with_traceability_v3(uuid, timestamptz, uuid, text, text, text, text, jsonb) from public;

grant execute on function create_production_plan_bundle(jsonb, jsonb, jsonb) to authenticated;
grant execute on function cancel_production_plan(uuid, text) to authenticated;
grant execute on function refresh_production_plan(uuid, uuid, integer, jsonb, jsonb) to authenticated;
grant execute on function get_production_plan_confirmation_context(uuid) to authenticated;
grant execute on function create_production_with_traceability_v3(uuid, timestamptz, uuid, text, text, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';

create or replace function update_production_plan_series_status(
  p_series_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := ensure_traceability_profile();
begin
  if p_status not in ('active', 'paused') then
    raise exception 'Unsupported production plan series status: %', p_status;
  end if;

  update production_plan_series
  set status = p_status,
      updated_by = v_actor_id,
      updated_at = now()
  where id = p_series_id
    and status <> 'archived';

  if not found then
    raise exception 'Production plan series not found.';
  end if;

  perform log_traceability_event(
    case when p_status = 'paused' then 'production_plan_series.paused' else 'production_plan_series.resumed' end,
    'production_plan_series',
    p_series_id,
    jsonb_build_object('status', p_status)
  );
end;
$$;

create or replace function archive_production_plan_series(
  p_series_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := ensure_traceability_profile();
  v_cancelled_count integer := 0;
begin
  update production_plan_series
  set status = 'archived',
      updated_by = v_actor_id,
      updated_at = now()
  where id = p_series_id;

  if not found then
    raise exception 'Production plan series not found.';
  end if;

  update production_plans
  set status = 'cancelled',
      cancelled_reason = coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'Planification supprimee'),
      cancelled_at = now(),
      cancelled_by = v_actor_id,
      updated_by = v_actor_id,
      updated_at = now()
  where series_id = p_series_id
    and status = 'planned';

  get diagnostics v_cancelled_count = row_count;

  perform log_traceability_event(
    'production_plan_series.archived',
    'production_plan_series',
    p_series_id,
    jsonb_build_object('reason', p_reason, 'cancelledPlans', v_cancelled_count)
  );
end;
$$;

revoke all on function update_production_plan_series_status(uuid, text) from public;
revoke all on function archive_production_plan_series(uuid, text) from public;

grant execute on function update_production_plan_series_status(uuid, text) to authenticated;
grant execute on function archive_production_plan_series(uuid, text) to authenticated;

notify pgrst, 'reload schema';


-- 022_biscuit_semi_finished_substitutions
-- Allow operator-selected semi-finished biscuit substitutions during production confirmation.
-- The original blueprint component is preserved as the expected component, while the
-- selected component and row path are stored for audit, snapshots, history, and PDFs.

update products
set substitution_group = 'biscuit',
    updated_at = now()
where type = 'semi_finished'
  and is_active = true
  and lower(name) like '%biscuit%'
  and coalesce(substitution_group, '') <> 'biscuit';

create or replace function assign_biscuit_substitution_group()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.type = 'semi_finished' and new.is_active = true and lower(coalesce(new.name, '')) like '%biscuit%' then
    new.substitution_group = 'biscuit';
  end if;

  return new;
end;
$$;

drop trigger if exists products_assign_biscuit_substitution_group on products;
create trigger products_assign_biscuit_substitution_group
before insert or update of name, type, is_active on products
for each row execute function assign_biscuit_substitution_group();

alter table production_consumptions
  add column if not exists selected_component_product_id uuid references products(id),
  add column if not exists component_node_key text,
  add column if not exists parent_component_node_key text,
  add column if not exists component_depth integer;

update production_consumptions pc
set selected_component_product_id = coalesce(pc.selected_component_product_id, l.product_id),
    component_depth = coalesce(pc.component_depth, 1),
    component_node_key = coalesce(pc.component_node_key, coalesce(pc.expected_component_product_id, l.product_id)::text)
from lots l
where l.id = pc.consumed_lot_id
  and (
    pc.selected_component_product_id is null
    or pc.component_depth is null
    or pc.component_node_key is null
  );

create index if not exists production_consumptions_selected_component_idx
  on production_consumptions(selected_component_product_id);

create index if not exists production_consumptions_component_node_idx
  on production_consumptions(production_batch_id, component_node_key);

drop view if exists production_consumption_details;

create or replace view production_consumption_details as
select
  pc.id,
  pc.production_batch_id,
  pc.component_node_key,
  pc.parent_component_node_key,
  pc.component_depth,
  pc.selected_component_product_id,
  coalesce(pc.expected_component_product_id, l.product_id) as expected_component_product_id,
  expected_product.code as expected_component_product_code,
  expected_product.name as expected_component_product_name,
  expected_product.type as expected_component_product_type,
  expected_product.category as expected_component_product_category,
  l.id as lot_id,
  l.lot_number,
  l.product_id as consumed_product_id,
  consumed_product.code as consumed_product_code,
  consumed_product.name as consumed_product_name,
  consumed_product.type as consumed_product_type,
  consumed_product.category as consumed_product_category,
  l.supplier_lot,
  l.source_type,
  l.created_at as lot_created_at,
  pc.created_at as linked_at
from production_consumptions pc
join lots l on l.id = pc.consumed_lot_id
join products consumed_product on consumed_product.id = l.product_id
join products expected_product on expected_product.id = coalesce(pc.expected_component_product_id, l.product_id);

create or replace function build_production_traceability_snapshot(p_batch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_has_effective_nodes boolean;
  v_snapshot jsonb;
begin
  select exists (
    select 1
    from production_consumptions pc
    where pc.production_batch_id = p_batch_id
      and pc.component_node_key is not null
  )
  into v_has_effective_nodes;

  if v_has_effective_nodes then
    with batch_context as (
      select
        pb.id,
        pb.product_id,
        pb.generated_lot,
        p.name as product_name,
        p.type as product_type,
        r.diagram_nodes,
        r.diagram_edges,
        r.diagram_viewport
      from production_batches pb
      join products p on p.id = pb.product_id
      left join lateral (
        select recipes.diagram_nodes, recipes.diagram_edges, recipes.diagram_viewport
        from recipes
        where recipes.product_id = pb.product_id
          and recipes.is_active = true
        order by recipes.version desc, recipes.created_at desc
        limit 1
      ) r on true
      where pb.id = p_batch_id
    ),
    base_component_nodes as (
      select
        coalesce(pc.component_node_key, coalesce(pc.expected_component_product_id, l.product_id)::text) as node_id,
        coalesce(pc.parent_component_node_key, bc.product_id::text) as parent_node_id,
        coalesce(pc.selected_component_product_id, l.product_id) as product_id,
        display_product.name as product_name,
        display_product.type as product_type,
        coalesce(pc.component_depth, 1) as depth,
        jsonb_agg(
          jsonb_build_object(
            'lotId', l.id,
            'lotNumber', l.lot_number,
            'supplierLot', l.supplier_lot,
            'sourceType', l.source_type,
            'lotCreatedAt', l.created_at,
            'productId', l.product_id,
            'productName', consumed_product.name,
            'productType', consumed_product.type,
            'productCategory', consumed_product.category,
            'expectedProductId', coalesce(pc.expected_component_product_id, l.product_id),
            'expectedProductName', expected_product.name
          )
          order by l.created_at desc, l.id
        ) as lots
      from batch_context bc
      join production_consumptions pc on pc.production_batch_id = bc.id
      join lots l on l.id = pc.consumed_lot_id
      join products consumed_product on consumed_product.id = l.product_id
      join products expected_product on expected_product.id = coalesce(pc.expected_component_product_id, l.product_id)
      join products display_product on display_product.id = coalesce(pc.selected_component_product_id, l.product_id)
      group by
        bc.product_id,
        coalesce(pc.component_node_key, coalesce(pc.expected_component_product_id, l.product_id)::text),
        coalesce(pc.parent_component_node_key, bc.product_id::text),
        coalesce(pc.selected_component_product_id, l.product_id),
        display_product.name,
        display_product.type,
        coalesce(pc.component_depth, 1)
    ),
    expanded_substitution_nodes as (
      select
        concat(
          coalesce(pc.component_node_key, coalesce(pc.expected_component_product_id, l.product_id)::text),
          '/lot:',
          l.id,
          '/',
          child_node.value->>'nodeId'
        ) as node_id,
        case
          when child_node.value->>'parentNodeId' = child_batch.product_id::text then
            coalesce(pc.component_node_key, coalesce(pc.expected_component_product_id, l.product_id)::text)
          else concat(
            coalesce(pc.component_node_key, coalesce(pc.expected_component_product_id, l.product_id)::text),
            '/lot:',
            l.id,
            '/',
            child_node.value->>'parentNodeId'
          )
        end as parent_node_id,
        nullif(child_node.value->>'productId', '')::uuid as product_id,
        child_node.value->>'productName' as product_name,
        nullif(child_node.value->>'productType', '')::product_type as product_type,
        coalesce(pc.component_depth, 1) + coalesce(nullif(child_node.value->>'depth', '')::integer, 1) as depth,
        coalesce(child_node.value->'lots', '[]'::jsonb) as lots
      from batch_context bc
      join production_consumptions pc on pc.production_batch_id = bc.id
      join lots l on l.id = pc.consumed_lot_id
      join products expected_product on expected_product.id = coalesce(pc.expected_component_product_id, l.product_id)
      join products selected_product on selected_product.id = coalesce(pc.selected_component_product_id, l.product_id)
      join production_batches child_batch on child_batch.id = l.source_id
      cross join lateral jsonb_array_elements(coalesce(child_batch.traceability_snapshot->'components', '[]'::jsonb)) as child_node(value)
      where l.source_type = 'fabrication'
        and selected_product.type = 'semi_finished'
        and coalesce(pc.selected_component_product_id, l.product_id) <> coalesce(pc.expected_component_product_id, l.product_id)
        and expected_product.substitution_group is not null
        and expected_product.substitution_group = selected_product.substitution_group
    ),
    component_nodes as (
      select * from base_component_nodes
      union all
      select * from expanded_substitution_nodes
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
    into v_snapshot
    from batch_context bc;

    return v_snapshot;
  end if;

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
            'lotCreatedAt', lot.created_at,
            'productId', lot_product.id,
            'productName', lot_product.name,
            'productType', lot_product.type,
            'productCategory', lot_product.category,
            'expectedProductId', tree.component_product_id,
            'expectedProductName', product.name
          )
          order by lot.created_at desc, lot.id
        )
        from production_consumptions consumption
        join lots lot on lot.id = consumption.consumed_lot_id
        join products lot_product on lot_product.id = lot.product_id
        where consumption.production_batch_id = p_batch_id
          and (
            consumption.expected_component_product_id = tree.component_product_id
            or (consumption.expected_component_product_id is null and lot.product_id = tree.component_product_id)
          )
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
  into v_snapshot
  from batch_context bc;

  return v_snapshot;
end;
$$;

create or replace function create_production_with_traceability_v2(
  p_production_date timestamptz,
  p_product_id uuid,
  p_generated_lot text,
  p_responsible_name text,
  p_operation text,
  p_observations text,
  p_consumed_lot_selections jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := ensure_traceability_profile();
  v_product products;
  v_recipe_id uuid;
  v_batch_id uuid;
  v_required_traceable_count integer;
  v_selected_count integer;
  v_missing_count integer;
  v_invalid_count integer;
  v_has_node_keys boolean;
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
  order by version desc, created_at desc
  limit 1;

  if v_recipe_id is null then
    raise exception 'Production product must have an active blueprint.';
  end if;

  if nullif(trim(coalesce(p_generated_lot, '')), '') is null then
    raise exception 'Generated lot is required.';
  end if;

  with selected_lots as (
    select
      nullif(coalesce(item.value->>'nodeKey', item.value->>'node_key', item.value->>'componentNodeKey', item.value->>'component_node_key'), '') as node_key
    from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) as item(value)
  )
  select exists(select 1 from selected_lots where node_key is not null)
  into v_has_node_keys;

  if v_has_node_keys then
    with selected_lots as (
      select distinct
        nullif(coalesce(item.value->>'nodeKey', item.value->>'node_key', item.value->>'componentNodeKey', item.value->>'component_node_key'), '') as node_key,
        nullif(coalesce(item.value->>'parentNodeKey', item.value->>'parent_node_key', item.value->>'parentComponentNodeKey', item.value->>'parent_component_node_key'), '') as parent_node_key,
        coalesce(nullif(coalesce(item.value->>'depth', item.value->>'componentDepth', item.value->>'component_depth'), '')::integer, 1) as depth,
        nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '')::uuid as expected_product_id,
        nullif(coalesce(item.value->>'selectedProductId', item.value->>'selected_product_id'), '')::uuid as selected_product_id,
        nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
      from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) as item(value)
      where nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '') is not null
        and nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '') is not null
        and nullif(coalesce(item.value->>'nodeKey', item.value->>'node_key', item.value->>'componentNodeKey', item.value->>'component_node_key'), '') is not null
    )
    select count(*)
    into v_selected_count
    from selected_lots;

    if v_selected_count = 0 then
      raise exception 'At least one consumed lot is required.';
    end if;

    with selected_lots as (
      select distinct
        nullif(coalesce(item.value->>'nodeKey', item.value->>'node_key', item.value->>'componentNodeKey', item.value->>'component_node_key'), '') as node_key,
        nullif(coalesce(item.value->>'parentNodeKey', item.value->>'parent_node_key', item.value->>'parentComponentNodeKey', item.value->>'parent_component_node_key'), '') as parent_node_key,
        nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '')::uuid as expected_product_id,
        nullif(coalesce(item.value->>'selectedProductId', item.value->>'selected_product_id'), '')::uuid as selected_product_id,
        nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
      from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) as item(value)
      where nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '') is not null
        and nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '') is not null
        and nullif(coalesce(item.value->>'nodeKey', item.value->>'node_key', item.value->>'componentNodeKey', item.value->>'component_node_key'), '') is not null
    ),
    root_required as (
      select rc.component_product_id
      from recipe_components rc
      join products p on p.id = rc.component_product_id
      where rc.recipe_id = v_recipe_id
        and not (p.type = 'raw' and lower(trim(p.name)) = 'eau')
    ),
    child_required as (
      select
        parent.node_key as parent_node_key,
        child_rc.component_product_id
      from selected_lots parent
      join products selected_product on selected_product.id = coalesce(parent.selected_product_id, parent.expected_product_id)
        and selected_product.type = 'semi_finished'
      join recipes child_recipe on child_recipe.product_id = selected_product.id
        and child_recipe.is_active = true
      join recipe_components child_rc on child_rc.recipe_id = child_recipe.id
      join products child_product on child_product.id = child_rc.component_product_id
      where not (child_product.type = 'raw' and lower(trim(child_product.name)) = 'eau')
        and selected_product.id = parent.expected_product_id
    ),
    missing as (
      select 'root' as scope
      from root_required required
      where not exists (
        select 1
        from selected_lots selected
        where selected.parent_node_key is null
          and selected.expected_product_id = required.component_product_id
      )
      union all
      select 'child' as scope
      from child_required required
      where not exists (
        select 1
        from selected_lots selected
        where selected.parent_node_key = required.parent_node_key
          and selected.expected_product_id = required.component_product_id
      )
    )
    select count(*)
    into v_missing_count
    from missing;

    if v_missing_count > 0 then
      raise exception 'Every blueprint component must have a confirmed lot.';
    end if;

    with selected_lots as (
      select distinct
        nullif(coalesce(item.value->>'nodeKey', item.value->>'node_key', item.value->>'componentNodeKey', item.value->>'component_node_key'), '') as node_key,
        nullif(coalesce(item.value->>'parentNodeKey', item.value->>'parent_node_key', item.value->>'parentComponentNodeKey', item.value->>'parent_component_node_key'), '') as parent_node_key,
        nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '')::uuid as expected_product_id,
        nullif(coalesce(item.value->>'selectedProductId', item.value->>'selected_product_id'), '')::uuid as selected_product_id,
        nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
      from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) as item(value)
      where nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '') is not null
        and nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '') is not null
        and nullif(coalesce(item.value->>'nodeKey', item.value->>'node_key', item.value->>'componentNodeKey', item.value->>'component_node_key'), '') is not null
    ),
    selected_with_lots as (
      select
        selected.*,
        coalesce(selected.selected_product_id, l.product_id) as effective_selected_product_id,
        l.product_id as lot_product_id,
        expected_product.substitution_group as expected_group,
        selected_product.substitution_group as selected_group,
        selected_product.type as selected_product_type,
        exists (
          select 1
          from recipes selected_recipe
          where selected_recipe.product_id = selected_product.id
            and selected_recipe.is_active = true
        ) as selected_has_active_recipe
      from selected_lots selected
      left join lots l on l.id = selected.consumed_lot_id
        and l.lot_status = 'available'
        and l.quality_status = 'conforme'
      left join products expected_product on expected_product.id = selected.expected_product_id
        and expected_product.is_active = true
      left join products selected_product on selected_product.id = coalesce(selected.selected_product_id, l.product_id)
        and selected_product.is_active = true
    ),
    unexpected as (
      select selected.node_key
      from selected_lots selected
      where selected.parent_node_key is null
        and not exists (
          select 1
          from recipe_components rc
          where rc.recipe_id = v_recipe_id
            and rc.component_product_id = selected.expected_product_id
        )
      union all
      select selected.node_key
      from selected_lots selected
      join selected_lots parent on parent.node_key = selected.parent_node_key
      where selected.parent_node_key is not null
        and not exists (
          select 1
          from recipes parent_recipe
          join recipe_components rc on rc.recipe_id = parent_recipe.id
          where parent_recipe.product_id = coalesce(parent.selected_product_id, parent.expected_product_id)
            and parent_recipe.is_active = true
            and rc.component_product_id = selected.expected_product_id
        )
      union all
      select selected.node_key
      from selected_lots selected
      where selected.parent_node_key is not null
        and not exists (
          select 1
          from selected_lots parent
          where parent.node_key = selected.parent_node_key
        )
    ),
    invalid_lots as (
      select selected.node_key
      from selected_with_lots selected
      where selected.lot_product_id is null
         or selected.effective_selected_product_id is null
         or selected.expected_product_id is null
         or selected.lot_product_id <> selected.effective_selected_product_id
         or (
           selected.effective_selected_product_id <> selected.expected_product_id
           and not (
             selected.expected_group is not null
             and selected.expected_group = selected.selected_group
             and (
               selected.selected_product_type <> 'semi_finished'
               or selected.selected_has_active_recipe
             )
           )
         )
    ),
    invalid as (
      select node_key from unexpected
      union all
      select node_key from invalid_lots
    )
    select count(*)
    into v_invalid_count
    from invalid;

    if v_invalid_count > 0 then
      raise exception 'Selected lots must be available lots for the active blueprint components or an allowed substitution group.';
    end if;
  else
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

    with selected_lots as (
      select distinct
        nullif(coalesce(selected.value->>'expectedProductId', selected.value->>'expected_product_id'), '')::uuid as expected_product_id,
        nullif(coalesce(selected.value->>'consumedLotId', selected.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
      from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) as selected(value)
      where nullif(coalesce(selected.value->>'expectedProductId', selected.value->>'expected_product_id'), '') is not null
        and nullif(coalesce(selected.value->>'consumedLotId', selected.value->>'consumed_lot_id'), '') is not null
    )
    select count(*)
    into v_selected_count
    from selected_lots;

    if v_selected_count = 0 and v_required_traceable_count > 0 then
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
      select distinct
        nullif(coalesce(selected.value->>'expectedProductId', selected.value->>'expected_product_id'), '')::uuid as expected_product_id,
        nullif(coalesce(selected.value->>'consumedLotId', selected.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
      from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) as selected(value)
      where nullif(coalesce(selected.value->>'expectedProductId', selected.value->>'expected_product_id'), '') is not null
        and nullif(coalesce(selected.value->>'consumedLotId', selected.value->>'consumed_lot_id'), '') is not null
    )
    select count(*)
    into v_missing_count
    from required_components rc
    join products p on p.id = rc.component_product_id
    where not (p.type = 'raw' and lower(trim(p.name)) = 'eau')
      and not exists (
        select 1
        from selected_lots sl
        where sl.expected_product_id = rc.component_product_id
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
      select distinct
        nullif(coalesce(selected.value->>'expectedProductId', selected.value->>'expected_product_id'), '')::uuid as expected_product_id,
        nullif(coalesce(selected.value->>'consumedLotId', selected.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
      from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) as selected(value)
      where nullif(coalesce(selected.value->>'expectedProductId', selected.value->>'expected_product_id'), '') is not null
        and nullif(coalesce(selected.value->>'consumedLotId', selected.value->>'consumed_lot_id'), '') is not null
    ),
    validated_lots as (
      select
        sl.expected_product_id,
        sl.consumed_lot_id,
        expected_product.substitution_group as expected_group,
        consumed_product.substitution_group as consumed_group,
        l.product_id as consumed_product_id
      from selected_lots sl
      left join required_components rc on rc.component_product_id = sl.expected_product_id
      left join products expected_product on expected_product.id = sl.expected_product_id
        and expected_product.is_active = true
      left join lots l on l.id = sl.consumed_lot_id
        and l.lot_status = 'available'
        and l.quality_status = 'conforme'
      left join products consumed_product on consumed_product.id = l.product_id
        and consumed_product.is_active = true
      where rc.component_product_id is null
         or l.id is null
         or expected_product.id is null
         or consumed_product.id is null
         or (
           l.product_id <> sl.expected_product_id
           and not (
             expected_product.substitution_group is not null
             and expected_product.substitution_group = consumed_product.substitution_group
           )
         )
    )
    select count(*)
    into v_invalid_count
    from validated_lots;

    if v_invalid_count > 0 then
      raise exception 'Selected lots must be available lots for the active blueprint components or an allowed substitution group.';
    end if;
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
    status,
    confirmed_by,
    confirmed_at,
    created_by,
    updated_by,
    updated_at
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
    'validated',
    v_actor_id,
    now(),
    v_actor_id,
    v_actor_id,
    now()
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
    source_id,
    created_by,
    updated_by,
    updated_at
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
    v_batch_id,
    v_actor_id,
    v_actor_id,
    now()
  );

  insert into production_consumptions (
    production_batch_id,
    expected_component_product_id,
    selected_component_product_id,
    component_node_key,
    parent_component_node_key,
    component_depth,
    consumed_lot_id,
    quantity_used,
    unit,
    created_by,
    updated_by,
    updated_at
  )
  select distinct
    v_batch_id,
    selected.expected_product_id,
    coalesce(selected.selected_product_id, l.product_id),
    selected.node_key,
    selected.parent_node_key,
    selected.depth,
    selected.consumed_lot_id,
    null::numeric,
    null::text,
    v_actor_id,
    v_actor_id,
    now()
  from (
    select
      nullif(coalesce(item.value->>'nodeKey', item.value->>'node_key', item.value->>'componentNodeKey', item.value->>'component_node_key'), '') as node_key,
      nullif(coalesce(item.value->>'parentNodeKey', item.value->>'parent_node_key', item.value->>'parentComponentNodeKey', item.value->>'parent_component_node_key'), '') as parent_node_key,
      coalesce(nullif(coalesce(item.value->>'depth', item.value->>'componentDepth', item.value->>'component_depth'), '')::integer, 1) as depth,
      nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '')::uuid as expected_product_id,
      nullif(coalesce(item.value->>'selectedProductId', item.value->>'selected_product_id'), '')::uuid as selected_product_id,
      nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
    from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) as item(value)
    where nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '') is not null
      and nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '') is not null
  ) selected
  join lots l on l.id = selected.consumed_lot_id;

  perform log_traceability_event(
    'production_lots.confirmed',
    'production_batch',
    v_batch_id,
    jsonb_build_object(
      'productId', p_product_id,
      'productName', v_product.name,
      'generatedLot', trim(p_generated_lot),
      'consumedLotCount', v_selected_count,
      'supportsSubstitutions', true,
      'supportsEffectiveComponentTree', v_has_node_keys
    )
  );

  return v_batch_id;
end;
$$;

revoke all on function build_production_traceability_snapshot(uuid) from public;
grant execute on function build_production_traceability_snapshot(uuid) to authenticated;

revoke all on function create_production_with_traceability_v2(timestamptz, uuid, text, text, text, text, jsonb) from public;
grant execute on function create_production_with_traceability_v2(timestamptz, uuid, text, text, text, text, jsonb) to authenticated;

grant select on production_consumption_details to authenticated;

-- ============================================================
-- 023_repair_substituted_component_snapshots.sql
-- ============================================================
create or replace function hydrate_production_traceability_snapshot_lots(
  p_batch_id uuid,
  p_snapshot jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with snapshot_components as (
    select component.value, component.ordinality
    from jsonb_array_elements(coalesce(p_snapshot->'components', '[]'::jsonb))
      with ordinality as component(value, ordinality)
  ),
  hydrated_components as (
    select
      component.ordinality,
      case
        when jsonb_array_length(coalesce(component.value->'lots', '[]'::jsonb)) > 0 then component.value
        else jsonb_set(
          component.value,
          '{lots}',
          coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'lotId', lot.id,
                'lotNumber', lot.lot_number,
                'supplierLot', lot.supplier_lot,
                'sourceType', lot.source_type,
                'lotCreatedAt', lot.created_at,
                'productId', lot.product_id,
                'productName', consumed_product.name,
                'productType', consumed_product.type,
                'productCategory', consumed_product.category,
                'expectedProductId', coalesce(consumption.expected_component_product_id, lot.product_id),
                'expectedProductName', expected_product.name
              )
              order by lot.created_at desc, lot.id
            )
            from production_consumptions consumption
            join lots lot on lot.id = consumption.consumed_lot_id
            join products consumed_product on consumed_product.id = lot.product_id
            join products expected_product
              on expected_product.id = coalesce(consumption.expected_component_product_id, lot.product_id)
            where consumption.production_batch_id = p_batch_id
              and (
                consumption.component_node_key = component.value->>'nodeId'
                or (
                  not exists (
                    select 1
                    from production_consumptions exact_consumption
                    where exact_consumption.production_batch_id = p_batch_id
                      and exact_consumption.component_node_key = component.value->>'nodeId'
                  )
                  and coalesce(
                    consumption.selected_component_product_id,
                    consumption.expected_component_product_id,
                    lot.product_id
                  ) = nullif(component.value->>'productId', '')::uuid
                )
              )
          ), '[]'::jsonb),
          true
        )
      end as value
    from snapshot_components component
  )
  select case
    when p_snapshot is null then null
    else jsonb_set(
      p_snapshot,
      '{components}',
      coalesce(
        (select jsonb_agg(component.value order by component.ordinality) from hydrated_components component),
        '[]'::jsonb
      ),
      true
    )
  end;
$$;

revoke all on function hydrate_production_traceability_snapshot_lots(uuid, jsonb) from public;
grant execute on function hydrate_production_traceability_snapshot_lots(uuid, jsonb) to authenticated;

create or replace function refresh_production_traceability_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update production_batches batch
  set traceability_snapshot = hydrate_production_traceability_snapshot_lots(
    batch.id,
    build_production_traceability_snapshot(batch.id)
  )
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

do $$
declare
  v_batch record;
begin
  for v_batch in
    select batch.id
    from production_batches batch
    order by batch.created_at, batch.id
  loop
    update production_batches batch
    set traceability_snapshot = hydrate_production_traceability_snapshot_lots(
      batch.id,
      build_production_traceability_snapshot(batch.id)
    )
    where batch.id = v_batch.id;
  end loop;
end;
$$;

-- 024_more_semi_finished_substitution_groups

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

create or replace function public.assign_semifinished_substitution_group()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_group text;
begin
  if new.type = 'semi_finished' and new.is_active = true then
    v_group := public.resolve_semi_finished_substitution_group(new.name);

    if v_group is not null then
      new.substitution_group = v_group;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists products_assign_semifinished_substitution_group on products;
create trigger products_assign_semifinished_substitution_group
before insert or update of name, type, is_active on products
for each row execute function public.assign_semifinished_substitution_group();

-- The snapshot repair introduced after biscuit substitutions is generic. Rerun
-- it when available so historical snapshots stay hydrated if a substituted
-- semi-finished component belongs to one of the newly classified groups.
do $$
declare
  v_batch record;
begin
  if to_regclass('public.production_batches') is null then
    return;
  end if;

  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.production_batches'::regclass
      and attname = 'traceability_snapshot'
      and not attisdropped
  ) then
    return;
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'hydrate_production_traceability_snapshot_lots'
  ) then
    return;
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'build_production_traceability_snapshot'
  ) then
    return;
  end if;

  for v_batch in
    select batch.id
    from production_batches batch
    order by batch.created_at, batch.id
  loop
    update production_batches batch
    set traceability_snapshot = public.hydrate_production_traceability_snapshot_lots(
      batch.id,
      public.build_production_traceability_snapshot(batch.id)
    )
    where batch.id = v_batch.id;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
