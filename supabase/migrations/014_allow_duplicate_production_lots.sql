-- Allows repeated production confirmations for the same generated lot.
-- A production lot code identifies the product/date formula, but multiple
-- confirmations can happen for the same product and production date.

alter table if exists production_batches
  drop constraint if exists production_batches_generated_lot_key;

alter table if exists lots
  drop constraint if exists lots_lot_number_key;

create index if not exists production_batches_generated_lot_idx
  on production_batches (generated_lot);

create index if not exists lots_lot_number_idx
  on lots (lot_number);

