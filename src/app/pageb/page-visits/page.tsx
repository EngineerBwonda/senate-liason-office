"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LoaderCircle, Search } from "lucide-react";
import { createClient } from "../../supabase/client";
import styles from "./styles.module.css";

interface PageVisit {
  id: number;
  user_id: string;
  path: string;
  ip_address: string | null;
  visited_at: string;
  user_name: string;
  user_email: string;
}

interface ProfileSummary {
  id: string;
  full_name: string | null;
  email: string | null;
}

export default function PageVisitsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [visits, setVisits] = useState<PageVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadVisits = async () => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (cancelled) return;
      if (authError || !user) {
        router.replace("/login");
        return;
      }

      const { data: admin, error: adminError } = await supabase
        .from("admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;
      if (adminError) {
        setError(adminError.message);
        setLoading(false);
        return;
      }
      if (!admin) {
        router.replace("/pageb/menu");
        return;
      }

      const { data, error: visitsError } = await supabase
        .from("page_visits")
        .select("id, user_id, path, ip_address, visited_at")
        .order("visited_at", { ascending: false })
        .limit(500);

      if (cancelled) return;
      if (visitsError) {
        setError(visitsError.message);
        setLoading(false);
        return;
      }

      const rows = data ?? [];
      const userIds = [...new Set(rows.map((visit) => visit.user_id))];
      const { data: profiles, error: profilesError } = userIds.length
        ? await supabase
            .from("profilec")
            .select("id, full_name, email")
            .in("id", userIds)
        : { data: [], error: null };

      if (cancelled) return;
      if (profilesError) {
        setError(profilesError.message);
        setLoading(false);
        return;
      }

      const profilesById = new Map(
        ((profiles ?? []) as ProfileSummary[]).map((profile) => [
          profile.id,
          profile,
        ]),
      );
      setVisits(
        rows.map((visit) => {
          const profile = profilesById.get(visit.user_id);
          return {
            ...visit,
            user_name: profile?.full_name?.trim() || "Staff member",
            user_email: profile?.email || "",
          };
        }),
      );
      setLoading(false);
    };

    void loadVisits();
    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  const filteredVisits = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return visits;
    return visits.filter((visit) =>
      `${visit.user_name} ${visit.user_email} ${visit.user_id} ${visit.path} ${visit.ip_address ?? ""}`
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [search, visits]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Administration / Activity</p>
          <h1 className={styles.title}>Page visits</h1>
          <p className={styles.subtitle}>
            Latest {visits.length} recorded visits
          </p>
        </div>
        <Link className={styles.backLink} href="/pageb/menu">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to menu
        </Link>
      </header>

      <label className={styles.searchBox}>
        <Search size={16} aria-hidden="true" />
        <span className={styles.visuallyHidden}>Search page visits</span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search user, path, or IP address"
        />
      </label>

      {error ? (
        <p className={styles.state} role="alert">
          {error}
        </p>
      ) : loading ? (
        <p className={styles.state} role="status">
          <LoaderCircle className={styles.spinner} size={18} />
          Loading visits...
        </p>
      ) : filteredVisits.length === 0 ? (
        <p className={styles.state}>
          {search ? "No matching visits." : "No page visits recorded yet."}
        </p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">User</th>
                <th scope="col">Page</th>
                <th scope="col">Public IP</th>
                <th scope="col">Visited</th>
              </tr>
            </thead>
            <tbody>
              {filteredVisits.map((visit) => (
                <tr key={visit.id}>
                  <td>
                    <strong>{visit.user_name}</strong>
                    <span className={styles.userEmail}>
                      {visit.user_email || visit.user_id}
                    </span>
                  </td>
                  <td className={styles.path}>{visit.path}</td>
                  <td className={styles.ipAddress}>
                    {visit.ip_address || "Unavailable"}
                  </td>
                  <td>
                    <time dateTime={visit.visited_at}>
                      {new Date(visit.visited_at).toLocaleString()}
                    </time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
