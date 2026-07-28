"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Card, EmptyState, PageHeader, Button } from "@/components/ui";
import type { Warehouse } from "@/lib/database.types";

type WarehouseWithCounts = Warehouse & { locations: { count: number }[] };

// docs/product/SCREENS.md #3 Manager Dashboard (home). Pallet/exception
// counts and the recent-activity feed are placeholders until M2/M4 exist
// to generate that data — this milestone is Manager-only, so there's
// nothing real to show there yet, and a fabricated number would be worse
// than an honest "not yet" state.
export default function DashboardPage() {
  const [warehouses, setWarehouses] = useState<WarehouseWithCounts[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("warehouses")
      .select("*, locations(count)")
      .is("archived_at", null)
      .order("created_at", { ascending: true })
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) setError(fetchError.message);
        setWarehouses((data as WarehouseWithCounts[] | null) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <PageHeader title="Dashboard" />
      {error && <p className="text-status-bad">{error}</p>}

      {warehouses === null ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : warehouses.length === 0 ? (
        <EmptyState
          title="No warehouses yet"
          description="Add your first warehouse to start configuring locations and Expected Inventory."
          action={
            <Link href="/warehouses">
              <Button>Add a Warehouse</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {warehouses.map((w) => (
            <Link key={w.id} href={`/warehouses/${w.id}`}>
              <Card className="transition hover:border-accent">
                <p className="font-medium">{w.name}</p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {w.locations?.[0]?.count ?? 0} location(s)
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-gray-500 dark:text-gray-400">
          Recent Activity
        </h2>
        <EmptyState
          title="Nothing to show yet"
          description="Once the Worker App is live (M2), pallet activity will appear here."
        />
      </div>
    </div>
  );
}
