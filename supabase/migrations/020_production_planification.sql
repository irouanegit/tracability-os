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
  where id = p_plan_id
    and status = 'planned'
    and production_batch_id is null;

  if not found then
    raise exception 'Production plan was already confirmed by another request.';
  end if;

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
