"use client";

import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
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
//
// Fixed in the pre-M2 review: this previously showed a disabled dropdown
// silently displaying the first warehouse's timezone — confusing filler,
// not a real setting. `default_timezone` is now a genuine org-level
// column (pre-fills new Warehouse forms; see warehouses/page.tsx).
export default function SettingsPage() {
  const { membership } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [name, setName] = useState("");
  const [defaultTimezone, setDefaultTimezone] = useState(TIMEZONES[0]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!membership) return;
    supabase
      .from("organizations")
      .select("*")
      .eq("id", membership.org_id)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const organization = data as Organization;
        setOrg(organization);
        setName(organization.name);
        setDefaultTimezone(organization.default_timezone);
      });
  }, [membership]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!org) return;
    setError(null);
    setSaved(false);
    setSubmitting(true);
    const { error: updateError } = await supabase
      .from("organizations")
      .update({ name, default_timezone: defaultTimezone })
      .eq("id", org.id);
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
              value={defaultTimezone}
              onChange={(e) => setDefaultTimezone(e.target.value)}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-gray-500">
              Pre-fills new warehouses — each warehouse can still set its own.
            </span>
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
