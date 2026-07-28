"use client";

import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button, Card, ErrorBanner, Field, Input, PageHeader } from "@/components/ui";
import type { Organization } from "@/lib/database.types";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "UTC",
];

// docs/product/SCREENS.md #17 Settings. Notification Preferences and AI
// Confidence Threshold are intentionally absent — the former has no
// backing feature until V2 push notifications, the latter has nothing to
// tune until M2's AI review flow exists. Both return here when their
// underlying feature ships, per the final architecture review.
export default function SettingsPage() {
  const [org, setOrg] = useState<Organization | null>(null);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(TIMEZONES[0]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: membership } = await supabase
        .from("memberships")
        .select("org_id")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (!membership) return;
      const { data } = await supabase.from("organizations").select("*").eq("id", membership.org_id).single();
      if (data) {
        setOrg(data as Organization);
        setName((data as Organization).name);
      }
      // Default warehouse's timezone stands in for an org-level default
      // until warehouses can genuinely differ — kept simple for M1.
      const { data: firstWarehouse } = await supabase
        .from("warehouses")
        .select("timezone")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (firstWarehouse) setTimezone(firstWarehouse.timezone);
    })();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!org) return;
    setError(null);
    setSaved(false);
    setSubmitting(true);
    const { error: updateError } = await supabase.from("organizations").update({ name }).eq("id", org.id);
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSaved(true);
  }

  if (!org) return <p className="text-sm text-gray-500">Loading...</p>;

  return (
    <div>
      <PageHeader title="Settings" />
      <Card className="max-w-md">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <Field label="Organization Name">
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Default Timezone">
            <select
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled
              title="Set per-warehouse in Warehouses — shown here for reference"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </Field>
          {error && <ErrorBanner message={error} />}
          {saved && <p className="text-sm text-status-good">Saved.</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Save"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
