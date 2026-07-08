create sequence if not exists reception_batch_sequence start 1001;

create table if not exists supplier_raw_materials (
  supplier_id uuid not null references suppliers(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (supplier_id, product_id)
);

create table if not exists reception_batches (
  id uuid primary key default gen_random_uuid(),
  batch_number text not null unique,
  supplier_id uuid not null references suppliers(id),
  reception_date timestamptz not null default now(),
  status quality_status not null default 'conforme',
  observations text,
  created_at timestamptz not null default now()
);

do $$ begin
  alter table raw_material_receptions add column batch_id uuid references reception_batches(id);
exception when duplicate_column then null;
end $$;

create or replace function enforce_supplier_raw_material_product_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from products p
    where p.id = new.product_id
      and p.type = 'raw'
      and p.is_active = true
  ) then
    raise exception 'Supplier materials must be active raw-material products.';
  end if;

  return new;
end;
$$;

drop trigger if exists supplier_raw_materials_product_type_trigger on supplier_raw_materials;
create trigger supplier_raw_materials_product_type_trigger
before insert or update on supplier_raw_materials
for each row execute function enforce_supplier_raw_material_product_type();

create or replace view supplier_raw_material_catalog as
select
  srm.supplier_id,
  p.id as product_id,
  p.code,
  p.name,
  p.type,
  p.unit,
  p.updated_at
from supplier_raw_materials srm
join products p on p.id = srm.product_id
where p.is_active = true
  and p.type = 'raw';

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
  b.created_at
from reception_batches b
join suppliers s on s.id = b.supplier_id
left join raw_material_receptions r on r.batch_id = b.id
group by b.id, s.name
order by b.reception_date desc, s.name;

create or replace view reception_batch_lines as
select
  r.id,
  r.batch_id,
  r.reception_date,
  r.product_id,
  p.code as product_code,
  p.name as product_name,
  r.supplier_id,
  s.name as supplier_name,
  r.supplier_lot,
  r.internal_lot,
  r.quantity,
  r.unit,
  r.expiry_date,
  r.transport_temperature_c,
  r.temperature_status,
  r.hygiene_status,
  r.status,
  r.observations
from raw_material_receptions r
join products p on p.id = r.product_id
join suppliers s on s.id = r.supplier_id
where r.batch_id is not null
order by r.created_at, p.name;

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
    observations
  )
  values (
    v_batch_number,
    p_supplier_id,
    v_reception_date,
    'conforme'::quality_status,
    nullif(trim(coalesce(p_observations, '')), '')
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
      observations
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
  end loop;

  update reception_batches
  set status = v_batch_status
  where id = v_batch_id;

  return v_batch_id;
end;
$$;

alter table supplier_raw_materials enable row level security;
alter table reception_batches enable row level security;

do $$ begin
  create policy "prototype_supplier_raw_materials_read_write" on supplier_raw_materials for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "prototype_reception_batches_read_write" on reception_batches for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

grant select, insert, update, delete on supplier_raw_materials to anon, authenticated;
grant select, insert, update on reception_batches to anon, authenticated;
grant select on supplier_raw_material_catalog to anon, authenticated;
grant select on reception_batch_history to anon, authenticated;
grant select on reception_batch_lines to anon, authenticated;
grant usage, select on sequence reception_batch_sequence to anon, authenticated;
grant execute on function create_raw_material_reception_batch(uuid, timestamptz, text, jsonb) to anon, authenticated;
