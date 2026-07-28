"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import type { Membership } from "./database.types";

// M1 auth guarding is deliberately client-side: the anon-key client checks
// the session on mount and via onAuthStateChange, and route groups below
// redirect based on that state. This is a known, reasonable simplification
// for M1 — migrating to @supabase/ssr with middleware-based server session
// handling (avoiding any unauthenticated-content flash, and letting server
// components know the user) is a sensible near-term hardening once there's
// a real Supabase project to test it against, not a blocker for the pilot.
interface AuthState {
  session: Session | null;
  membership: Membership | null;
  loading: boolean;
  refreshMembership: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadMembership(userId: string) {
    // A user has exactly one *effective* membership in V1's UI (see
    // docs/database/DATABASE.md §1) — the most recently created active one,
    // matching the current_org_id() SQL helper's own tie-break rule.
    const { data } = await supabase
      .from("memberships")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setMembership((data as Membership | null) ?? null);
  }

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      if (data.session) {
        await loadMembership(data.session.user.id);
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);
        if (newSession) {
          await loadMembership(newSession.user.id);
        } else {
          setMembership(null);
        }
      }
    );

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      membership,
      loading,
      refreshMembership: async () => {
        if (session) await loadMembership(session.user.id);
      },
    }),
    [session, membership, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
