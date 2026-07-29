-- Fixes a real bug surfaced during the first live test: migrations 0009
-- and 0010 added composite (fk, org_id) foreign keys alongside the
-- original single-column ones, on purpose, for the tenant-isolation
-- reasons explained in DATABASE.md §6b — but left the original
-- single-column FKs in place too, on the assumption that a redundant
-- constraint was merely "harmless." It wasn't: PostgREST (which the web
-- and mobile apps both go through) refuses to auto-embed a related table
-- when it finds more than one foreign key between the same two tables,
-- so every `.select("*, locations(count)")`-style query in the app broke
-- with "Could not embed because more than one relationship was found."
--
-- The fix is to drop the now-redundant single-column FK on each pair,
-- keeping only the composite one — it already enforces everything the
-- single-column version did (warehouse_id must exist in warehouses),
-- plus the org match, so nothing about referential integrity is lost.

alter table csv_import_rows drop constraint csv_import_rows_import_id_fkey;
alter table csv_import_rows drop constraint csv_import_rows_resulting_record_id_fkey;
alter table expected_inventory_records drop constraint expected_inventory_records_project_id_fkey;
alter table expected_inventory_records drop constraint expected_inventory_records_warehouse_id_fkey;
alter table expected_serial_numbers drop constraint expected_serial_numbers_expected_inventory_record_id_fkey;
alter table locations drop constraint locations_warehouse_id_fkey;
alter table pallet_exceptions drop constraint pallet_exceptions_movement_id_fkey;
alter table pallet_exceptions drop constraint pallet_exceptions_pallet_id_fkey;
alter table pallet_lifecycle_events drop constraint pallet_lifecycle_events_pallet_id_fkey;
alter table pallet_movements drop constraint pallet_movements_new_location_id_fkey;
alter table pallet_movements drop constraint pallet_movements_previous_location_id_fkey;
alter table pallet_movements drop constraint pallet_movements_pallet_id_fkey;
alter table pallet_photos drop constraint pallet_photos_pallet_id_fkey;
alter table pallets drop constraint pallets_expected_inventory_record_id_fkey;
alter table pallets drop constraint pallets_current_location_id_fkey;
alter table pallets drop constraint pallets_project_id_fkey;
alter table pallets drop constraint pallets_warehouse_id_fkey;
alter table serial_numbers drop constraint serial_numbers_pallet_id_fkey;

-- pallet_photos -> pallet_movements (pallet_photos_movement_fk) was never
-- duplicated (no composite version exists for it) and is left untouched.
