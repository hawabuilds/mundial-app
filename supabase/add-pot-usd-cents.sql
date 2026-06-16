-- Run once on existing databases (schema.sql includes this for fresh installs).
alter table payout_epochs
  add column if not exists pot_usd_cents integer;
