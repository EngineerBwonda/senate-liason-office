"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "../../supabase/client";
import styles from "./styles.module.css";

interface Profile {
  full_name: string | null;
  position: string | null;
  is_approved: boolean | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    const handleNotApproved = () => {
      if (cancelled) return;
      router.replace("/pending");
    };

    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;
      if (!user) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("profilec")
        .select("full_name, position, is_approved")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error("profilec lookup failed:", error);
        setLoading(false);
        return;
      }

      if (!data || !data.is_approved) {
        handleNotApproved();
        return;
      }

      setProfile(data);
      setLoading(false);

      // Live revoke — kick the user back if an admin toggles access off
      const channel = supabase
        .channel(`dashboard-guard-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "profilec",
            filter: `id=eq.${user.id}`,
          },
          (payload) => {
            const next = payload.new as { is_approved?: boolean };
            if (!next.is_approved) {
              handleNotApproved();
            }
          },
        )
        .subscribe();

      cleanup = () => {
        supabase.removeChannel(channel);
      };
    };

    init();

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, [router, supabase]);

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={styles.loadingWrapper}>
          <Loader2 className={styles.loadingSpinner} size={26} />
          <p>Loading your dashboard...</p>
        </div>
      </main>
    );
  }

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <span className={styles.eyebrow}>Dashboard</span>
          <h1 className={styles.title}>
            Welcome back, <span>{firstName}</span>
          </h1>
          <p className={styles.subtitle}>
            {profile?.position
              ? `${profile.full_name} · ${profile.position}`
              : (profile?.full_name ?? "")}
          </p>
        </header>

        <section className={styles.cardGrid}>
          <div className={styles.card}>
            <span className={styles.cardLabel}>System</span>
            <strong className={styles.cardValue}>Senate Liaison</strong>
            <span className={styles.cardMeta}>Office Management System</span>
          </div>

          <div className={styles.card}>
            <span className={styles.cardLabel}>Access</span>
            <strong className={styles.cardValue}>Active</strong>
            <span className={styles.cardMeta}>Your account is approved</span>
          </div>
        </section>
      </div>
    </main>
  );
}
