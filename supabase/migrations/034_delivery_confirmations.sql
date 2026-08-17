-- Records which validated finished-product lots were delivered for each daily run.

create table if not exists public.delivery_confirmations (
  id uuid primary key default gen_random_uuid(),
  delivery_date date not null,
  store_name text not null,
  delivery_number smallint not null,
  product_id uuid not null references public.products(id),
  production_batch_id uuid not null references public.production_batches(id),
  lot_number text not null,
  confirmed_by uuid references public.profiles(user_id),
  confirmed_at timestamptz not null default now(),
  created_by uuid references public.profiles(user_id),
  updated_by uuid references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_confirmations_store_name_check
    check (store_name in ('AL QODS', 'MIMOUZA', 'CHEFCHAOUNI', 'MOHAMMEDIA', 'ORCHIDÉE')),
  constraint delivery_confirmations_delivery_number_check
    check (delivery_number between 1 and 4),
  constraint delivery_confirmations_slot_product_key
    unique (delivery_date, store_name, delivery_number, product_id)
);

create index if not exists delivery_confirmations_slot_idx
  on public.delivery_confirmations (delivery_date desc, store_name, delivery_number);

create index if not exists delivery_confirmations_batch_idx
  on public.delivery_confirmations (production_batch_id);

drop trigger if exists delivery_confirmations_traceability_audit_columns on public.delivery_confirmations;
create trigger delivery_confirmations_traceability_audit_columns
before insert or update on public.delivery_confirmations
for each row execute function public.set_traceability_audit_columns();

create or replace function public.confirm_product_delivery(
  p_delivery_date date,
  p_store_name text,
  p_delivery_number smallint,
  p_product_id uuid,
  p_production_batch_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.ensure_traceability_profile();
  v_confirmation_id uuid;
  v_batch record;
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

  select
    batch.id,
    batch.product_id,
    batch.generated_lot,
    batch.status,
    product.type as product_type,
    product.is_active
  into v_batch
  from public.production_batches batch
  join public.products product on product.id = batch.product_id
  where batch.id = p_production_batch_id;

  if not found then
    raise exception 'Le lot de production selectionne est introuvable.';
  end if;

  if v_batch.product_id <> p_product_id then
    raise exception 'Le lot selectionne ne correspond pas au produit.';
  end if;

  if v_batch.product_type <> 'finished' or not v_batch.is_active then
    raise exception 'Seuls les produits finis actifs peuvent etre livres.';
  end if;

  if v_batch.status <> 'validated' then
    raise exception 'Seul un lot de production confirme peut etre livre.';
  end if;

  insert into public.delivery_confirmations (
    delivery_date,
    store_name,
    delivery_number,
    product_id,
    production_batch_id,
    lot_number,
    confirmed_by,
    confirmed_at,
    created_by,
    updated_by
  )
  values (
    p_delivery_date,
    p_store_name,
    p_delivery_number,
    p_product_id,
    p_production_batch_id,
    v_batch.generated_lot,
    v_actor_id,
    now(),
    v_actor_id,
    v_actor_id
  )
  on conflict (delivery_date, store_name, delivery_number, product_id)
  do update set
    production_batch_id = excluded.production_batch_id,
    lot_number = excluded.lot_number,
    confirmed_by = excluded.confirmed_by,
    confirmed_at = excluded.confirmed_at,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning id into v_confirmation_id;

  perform public.log_traceability_event(
    'delivery.confirmed',
    'delivery_confirmation',
    v_confirmation_id,
    jsonb_build_object(
      'delivery_date', p_delivery_date,
      'store_name', p_store_name,
      'delivery_number', p_delivery_number,
      'product_id', p_product_id,
      'production_batch_id', p_production_batch_id,
      'lot_number', v_batch.generated_lot
    )
  );

  return v_confirmation_id;
end;
$$;

alter table public.delivery_confirmations enable row level security;

drop policy if exists delivery_confirmations_authenticated_read on public.delivery_confirmations;
create policy delivery_confirmations_authenticated_read
on public.delivery_confirmations
for select
to authenticated
using (auth.uid() is not null);

revoke all on table public.delivery_confirmations from public, anon;
grant select on table public.delivery_confirmations to authenticated;

revoke all on function public.confirm_product_delivery(date, text, smallint, uuid, uuid) from public;
grant execute on function public.confirm_product_delivery(date, text, smallint, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
