import type { ExceptionType, PalletException } from "./database.types";

// Every worker-facing message a warehouse floor employee will ever see for
// a receiving exception. Deliberately centralized here, not server-side:
// the server (docs/api/API.md rpc/confirm_pallet_receipt) returns only
// structured type/severity/details — copy iteration shouldn't require a
// database migration. No raw exception codes, no confidence percentages,
// ever reach this file's callers — see docs/design/DESIGN.md §4b.
const MESSAGES: Record<ExceptionType, string> = {
  unknown_po: "This purchase order could not be found.",
  duplicate_pallet: "This pallet already exists.",
  duplicate_serial: "One of these serial numbers already exists.",
  wrong_project: "This pallet belongs to another project.",
  wrong_manufacturer: "Manufacturer does not match what was expected.",
  wrong_product: "Product does not match what was expected.",
  quantity_mismatch: "Please verify quantity.",
  over_receipt: "This would receive more than expected. Please verify quantity.",
  missing_expected_serials: "Some expected serial numbers are missing.",
  unexpected_pallet: "No matching purchase order — logged for manager review.",
  low_ai_confidence: "Please double-check this.",
};

export function messageFor(exception: PalletException): string {
  return MESSAGES[exception.type] ?? "Please review this pallet before continuing.";
}

export function blockingExceptions(exceptions: PalletException[]): PalletException[] {
  return exceptions.filter((e) => e.severity === "blocking");
}

export function warningExceptions(exceptions: PalletException[]): PalletException[] {
  return exceptions.filter((e) => e.severity === "warning");
}
