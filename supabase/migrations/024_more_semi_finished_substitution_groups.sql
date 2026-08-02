-- Extend operator-selected semi-finished substitutions beyond biscuits.
-- The confirmation flow is already generic: products can substitute one another
-- only when they share the same substitution_group.

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
