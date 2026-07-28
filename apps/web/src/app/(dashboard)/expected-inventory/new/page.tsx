"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Button, Card, ErrorBanner, Field, Input, PageHeader } from "@/components/ui";
import type { Project, Warehouse } from "@/lib/database.types";

// docs/product/SCREENS.md #11 Create/Edit Expected Inventory Record.
export default function NewExpectedInventoryPage() {
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState({
    warehouse_id: "",
    project_id: "",
    po_number: "",
    line_number: "1",
    manufacturer: "",
    product: "",
    expected_quantity: "",
    expected_pallet_count: "",
    expected_delivery_date: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase
      .from("warehouses")
      .select("*")
      .is("archived_at", null)
      .then(({ data }) => {
        const list = (data as Warehouse[]) ?? [];
        setWarehouses(list);
        if (list[0]) setForm((f) => ({ ...f, warehouse_id: list[0].id }));
      });
    supabase
      .from("projects")
      .select("*")
      .eq("status", "active")
      .then(({ data }) => {
        const list = (data as Project[]) ?? [];
        setProjects(list);
        if (list[0]) setForm((f) => ({ ...f, project_id: list[0].id }));
      });
  }, []);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const { data: membership } = await supabase
      .from("memberships")
      .select("org_id")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const { error: insertError } = await supabase.from("expected_inventory_records").insert({
      org_id: membership?.org_id,
      warehouse_id: form.warehouse_id,
      project_id: form.project_id,
      po_number: form.po_number,
      line_number: Number(form.line_number) || 1,
      manufacturer: form.manufacturer,
      product: form.product,
      expected_quantity: Number(form.expected_quantity),
      expected_pallet_count: Number(form.expected_pallet_count),
      expected_delivery_date: form.expected_delivery_date || null,
      notes: form.notes || null,
      source: "manual",
    });

    setSubmitting(false);
    if (insertError) {
      setError(
        insertError.code === "23505"
          ? `PO "${form.po_number}" (line ${form.line_number}) already exists in Expected Inventory.`
          : insertError.message
      );
      return;
    }
    router.replace("/expected-inventory");
  }

  return (
    <div>
      <Link href="/expected-inventory" className="text-sm text-accent hover:underline">
        &larr; Expected Inventory
      </Link>
      <PageHeader title="New Expected Inventory Record" />
      <Card className="max-w-2xl">
        <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
          <Field label="Warehouse">
            <select
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
              required
              value={form.warehouse_id}
              onChange={(e) => set("warehouse_id", e.target.value)}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Project">
            <select
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
              required
              value={form.project_id}
              onChange={(e) => set("project_id", e.target.value)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="PO Number">
            <Input required value={form.po_number} onChange={(e) => set("po_number", e.target.value)} />
          </Field>
          <Field label="Line Number">
            <Input
              type="number"
              min={1}
              value={form.line_number}
              onChange={(e) => set("line_number", e.target.value)}
            />
          </Field>
          <Field label="Manufacturer">
            <Input required value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} />
          </Field>
          <Field label="Product">
            <Input required value={form.product} onChange={(e) => set("product", e.target.value)} />
          </Field>
          <Field label="Expected Quantity">
            <Input
              type="number"
              min={0}
              required
              value={form.expected_quantity}
              onChange={(e) => set("expected_quantity", e.target.value)}
            />
          </Field>
          <Field label="Expected Pallet Count">
            <Input
              type="number"
              min={0}
              required
              value={form.expected_pallet_count}
              onChange={(e) => set("expected_pallet_count", e.target.value)}
            />
          </Field>
          <Field label="Expected Delivery Date (optional)">
            <Input
              type="date"
              value={form.expected_delivery_date}
              onChange={(e) => set("expected_delivery_date", e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes (optional)">
              <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </div>
          {error && (
            <div className="sm:col-span-2">
              <ErrorBanner message={error} />
            </div>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
