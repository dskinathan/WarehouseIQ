"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Button, Card, ErrorBanner, Field, Input } from "@/components/ui";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "org"
  );
}

// docs/product/SCREENS.md #2 Create Company. Creates the Supabase Auth
// user, then calls create_organization() (docs/api/API.md) to atomically
// create the organization, profile, and manager membership.
export default function SignupPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError || !signUpData.user) {
      setSubmitting(false);
      setError(signUpError?.message ?? "Could not create an account.");
      return;
    }

    // If email confirmation is required by the Supabase project's auth
    // settings, there's no session yet to call the RPC under — send the
    // user to check their email rather than failing silently.
    if (!signUpData.session) {
      setSubmitting(false);
      router.replace("/login?confirm=1");
      return;
    }

    const baseSlug = slugify(companyName);
    let { error: orgError } = await supabase.rpc("create_organization", {
      p_org_name: companyName,
      p_org_slug: baseSlug,
      p_manager_full_name: fullName,
    });

    if (orgError?.code === "23505") {
      // Slug collision — not a field the user sees, so retry once with a
      // short disambiguating suffix instead of surfacing raw DB detail.
      const retrySlug = `${baseSlug}-${Math.random().toString(16).slice(2, 6)}`;
      ({ error: orgError } = await supabase.rpc("create_organization", {
        p_org_name: companyName,
        p_org_slug: retrySlug,
        p_manager_full_name: fullName,
      }));
    }

    setSubmitting(false);

    if (orgError) {
      setError(orgError.message);
      return;
    }

    router.replace("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <Card className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-semibold">Create your organization</h1>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <Field label="Company name">
            <Input required value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </Field>
          <Field label="Your full name">
            <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label="Work email">
            <Input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error && <ErrorBanner message={error} />}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Creating..." : "Create Account"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Already have an account?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Log in
          </Link>
        </p>
      </Card>
    </main>
  );
}
