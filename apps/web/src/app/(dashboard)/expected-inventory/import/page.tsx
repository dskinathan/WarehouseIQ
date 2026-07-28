"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Papa from "papaparse";
import { supabase } from "@/lib/supabaseClient";
import { Badge, Button, Card, ErrorBanner, PageHeader } from "@/components/ui";
import type { CsvImportRow, Warehouse } from "@/lib/database.types";

// docs/product/SCREENS.md #12 CSV Import Wizard. Standalone Import History
// browsing and per-org remembered column mappings were cut from V1 (see
// docs/database/DATABASE.md §3) — the underlying audit data is kept either
// way; only that extra UI was deferred.

const TARGET_FIELDS = [
  { key: "po_number", label: "PO Number", required: true },
  { key: "line_number", label: "Line Number", required: false },
  { key: "project_code", label: "Project Code", required: true },
  { key: "manufacturer", label: "Manufacturer", required: true },
  { key: "product", label: "Product", required: true },
  { key: "expected_quantity", label: "Expected Quantity", required: true },
  { key: "expected_pallet_count", label: "Expected Pallet Count", required: true },
  { key: "expected_delivery_date", label: "Expected Delivery Date", required: false },
] as const;

type Step = "upload" | "map" | "review" | "done";

export default function CsvImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importId, setImportId] = useState<string | null>(null);
  const [rows, setRows] = useState<CsvImportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [commitResult, setCommitResult] = useState<{ committed_count: number; skipped_count: number } | null>(
    null
  );

  useEffect(() => {
    supabase
      .from("warehouses")
      .select("*")
      .is("archived_at", null)
      .then(({ data }) => {
        const list = (data as Warehouse[]) ?? [];
        setWarehouses(list);
        if (list[0]) setWarehouseId(list[0].id);
      });
  }, []);

  function handleFile(f: File) {
    setFile(f);
    setError(null);
    Papa.parse<Record<string, string>>(f, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setCsvHeaders(results.meta.fields ?? []);
        setCsvRows(results.data);
        // Best-effort auto-map by matching header text to field labels.
        const auto: Record<string, string> = {};
        for (const field of TARGET_FIELDS) {
          const match = (results.meta.fields ?? []).find(
            (h) => h.toLowerCase().replace(/[^a-z]/g, "") === field.label.toLowerCase().replace(/[^a-z]/g, "")
          );
          if (match) auto[field.key] = match;
        }
        setMapping(auto);
        setStep("map");
      },
      error: (err) => setError(err.message),
    });
  }

  async function handleValidate() {
    setError(null);
    setBusy(true);
    const mappedRows = csvRows.map((row) => {
      const mapped: Record<string, string> = {};
      for (const field of TARGET_FIELDS) {
        const sourceCol = mapping[field.key];
        mapped[field.key] = sourceCol ? (row[sourceCol] ?? "").trim() : "";
      }
      return mapped;
    });

    const { data: newImportId, error: rpcError } = await supabase.rpc("stage_csv_import", {
      p_filename: file?.name ?? "import.csv",
      p_column_mapping: mapping,
      p_warehouse_id: warehouseId,
      p_rows: mappedRows,
    });

    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setImportId(newImportId as string);
    const { data: rowData } = await supabase
      .from("csv_import_rows")
      .select("*")
      .eq("import_id", newImportId)
      .order("row_number", { ascending: true });
    setRows((rowData as CsvImportRow[]) ?? []);
    setStep("review");
  }

  async function handleCommit() {
    if (!importId) return;
    setBusy(true);
    setError(null);
    const { data, error: commitError } = await supabase.rpc("commit_csv_import", {
      p_import_id: importId,
      p_row_ids: null,
    });
    setBusy(false);
    if (commitError) {
      setError(commitError.message);
      return;
    }
    setCommitResult(data as { committed_count: number; skipped_count: number });
    setStep("done");
  }

  const validCount = rows.filter((r) => r.status === "valid").length;
  const errorCount = rows.filter((r) => r.status === "error").length;
  const requiredMapped = TARGET_FIELDS.filter((f) => f.required).every((f) => mapping[f.key]);

  return (
    <div>
      <Link href="/expected-inventory" className="text-sm text-accent hover:underline">
        &larr; Expected Inventory
      </Link>
      <PageHeader title="Import Expected Inventory from CSV" />
      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      {step === "upload" && (
        <Card className="max-w-xl">
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Upload a CSV exported from Excel, Smartsheet, or any system you already use — nothing commits
            until the final step.
          </p>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </Card>
      )}

      {step === "map" && (
        <Card className="max-w-xl">
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium">Warehouse for this import</label>
            <select
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-3">
            {TARGET_FIELDS.map((field) => (
              <div key={field.key} className="flex items-center justify-between gap-4">
                <span className="text-sm">
                  {field.label}
                  {field.required && <span className="text-status-bad"> *</span>}
                </span>
                <select
                  className="w-56 rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                  value={mapping[field.key] ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [field.key]: e.target.value }))}
                >
                  <option value="">— none —</option>
                  {csvHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-gray-500">{csvRows.length} row(s) found in {file?.name}</p>
          <div className="mt-4">
            <Button disabled={!requiredMapped || busy} onClick={handleValidate}>
              {busy ? "Validating..." : "Validate"}
            </Button>
          </div>
        </Card>
      )}

      {step === "review" && (
        <div>
          <Card className="mb-4">
            <p>
              <span className="font-medium text-status-good">{validCount} valid row(s)</span>
              {errorCount > 0 && (
                <span className="ml-4 font-medium text-status-bad">{errorCount} row(s) with errors</span>
              )}
            </p>
          </Card>
          <div className="mb-4 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">PO</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2">{r.row_number}</td>
                    <td className="px-3 py-2">{r.raw_data.po_number || "—"}</td>
                    <td className="px-3 py-2">{r.raw_data.product || "—"}</td>
                    <td className="px-3 py-2">
                      <Badge tone={r.status === "valid" ? "good" : "bad"}>{r.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-status-bad">{r.validation_errors?.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button disabled={validCount === 0 || busy} onClick={handleCommit}>
            {busy ? "Importing..." : `Import ${validCount} Valid Row(s)`}
          </Button>
        </div>
      )}

      {step === "done" && commitResult && (
        <Card className="max-w-xl text-center">
          <p className="mb-4 font-medium">
            Imported {commitResult.committed_count} record(s).
            {commitResult.skipped_count > 0 && ` ${commitResult.skipped_count} were skipped.`}
          </p>
          <Link href="/expected-inventory">
            <Button>Back to Expected Inventory</Button>
          </Link>
        </Card>
      )}
    </div>
  );
}
