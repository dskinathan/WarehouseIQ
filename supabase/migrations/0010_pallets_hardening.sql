-- Applying the pre-M2 review's lesson (DATABASE.md §6b) from the start
-- instead of retrofitting it later: every table pallets and the ledger
-- reference gets the composite (fk, org_id) treatment now.
--
-- Also closes a gap named but not actually enforced back in M0:
-- DATABASE.md always described duplicate-pallet-ID detection as "scoped
-- to (org_id, pallet_label_id) among active pallets," but no constraint
-- ever backed that — it was going to be an RPC-level pre-check alone,
-- which is a real (if narrow) race window for the exact safety feature
-- V1's spec calls out by name. Fixed with a partial unique index, the
-- same structural pattern already used for serial numbers and Expected
-- Inventory line items.

-- Scoped to confirmed pallets only (auto_approved/approved), not
-- pending_approval ones: a genuine duplicate-label scan needs to create a
-- *second*, pending record for a manager to review side-by-side with the
-- original — that pending record isn't real inventory yet, so it must be
-- allowed to coexist under the same label until it's decided.
create unique index pallets_active_label_unique_idx on pallets (org_id, pallet_label_id)
  where voided_at is null and receipt_status in ('auto_approved', 'approved');

alter table pallets add constraint pallets_id_org_unique unique (id, org_id);
alter table pallet_movements add constraint pallet_movements_id_org_unique unique (id, org_id);

alter table pallets
  add constraint pallets_warehouse_org_fk
  foreign key (warehouse_id, org_id) references warehouses (id, org_id),
  add constraint pallets_location_org_fk
  foreign key (current_location_id, org_id) references locations (id, org_id),
  add constraint pallets_project_org_fk
  foreign key (project_id, org_id) references projects (id, org_id),
  add constraint pallets_expected_record_org_fk
  foreign key (expected_inventory_record_id, org_id) references expected_inventory_records (id, org_id);

alter table serial_numbers
  add constraint serial_numbers_pallet_org_fk
  foreign key (pallet_id, org_id) references pallets (id, org_id);

alter table pallet_photos
  add constraint pallet_photos_pallet_org_fk
  foreign key (pallet_id, org_id) references pallets (id, org_id);

alter table pallet_movements
  add constraint pallet_movements_pallet_org_fk
  foreign key (pallet_id, org_id) references pallets (id, org_id),
  add constraint pallet_movements_prev_location_org_fk
  foreign key (previous_location_id, org_id) references locations (id, org_id),
  add constraint pallet_movements_new_location_org_fk
  foreign key (new_location_id, org_id) references locations (id, org_id);

alter table pallet_lifecycle_events
  add constraint pallet_lifecycle_events_pallet_org_fk
  foreign key (pallet_id, org_id) references pallets (id, org_id);

alter table pallet_exceptions
  add constraint pallet_exceptions_pallet_org_fk
  foreign key (pallet_id, org_id) references pallets (id, org_id),
  add constraint pallet_exceptions_movement_org_fk
  foreign key (movement_id, org_id) references pallet_movements (id, org_id);

-- approval_requests.entity_id is intentionally left without a composite
-- FK: it's polymorphic (entity_type is 'pallet' or 'movement'), and fully
-- constraining a polymorphic association means splitting it into separate
-- per-entity-type tables. Named explicitly as accepted debt in
-- DATABASE.md rather than silently left inconsistent with every other
-- table here.
