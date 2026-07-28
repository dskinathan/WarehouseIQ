// Hand-written types mirroring the subset of the schema the Manager
// Dashboard touches as of M1. Full schema/rationale: docs/database/DATABASE.md.
// Extend this file as later milestones add tables the UI needs (pallets,
// the trust ledger, exceptions, approvals — none of which M1 reads or
// writes, since there's no worker app yet to generate that data).

export type MembershipRole = "worker" | "manager";
export type ProjectStatus = "active" | "completed" | "archived";
export type LocationStatus = "active" | "inactive";
export type ExpectedInventoryStatus =
  | "expected"
  | "partially_received"
  | "fully_received"
  | "exception";
export type ExpectedInventorySource = "manual" | "csv_import" | "erp_integration";
export type CsvImportStatus = "validating" | "ready" | "committed" | "failed";
export type CsvImportRowStatus = "pending" | "valid" | "error" | "imported";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  default_timezone: string;
  created_at: string;
  archived_at: string | null;
}

export interface Profile {
  id: string;
  full_name: string;
  created_at: string;
}

export interface Membership {
  id: string;
  user_id: string;
  org_id: string;
  role: MembershipRole;
  status: "invited" | "active" | "deactivated";
  created_at: string;
}

export interface Warehouse {
  id: string;
  org_id: string;
  name: string;
  address: string | null;
  timezone: string;
  created_at: string;
  archived_at: string | null;
}

export interface Project {
  id: string;
  org_id: string;
  name: string;
  code: string;
  client_name: string | null;
  status: ProjectStatus;
  created_at: string;
}

export interface Location {
  id: string;
  org_id: string;
  warehouse_id: string;
  name: string;
  qr_token: string;
  status: LocationStatus;
  created_at: string;
}

export interface ExpectedInventoryRecord {
  id: string;
  org_id: string;
  warehouse_id: string;
  project_id: string;
  po_number: string;
  line_number: number;
  manufacturer: string;
  product: string;
  expected_quantity: number;
  expected_pallet_count: number;
  expected_delivery_date: string | null;
  status: ExpectedInventoryStatus;
  received_quantity: number;
  received_pallet_count: number;
  source: ExpectedInventorySource;
  external_system_name: string | null;
  external_system_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CsvImport {
  id: string;
  org_id: string;
  uploaded_by: string;
  filename: string;
  column_mapping: Record<string, string>;
  status: CsvImportStatus;
  row_count: number;
  error_count: number;
  created_at: string;
  committed_at: string | null;
}

export interface CsvImportRow {
  id: string;
  import_id: string;
  org_id: string;
  row_number: number;
  raw_data: Record<string, string | null>;
  validation_errors: string[] | null;
  resulting_record_id: string | null;
  status: CsvImportRowStatus;
  created_at: string;
}
