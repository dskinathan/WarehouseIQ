"use client";

import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, Input, PageHeader } from "@/components/ui";
import type { Project, ProjectStatus } from "@/lib/database.types";

const STATUS_TONE: Record<ProjectStatus, "good" | "neutral"> = {
  active: "good",
  completed: "neutral",
  archived: "neutral",
};

// docs/product/SCREENS.md #6 Project Management. `code` is the single
// canonical "project number" — see docs/database/DATABASE.md §2 design
// note; Expected Inventory references project_id, never a duplicated code.
export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [clientName, setClientName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const { data, error: fetchError } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: true });
    if (fetchError) setError(fetchError.message);
    setProjects((data as Project[] | null) ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: FormEvent) {
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

    const { error: insertError } = await supabase.from("projects").insert({
      org_id: membership?.org_id,
      name,
      code,
      client_name: clientName || null,
    });

    setSubmitting(false);
    if (insertError) {
      setError(
        insertError.code === "23505"
          ? `A project with code "${code}" already exists.`
          : insertError.message
      );
      return;
    }
    setName("");
    setCode("");
    setClientName("");
    setShowForm(false);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        action={<Button onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancel" : "+ New"}</Button>}
      />

      {showForm && (
        <Card className="mb-6">
          <form className="grid grid-cols-1 gap-4 sm:grid-cols-3" onSubmit={handleCreate}>
            <Field label="Project code">
              <Input required value={code} onChange={(e) => setCode(e.target.value)} placeholder="P-101" />
            </Field>
            <Field label="Name">
              <Input required value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Client (optional)">
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </Field>
            {error && (
              <div className="sm:col-span-3">
                <ErrorBanner message={error} />
              </div>
            )}
            <div className="sm:col-span-3">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {projects === null ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : projects.length === 0 ? (
        <EmptyState title="No projects yet" description="Create a project to allocate inventory to it." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th className="px-4 py-2 font-medium">Code</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {projects.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 font-medium">{p.code}</td>
                  <td className="px-4 py-2">{p.name}</td>
                  <td className="px-4 py-2 text-gray-500">{p.client_name ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
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
