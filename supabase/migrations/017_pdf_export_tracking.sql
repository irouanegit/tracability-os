alter table reception_batches
  add column if not exists exported_by uuid references profiles(user_id),
  add column if not exists exported_at timestamptz;

alter table production_batches
  add column if not exists exported_by uuid references profiles(user_id),
  add column if not exists exported_at timestamptz;

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
  updater.email as updated_by_email,
  b.exported_by,
  b.exported_at,
  exporter.display_name as exported_by_name,
  exporter.email as exported_by_email
from reception_batches b
join suppliers s on s.id = b.supplier_id
left join raw_material_receptions r on r.batch_id = b.id
left join profiles validator on validator.user_id = b.validated_by
left join profiles updater on updater.user_id = b.updated_by
left join profiles exporter on exporter.user_id = b.exported_by
group by b.id, s.name, validator.display_name, validator.email, updater.display_name, updater.email, exporter.display_name, exporter.email
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
  updater.email as updated_by_email,
  pb.exported_by,
  pb.exported_at,
  exporter.display_name as exported_by_name,
  exporter.email as exported_by_email
from production_batches pb
join products p on p.id = pb.product_id
left join production_consumptions pc on pc.production_batch_id = pb.id
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
  exporter.email
order by pb.created_at desc;

create or replace function mark_reception_batches_pdf_exported(p_batch_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := ensure_traceability_profile();
  v_batch_id uuid;
begin
  if p_batch_ids is null or array_length(p_batch_ids, 1) is null then
    return;
  end if;

  update reception_batches
  set exported_by = v_actor_id,
      exported_at = now()
  where id = any(p_batch_ids);

  foreach v_batch_id in array p_batch_ids loop
    perform log_traceability_event(
      'pdf_exported',
      'reception_batch',
      v_batch_id,
      jsonb_build_object('source', 'reception_quality_pdf')
    );
  end loop;
end;
$$;

create or replace function mark_production_batches_pdf_exported(p_batch_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := ensure_traceability_profile();
  v_batch_id uuid;
begin
  if p_batch_ids is null or array_length(p_batch_ids, 1) is null then
    return;
  end if;

  update production_batches
  set exported_by = v_actor_id,
      exported_at = now()
  where id = any(p_batch_ids);

  foreach v_batch_id in array p_batch_ids loop
    perform log_traceability_event(
      'pdf_exported',
      'production_batch',
      v_batch_id,
      jsonb_build_object('source', 'production_traceability_pdf')
    );
  end loop;
end;
$$;

revoke all on function mark_reception_batches_pdf_exported(uuid[]) from public, anon;
revoke all on function mark_production_batches_pdf_exported(uuid[]) from public, anon;
grant execute on function mark_reception_batches_pdf_exported(uuid[]) to authenticated;
grant execute on function mark_production_batches_pdf_exported(uuid[]) to authenticated;
grant select on reception_batch_history, production_batch_history to authenticated;
