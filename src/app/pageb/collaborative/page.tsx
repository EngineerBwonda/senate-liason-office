"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileEdit, LoaderCircle, Plus } from "lucide-react";
import styles from "./styles.module.css";

type DocumentType = "memo" | "minutes" | "report" | "correspondence" | "other";

interface CollaborativeDocument {
  id: string;
  title: string;
  document_type: DocumentType;
  source_type: "memo" | "minutes" | null;
  source_id: number | null;
  status: "draft" | "in_review" | "approved" | "archived";
  updated_at: string;
}

const documentTypes: { value: DocumentType; label: string }[] = [
  { value: "memo", label: "Memo" },
  { value: "minutes", label: "Minutes" },
  { value: "report", label: "Report" },
  { value: "correspondence", label: "Correspondence" },
  { value: "other", label: "Other" },
];

export default function CollaborativeDocumentsPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<CollaborativeDocument[]>([]);
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType>("memo");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const loadDocuments = useCallback(async () => {
    const response = await fetch("/api/collaborative-documents", {
      cache: "no-store",
    });
    const result = (await response.json()) as {
      documents?: CollaborativeDocument[];
      error?: string;
    };

    if (response.status === 401) {
      router.replace("/login");
      return;
    }
    setError("");
    if (!response.ok) {
      setError(result.error ?? "Could not load collaborative drafts.");
    } else {
      setDocuments(result.documents ?? []);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDocuments(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDocuments]);

  const createDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedTitle = title.trim();
    if (!normalizedTitle || creating) return;

    setCreating(true);
    setError("");
    const response = await fetch("/api/collaborative-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: normalizedTitle, documentType }),
    });
    const result = (await response.json()) as {
      document?: CollaborativeDocument;
      error?: string;
    };

    if (response.status === 401) {
      router.replace("/login");
      return;
    }
    if (!response.ok || !result.document) {
      setError(result.error ?? "The collaborative draft could not be created.");
      setCreating(false);
      return;
    }

    setTitle("");
    router.push(`/pageb/collaborative/${result.document.id}`);
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Records / Collaborative workspace</p>
          <h1 className={styles.title}>Collaborative drafts</h1>
          <p className={styles.subtitle}>
            Shared drafts are separate from uploaded source files.
          </p>
        </div>
      </header>

      <form className={styles.createForm} onSubmit={createDocument}>
        <label className={styles.titleField}>
          <span>Document title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={180}
            placeholder="Enter a title"
            required
          />
        </label>
        <label className={styles.typeField}>
          <span>Type</span>
          <select
            value={documentType}
            onChange={(event) =>
              setDocumentType(event.target.value as DocumentType)
            }
          >
            {documentTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className={styles.createButton}
          type="submit"
          disabled={creating || !title.trim()}
        >
          {creating ? (
            <LoaderCircle className={styles.spinner} size={17} />
          ) : (
            <Plus size={17} aria-hidden="true" />
          )}
          Create draft
        </button>
      </form>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <section className={styles.documentSection} aria-label="Your collaborative drafts">
        <div className={styles.sectionHeader}>
          <h2>Recent drafts</h2>
          <span>{documents.length} documents</span>
        </div>
        {loading ? (
          <p className={styles.emptyState} role="status">
            <LoaderCircle className={styles.spinner} size={18} />
            Loading drafts...
          </p>
        ) : documents.length === 0 ? (
          <p className={styles.emptyState}>
            No shared drafts yet. Create one to begin editing.
          </p>
        ) : (
          <ul className={styles.documentList}>
            {documents.map((document) => (
              <li key={document.id}>
                <Link
                  className={styles.documentLink}
                  href={`/pageb/collaborative/${document.id}`}
                >
                  <span className={styles.documentIcon} aria-hidden="true">
                    <FileEdit size={17} />
                  </span>
                  <span className={styles.documentCopy}>
                    <strong>{document.title}</strong>
                    <span>
                      {documentTypes.find(
                        (type) => type.value === document.document_type,
                      )?.label ?? "Document"}
                      {document.source_type && document.source_id
                        ? ` · Linked to ${document.source_type} #${document.source_id}`
                        : " · Collaborative draft"}
                    </span>
                  </span>
                  <span
                    className={styles.status}
                    data-status={document.status}
                  >
                    {document.status.replace("_", " ")}
                  </span>
                  <time dateTime={document.updated_at}>
                    {new Date(document.updated_at).toLocaleDateString()}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}