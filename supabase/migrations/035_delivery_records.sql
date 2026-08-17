-- Groups confirmed product lots into one durable delivery record.

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  delivery_code text not null unique,
  delivery_date date not null,
  store_name text not null,
  delivery_number smallint not null,
  status text not null default 'confirmed',
  confirmed_product_count integer not null default 0,
  confirmed_by uuid references public.profiles(user_id),
  confirmed_at timestamptz not null default now(),
  created_by uuid references public.profiles(user_id),
  updated_by uuid references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deliveries_store_name_check
    check (store_name in ('AL QODS', 'MIMOUZA', 'CHEFCHAOUNI', 'MOHAMMEDIA', 'ORCHIDÉE')),
  constraint deliveries_delivery_number_check
    check (delivery_number between 1 and 4),
  constraint deliveries_status_check
    check (status in ('confirmed', 'cancelled')),
  constraint deliveries_confirmed_product_count_check
    check (confirmed_product_count >= 0),
  constraint deliveries_slot_key
    unique (delivery_date, store_name, delivery_number)
);

create table if not exists public.delivery_items (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  product_id uuid not null references public.products(id),
  production_batch_id uuid not null references public.production_batches(id),
  product_code text not null,
  product_name text not null,
  product_category text,
  lot_number text not null,
  confirmed_by uuid references public.profiles(user_id),
  confirmed_at timestamptz not null default now(),
  created_by uuid references public.profiles(user_id),
  updated_by uuid references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_items_delivery_product_key unique (delivery_id, product_id),
  constraint delivery_items_delivery_batch_key unique (delivery_id, production_batch_id)
);

create index if not exists deliveries_history_idx
  on public.deliveries (delivery_date desc, confirmed_at desc);

create index if not exists delivery_items_delivery_idx
  on public.delivery_items (delivery_id, created_at);

create index if not exists delivery_items_product_idx
  on public.delivery_items (product_id, confirmed_at desc);

drop trigger if exists deliveries_traceability_audit_columns on public.deliveries;
create trigger deliveries_traceability_audit_columns
before insert or update on public.deliveries
for each row execute function public.set_traceability_audit_columns();

drop trigger if exists delivery_items_traceability_audit_columns on public.delivery_items;
create trigger delivery_items_traceability_audit_columns
before insert or update on public.delivery_items
for each row execute function public.set_traceability_audit_columns();

-- Preserve confirmations created with migration 034 before grouped deliveries existed.
insert into public.deliveries (
  delivery_code,
  delivery_date,
  store_name,
  delivery_number,
  confirmed_product_count,
  confirmed_by,
  confirmed_at,
  created_by,
  updated_by,
  created_at,
  updated_at
)
select
  'LIV-' || to_char(confirmation.delivery_date, 'YYYYMMDD') || '-' ||
    case confirmation.store_name
      when 'AL QODS' then 'AQ'
      when 'MIMOUZA' then 'MIM'
      when 'CHEFCHAOUNI' then 'CHF'
      when 'MOHAMMEDIA' then 'MHD'
      when 'ORCHIDÉE' then 'ORC'
    end || '-' || confirmation.delivery_number::text,
  confirmation.delivery_date,
  confirmation.store_name,
  confirmation.delivery_number,
  count(*)::integer,
  (array_agg(confirmation.confirmed_by order by confirmation.confirmed_at desc))[1],
  max(confirmation.confirmed_at),
  (array_agg(confirmation.created_by order by confirmation.created_at))[1],
  (array_agg(confirmation.updated_by order by confirmation.updated_at desc))[1],
  min(confirmation.created_at),
  max(confirmation.updated_at)
from public.delivery_confirmations confirmation
group by confirmation.delivery_date, confirmation.store_name, confirmation.delivery_number
on conflict (delivery_date, store_name, delivery_number) do nothing;

insert into public.delivery_items (
  delivery_id,
  product_id,
  production_batch_id,
  product_code,
  product_name,
  product_category,
  lot_number,
  confirmed_by,
  confirmed_at,
  created_by,
  updated_by,
  created_at,
  updated_at
)
select
  delivery.id,
  confirmation.product_id,
  confirmation.production_batch_id,
  product.code,
  product.name,
  product.category::text,
  confirmation.lot_number,
  confirmation.confirmed_by,
  confirmation.confirmed_at,
  confirmation.created_by,
  confirmation.updated_by,
  confirmation.created_at,
  confirmation.updated_at
from public.delivery_confirmations confirmation
join public.deliveries delivery
  on delivery.delivery_date = confirmation.delivery_date
 and delivery.store_name = confirmation.store_name
 and delivery.delivery_number = confirmation.delivery_number
join public.products product on product.id = confirmation.product_id
on conflict (delivery_id, product_id) do nothing;

