"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileEdit, LoaderCircle } from "lucide-react";
import styles from "./collaborative-draft-action.module.css";

interface CollaborativeDraftActionProps {
  documentType: "memo" | "minutes";
  sourceId: number;
  title: string;
}

export default function CollaborativeDraftAction({
  documentType,
  sourceId,
  title,
}: CollaborativeDraftActionProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const createDraft = async () => {
    if (creating) return;
    setCreating(true);
    setError("");

    const response = await fetch("/api/collaborative-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim().slice(0, 180),
        documentType,
        sourceType: documentType,
        sourceId,
      }),
    });
    const result = (await response.json()) as {
      document?: { id: string };
      error?: string;
    };

    if (!response.ok || !result.document) {
      setError(result.error ?? "Could not create collaborative draft.");
      setCreating(false);
      return;
    }

    router.push(`/pageb/collaborative/${result.document.id}`);
  };

  return (
    <span className={styles.wrapper}>
      <button
        className={styles.button}
        type="button"
        onClick={() => void createDraft()}
        disabled={creating}
        title="Create a separate collaborative draft based on this record"
      >
        {creating ? (
          <LoaderCircle className={styles.spinner} size={14} />
        ) : (
          <FileEdit size={14} aria-hidden="true" />
        )}
        Collaborate
      </button>
      {error && <span className={styles.error}>{error}</span>}
    </span>
  );
}