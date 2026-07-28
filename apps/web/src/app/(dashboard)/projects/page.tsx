"use client";

import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, Input, PageHeader } from "@/components/ui";
import type { Project, ProjectStatus } from "@/lib/database.types";

const STATUS_TONE: Record<ProjectStatus, "good" | "neutral"> = {
  active: "good",
  completed: "neutral",
  archived: "neutral",
};

const STATUSES: ProjectStatus[] = ["active", "completed", "archived"];

type FormState = { name: string; code: string; clientName: string; status: ProjectStatus };
const emptyForm: FormState = { name: "", code: "", clientName: "", status: "active" };

// docs/product/SCREENS.md #6 Project Management. `code` is the single
// canonical "project number" — see docs/database/DATABASE.md §2 design
// note; Expected Inventory references project_id, never a duplicated code.
export default function ProjectsPage() {
  const { membership } = useAuth();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
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

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(p: Project) {
    setEditingId(p.id);
    setForm({ name: p.name, code: p.code, clientName: p.client_name ?? "", status: p.status });
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload = {
      name: form.name,
      code: form.code,
      client_name: form.clientName || null,
      status: form.status,
    };
    const { error: writeError } = editingId
      ? await supabase.from("projects").update(payload).eq("id", editingId)
      : await supabase.from("projects").insert({ org_id: membership?.org_id, ...payload });

    setSubmitting(false);
    if (writeError) {
      setError(
        writeError.code === "23505" ? `A project with code "${form.code}" already exists.` : writeError.message
      );
      return;
    }
    setShowForm(false);
    setEditingId(null);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        action={<Button onClick={() => (showForm ? setShowForm(false) : startCreate())}>{showForm ? "Cancel" : "+ New"}</Button>}
      />

      {showForm && (
        <Card className="mb-6">
          <form className="grid grid-cols-1 gap-4 sm:grid-cols-4" onSubmit={handleSubmit}>
            <Field label="Project code">
              <Input
                required
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="P-101"
              />
            </Field>
            <Field label="Name">
              <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Client (optional)">
              <Input
                value={form.clientName}
                onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
              />
            </Field>
            <Field label="Status">
              <select
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ProjectStatus }))}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            {error && (
              <div className="sm:col-span-4">
                <ErrorBanner message={error} />
              </div>
            )}
            <div className="sm:col-span-4">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : editingId ? "Save Changes" : "Save"}
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
                <th className="px-4 py-2 font-medium"></th>
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
                  <td className="px-4 py-2 text-right">
                    <Button variant="secondary" onClick={() => startEdit(p)}>
                      Edit
                    </Button>
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
