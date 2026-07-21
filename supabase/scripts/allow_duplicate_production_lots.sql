-- Run this once in Supabase SQL editor to allow confirming a production
-- even when the generated lot already exists.

alter table if exists production_batches
  drop constraint if exists production_batches_generated_lot_key;

alter table if exists lots
  drop constraint if exists lots_lot_number_key;

create index if not exists production_batches_generated_lot_idx
  on production_batches (generated_lot);

create index if not exists lots_lot_number_idx
  on lots (lot_number);

