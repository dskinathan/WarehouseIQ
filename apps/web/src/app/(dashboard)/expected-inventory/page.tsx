"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Badge, Button, EmptyState, Input, PageHeader } from "@/components/ui";
import type { ExpectedInventoryRecord, ExpectedInventoryStatus, Project, Warehouse } from "@/lib/database.types";

const STATUS_TONE: Record<ExpectedInventoryStatus, "good" | "warning" | "info" | "bad"> = {
  expected: "info",
  partially_received: "warning",
  fully_received: "good",
  exception: "bad",
};

const STATUS_LABEL: Record<ExpectedInventoryStatus, string> = {
  expected: "Expected",
  partially_received: "Partially Received",
  fully_received: "Fully Received",
  exception: "Exception",
};

type Row = ExpectedInventoryRecord & { projects: Pick<Project, "code" | "name"> | null; warehouses: Pick<Warehouse, "name"> | null };

// docs/product/SCREENS.md #9 Expected Inventory List.
export default function ExpectedInventoryPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase
      .from("expected_inventory_records")
      .select("*, projects(code, name), warehouses(name)")
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows((data as Row[] | null) ?? []));
  }, []);

  const filtered = (rows ?? []).filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.po_number.toLowerCase().includes(q) ||
      r.manufacturer.toLowerCase().includes(q) ||
      r.product.toLowerCase().includes(q) ||
      r.projects?.code.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        title="Expected Inventory"
        action={
          <div className="flex gap-2">
            <Link href="/expected-inventory/import">
              <Button variant="secondary">Import CSV</Button>
            </Link>
            <Link href="/expected-inventory/new">
              <Button>+ New</Button>
            </Link>
          </div>
        }
      />

      <div className="mb-4">
        <Input
          placeholder="Search PO, manufacturer, product, or project..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {rows === null ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No Expected Inventory records"
          description="Create one manually or import a CSV export from your existing system."
          action={
            <Link href="/expected-inventory/new">
              <Button>+ New</Button>
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th className="px-4 py-2 font-medium">PO</th>
                <th className="px-4 py-2 font-medium">Project</th>
                <th className="px-4 py-2 font-medium">Manufacturer</th>
                <th className="px-4 py-2 font-medium">Product</th>
                <th className="px-4 py-2 font-medium">Exp / Recv (units)</th>
                <th className="px-4 py-2 font-medium">Exp / Recv (pallets)</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 font-medium">
                    {r.po_number}
                    {r.line_number > 1 && <span className="text-gray-400"> / line {r.line_number}</span>}
                  </td>
                  <td className="px-4 py-2">{r.projects?.code ?? "—"}</td>
                  <td className="px-4 py-2">{r.manufacturer}</td>
                  <td className="px-4 py-2">{r.product}</td>
                  <td className="px-4 py-2">
                    {r.expected_quantity} / {r.received_quantity}
                  </td>
                  <td className="px-4 py-2">
                    {r.expected_pallet_count} / {r.received_pallet_count}
                  </td>
                  <td className="px-4 py-2 capitalize text-gray-500">{r.source.replace("_", " ")}</td>
                  <td className="px-4 py-2">
                    <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
