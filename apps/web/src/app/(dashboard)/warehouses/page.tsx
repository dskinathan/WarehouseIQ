"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { Button, Card, EmptyState, ErrorBanner, Field, Input, PageHeader } from "@/components/ui";
import type { Warehouse } from "@/lib/database.types";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "UTC",
];

type FormState = { name: string; address: string; timezone: string };

// docs/product/SCREENS.md #5 Warehouse Setup.
export default function WarehousesPage() {
  const { membership } = useAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ name: "", address: "", timezone: TIMEZONES[0] });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const { data, error: fetchError } = await supabase
      .from("warehouses")
      .select("*")
      .is("archived_at", null)
      .order("created_at", { ascending: true });
    if (fetchError) setError(fetchError.message);
    setWarehouses((data as Warehouse[] | null) ?? []);
  }

  useEffect(() => {
    load();
    // Pre-fill new-warehouse timezone from the org default rather than
    // always defaulting to the first hardcoded option.
    supabase
      .from("organizations")
      .select("default_timezone")
      .single()
      .then(({ data }) => {
        if (data) setForm((f) => ({ ...f, timezone: data.default_timezone }));
      });
  }, []);

  function startCreate() {
    setEditingId(null);
    setForm((f) => ({ ...f, name: "", address: "" }));
    setShowForm(true);
  }

  function startEdit(w: Warehouse) {
    setEditingId(w.id);
    setForm({ name: w.name, address: w.address ?? "", timezone: w.timezone });
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload = { name: form.name, address: form.address || null, timezone: form.timezone };
    const { error: writeError } = editingId
      ? await supabase.from("warehouses").update(payload).eq("id", editingId)
      : await supabase.from("warehouses").insert({ org_id: membership?.org_id, ...payload });

    setSubmitting(false);
    if (writeError) {
      setError(writeError.message);
      return;
    }
    setShowForm(false);
    setEditingId(null);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Warehouses"
        action={
          <Button
            onClick={() => (showForm ? setShowForm(false) : startCreate())}
          >
            {showForm ? "Cancel" : "+ New"}
          </Button>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
            <Field label="Name">
              <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Timezone">
              <select
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                value={form.timezone}
                onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Address (optional)">
                <Input
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              </Field>
            </div>
            {error && (
              <div className="sm:col-span-2">
                <ErrorBanner message={error} />
              </div>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : editingId ? "Save Changes" : "Save"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {warehouses === null ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : warehouses.length === 0 ? (
        <EmptyState
          title="No warehouses yet"
          description="Create your first warehouse to start adding locations."
        />
      ) : (
        <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
          {warehouses.map((w) => (
            <div key={w.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900">
              <Link href={`/warehouses/${w.id}`} className="flex-1">
                <p className="font-medium">{w.name}</p>
                {w.address && <p className="text-sm text-gray-500 dark:text-gray-400">{w.address}</p>}
              </Link>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400">{w.timezone}</span>
                <Button variant="secondary" onClick={() => startEdit(w)}>
                  Edit
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
