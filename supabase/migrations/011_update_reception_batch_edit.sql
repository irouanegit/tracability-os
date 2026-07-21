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
      observations = nullif(trim(coalesce(p_observations, '')), '')
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
          observations = v_line_observations
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
            lot_status = case when v_line_status = 'non_conforme' then 'quarantine'::lot_status else 'available'::lot_status end
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
        observations
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
        v_line_observations
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
        v_reception.id
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
  set status = v_batch_status
  where id = p_batch_id;

  return p_batch_id;
end;
$$;

grant execute on function update_raw_material_reception_batch(uuid, uuid[], uuid, timestamptz, text, jsonb) to anon, authenticated;
