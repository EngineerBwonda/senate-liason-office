"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  Eye,
  ExternalLink,
  FileText,
  LoaderCircle,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import MinutesUpload from "../../page/(component)/minutes-upload";
import CollaborativeDraftAction from "../(component)/collaborative-draft-action";
import { createClient } from "../../supabase/client";
import styles from "./styles.module.css";

const STORAGE_BUCKET = "minutes";
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ACCEPTED_FILE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
];

interface MinuteRecord {
  id: number;
  created_at: string;
  title: string;
  description: string;
  file_url: string;
  user_id: string;
  email: string;
}

export default function Page() {
  const router = useRouter();
  const supabase = createClient();
  const [minutes, setMinutes] = useState<MinuteRecord[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<Record<number, string>>({});
  const [downloadUrls, setDownloadUrls] = useState<Record<number, string>>({});
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [mutatingId, setMutatingId] = useState<number | null>(null);

  const loadMinutes = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("minutes")
      .select("id, created_at, title, description, file_url, user_id, email")
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    const records = (data ?? []) as MinuteRecord[];
    setMinutes(records);

    const urls = await Promise.all(
      records.map(async (record) => {
        if (/^https?:\/\//i.test(record.file_url)) {
          return {
            id: record.id,
            previewUrl: record.file_url,
            downloadUrl: record.file_url,
          };
        }
        const storage = supabase.storage.from(STORAGE_BUCKET);
        const [preview, download] = await Promise.all([
          storage.createSignedUrl(record.file_url, 60 * 60),
          storage.createSignedUrl(record.file_url, 60 * 60, { download: true }),
        ]);
        if (preview.error) {
          console.error("Could not create minutes preview URL:", preview.error);
        }
        if (download.error) {
          console.error(
            "Could not create minutes download URL:",
            download.error,
          );
        }
        return {
          id: record.id,
          previewUrl: preview.data?.signedUrl ?? "",
          downloadUrl:
            download.data?.signedUrl ?? preview.data?.signedUrl ?? "",
        };
      }),
    );

    setPreviewUrls(
      Object.fromEntries(urls.map(({ id, previewUrl }) => [id, previewUrl])),
    );
    setDownloadUrls(
      Object.fromEntries(urls.map(({ id, downloadUrl }) => [id, downloadUrl])),
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | undefined;

    const initialize = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (cancelled) return;
      if (!user) {
        router.replace("/login");
        return;
      }
      setCurrentUserId(user.id);
      if (error) {
        setErrorMessage(error.message);
        setLoading(false);
        return;
      }

      const { data: adminRow, error: adminError } = await supabase
        .from("admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;
      if (adminError) {
        console.error("Could not verify minutes admin access:", adminError);
      }
      setIsAdmin(Boolean(adminRow) && !adminError);

      channel = supabase
        .channel("minutes-archive-changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "minutes" },
          () => {
            void loadMinutes();
          },
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error(`Minutes realtime subscription status: ${status}`);
          }
        });

      await loadMinutes();
    };

    void initialize();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [loadMinutes, router, supabase]);

  const filteredMinutes = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return minutes;
    return minutes.filter((record) =>
      `${record.id} ${record.created_at} ${record.title} ${record.description} ${record.file_url} ${record.user_id} ${record.email}`
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [minutes, search]);

  const previewMinute = minutes.find((record) => record.id === previewId);
  const previewUrl = previewMinute ? previewUrls[previewMinute.id] : "";
  const canEmbedPreview = previewMinute
    ? /\.(pdf|jpe?g|png|webp)(?:$|\?)/i.test(previewMinute.file_url)
    : false;

  const closeUpload = useCallback(() => setUploadOpen(false), []);
  const closePreview = useCallback(() => setPreviewId(null), []);
  const handleUploaded = useCallback(
    async (id: number) => {
      setNotice("Minutes uploaded successfully.");
      await loadMinutes();
      setPreviewId(id);
    },
    [loadMinutes],
  );

  const handleDelete = async (record: MinuteRecord) => {
    if (!isAdmin && record.user_id !== currentUserId) return;
    if (!window.confirm(`Delete "${record.title}"? This cannot be undone.`)) {
      return;
    }

    setMutatingId(record.id);
    setErrorMessage("");
    setNotice("");

    const { data: deleted, error } = await supabase
      .from("minutes")
      .delete()
      .eq("id", record.id)
      .select("id")
      .maybeSingle();

    if (error || !deleted) {
      setErrorMessage(
        error?.message ?? "You are not allowed to delete this file.",
      );
      setMutatingId(null);
      return;
    }

    if (!/^https?:\/\//i.test(record.file_url)) {
      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([record.file_url]);
      if (storageError) {
        console.error(
          "Minute row deleted, but its file could not be removed:",
          storageError,
        );
      }
    }

    if (previewId === record.id) setPreviewId(null);
    setNotice(
      "Minute deleted." +
        (!/^https?:\/\//i.test(record.file_url)
          ? ""
          : " The external file was not removed."),
    );
    await loadMinutes();
    setMutatingId(null);
  };

  const handleReplace = async (
    record: MinuteRecord,
    file: File | undefined,
  ) => {
    if (!file || record.user_id !== currentUserId) return;
    setErrorMessage("");
    setNotice("");

    if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
      setErrorMessage(
        "Upload a PDF, Word document, or JPG, PNG, or WebP image.",
      );
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setErrorMessage("Files must be 20 MB or smaller.");
      return;
    }

    setMutatingId(record.id);
    const safeFileName = file.name
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]+/g, "-");
    const newObjectPath = `${currentUserId}/${crypto.randomUUID()}-${safeFileName}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(newObjectPath, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      setErrorMessage(uploadError.message);
      setMutatingId(null);
      return;
    }

    const { data: updated, error: updateError } = await supabase
      .from("minutes")
      .update({ file_url: newObjectPath })
      .eq("id", record.id)
      .eq("user_id", currentUserId)
      .select("id")
      .maybeSingle();

    if (updateError || !updated) {
      await supabase.storage.from(STORAGE_BUCKET).remove([newObjectPath]);
      setErrorMessage(
        updateError?.message ?? "Only the uploader can replace this file.",
      );
      setMutatingId(null);
      return;
    }

    if (!/^https?:\/\//i.test(record.file_url)) {
      const { error: removeError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([record.file_url]);
      if (removeError) {
        console.error(
          "Updated minute, but the old file could not be removed:",
          removeError,
        );
      }
    }

    setNotice("File replaced successfully.");
    await loadMinutes();
    setMutatingId(null);
  };

  useEffect(() => {
    if (previewId === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePreview();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closePreview, previewId]);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Records / Minutes</p>
          <h1 className={styles.title}>Minutes archive</h1>
          <p className={styles.subtitle}>
            Upload meeting records and review documents shared with your office.
          </p>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.totalCount}>
            <FileText size={16} aria-hidden="true" />
            {minutes.length} {minutes.length === 1 ? "record" : "records"}
          </span>
          <button
            className={styles.uploadButton}
            type="button"
            onClick={() => {
              setNotice("");
              setUploadOpen(true);
            }}
          >
            <Upload size={17} aria-hidden="true" />
            Upload minutes
          </button>
        </div>
      </header>

      <div className={styles.workspace}>
        <section className={styles.archive} aria-label="Minutes archive">
          <div className={styles.archiveHeader}>
            <h2>Minutes table</h2>
            <label className={styles.searchBox}>
              <Search size={16} aria-hidden="true" />
              <span className={styles.visuallyHidden}>Search minutes</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search records"
              />
            </label>
          </div>

          {loading ? (
            <div className={styles.stateMessage}>
              <LoaderCircle className={styles.spinner} size={20} />
              Loading minutes...
            </div>
          ) : errorMessage && minutes.length === 0 ? (
            <div className={styles.stateMessage} role="alert">
              {errorMessage}
            </div>
          ) : filteredMinutes.length === 0 ? (
            <div className={styles.emptyState}>
              <FileText size={28} aria-hidden="true" />
              <h3>{search ? "No matching records" : "No minutes yet"}</h3>
              <p>
                {search
                  ? "Try another ID, date, title, description, file path, user ID, or email."
                  : "Uploaded minutes will appear here for you to review."}
              </p>
            </div>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.recordTable}>
                <caption className={styles.visuallyHidden}>
                  Minutes records with their full database fields
                </caption>
                <thead>
                  <tr>
                    <th scope="col">ID</th>
                    <th scope="col">Created</th>
                    <th scope="col">Title</th>
                    <th scope="col">Description</th>
                    <th scope="col">Download</th>
                    <th scope="col">Email</th>
                    <th scope="col">Preview</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMinutes.map((record) => (
                    <tr
                      key={record.id}
                      className={
                        record.id === previewId
                          ? styles.selectedTableRow
                          : undefined
                      }
                    >
                      <td>{record.id}</td>
                      <td className={styles.dateCell}>
                        <time dateTime={record.created_at}>
                          {new Date(record.created_at).toLocaleString()}
                        </time>
                      </td>
                      <th scope="row" className={styles.titleCell}>
                        {record.title}
                      </th>
                      <td className={styles.descriptionCell}>
                        {record.description}
                      </td>
                      <td className={styles.downloadCell}>
                        <a
                          href={downloadUrls[record.id] || undefined}
                          download
                          aria-label={`Download ${record.title}`}
                          title={`Download ${record.title}`}
                        >
                          <Download size={15} aria-hidden="true" />
                          Download
                        </a>
                      </td>
                      <td>{record.email}</td>
                      <td className={styles.previewCell}>
                        <button
                          className={styles.previewButton}
                          type="button"
                          onClick={() => setPreviewId(record.id)}
                          disabled={!previewUrls[record.id]}
                          aria-label={`Preview ${record.title}`}
                        >
                          <Eye size={15} aria-hidden="true" />
                          Preview
                        </button>
                      </td>
                      <td className={styles.actionsCell}>
                        <CollaborativeDraftAction
                          documentType="minutes"
                          sourceId={record.id}
                          title={record.title}
                        />
                        {record.user_id === currentUserId && (
                          <label className={styles.rowAction}>
                            <RefreshCw size={14} aria-hidden="true" />
                            Replace
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                              disabled={mutatingId === record.id}
                              onChange={(event) => {
                                void handleReplace(
                                  record,
                                  event.target.files?.[0],
                                );
                                event.currentTarget.value = "";
                              }}
                              aria-label={`Replace ${record.title}`}
                            />
                          </label>
                        )}
                        {(isAdmin || record.user_id === currentUserId) && (
                          <button
                            className={`${styles.rowAction} ${styles.deleteAction}`}
                            type="button"
                            disabled={mutatingId === record.id}
                            onClick={() => void handleDelete(record)}
                            aria-label={`Delete ${record.title}`}
                          >
                            {mutatingId === record.id ? (
                              <LoaderCircle
                                className={styles.spinner}
                                size={14}
                              />
                            ) : (
                              <Trash2 size={14} aria-hidden="true" />
                            )}
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {errorMessage && minutes.length > 0 && (
        <p className={styles.inlineError} role="alert">
          {errorMessage}
        </p>
      )}
      {notice && (
        <p className={styles.successMessage} role="status">
          {notice}
        </p>
      )}
      <p className={styles.storageNote}>
        Files are stored in a private Supabase Storage bucket named minutes.
      </p>
      {uploadOpen && (
        <MinutesUpload onClose={closeUpload} onUploaded={handleUploaded} />
      )}
      {previewMinute && (
        <div
          className={styles.modalBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePreview();
          }}
        >
          <section
            className={styles.previewModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="minutes-preview-heading"
          >
            <header className={styles.modalHeader}>
              <div className={styles.previewHeading}>
                <h2 id="minutes-preview-heading">{previewMinute.title}</h2>
                <p>{previewMinute.description}</p>
              </div>
              <div className={styles.previewActions}>
                {previewUrl && (
                  <div className={styles.fileActions}>
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Open document in new tab"
                      title="Open in new tab"
                    >
                      <ExternalLink size={16} />
                    </a>
                    <a
                      href={previewUrl}
                      download
                      aria-label="Download document"
                      title="Download"
                    >
                      <Download size={16} />
                    </a>
                  </div>
                )}
                <button
                  className={styles.modalCloseButton}
                  type="button"
                  onClick={closePreview}
                  aria-label="Close preview"
                >
                  <X size={18} />
                </button>
              </div>
            </header>
            {previewUrl && canEmbedPreview ? (
              <iframe
                className={styles.previewFrame}
                src={previewUrl}
                title={`Preview: ${previewMinute.title}`}
              />
            ) : (
              <div className={styles.documentFallback}>
                <FileText size={32} aria-hidden="true" />
                <p>{previewMinute.title}</p>
                <span>
                  {previewUrl
                    ? "Preview is not available for this file type."
                    : "The document preview link could not be created."}
                </span>
                {previewUrl && (
                  <a href={previewUrl} target="_blank" rel="noreferrer">
                    Open document <ExternalLink size={14} />
                  </a>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
