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
  lot_number text not null unique,
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
  generated_lot text not null unique,
  quantity_produced numeric(12, 3) not null check (quantity_produced > 0),
  unit text not null,
  responsible_name text,
  operation text,
  status text not null default 'draft' check (status in ('draft', 'validated', 'cancelled')),
  observations text,
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
