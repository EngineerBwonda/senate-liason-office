"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../../supabase/client";
import styles from "./styles.module.css";

interface StaffMember {
  userId: string;
  name: string;
  role: string;
}

export default function OnlineUsers() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const loadApprovedStaff = async () => {
      const { data, error } = await supabase
        .from("profilec")
        .select("id, full_name, position")
        .eq("is_approved", true)
        .order("full_name", { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error("Could not load approved staff:", error);
        setErrorMessage("Approved staff could not be loaded.");
      } else {
        setStaff(
          (data ?? []).map((profile) => ({
            userId: profile.id,
            name: profile.full_name?.trim() || "Staff member",
            role: profile.position?.trim() || "Staff",
          })),
        );
      }

      setLoading(false);
    };

    void loadApprovedStaff();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className={styles.card} aria-labelledby="online-users-heading">
      <div className={styles.header}>
        <h2 className={styles.title} id="online-users-heading">
          Staff Members
        </h2>
        <span className={styles.count}>{staff.length}</span>
      </div>
      <ul className={styles.list}>
        {staff.map((member) => (
          <li key={member.userId} className={styles.row}>
            <span className={styles.avatar} aria-hidden="true">
              {member.name
                .split(" ")
                .map((part) => part[0])
                .slice(-2)
                .join("")}
            </span>
            <span className={styles.info}>
              <span className={styles.name}>{member.name}</span>
              <span className={styles.role}>{member.role}</span>
            </span>
          </li>
        ))}
      </ul>
      {loading && (
        <p className={styles.emptyMessage} role="status">
          Loading approved staff...
        </p>
      )}
      {!loading && errorMessage && (
        <p className={styles.emptyMessage} role="status">
          {errorMessage}
        </p>
      )}
      {!loading && !errorMessage && staff.length === 0 && (
        <p className={styles.emptyMessage} role="status">
          No approved staff members found.
        </p>
      )}
    </section>
  );
}
