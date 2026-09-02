-- Optimize production_batch_history view performance and add query indexes.
-- Replaces heavy 26-column GROUP BY with correlated subquery for consumed_lot_count.

-- 1. Create supporting indexes if not present
create index if not exists production_batches_created_at_idx on production_batches (created_at desc);
create index if not exists production_batches_production_date_idx on production_batches (production_date desc);
create index if not exists production_batches_product_id_idx on production_batches (product_id);
create index if not exists production_consumptions_batch_id_idx on production_consumptions (production_batch_id);
create index if not exists production_plans_batch_id_idx on production_plans (production_batch_id);

-- 2. Optimize the history view
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
  (
    select count(*)::integer
    from production_consumptions pc
    where pc.production_batch_id = pb.id
  ) as consumed_lot_count,
  pb.created_at,
  pb.traceability_snapshot,
  pb.confirmed_by,
  pb.confirmed_at,
  confirmer.display_name as confirmed_by_name,
  confirmer.email as confirmed_by_email,
  pb.updated_by,
  pb.updated_at,
  updater.display_name as updated_by_name,
  updater.email as updated_by_email,
  pb.exported_by,
  pb.exported_at,
  exporter.display_name as exported_by_name,
  exporter.email as exported_by_email,
  plan.id as plan_id
from production_batches pb
join products p on p.id = pb.product_id
left join production_plans plan on plan.production_batch_id = pb.id
left join profiles confirmer on confirmer.user_id = pb.confirmed_by
left join profiles updater on updater.user_id = pb.updated_by
left join profiles exporter on exporter.user_id = pb.exported_by;

grant select on production_batch_history to anon, authenticated;

notify pgrst, 'reload schema';