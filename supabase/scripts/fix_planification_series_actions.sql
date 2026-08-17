-- Standalone repair for Planification pause/remove actions.
-- Run this if the app reports missing:
-- - public.update_production_plan_series_status(p_series_id, p_status)
-- - public.archive_production_plan_series(p_series_id, p_reason)

create or replace function public.update_production_plan_series_status(
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

create or replace function public.archive_production_plan_series(
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

revoke all on function public.update_production_plan_series_status(uuid, text) from public;
revoke all on function public.archive_production_plan_series(uuid, text) from public;

grant execute on function public.update_production_plan_series_status(uuid, text) to authenticated;
grant execute on function public.archive_production_plan_series(uuid, text) to authenticated;

notify pgrst, 'reload schema';
