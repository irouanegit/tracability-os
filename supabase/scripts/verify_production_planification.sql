-- Read-only verification after 020_production_planification.sql and
-- 026_planification_planned_time.sql.
-- This script is intentionally defensive: if the migration is only partially applied,
-- it reports missing objects instead of failing on the first absent table/view.

create temp table if not exists planning_verification_report (
  section text not null,
  status text not null,
  details jsonb not null default '{}'::jsonb
) on commit drop;

truncate planning_verification_report;

insert into planning_verification_report (section, status, details)
select
  'object readiness',
  case
    when bool_and(is_present) then 'ok'
    else 'missing'
  end,
  jsonb_object_agg(object_name, is_present order by object_name)
from (
  values
    ('production_plan_series table', to_regclass('public.production_plan_series') is not null),
    ('production_plans table', to_regclass('public.production_plans') is not null),
    ('production_plan_dependencies table', to_regclass('public.production_plan_dependencies') is not null),
    (
      'production_batch_history.plan_id column',
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'production_batch_history'
          and column_name = 'plan_id'
      )
    ),
    ('planning_eligible_lots view', to_regclass('public.planning_eligible_lots') is not null),
    ('production_plan_overview view', to_regclass('public.production_plan_overview') is not null),
    ('production_plan_dependency_details view', to_regclass('public.production_plan_dependency_details') is not null),
    ('create_production_plan_bundle rpc', to_regprocedure('public.create_production_plan_bundle(jsonb,jsonb,jsonb)') is not null),
    ('update_production_plan_series_status rpc', to_regprocedure('public.update_production_plan_series_status(uuid,text)') is not null),
    ('archive_production_plan_series rpc', to_regprocedure('public.archive_production_plan_series(uuid,text)') is not null),
    ('get_production_plan_confirmation_context rpc', to_regprocedure('public.get_production_plan_confirmation_context(uuid)') is not null),
    ('create_production_with_traceability_v3 rpc', to_regprocedure('public.create_production_with_traceability_v3(uuid,timestamp with time zone,uuid,text,text,text,text,jsonb)') is not null),
    ('cancel_production_plan rpc', to_regprocedure('public.cancel_production_plan(uuid,text)') is not null),
    ('refresh_production_plan rpc', to_regprocedure('public.refresh_production_plan(uuid,uuid,integer,jsonb,jsonb)') is not null)
) as checks(object_name, is_present);

insert into planning_verification_report (section, status, details)
select
  'prerequisites',
  case when bool_and(is_present) then 'ok' else 'missing' end,
  jsonb_object_agg(object_name, is_present order by object_name)
from (
  values
    ('ensure_traceability_profile function', to_regprocedure('public.ensure_traceability_profile()') is not null),
    ('set_traceability_audit_columns trigger function', to_regprocedure('public.set_traceability_audit_columns()') is not null),
    ('log_traceability_event function', to_regprocedure('public.log_traceability_event(text,text,uuid,jsonb)') is not null),
    ('create_production_with_traceability_v2 rpc', to_regprocedure('public.create_production_with_traceability_v2(timestamp with time zone,uuid,text,text,text,text,jsonb)') is not null),
    (
      'production_consumptions expected_component_product_id column',
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'production_consumptions'
          and column_name = 'expected_component_product_id'
      )
    )
) as checks(object_name, is_present);

