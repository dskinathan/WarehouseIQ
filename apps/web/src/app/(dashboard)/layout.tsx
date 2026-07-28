"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthProvider";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/warehouses", label: "Warehouses" },
  { href: "/projects", label: "Projects" },
  { href: "/expected-inventory", label: "Expected Inventory" },
  { href: "/settings", label: "Settings" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, membership, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-8">
            <span className="text-lg font-semibold">WarehouseIQ</span>
            <nav className="flex gap-1">
              {NAV_ITEMS.map((item) => {
                const active = pathname?.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-md px-3 py-2 text-sm font-medium ${
                      active
                        ? "bg-accent/10 text-accent"
                        : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
            <span>{session.user.email}</span>
            {membership && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize dark:bg-gray-800">
                {membership.role}
              </span>
            )}
            <Button
              variant="secondary"
              onClick={async () => {
                await supabase.auth.signOut();
                router.replace("/login");
              }}
            >
              Log Out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
