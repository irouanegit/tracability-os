-- Prevent a production confirmation from consuming a lot that did not exist yet
-- on the selected production date.

create or replace function validate_production_consumption_lot_effective_date()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_production_date date;
  v_lot_effective_date date;
begin
  if new.consumed_lot_id is null then
    return new;
  end if;

  select batch.production_date::date
    into v_production_date
  from production_batches batch
  where batch.id = new.production_batch_id;

  select
    case
      when lot.source_type = 'fabrication' then coalesce(source_batch.production_date::date, lot.created_at::date)
      when lot.source_type = 'reception' then coalesce(source_reception.reception_date::date, lot.created_at::date)
      else lot.created_at::date
    end
    into v_lot_effective_date
  from lots lot
  left join production_batches source_batch
    on lot.source_type = 'fabrication'
   and source_batch.id = lot.source_id
  left join raw_material_receptions source_reception
    on lot.source_type = 'reception'
   and source_reception.id = lot.source_id
  where lot.id = new.consumed_lot_id;

  if v_production_date is not null
     and v_lot_effective_date is not null
     and v_lot_effective_date > v_production_date then
    raise exception 'Selected lot cannot be later than the production date. P0002';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_production_consumption_lot_effective_date_trigger on production_consumptions;

create trigger validate_production_consumption_lot_effective_date_trigger
before insert or update of production_batch_id, consumed_lot_id
on production_consumptions
for each row
execute function validate_production_consumption_lot_effective_date();

grant execute on function validate_production_consumption_lot_effective_date() to authenticated;
