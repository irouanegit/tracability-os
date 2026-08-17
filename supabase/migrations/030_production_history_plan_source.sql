-- Expose the planification source for production history filtering.
-- A null plan_id means the batch was confirmed manually from Production.
-- A non-null plan_id means the batch was confirmed from a planned occurrence.

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
  updater.email as updated_by_email,
  pb.exported_by,
  pb.exported_at,
  exporter.display_name as exported_by_name,
  exporter.email as exported_by_email,
  plan.id as plan_id
from production_batches pb
join products p on p.id = pb.product_id
left join production_consumptions pc on pc.production_batch_id = pb.id
left join production_plans plan on plan.production_batch_id = pb.id
left join profiles confirmer on confirmer.user_id = pb.confirmed_by
left join profiles updater on updater.user_id = pb.updated_by
left join profiles exporter on exporter.user_id = pb.exported_by
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
  updater.email,
  pb.exported_by,
  pb.exported_at,
  exporter.display_name,
  exporter.email,
  plan.id
order by pb.created_at desc;

grant select on production_batch_history to authenticated;

notify pgrst, 'reload schema';