do $$
begin
  if not (
    to_regclass('public.production_plan_series') is not null
    and to_regclass('public.production_plans') is not null
    and to_regclass('public.production_plan_dependencies') is not null
    and to_regclass('public.planning_eligible_lots') is not null
    and to_regclass('public.production_plan_overview') is not null
    and to_regclass('public.production_plan_dependency_details') is not null
  ) then
    insert into planning_verification_report (section, status, details)
    values (
      'deep checks',
      'skipped',
      jsonb_build_object('reason', 'Run 020_production_planification.sql, then rerun this verifier.')
    );
    return;
  end if;

  execute $sql$
    insert into planning_verification_report (section, status, details)
    select
      'planned-time readiness',
      case when bool_and(is_present) then 'ok' else 'missing' end,
      jsonb_object_agg(object_name, is_present order by object_name)
    from (
      values
        (
          'production_plan_series.planned_time column',
          exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'production_plan_series'
              and column_name = 'planned_time'
          )
        ),
        (
          'production_plans.planned_time column',
          exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'production_plans'
              and column_name = 'planned_time'
          )
        ),
        (
          'production_plan_overview.planned_time column',
          exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'production_plan_overview'
              and column_name = 'planned_time'
          )
        ),
        (
          'production_plan_dependency_details.source_plan_time column',
          exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'production_plan_dependency_details'
              and column_name = 'source_plan_time'
          )
        ),
        (
          'production_plans_product_moment_idx index',
          exists (
            select 1
            from pg_indexes
            where schemaname = 'public'
              and tablename = 'production_plans'
              and indexname = 'production_plans_product_moment_idx'
          )
        ),
        (
          'validate_production_plan_dependency time-aware function',
          exists (
            select 1
            from pg_proc proc
            join pg_namespace nsp on nsp.oid = proc.pronamespace
            where nsp.nspname = 'public'
              and proc.proname = 'validate_production_plan_dependency'
              and pg_get_functiondef(proc.oid) like '%planned_time%'
          )
        ),
        (
          'create_production_plan_bundle plannedTime payload support',
          exists (
            select 1
            from pg_proc proc
            join pg_namespace nsp on nsp.oid = proc.pronamespace
            where nsp.nspname = 'public'
              and proc.proname = 'create_production_plan_bundle'
              and pg_get_function_arguments(proc.oid) = 'p_series jsonb, p_plans jsonb, p_dependencies jsonb'
              and pg_get_functiondef(proc.oid) like '%plannedTime%'
          )
        ),
        (
          'planned confirmation duplicate guard',
          exists (
            select 1
            from pg_proc proc
            join pg_namespace nsp on nsp.oid = proc.pronamespace
            where nsp.nspname = 'public'
              and proc.proname = 'create_production_with_traceability_v3'
              and pg_get_function_arguments(proc.oid) = 'p_plan_id uuid, p_production_date timestamp with time zone, p_product_id uuid, p_generated_lot text, p_responsible_name text, p_operation text, p_observations text, p_consumed_lot_selections jsonb'
              and pg_get_functiondef(proc.oid) like '%production_batch_id is null%'
              and pg_get_functiondef(proc.oid) like '%Production plan was already confirmed by another request.%'
          )
        )
    ) as checks(object_name, is_present)
  $sql$;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'production_plan_series'
      and column_name = 'planned_time'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'production_plans'
      and column_name = 'planned_time'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'production_plan_overview'
      and column_name = 'planned_time'
  ) then
    insert into planning_verification_report (section, status, details)
    values (
      'deep checks',
      'skipped',
      jsonb_build_object('reason', 'Run 020_production_planification.sql, then 026_planification_planned_time.sql, then rerun this verifier.')
    );
    return;
  end if;

  execute $sql$
    insert into planning_verification_report (section, status, details)
    select
      'series plan_name column',
      case when exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'production_plan_series'
          and column_name = 'plan_name'
      ) then 'ok' else 'missing' end,
      '{}'::jsonb
  $sql$;

  execute $sql$
    insert into planning_verification_report (section, status, details)
    select
      'rls',
      case when bool_and(relrowsecurity) then 'ok' else 'review' end,
      coalesce(jsonb_object_agg(relname, relrowsecurity order by relname), '{}'::jsonb)
    from pg_class
    where oid in (
      to_regclass('public.production_plan_series'),
      to_regclass('public.production_plans'),
      to_regclass('public.production_plan_dependencies')
    )
  $sql$;

  execute $sql$
    insert into planning_verification_report (section, status, details)
    select
      'derived statuses',
      'info',
      coalesce(jsonb_object_agg(derived_status, plan_count order by derived_status), '{}'::jsonb)
    from (
      select derived_status, count(*) as plan_count
      from production_plan_overview
      group by derived_status
    ) status_counts
  $sql$;

  execute $sql$
    insert into planning_verification_report (section, status, details)
    select
      'dependency source counts',
      'info',
      jsonb_build_object(
        'water', count(*) filter (where source_kind = 'water'),
        'raw_lot', count(*) filter (where source_kind = 'raw_lot'),
        'existing_production_lot', count(*) filter (where source_kind = 'existing_production_lot'),
        'planned_production', count(*) filter (where source_kind = 'planned_production')
      )
    from production_plan_dependencies
  $sql$;

  execute $sql$
    insert into planning_verification_report (section, status, details)
    select
      'missing mandatory dependencies',
      case when count(*) = 0 then 'ok' else 'error' end,
      jsonb_build_object(
        'count', count(*),
        'examples', coalesce(jsonb_agg(to_jsonb(missing_rows) order by planned_date, product_name), '[]'::jsonb)
      )
    from (
      select
        plan.id,
        product.name as product_name,
        plan.planned_date,
        component.component_product_id as missing_component_id
      from production_plans plan
      join products product on product.id = plan.product_id
      join recipe_components component on component.recipe_id = plan.recipe_id and component.mandatory = true
      where plan.status = 'planned'
        and not exists (
          select 1
          from production_plan_dependencies dependency
          where dependency.plan_id = plan.id
            and dependency.expected_product_id = component.component_product_id
        )
      limit 20
    ) missing_rows
  $sql$;

  execute $sql$
    insert into planning_verification_report (section, status, details)
    select
      'invalid dependency sources',
      case when count(*) = 0 then 'ok' else 'error' end,
      jsonb_build_object(
        'count', count(*),
        'examples', coalesce(jsonb_agg(to_jsonb(invalid_rows) order by parent_date, parent_product), '[]'::jsonb)
      )
    from (
      select
        dependency.id,
        parent_product.name as parent_product,
        parent.planned_date as parent_date,
        parent.planned_time as parent_time,
        dependency.source_kind,
        selected_product.name as selected_component,
        lot.effective_date,
        lot.expiry_date,
        child.planned_date as child_date,
        child.planned_time as child_time,
        child.status as child_status
      from production_plan_dependencies dependency
      join production_plans parent on parent.id = dependency.plan_id
      join products parent_product on parent_product.id = parent.product_id
      join products selected_product on selected_product.id = dependency.selected_product_id
      left join planning_eligible_lots lot on lot.lot_id = dependency.source_lot_id
      left join production_plans child on child.id = dependency.source_plan_id
      where parent.status = 'planned'
        and (
          (
            dependency.source_kind in ('raw_lot', 'existing_production_lot')
            and (
              lot.lot_id is null
              or lot.effective_date > parent.planned_date
              or (lot.expiry_date is not null and lot.expiry_date < parent.planned_date)
            )
          )
          or (
            dependency.source_kind = 'planned_production'
            and (
              child.id is null
              or child.status = 'cancelled'
              or (child.planned_date + child.planned_time) > (parent.planned_date + parent.planned_time)
            )
          )
        )
      limit 20
    ) invalid_rows
  $sql$;

  execute $sql$
    insert into planning_verification_report (section, status, details)
    with recursive dependency_chain as (
      select
        plan.id as root_plan_id,
        plan.id as current_plan_id,
        dependency.source_plan_id,
        array[plan.id]::uuid[] as plan_path,
        false as cycle_found
      from production_plans plan
      join production_plan_dependencies dependency
        on dependency.plan_id = plan.id
        and dependency.source_kind = 'planned_production'

      union all

      select
        chain.root_plan_id,
        chain.source_plan_id,
        dependency.source_plan_id,
        chain.plan_path || chain.source_plan_id,
        dependency.source_plan_id = any(chain.plan_path)
      from dependency_chain chain
      join production_plan_dependencies dependency
        on dependency.plan_id = chain.source_plan_id
        and dependency.source_kind = 'planned_production'
      where chain.source_plan_id is not null
        and not chain.cycle_found
    ),
    cycles as (
      select distinct root_plan_id
      from dependency_chain
      where cycle_found
      limit 20
    )
    select
      'dependency cycles',
      case when count(*) = 0 then 'ok' else 'error' end,
      jsonb_build_object(
        'count', count(*),
        'examples', coalesce(jsonb_agg(root_plan_id), '[]'::jsonb)
      )
    from cycles
  $sql$;

  execute $sql$
    insert into planning_verification_report (section, status, details)
    with recursive dependency_walk as (
      select
        plan.id as root_plan_id,
        dependency.*,
        array[plan.id]::uuid[] as plan_path
      from production_plans plan
      join production_plan_dependencies dependency on dependency.plan_id = plan.id
      where plan.status = 'completed'
        and plan.production_batch_id is not null

      union all

      select
        parent.root_plan_id,
        child.*,
        parent.plan_path || parent.source_plan_id
      from dependency_walk parent
      join production_plan_dependencies child on child.plan_id = parent.source_plan_id
      where parent.source_kind = 'planned_production'
        and parent.source_plan_id is not null
        and not parent.source_plan_id = any(parent.plan_path)
    ),
    planned_selections as (
      select distinct on (walk.root_plan_id, walk.expected_product_id)
        walk.root_plan_id,
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
      order by walk.root_plan_id, walk.expected_product_id, walk.depth
    ),
    actual_selections as (
      select distinct
        plan.id as root_plan_id,
        coalesce(consumption.expected_component_product_id, lot.product_id) as expected_product_id,
        consumption.consumed_lot_id
      from production_plans plan
      join production_consumptions consumption
        on consumption.production_batch_id = plan.production_batch_id
      join lots lot on lot.id = consumption.consumed_lot_id
      where plan.status = 'completed'
        and plan.production_batch_id is not null
    ),
    missing_expected as (
      select root_plan_id, expected_product_id, consumed_lot_id
      from planned_selections
      where consumed_lot_id is not null
      except
      select root_plan_id, expected_product_id, consumed_lot_id
      from actual_selections
    ),
    unexpected_actual as (
      select root_plan_id, expected_product_id, consumed_lot_id
      from actual_selections
      except
      select root_plan_id, expected_product_id, consumed_lot_id
      from planned_selections
      where consumed_lot_id is not null
    ),
    mismatch_roots as (
      select root_plan_id from missing_expected
      union
      select root_plan_id from unexpected_actual
    )
    select
      'completed plan consumption mismatch',
      case when count(*) = 0 then 'ok' else 'error' end,
      jsonb_build_object(
        'count', count(*),
        'examples', coalesce(jsonb_agg(to_jsonb(example_rows) order by planned_date, product_name), '[]'::jsonb)
      )
    from (
      select
        plan.id,
        product.name as product_name,
        plan.planned_date,
        plan.production_batch_id
      from production_plans plan
      join mismatch_roots mismatch on mismatch.root_plan_id = plan.id
      join products product on product.id = plan.product_id
      limit 20
    ) example_rows
  $sql$;

  execute $sql$
    insert into planning_verification_report (section, status, details)
    select
      'blocked or recipe-changed plans',
      case when count(*) = 0 then 'ok' else 'review' end,
      jsonb_build_object(
        'count', count(*),
        'examples', coalesce(jsonb_agg(to_jsonb(review_rows) order by planned_date, product_name), '[]'::jsonb)
      )
    from (
      select
        overview.id,
        overview.product_name,
        overview.planned_date,
        overview.planned_time,
        overview.derived_status,
        overview.blocker_count,
        overview.waiting_count
      from production_plan_overview overview
      where overview.derived_status in ('blocked', 'recipe_changed')
      limit 20
    ) review_rows
  $sql$;
end $$;

select section, status, details
from planning_verification_report
order by
  case section
    when 'object readiness' then 1
    when 'prerequisites' then 2
    when 'planned-time readiness' then 3
    when 'series plan_name column' then 4
    when 'rls' then 5
    else 10
  end,
  section;
