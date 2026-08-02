-- Adds user-level traceability for receptions, production confirmations, and schema edits.
-- Run after the existing traceability migrations.

create table if not exists profiles (
  -- Preserve profile identity even if the Auth account is later removed.
  user_id uuid primary key,
  display_name text not null,
  email text,
  role text not null default 'operator',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Safe when rerunning an earlier draft of this migration.
alter table profiles drop constraint if exists profiles_user_id_fkey;

insert into profiles (user_id, display_name, email)
select
  users.id,
  coalesce(nullif(users.raw_user_meta_data->>'display_name', ''), split_part(users.email, '@', 1), users.id::text),
  users.email
from auth.users users
on conflict (user_id) do update
set email = excluded.email,
    display_name = coalesce(nullif(profiles.display_name, ''), excluded.display_name),
    updated_at = now();

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(user_id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on audit_logs (created_at desc);
create index if not exists audit_logs_entity_idx on audit_logs (entity_type, entity_id, created_at desc);
create index if not exists recipes_active_product_version_idx
  on recipes (product_id, version desc, created_at desc)
  where is_active = true;

alter table products add column if not exists created_by uuid references profiles(user_id);
alter table products add column if not exists updated_by uuid references profiles(user_id);

alter table suppliers add column if not exists created_by uuid references profiles(user_id);
alter table suppliers add column if not exists updated_by uuid references profiles(user_id);
alter table suppliers add column if not exists updated_at timestamptz not null default now();

alter table recipes add column if not exists created_by uuid references profiles(user_id);
alter table recipes add column if not exists updated_by uuid references profiles(user_id);
alter table recipes add column if not exists updated_at timestamptz not null default now();

alter table supplier_raw_materials add column if not exists created_by uuid references profiles(user_id);
alter table supplier_raw_materials add column if not exists updated_by uuid references profiles(user_id);
alter table supplier_raw_materials add column if not exists updated_at timestamptz not null default now();

alter table reception_batches add column if not exists validated_by uuid references profiles(user_id);
alter table reception_batches add column if not exists validated_at timestamptz;
alter table reception_batches add column if not exists created_by uuid references profiles(user_id);
alter table reception_batches add column if not exists updated_by uuid references profiles(user_id);
alter table reception_batches add column if not exists updated_at timestamptz not null default now();

alter table raw_material_receptions add column if not exists created_by uuid references profiles(user_id);
alter table raw_material_receptions add column if not exists updated_by uuid references profiles(user_id);
alter table raw_material_receptions add column if not exists updated_at timestamptz not null default now();

alter table lots add column if not exists created_by uuid references profiles(user_id);
alter table lots add column if not exists updated_by uuid references profiles(user_id);
alter table lots add column if not exists updated_at timestamptz not null default now();

alter table production_batches add column if not exists confirmed_by uuid references profiles(user_id);
alter table production_batches add column if not exists confirmed_at timestamptz;
alter table production_batches add column if not exists created_by uuid references profiles(user_id);
alter table production_batches add column if not exists updated_by uuid references profiles(user_id);
alter table production_batches add column if not exists updated_at timestamptz not null default now();
alter table production_batches add column if not exists traceability_snapshot jsonb;

alter table production_consumptions add column if not exists created_by uuid references profiles(user_id);
alter table production_consumptions add column if not exists updated_by uuid references profiles(user_id);
alter table production_consumptions add column if not exists updated_at timestamptz not null default now();

create or replace function ensure_traceability_profile()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_email text := auth.jwt()->>'email';
  v_display_name text := coalesce(
    nullif(auth.jwt()->'user_metadata'->>'display_name', ''),
    nullif(auth.jwt()->'user_metadata'->>'name', ''),
    nullif(split_part(v_email, '@', 1), ''),
    v_actor_id::text
  );
begin
  if v_actor_id is null then
    raise exception 'Authentication required.';
  end if;

  insert into profiles (user_id, display_name, email)
  values (v_actor_id, v_display_name, v_email)
  on conflict (user_id) do update
  set email = coalesce(excluded.email, profiles.email),
      display_name = coalesce(nullif(profiles.display_name, ''), excluded.display_name),
      updated_at = now();

  return v_actor_id;
end;
$$;

create or replace function log_traceability_event(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := ensure_traceability_profile();
begin
  insert into audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (v_actor_id, p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

create or replace function set_traceability_audit_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if TG_OP = 'INSERT' then
    if v_actor_id is not null then
      perform ensure_traceability_profile();
      new.created_by = v_actor_id;
      new.updated_by = v_actor_id;
      new.updated_at = now();
    else
      new.created_by = coalesce(new.created_by, v_actor_id);
      new.updated_by = coalesce(new.updated_by, v_actor_id);
      new.updated_at = coalesce(new.updated_at, now());
    end if;
  else
    new.created_by = old.created_by;
    if v_actor_id is not null then
      perform ensure_traceability_profile();
      new.updated_by = v_actor_id;
    end if;
    new.updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists products_traceability_audit_columns on products;
create trigger products_traceability_audit_columns
before insert or update on products
for each row execute function set_traceability_audit_columns();

drop trigger if exists suppliers_traceability_audit_columns on suppliers;
create trigger suppliers_traceability_audit_columns
before insert or update on suppliers
for each row execute function set_traceability_audit_columns();

drop trigger if exists recipes_traceability_audit_columns on recipes;
create trigger recipes_traceability_audit_columns
before insert or update on recipes
for each row execute function set_traceability_audit_columns();

drop trigger if exists supplier_raw_materials_traceability_audit_columns on supplier_raw_materials;
create trigger supplier_raw_materials_traceability_audit_columns
before insert or update on supplier_raw_materials
for each row execute function set_traceability_audit_columns();

drop trigger if exists raw_material_receptions_traceability_audit_columns on raw_material_receptions;
create trigger raw_material_receptions_traceability_audit_columns
before insert or update on raw_material_receptions
for each row execute function set_traceability_audit_columns();

drop trigger if exists lots_traceability_audit_columns on lots;
create trigger lots_traceability_audit_columns
before insert or update on lots
for each row execute function set_traceability_audit_columns();

drop trigger if exists production_consumptions_traceability_audit_columns on production_consumptions;
create trigger production_consumptions_traceability_audit_columns
before insert or update on production_consumptions
for each row execute function set_traceability_audit_columns();

drop trigger if exists reception_batches_traceability_audit_columns on reception_batches;
create trigger reception_batches_traceability_audit_columns
before insert or update on reception_batches
for each row execute function set_traceability_audit_columns();

drop trigger if exists production_batches_traceability_audit_columns on production_batches;
create trigger production_batches_traceability_audit_columns
before insert or update on production_batches
for each row execute function set_traceability_audit_columns();

create or replace function set_business_confirmation_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if TG_TABLE_NAME = 'reception_batches' then
    if TG_OP = 'INSERT' then
      if v_actor_id is not null then
        new.validated_by = v_actor_id;
        new.validated_at = now();
      end if;
    else
      new.validated_by = old.validated_by;
      new.validated_at = old.validated_at;
    end if;
  elsif TG_TABLE_NAME = 'production_batches' then
    if TG_OP = 'INSERT' then
      if new.status = 'validated' and v_actor_id is not null then
        new.confirmed_by = v_actor_id;
        new.confirmed_at = now();
      end if;
    else
      new.confirmed_by = old.confirmed_by;
      new.confirmed_at = old.confirmed_at;

      if old.status <> 'validated' and new.status = 'validated' and v_actor_id is not null then
        new.confirmed_by = v_actor_id;
        new.confirmed_at = now();
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists reception_batches_business_confirmation_actor on reception_batches;
create trigger reception_batches_business_confirmation_actor
before insert or update on reception_batches
for each row execute function set_business_confirmation_actor();

drop trigger if exists production_batches_business_confirmation_actor on production_batches;
create trigger production_batches_business_confirmation_actor
before insert or update on production_batches
for each row execute function set_business_confirmation_actor();

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
  b.created_at,
  b.validated_by,
  b.validated_at,
  validator.display_name as validated_by_name,
  validator.email as validated_by_email,
  b.updated_by,
  b.updated_at,
  updater.display_name as updated_by_name,
  updater.email as updated_by_email
from reception_batches b
join suppliers s on s.id = b.supplier_id
left join raw_material_receptions r on r.batch_id = b.id
left join profiles validator on validator.user_id = b.validated_by
left join profiles updater on updater.user_id = b.updated_by
group by b.id, s.name, validator.display_name, validator.email, updater.display_name, updater.email
order by b.reception_date desc, s.name;

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
  pb.traceability_snapshot,
  pb.confirmed_by,
  pb.confirmed_at,
  confirmer.display_name as confirmed_by_name,
  confirmer.email as confirmed_by_email,
  pb.updated_by,
  pb.updated_at,
  updater.display_name as updated_by_name,
  updater.email as updated_by_email
from production_batches pb
join products p on p.id = pb.product_id
left join production_consumptions pc on pc.production_batch_id = pb.id
left join profiles confirmer on confirmer.user_id = pb.confirmed_by
left join profiles updater on updater.user_id = pb.updated_by
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
  pb.traceability_snapshot,
  pb.confirmed_by,
  pb.confirmed_at,
  confirmer.display_name,
  confirmer.email,
  pb.updated_by,
  pb.updated_at,
  updater.display_name,
  updater.email
order by pb.created_at desc;

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
  p.updated_at,
  p.lot_zone,
  p.lot_code,
  p.created_by,
  creator.display_name as created_by_name,
  creator.email as created_by_email,
  p.updated_by,
  updater.display_name as updated_by_name,
  updater.email as updated_by_email,
  active_recipe.created_by as schema_updated_by,
  schema_actor.display_name as schema_updated_by_name,
  schema_actor.email as schema_updated_by_email,
  active_recipe.created_at as schema_updated_at
from products p
left join profiles creator on creator.user_id = p.created_by
left join profiles updater on updater.user_id = p.updated_by
left join lateral (
  select r.created_by, r.created_at
  from recipes r
  where r.product_id = p.id
    and r.is_active = true
  order by r.version desc, r.created_at desc
  limit 1
) active_recipe on true
left join profiles schema_actor on schema_actor.user_id = active_recipe.created_by
where p.is_active = true;

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
  v_actor_id uuid := ensure_traceability_profile();
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
  set is_active = false,
      updated_by = v_actor_id,
      updated_at = now()
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
    diagram_viewport,
    created_by,
    updated_by,
    updated_at
  )
  values (
    p_target_product_id,
    v_next_version,
    true,
    'Diagram editor',
    coalesce(p_diagram_nodes, '[]'::jsonb),
    coalesce(p_diagram_edges, '[]'::jsonb),
    p_diagram_viewport,
    v_actor_id,
    v_actor_id,
    now()
  )
  returning id into v_recipe_id;

  insert into recipe_components (recipe_id, component_product_id, quantity, unit)
  select v_recipe_id, component_id, null, null
  from unnest(v_component_ids) as component(component_id);

  update products
  set updated_at = now(),
      updated_by = v_actor_id
  where id = p_target_product_id;

  perform log_traceability_event(
    case when v_next_version = 1 then 'schema.created' else 'schema.modified' end,
    'recipe',
    v_recipe_id,
    jsonb_build_object(
      'productId', p_target_product_id,
      'productName', v_target.name,
      'version', v_next_version,
      'componentCount', cardinality(v_component_ids)
    )
  );

  return v_recipe_id;
end;
$$;

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
  v_actor_id uuid := ensure_traceability_profile();
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
    observations,
    validated_by,
    validated_at,
    updated_by,
    updated_at
  )
  values (
    v_batch_number,
    p_supplier_id,
    v_reception_date,
    'conforme'::quality_status,
    nullif(trim(coalesce(p_observations, '')), ''),
    v_actor_id,
    now(),
    v_actor_id,
    now()
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
      observations,
      created_by,
      updated_by,
      updated_at
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
      v_line_observations,
      v_actor_id,
      v_actor_id,
      now()
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
      source_id,
      created_by,
      updated_by,
      updated_at
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
      v_reception.id,
      v_actor_id,
      v_actor_id,
      now()
    );
  end loop;

  update reception_batches
  set status = v_batch_status,
      updated_by = v_actor_id,
      updated_at = now()
  where id = v_batch_id;

  perform log_traceability_event(
    'reception.validated',
    'reception_batch',
    v_batch_id,
    jsonb_build_object('supplierId', p_supplier_id, 'batchNumber', v_batch_number, 'lineCount', jsonb_array_length(p_lines))
  );

  return v_batch_id;
end;
$$;

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
  v_actor_id uuid := ensure_traceability_profile();
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
      observations = nullif(trim(coalesce(p_observations, '')), ''),
      updated_by = v_actor_id,
      updated_at = now()
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
          observations = v_line_observations,
          updated_by = v_actor_id,
          updated_at = now()
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
            lot_status = case when v_line_status = 'non_conforme' then 'quarantine'::lot_status else 'available'::lot_status end,
            updated_by = v_actor_id,
            updated_at = now()
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
        observations,
        created_by,
        updated_by,
        updated_at
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
        v_line_observations,
        v_actor_id,
        v_actor_id,
        now()
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
        source_id,
        created_by,
        updated_by,
        updated_at
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
        v_reception.id,
        v_actor_id,
        v_actor_id,
        now()
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
  set status = v_batch_status,
      updated_by = v_actor_id,
      updated_at = now()
  where id = p_batch_id;

  perform log_traceability_event(
    'reception.updated',
    'reception_batch',
    p_batch_id,
    jsonb_build_object('supplierId', p_supplier_id, 'lineCount', jsonb_array_length(p_lines), 'mergedBatchIds', coalesce(p_merged_batch_ids, array[]::uuid[]))
  );

  return p_batch_id;
end;
$$;

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
  v_actor_id uuid := ensure_traceability_profile();
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
    consumed_lot_id,
    quantity_used,
    unit,
    created_by,
    updated_by,
    updated_at
  )
  select distinct
    v_batch_id,
    selected.lot_id,
    null::numeric,
    null::text,
    v_actor_id,
    v_actor_id,
    now()
  from unnest(v_consumed_lot_ids) as selected(lot_id);

  perform log_traceability_event(
    'production_lots.confirmed',
    'production_batch',
    v_batch_id,
    jsonb_build_object('productId', p_product_id, 'productName', v_product.name, 'generatedLot', trim(p_generated_lot), 'consumedLotCount', cardinality(v_consumed_lot_ids))
  );

  return v_batch_id;
end;
$$;

alter table profiles enable row level security;
alter table audit_logs enable row level security;

drop policy if exists "authenticated_profiles_read" on profiles;
create policy "authenticated_profiles_read" on profiles
  for select to authenticated using (true);

drop policy if exists "authenticated_profiles_self_update" on profiles;

drop policy if exists "authenticated_audit_logs_read" on audit_logs;
create policy "authenticated_audit_logs_read" on audit_logs
  for select to authenticated using (true);

revoke insert, update, delete on
  products,
  suppliers,
  recipes,
  recipe_components,
  supplier_raw_materials,
  reception_batches,
  raw_material_receptions,
  lots,
  production_batches,
  production_consumptions
from anon;

-- Migrations 011-015 historically re-granted some prototype access after the
-- original hardening migration. Reset anonymous/public privileges here so the
-- authenticated audit boundary is authoritative regardless of prior grants.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;

revoke execute on function save_product_schema(uuid, uuid[], jsonb, jsonb, jsonb) from anon;
revoke execute on function create_raw_material_reception_batch(uuid, timestamptz, text, jsonb) from anon;
revoke execute on function update_raw_material_reception_batch(uuid, uuid[], uuid, timestamptz, text, jsonb) from anon;
revoke execute on function create_production_with_traceability(timestamptz, uuid, text, text, text, text, uuid[]) from anon;

-- PostgreSQL grants EXECUTE on newly created functions to PUBLIC by default.
-- Keep generic audit helpers private so users cannot forge audit events.
revoke all on function ensure_traceability_profile() from public, anon, authenticated;
revoke all on function log_traceability_event(text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function set_traceability_audit_columns() from public, anon, authenticated;
revoke all on function set_business_confirmation_actor() from public, anon, authenticated;
revoke all on function save_product_schema(uuid, uuid[], jsonb, jsonb, jsonb) from public;
revoke all on function create_raw_material_reception_batch(uuid, timestamptz, text, jsonb) from public;
revoke all on function update_raw_material_reception_batch(uuid, uuid[], uuid, timestamptz, text, jsonb) from public;
revoke all on function create_production_with_traceability(timestamptz, uuid, text, text, text, text, uuid[]) from public;

revoke all on profiles from anon;
revoke all on audit_logs from anon;
revoke update on profiles from authenticated;
revoke all on product_catalog, reception_batch_history, production_batch_history from anon, public;
grant select on profiles to authenticated;
grant select on audit_logs to authenticated;
grant execute on function save_product_schema(uuid, uuid[], jsonb, jsonb, jsonb) to authenticated;
grant execute on function create_raw_material_reception_batch(uuid, timestamptz, text, jsonb) to authenticated;
grant execute on function update_raw_material_reception_batch(uuid, uuid[], uuid, timestamptz, text, jsonb) to authenticated;
grant execute on function create_production_with_traceability(timestamptz, uuid, text, text, text, text, uuid[]) to authenticated;
grant select on product_catalog, reception_batch_history, production_batch_history to authenticated;

-- Fail loudly if a future edit weakens the audit boundary or omits the actor
-- fields consumed by the desktop application.
do $$
begin
  if has_function_privilege('anon', 'public.save_product_schema(uuid,uuid[],jsonb,jsonb,jsonb)', 'EXECUTE') then
    raise exception 'Audit migration verification failed: anon can execute save_product_schema.';
  end if;

  if has_function_privilege('authenticated', 'public.log_traceability_event(text,text,uuid,jsonb)', 'EXECUTE') then
    raise exception 'Audit migration verification failed: authenticated users can forge audit events.';
  end if;

  if has_table_privilege('authenticated', 'public.profiles', 'UPDATE') then
    raise exception 'Audit migration verification failed: authenticated users can alter protected profile fields.';
  end if;

  if not has_function_privilege('authenticated', 'public.create_raw_material_reception_batch(uuid,timestamptz,text,jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.update_raw_material_reception_batch(uuid,uuid[],uuid,timestamptz,text,jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.create_production_with_traceability(timestamptz,uuid,text,text,text,text,uuid[])', 'EXECUTE') then
    raise exception 'Audit migration verification failed: an authenticated business RPC grant is missing.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'product_catalog'
      and column_name = 'schema_updated_by'
  ) then
    raise exception 'Audit migration verification failed: product_catalog schema actor fields are missing.';
  end if;
end;
$$;
