"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, Input, PageHeader } from "@/components/ui";
import { QrCode } from "@/components/QrCode";
import type { Location, Warehouse } from "@/lib/database.types";

// docs/product/SCREENS.md #7 Location Management + #8 QR Code Generator,
// combined into one warehouse-scoped page for M1 — both operate on the
// same location list, and splitting them into separate routes didn't earn
// its complexity yet at this milestone's scope.
export default function WarehouseDetailPage() {
  const params = useParams<{ id: string }>();
  const warehouseId = params.id;

  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [singleName, setSingleName] = useState("");
  const [bulkPrefix, setBulkPrefix] = useState("Aisle");
  const [bulkFrom, setBulkFrom] = useState(1);
  const [bulkTo, setBulkTo] = useState(5);
  const [bulkSubPrefix, setBulkSubPrefix] = useState("");
  const [bulkSubFrom, setBulkSubFrom] = useState(1);
  const [bulkSubTo, setBulkSubTo] = useState(1);
  const [creating, setCreating] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showPrint, setShowPrint] = useState(false);

  async function load() {
    const [{ data: w, error: wErr }, { data: locs, error: lErr }] = await Promise.all([
      supabase.from("warehouses").select("*").eq("id", warehouseId).single(),
      supabase
        .from("locations")
        .select("*")
        .eq("warehouse_id", warehouseId)
        .order("name", { ascending: true }),
    ]);
    if (wErr) setError(wErr.message);
    if (lErr) setError(lErr.message);
    setWarehouse((w as Warehouse) ?? null);
    setLocations((locs as Location[] | null) ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId]);

  function buildBulkNames(): string[] {
    const names: string[] = [];
    for (let i = bulkFrom; i <= bulkTo; i++) {
      if (bulkSubPrefix.trim()) {
        for (let j = bulkSubFrom; j <= bulkSubTo; j++) {
          names.push(`${bulkPrefix} ${i} / ${bulkSubPrefix} ${j}`);
        }
      } else {
        names.push(`${bulkPrefix} ${i}`);
      }
    }
    return names;
  }

  async function handleSingleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    const { data: w } = await supabase.from("warehouses").select("org_id").eq("id", warehouseId).single();
    const { error: insertError } = await supabase
      .from("locations")
      .insert({ org_id: w?.org_id, warehouse_id: warehouseId, name: singleName });
    setCreating(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setSingleName("");
    load();
  }

  async function handleBulkCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    const names = buildBulkNames();
    const { data: w } = await supabase.from("warehouses").select("org_id").eq("id", warehouseId).single();
    const { error: insertError } = await supabase
      .from("locations")
      .insert(names.map((name) => ({ org_id: w?.org_id, warehouse_id: warehouseId, name })));
    setCreating(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    load();
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!warehouse || locations === null) {
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  const selectedLocations = locations.filter((l) => selected.has(l.id));

  return (
    <div>
      <Link href="/warehouses" className="text-sm text-accent hover:underline">
        &larr; All Warehouses
      </Link>
      <PageHeader title={warehouse.name} />
      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="mb-6">
            <h2 className="mb-4 font-medium">Add Locations</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <form className="space-y-3" onSubmit={handleSingleCreate}>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Single location</p>
                <Field label="Name">
                  <Input required value={singleName} onChange={(e) => setSingleName(e.target.value)} />
                </Field>
                <Button type="submit" disabled={creating}>
                  Add
                </Button>
              </form>

              <form className="space-y-3" onSubmit={handleBulkCreate}>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Bulk pattern</p>
                <div className="flex gap-2">
                  <Input
                    value={bulkPrefix}
                    onChange={(e) => setBulkPrefix(e.target.value)}
                    placeholder="Aisle"
                  />
                  <Input
                    type="number"
                    value={bulkFrom}
                    onChange={(e) => setBulkFrom(Number(e.target.value))}
                  />
                  <Input type="number" value={bulkTo} onChange={(e) => setBulkTo(Number(e.target.value))} />
                </div>
                <div className="flex gap-2">
                  <Input
                    value={bulkSubPrefix}
                    onChange={(e) => setBulkSubPrefix(e.target.value)}
                    placeholder="Bay (optional)"
                  />
                  <Input
                    type="number"
                    value={bulkSubFrom}
                    onChange={(e) => setBulkSubFrom(Number(e.target.value))}
                    disabled={!bulkSubPrefix.trim()}
                  />
                  <Input
                    type="number"
                    value={bulkSubTo}
                    onChange={(e) => setBulkSubTo(Number(e.target.value))}
                    disabled={!bulkSubPrefix.trim()}
                  />
                </div>
                <p className="text-xs text-gray-500">Will create {buildBulkNames().length} location(s)</p>
                <Button type="submit" disabled={creating}>
                  Generate
                </Button>
              </form>
            </div>
          </Card>

          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-medium">Locations ({locations.length})</h2>
              <Button disabled={selected.size === 0} onClick={() => setShowPrint(true)}>
                Generate QR Codes ({selected.size})
              </Button>
            </div>
            {locations.length === 0 ? (
              <EmptyState title="No locations yet" description="Add locations above to get started." />
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-800">
                {locations.map((loc) => (
                  <label key={loc.id} className="flex items-center justify-between py-2">
                    <span className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selected.has(loc.id)}
                        onChange={() => toggleSelected(loc.id)}
                      />
                      {loc.name}
                    </span>
                    <Badge tone={loc.status === "active" ? "good" : "neutral"}>{loc.status}</Badge>
                  </label>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card>
          <h2 className="mb-2 font-medium">Warehouse Info</h2>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-gray-500">Timezone</dt>
              <dd>{warehouse.timezone}</dd>
            </div>
            {warehouse.address && (
              <div>
                <dt className="text-gray-500">Address</dt>
                <dd>{warehouse.address}</dd>
              </div>
            )}
          </dl>
        </Card>
      </div>

      {showPrint && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-6 print:relative print:bg-transparent">
          <div className="max-h-full w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-8 dark:bg-gray-900 print:max-h-none print:overflow-visible print:rounded-none print:p-0">
            <div className="mb-6 flex items-center justify-between print:hidden">
              <h2 className="text-lg font-semibold">Printable QR Labels</h2>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setShowPrint(false)}>
                  Close
                </Button>
                <Button onClick={() => window.print()}>Print</Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
              {selectedLocations.map((loc) => (
                <div key={loc.id} className="flex flex-col items-center gap-2 border p-4 text-center">
                  <QrCode value={loc.qr_token} />
                  <span className="text-sm font-medium">{loc.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