create or replace function public.confirm_delivery(
  p_delivery_date date,
  p_store_name text,
  p_delivery_number smallint,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.ensure_traceability_profile();
  v_delivery_id uuid;
  v_delivery_code text;
  v_item jsonb;
  v_product_id uuid;
  v_production_batch_id uuid;
  v_batch record;
  v_item_count integer;
begin
  if p_delivery_date is null then
    raise exception 'La date de livraison est obligatoire.';
  end if;

  if p_store_name not in ('AL QODS', 'MIMOUZA', 'CHEFCHAOUNI', 'MOHAMMEDIA', 'ORCHIDÉE') then
    raise exception 'Magasin de livraison invalide.';
  end if;

  if p_delivery_number is null or p_delivery_number not between 1 and 4 then
    raise exception 'Le numero de livraison doit etre compris entre 1 et 4.';
  end if;

  if jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Confirmez au moins un produit avant de confirmer la livraison.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    where nullif(item->>'productId', '') is null
       or nullif(item->>'productionBatchId', '') is null
  ) then
    raise exception 'Chaque produit livre doit contenir un lot de production.';
  end if;

  if (
    select count(*) <> count(distinct item->>'productId')
    from jsonb_array_elements(p_items) item
  ) then
    raise exception 'Un produit ne peut apparaitre qu''une seule fois dans une livraison.';
  end if;

  if exists (
    select 1
    from public.deliveries delivery
    where delivery.delivery_date = p_delivery_date
      and delivery.store_name = p_store_name
      and delivery.delivery_number = p_delivery_number
  ) then
    raise exception 'Cette livraison existe deja pour ce magasin, cette date et ce numero.';
  end if;

  v_item_count := jsonb_array_length(p_items);

  -- Validate every line before creating the delivery header.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'productId')::uuid;
    v_production_batch_id := (v_item->>'productionBatchId')::uuid;

    select
      batch.id,
      batch.product_id,
      batch.generated_lot,
      batch.status,
      product.code as product_code,
      product.name as product_name,
      product.category::text as product_category,
      product.type as product_type,
      product.is_active
    into v_batch
    from public.production_batches batch
    join public.products product on product.id = batch.product_id
    where batch.id = v_production_batch_id;

    if not found then
      raise exception 'Un lot de production selectionne est introuvable.';
    end if;

    if v_batch.product_id <> v_product_id then
      raise exception 'Un lot selectionne ne correspond pas a son produit.';
    end if;

    if v_batch.product_type <> 'finished' or not v_batch.is_active then
      raise exception 'Seuls les produits finis actifs peuvent etre livres.';
    end if;

    if v_batch.status <> 'validated' then
      raise exception 'Seuls les lots de production confirmes peuvent etre livres.';
    end if;
  end loop;

  v_delivery_code := 'LIV-' || to_char(p_delivery_date, 'YYYYMMDD') || '-' ||
    case p_store_name
      when 'AL QODS' then 'AQ'
      when 'MIMOUZA' then 'MIM'
      when 'CHEFCHAOUNI' then 'CHF'
      when 'MOHAMMEDIA' then 'MHD'
      when 'ORCHIDÉE' then 'ORC'
    end || '-' || p_delivery_number::text;

  insert into public.deliveries (
    delivery_code,
    delivery_date,
    store_name,
    delivery_number,
    status,
    confirmed_product_count,
    confirmed_by,
    confirmed_at,
    created_by,
    updated_by
  )
  values (
    v_delivery_code,
    p_delivery_date,
    p_store_name,
    p_delivery_number,
    'confirmed',
    v_item_count,
    v_actor_id,
    now(),
    v_actor_id,
    v_actor_id
  )
  returning id into v_delivery_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'productId')::uuid;
    v_production_batch_id := (v_item->>'productionBatchId')::uuid;

    select
      batch.generated_lot,
      product.code as product_code,
      product.name as product_name,
      product.category::text as product_category
    into v_batch
    from public.production_batches batch
    join public.products product on product.id = batch.product_id
    where batch.id = v_production_batch_id;

    insert into public.delivery_items (
      delivery_id,
      product_id,
      production_batch_id,
      product_code,
      product_name,
      product_category,
      lot_number,
      confirmed_by,
      confirmed_at,
      created_by,
      updated_by
    )
    values (
      v_delivery_id,
      v_product_id,
      v_production_batch_id,
      v_batch.product_code,
      v_batch.product_name,
      v_batch.product_category,
      v_batch.generated_lot,
      v_actor_id,
      now(),
      v_actor_id,
      v_actor_id
    );
  end loop;

  perform public.log_traceability_event(
    'delivery.confirmed',
    'delivery',
    v_delivery_id,
    jsonb_build_object(
      'delivery_code', v_delivery_code,
      'delivery_date', p_delivery_date,
      'store_name', p_store_name,
      'delivery_number', p_delivery_number,
      'confirmed_product_count', v_item_count
    )
  );

  return v_delivery_id;
end;
$$;

alter table public.deliveries enable row level security;
alter table public.delivery_items enable row level security;

drop policy if exists deliveries_authenticated_read on public.deliveries;
create policy deliveries_authenticated_read
on public.deliveries
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists delivery_items_authenticated_read on public.delivery_items;
create policy delivery_items_authenticated_read
on public.delivery_items
for select
to authenticated
using (auth.uid() is not null);

revoke all on table public.deliveries from public, anon;
revoke all on table public.delivery_items from public, anon;
grant select on table public.deliveries to authenticated;
grant select on table public.delivery_items to authenticated;

revoke all on function public.confirm_delivery(date, text, smallint, jsonb) from public;
grant execute on function public.confirm_delivery(date, text, smallint, jsonb) to authenticated;

notify pgrst, 'reload schema';
