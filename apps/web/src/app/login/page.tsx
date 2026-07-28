"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { Button, Card, ErrorBanner, Field, Input } from "@/components/ui";

// docs/product/SCREENS.md #1 Login.
export default function LoginPage() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) router.replace("/dashboard");
  }, [loading, session, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.replace("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <Card className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-semibold">WarehouseIQ</h1>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <Field label="Email">
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
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error && <ErrorBanner message={error} />}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Logging in..." : "Log In"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          New organization?{" "}
          <Link href="/signup" className="text-accent hover:underline">
            Create your company
          </Link>
        </p>
      </Card>
    </main>
  );
}
