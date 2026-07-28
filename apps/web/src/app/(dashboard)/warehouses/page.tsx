"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
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

// docs/product/SCREENS.md #5 Warehouse Setup.
export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [timezone, setTimezone] = useState(TIMEZONES[0]);
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
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    // org_id is resolved server-side from the caller's membership via RLS
    // policy on insert — but the column is NOT NULL and has no default, so
    // the client still supplies it; a mismatched org_id is rejected by the
    // warehouses_write policy regardless of what's sent.
    const { data: membership } = await supabase
      .from("memberships")
      .select("org_id")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const { error: insertError } = await supabase.from("warehouses").insert({
      org_id: membership?.org_id,
      name,
      address: address || null,
      timezone,
    });

    setSubmitting(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setName("");
    setAddress("");
    setShowForm(false);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Warehouses"
        action={<Button onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancel" : "+ New"}</Button>}
      />

      {showForm && (
        <Card className="mb-6">
          <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={handleCreate}>
            <Field label="Name">
              <Input required value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Timezone">
              <select
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
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
                <Input value={address} onChange={(e) => setAddress(e.target.value)} />
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
            <Link
              key={w.id}
              href={`/warehouses/${w.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              <div>
                <p className="font-medium">{w.name}</p>
                {w.address && <p className="text-sm text-gray-500 dark:text-gray-400">{w.address}</p>}
              </div>
              <span className="text-sm text-gray-400">{w.timezone}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
