// Hand-written types mirroring only what the receiving flow touches — see
// docs/database/DATABASE.md for the full schema. The manager dashboard's
// broader type file (apps/web/src/lib/database.types.ts) is the source of
// truth for anything beyond this app's actual scope.

export type MembershipRole = "worker" | "manager";

export interface Membership {
  id: string;
  user_id: string;
  org_id: string;
  role: MembershipRole;
  status: "invited" | "active" | "deactivated";
  created_at: string;
}

export interface Location {
  id: string;
  org_id: string;
  warehouse_id: string;
  name: string;
  qr_token: string;
  status: "active" | "inactive";
}

export type ExceptionType =
  | "wrong_project"
  | "unknown_po"
  | "wrong_manufacturer"
  | "wrong_product"
  | "quantity_mismatch"
  | "duplicate_pallet"
  | "duplicate_serial"
  | "unexpected_pallet"
  | "over_receipt"
  | "missing_expected_serials"
  | "low_ai_confidence";

export interface PalletException {
  type: ExceptionType;
  severity: "blocking" | "warning";
  details: Record<string, unknown>;
}

export interface ExtractionResult {
  pallet_label_id: string | null;
  po_number: string | null;
  manufacturer: string | null;
  product: string | null;
  quantity: number | null;
  serial_numbers: string[];
  confidence: Record<string, number>;
}

export interface ConfirmPalletReceiptResult {
  pallet_id: string | null;
  receipt_status: "auto_approved" | "pending_approval" | "approved" | "rejected";
  match_status: "matched" | "unmatched_untracked";
  exceptions: PalletException[];
  blocking: boolean;
  already_processed?: boolean;
}
