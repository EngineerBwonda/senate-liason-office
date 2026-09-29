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
import IncomingCorrespondenceUpload from "../../page/(component)/incoming-correspondence-upload";
import { createClient } from "../../supabase/client";
import styles from "./styles.module.css";

const STORAGE_BUCKET = "incoming-correspondence";
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
      .from("incoming_correspondence")
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
          console.error(
            "Could not create correspondence preview URL:",
            preview.error,
          );
        }
        if (download.error) {
          console.error(
            "Could not create correspondence download URL:",
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
        console.error(
          "Could not verify correspondence admin access:",
          adminError,
        );
      }
      setIsAdmin(Boolean(adminRow) && !adminError);

      channel = supabase
        .channel("incoming-correspondence-changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "incoming_correspondence" },
          () => {
            void loadMinutes();
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void loadMinutes();
            return;
          }

          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error(`Incoming correspondence realtime status: ${status}`);
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
      setNotice("Incoming correspondence uploaded successfully.");
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
      .from("incoming_correspondence")
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
          "Correspondence row deleted, but its file could not be removed:",
          storageError,
        );
      }
    }

    if (previewId === record.id) setPreviewId(null);
    setNotice(
      "Correspondence deleted." +
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
      .from("incoming_correspondence")
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
          "Updated correspondence, but the old file could not be removed:",
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
          <p className={styles.eyebrow}>Registry / Incoming Correspondence</p>
          <h1 className={styles.title}>Incoming correspondence</h1>
          <p className={styles.subtitle}>
            Receive, archive, and review correspondence and its attachments.
          </p>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.totalCount}>
            <FileText size={16} aria-hidden="true" />
            {minutes.length} {minutes.length === 1 ? "item" : "items"}
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
            Upload correspondence
          </button>
        </div>
      </header>

      <div className={styles.workspace}>
        <section
          className={styles.archive}
          aria-label="Incoming correspondence archive"
        >
          <div className={styles.archiveHeader}>
            <h2>Correspondence archive</h2>
            <label className={styles.searchBox}>
              <Search size={16} aria-hidden="true" />
              <span className={styles.visuallyHidden}>
                Search correspondence
              </span>
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
              Loading correspondence...
            </div>
          ) : errorMessage && minutes.length === 0 ? (
            <div className={styles.stateMessage} role="alert">
              {errorMessage}
            </div>
          ) : filteredMinutes.length === 0 ? (
            <div className={styles.emptyState}>
              <FileText size={28} aria-hidden="true" />
              <h3>
                {search
                  ? "No matching correspondence"
                  : "No correspondence yet"}
              </h3>
              <p>
                {search
                  ? "Try another ID, date, title, description, file path, uploader ID, or sender email."
                  : "Incoming correspondence uploaded to the archive will appear here."}
              </p>
            </div>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.recordTable}>
                <caption className={styles.visuallyHidden}>
                  Incoming correspondence records
                </caption>
                <thead>
                  <tr>
                    <th scope="col">ID</th>
                    <th scope="col">Created</th>
                    <th scope="col">Title</th>
                    <th scope="col">Description</th>
                    <th scope="col">Download</th>
                    <th scope="col">Sender email</th>
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
        Files are stored in the private incoming-correspondence storage bucket.
      </p>
      {uploadOpen && (
        <IncomingCorrespondenceUpload
          onClose={closeUpload}
          onUploaded={handleUploaded}
        />
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
            aria-labelledby="incoming-correspondence-preview-heading"
          >
            <header className={styles.modalHeader}>
              <div className={styles.previewHeading}>
                <h2 id="incoming-correspondence-preview-heading">
                  {previewMinute.title}
                </h2>
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

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////// "use client";

// import { useEffect, useMemo, useRef, useState } from "react";

// import { createClient } from "@supabase/supabase-js";
// import styles from "./styles.module.css";

// const supabase = createClient(
//   process.env.NEXT_PUBLIC_SUPABASE_URL!,
//   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
// );

// interface IncomingCorrespondence {
//   id: number;
//   created_at: string;
//   title: string;
//   description: string;
//   file_url: string;
//   user_id: string;
//   email: string;
// }

// const BUCKET = "incoming-correspondence";
// const TABLE = "incoming_correspondence";

// const UploadIcon = () => (
//   <svg
//     width="16"
//     height="16"
//     viewBox="0 0 24 24"
//     fill="none"
//     stroke="currentColor"
//     strokeWidth="2"
//   >
//     <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
//     <polyline points="17 8 12 3 7 8" />
//     <line x1="12" y1="3" x2="12" y2="15" />
//   </svg>
// );

// const FileIcon = () => (
//   <svg
//     width="16"
//     height="16"
//     viewBox="0 0 24 24"
//     fill="none"
//     stroke="currentColor"
//     strokeWidth="2"
//   >
//     <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
//     <polyline points="14 2 14 8 20 8" />
//   </svg>
// );

// const SearchIcon = () => (
//   <svg
//     width="14"
//     height="14"
//     viewBox="0 0 24 24"
//     fill="none"
//     stroke="currentColor"
//     strokeWidth="2"
//   >
//     <circle cx="11" cy="11" r="8" />
//     <line x1="21" y1="21" x2="16.65" y2="16.65" />
//   </svg>
// );

// const TrashIcon = () => (
//   <svg
//     width="13"
//     height="13"
//     viewBox="0 0 24 24"
//     fill="none"
//     stroke="currentColor"
//     strokeWidth="2"
//   >
//     <polyline points="3 6 5 6 21 6" />
//     <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
//     <path d="M10 11v6M14 11v6" />
//   </svg>
// );

// const PreviewIcon = () => (
//   <svg
//     width="14"
//     height="14"
//     viewBox="0 0 24 24"
//     fill="none"
//     stroke="currentColor"
//     strokeWidth="2"
//   >
//     <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
//     <circle cx="12" cy="12" r="3" />
//   </svg>
// );

// const CloseIcon = () => (
//   <svg
//     width="16"
//     height="16"
//     viewBox="0 0 24 24"
//     fill="none"
//     stroke="currentColor"
//     strokeWidth="2"
//   >
//     <line x1="18" y1="6" x2="6" y2="18" />
//     <line x1="6" y1="6" x2="18" y2="18" />
//   </svg>
// );

// export default function IncomingCorrespondencePage() {
//   const [records, setRecords] = useState<IncomingCorrespondence[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [submitting, setSubmitting] = useState(false);
//   const [deletingId, setDeletingId] = useState<number | null>(null);
//   const [query, setQuery] = useState("");
//   const [formError, setFormError] = useState<string | null>(null);
//   const [formSuccess, setFormSuccess] = useState<string | null>(null);
//   const [loadError, setLoadError] = useState<string | null>(null);
//   const [preview, setPreview] = useState<IncomingCorrespondence | null>(null);
//   const [previewLoading, setPreviewLoading] = useState(false);

//   const [title, setTitle] = useState("");
//   const [description, setDescription] = useState("");
//   const [email, setEmail] = useState("");
//   const [file, setFile] = useState<File | null>(null);

//   const fileInputRef = useRef<HTMLInputElement>(null);

//   useEffect(() => {
//     loadRecords();
//   }, []);

//   async function loadRecords() {
//     setLoading(true);
//     setLoadError(null);
//     const { data, error } = await supabase
//       .from(TABLE)
//       .select("*")
//       .order("created_at", { ascending: false });

//     if (error) {
//       setLoadError(error.message);
//     } else {
//       setRecords(data ?? []);
//     }
//     setLoading(false);
//   }

//   const filtered = useMemo(() => {
//     const q = query.trim().toLowerCase();
//     if (!q) return records;
//     return records.filter(
//       (r) =>
//         r.title.toLowerCase().includes(q) ||
//         r.description.toLowerCase().includes(q) ||
//         r.email.toLowerCase().includes(q),
//     );
//   }, [records, query]);

//   async function handleUpload(e: React.FormEvent) {
//     e.preventDefault();
//     setFormError(null);
//     setFormSuccess(null);

//     if (!file) {
//       setFormError("Please attach a file.");
//       return;
//     }

//     setSubmitting(true);
//     try {
//       const { data: userData, error: userError } =
//         await supabase.auth.getUser();
//       if (userError || !userData.user)
//         throw new Error("You must be signed in.");
//       const userId = userData.user.id;

//       const ext = file.name.split(".").pop() ?? "bin";
//       const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

//       const { error: uploadError } = await supabase.storage
//         .from(BUCKET)
//         .upload(path, file, { cacheControl: "3600", upsert: false });
//       if (uploadError) throw uploadError;

//       const { data: urlData } = supabase.storage
//         .from(BUCKET)
//         .getPublicUrl(path);

//       const { error: insertError } = await supabase.from(TABLE).insert({
//         title: title.trim(),
//         description: description.trim(),
//         email: email.trim(),
//         file_url: urlData.publicUrl,
//         user_id: userId,
//       });
//       if (insertError) throw insertError;

//       setTitle("");
//       setDescription("");
//       setEmail("");
//       setFile(null);
//       if (fileInputRef.current) fileInputRef.current.value = "";
//       setFormSuccess("Correspondence uploaded successfully.");
//       await loadRecords();
//     } catch (err: unknown) {
//       setFormError(err instanceof Error ? err.message : "Upload failed.");
//     } finally {
//       setSubmitting(false);
//     }
//   }

//   async function handleDelete(record: IncomingCorrespondence) {
//     setDeletingId(record.id);
//     try {
//       // Remove the file from storage (best effort)
//       const marker = `/object/public/${BUCKET}/`;
//       const idx = record.file_url.indexOf(marker);
//       if (idx !== -1) {
//         const storagePath = record.file_url.slice(idx + marker.length);
//         await supabase.storage.from(BUCKET).remove([storagePath]);
//       }

//       const { error } = await supabase.from(TABLE).delete().eq("id", record.id);
//       if (error) throw error;

//       setRecords((prev) => prev.filter((r) => r.id !== record.id));
//       if (preview?.id === record.id) setPreview(null);
//     } catch (err: unknown) {
//       setLoadError(err instanceof Error ? err.message : "Delete failed.");
//     } finally {
//       setDeletingId(null);
//     }
//   }

//   function openPreview(record: IncomingCorrespondence) {
//     setPreview(record);
//     setPreviewLoading(true);
//   }

//   const isPdf = preview?.file_url.toLowerCase().includes(".pdf");

//   return (
//     <div className={styles.page}>
//       <header className={styles.pageHeader}>
//         <div>
//           <p className={styles.eyebrow}>Registry</p>
//           <h1 className={styles.title}>Incoming Correspondence</h1>
//           <p className={styles.subtitle}>
//             Upload and manage incoming correspondence, attachments, and
//             references.
//           </p>
//         </div>
//         <div className={styles.headerActions}>
//           <span className={styles.totalCount}>{records.length} records</span>
//         </div>
//       </header>

//       <div className={styles.workspace}>
//         <div className={styles.sideColumn}>
//           <section className={styles.archive}>
//             <div className={styles.archiveHeader}>
//               <h2>Archive</h2>
//               <div className={styles.searchBox}>
//                 <SearchIcon />
//                 <label className={styles.visuallyHidden} htmlFor="search">
//                   Search correspondence
//                 </label>
//                 <input
//                   id="search"
//                   type="search"
//                   value={query}
//                   onChange={(e) => setQuery(e.target.value)}
//                   placeholder="Search title, description, or email"
//                 />
//               </div>
//             </div>

//             {loading ? (
//               <div className={styles.stateMessage}>
//                 <svg
//                   className={styles.spinner}
//                   width="16"
//                   height="16"
//                   viewBox="0 0 24 24"
//                   fill="none"
//                   stroke="currentColor"
//                   strokeWidth="2"
//                 >
//                   <path d="M21 12a9 9 0 1 1-6.219-8.56" />
//                 </svg>
//                 Loading records…
//               </div>
//             ) : loadError ? (
//               <div className={styles.stateMessage}>
//                 <p className={styles.errorMessage}>{loadError}</p>
//               </div>
//             ) : filtered.length === 0 ? (
//               <div className={styles.emptyState}>
//                 <h3>No correspondence found</h3>
//                 <p>Upload the first record using the form below.</p>
//               </div>
//             ) : (
//               <div className={styles.tableScroll}>
//                 <table className={styles.recordTable}>
//                   <thead>
//                     <tr>
//                       <th>ID</th>
//                       <th>Title</th>
//                       <th>Description</th>
//                       <th>Email</th>
//                       <th className={styles.dateCell}>Created</th>
//                       <th className={styles.downloadCell}>File</th>
//                       <th className={styles.previewCell}>Preview</th>
//                       <th className={styles.actionsCell}>Actions</th>
//                     </tr>
//                   </thead>
//                   <tbody>
//                     {filtered.map((record) => (
//                       <tr key={record.id}>
//                         <td>#{record.id}</td>
//                         <th scope="row">{record.title}</th>
//                         <td className={styles.descriptionCell}>
//                           {record.description}
//                         </td>
//                         <td>{record.email}</td>
//                         <td className={styles.dateCell}>
//                           {new Date(record.created_at).toLocaleString()}
//                         </td>
//                         <td className={styles.downloadCell}>
//                           <a
//                             href={record.file_url}
//                             target="_blank"
//                             rel="noopener noreferrer"
//                           >
//                             <FileIcon />
//                             Download
//                           </a>
//                         </td>
//                         <td className={styles.previewCell}>
//                           <button
//                             type="button"
//                             className={styles.previewButton}
//                             onClick={() => openPreview(record)}
//                           >
//                             <PreviewIcon />
//                             Preview
//                           </button>
//                         </td>
//                         <td className={styles.actionsCell}>
//                           <button
//                             type="button"
//                             className={`${styles.rowAction} ${styles.deleteAction}`}
//                             onClick={() => handleDelete(record)}
//                             disabled={deletingId === record.id}
//                           >
//                             {deletingId === record.id ? (
//                               <>
//                                 <svg
//                                   className={styles.spinner}
//                                   width="12"
//                                   height="12"
//                                   viewBox="0 0 24 24"
//                                   fill="none"
//                                   stroke="currentColor"
//                                   strokeWidth="2"
//                                 >
//                                   <path d="M21 12a9 9 0 1 1-6.219-8.56" />
//                                 </svg>
//                                 Deleting…
//                               </>
//                             ) : (
//                               <>
//                                 <TrashIcon />
//                                 Delete
//                               </>
//                             )}
//                           </button>
//                         </td>
//                       </tr>
//                     ))}
//                   </tbody>
//                 </table>
//               </div>
//             )}
//           </section>
//         </div>
//       </div>

//       <div className={styles.workspace}>
//         <section className={styles.uploadPanel}>
//           <div className={styles.sectionHeading}>
//             <span className={styles.sectionIcon}>
//               <UploadIcon />
//             </span>
//             <h2>Upload Correspondence</h2>
//           </div>

//           <form className={styles.uploadForm} onSubmit={handleUpload}>
//             <label className={styles.field}>
//               Title
//               <input
//                 type="text"
//                 value={title}
//                 onChange={(e) => setTitle(e.target.value)}
//                 required
//                 placeholder="Subject line"
//               />
//             </label>

//             <label className={styles.field}>
//               Description
//               <textarea
//                 value={description}
//                 onChange={(e) => setDescription(e.target.value)}
//                 required
//                 placeholder="Brief description of the correspondence"
//               />
//             </label>

//             <label className={styles.field}>
//               Email
//               <input
//                 type="email"
//                 value={email}
//                 onChange={(e) => setEmail(e.target.value)}
//                 required
//                 placeholder="sender@example.com"
//               />
//             </label>

//             <label className={styles.fileField}>
//               <span className={styles.filePickerCopy}>
//                 <UploadIcon />
//                 <span>{file ? file.name : "Choose a file to upload"}</span>
//               </span>
//               <span className={styles.fileHint}>
//                 Stored in the “{BUCKET}” bucket
//               </span>
//               <input
//                 ref={fileInputRef}
//                 type="file"
//                 onChange={(e) => setFile(e.target.files?.[0] ?? null)}
//                 required
//               />
//             </label>

//             {formError && <p className={styles.errorMessage}>{formError}</p>}
//             {formSuccess && (
//               <p className={styles.successMessage}>{formSuccess}</p>
//             )}

//             <button
//               type="submit"
//               className={styles.uploadButton}
//               disabled={submitting}
//             >
//               {submitting ? (
//                 <>
//                   <svg
//                     className={styles.spinner}
//                     width="14"
//                     height="14"
//                     viewBox="0 0 24 24"
//                     fill="none"
//                     stroke="currentColor"
//                     strokeWidth="2"
//                   >
//                     <path d="M21 12a9 9 0 1 1-6.219-8.56" />
//                   </svg>
//                   Uploading…
//                 </>
//               ) : (
//                 <>
//                   <UploadIcon />
//                   Upload
//                 </>
//               )}
//             </button>
//           </form>
//         </section>
//       </div>

//       {preview && (
//         <div className={styles.modalBackdrop} onClick={() => setPreview(null)}>
//           <div
//             className={styles.previewModal}
//             onClick={(e) => e.stopPropagation()}
//           >
//             <div className={styles.modalHeader}>
//               <div className={styles.previewHeading}>
//                 <h2>{preview.title}</h2>
//                 <p>{preview.description}</p>
//               </div>
//               <div className={styles.previewActions}>
//                 <a
//                   className={styles.previewButton}
//                   href={preview.file_url}
//                   target="_blank"
//                   rel="noopener noreferrer"
//                 >
//                   <FileIcon />
//                   Open
//                 </a>
//                 <button
//                   type="button"
//                   className={styles.modalCloseButton}
//                   onClick={() => setPreview(null)}
//                   aria-label="Close preview"
//                 >
//                   <CloseIcon />
//                 </button>
//               </div>
//             </div>

//             {isPdf ? (
//               <>
//                 {previewLoading && (
//                   <div className={styles.stateMessage}>
//                     <svg
//                       className={styles.spinner}
//                       width="16"
//                       height="16"
//                       viewBox="0 0 24 24"
//                       fill="none"
//                       stroke="currentColor"
//                       strokeWidth="2"
//                     >
//                       <path d="M21 12a9 9 0 1 1-6.219-8.56" />
//                     </svg>
//                     Loading preview…
//                   </div>
//                 )}
//                 <iframe
//                   src={preview.file_url}
//                   title={preview.title}
//                   className={styles.previewFrame}
//                   onLoad={() => setPreviewLoading(false)}
//                 />
//               </>
//             ) : (
//               <div className={styles.documentFallback}>
//                 <p>{preview.title}</p>
//                 <span>Preview not available for this file type.</span>
//                 <a
//                   href={preview.file_url}
//                   target="_blank"
//                   rel="noopener noreferrer"
//                 >
//                   <FileIcon />
//                   Download file
//                 </a>
//               </div>
//             )}
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }

// "use client";

// import { useCallback, useEffect, useMemo, useState } from "react";
// import { useRouter } from "next/navigation";
// import {
//   Download,
//   Eye,
//   ExternalLink,
//   FileText,
//   LoaderCircle,
//   RefreshCw,
//   Search,
//   Trash2,
//   Upload,
//   X,
// } from "lucide-react";
// import MinutesUpload from "../../page/(component)/minutes-upload";
// import { createClient } from "../../supabase/client";
// import styles from "./styles.module.css";

// const STORAGE_BUCKET = "incoming-correspondence";
// const MAX_FILE_SIZE = 20 * 1024 * 1024;
// const ACCEPTED_FILE_TYPES = [
//   "application/pdf",
//   "application/msword",
//   "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
//   "image/jpeg",
//   "image/png",
//   "image/webp",
// ];

// interface MinuteRecord {
//   id: number;
//   created_at: string;
//   title: string;
//   description: string;
//   file_url: string;
//   user_id: string;
//   email: string;
// }

// export default function Page() {
//   const router = useRouter();
//   const supabase = createClient();
//   const [minutes, setMinutes] = useState<MinuteRecord[]>([]);
//   const [currentUserId, setCurrentUserId] = useState<string | null>(null);
//   const [isAdmin, setIsAdmin] = useState(false);
//   const [previewUrls, setPreviewUrls] = useState<Record<number, string>>({});
//   const [downloadUrls, setDownloadUrls] = useState<Record<number, string>>({});
//   const [previewId, setPreviewId] = useState<number | null>(null);
//   const [search, setSearch] = useState("");
//   const [loading, setLoading] = useState(true);
//   const [uploadOpen, setUploadOpen] = useState(false);
//   const [errorMessage, setErrorMessage] = useState("");
//   const [notice, setNotice] = useState("");
//   const [mutatingId, setMutatingId] = useState<number | null>(null);

//   const loadMinutes = useCallback(async () => {
//     setLoading(true);
//     setErrorMessage("");

//     const { data, error } = await supabase
//       .from("minutes")
//       .select("id, created_at, title, description, file_url, user_id, email")
//       .order("created_at", { ascending: false });

//     if (error) {
//       setErrorMessage(error.message);
//       setLoading(false);
//       return;
//     }

//     const records = (data ?? []) as MinuteRecord[];
//     setMinutes(records);

//     const urls = await Promise.all(
//       records.map(async (record) => {
//         if (/^https?:\/\//i.test(record.file_url)) {
//           return {
//             id: record.id,
//             previewUrl: record.file_url,
//             downloadUrl: record.file_url,
//           };
//         }
//         const storage = supabase.storage.from(STORAGE_BUCKET);
//         const [preview, download] = await Promise.all([
//           storage.createSignedUrl(record.file_url, 60 * 60),
//           storage.createSignedUrl(record.file_url, 60 * 60, { download: true }),
//         ]);
//         if (preview.error) {
//           console.error("Could not create minutes preview URL:", preview.error);
//         }
//         if (download.error) {
//           console.error(
//             "Could not create minutes download URL:",
//             download.error,
//           );
//         }
//         return {
//           id: record.id,
//           previewUrl: preview.data?.signedUrl ?? "",
//           downloadUrl:
//             download.data?.signedUrl ?? preview.data?.signedUrl ?? "",
//         };
//       }),
//     );

//     setPreviewUrls(
//       Object.fromEntries(urls.map(({ id, previewUrl }) => [id, previewUrl])),
//     );
//     setDownloadUrls(
//       Object.fromEntries(urls.map(({ id, downloadUrl }) => [id, downloadUrl])),
//     );
//     setLoading(false);
//   }, [supabase]);

//   useEffect(() => {
//     let cancelled = false;

//     const initialize = async () => {
//       const {
//         data: { user },
//         error,
//       } = await supabase.auth.getUser();

//       if (cancelled) return;
//       if (!user) {
//         router.replace("/login");
//         return;
//       }
//       setCurrentUserId(user.id);
//       if (error) {
//         setErrorMessage(error.message);
//         setLoading(false);
//         return;
//       }

//       const { data: adminRow, error: adminError } = await supabase
//         .from("admins")
//         .select("user_id")
//         .eq("user_id", user.id)
//         .maybeSingle();

//       if (cancelled) return;
//       if (adminError) {
//         console.error("Could not verify minutes admin access:", adminError);
//       }
//       setIsAdmin(Boolean(adminRow) && !adminError);
//       await loadMinutes();
//     };

//     void initialize();
//     return () => {
//       cancelled = true;
//     };
//   }, [loadMinutes, router, supabase]);

//   const filteredMinutes = useMemo(() => {
//     const query = search.trim().toLocaleLowerCase();
//     if (!query) return minutes;
//     return minutes.filter((record) =>
//       `${record.id} ${record.created_at} ${record.title} ${record.description} ${record.file_url} ${record.user_id} ${record.email}`
//         .toLocaleLowerCase()
//         .includes(query),
//     );
//   }, [minutes, search]);

//   const previewMinute = minutes.find((record) => record.id === previewId);
//   const previewUrl = previewMinute ? previewUrls[previewMinute.id] : "";
//   const canEmbedPreview = previewMinute
//     ? /\.(pdf|jpe?g|png|webp)(?:$|\?)/i.test(previewMinute.file_url)
//     : false;

//   const closeUpload = useCallback(() => setUploadOpen(false), []);
//   const closePreview = useCallback(() => setPreviewId(null), []);
//   const handleUploaded = useCallback(
//     async (id: number) => {
//       setNotice("Minutes uploaded successfully.");
//       await loadMinutes();
//       setPreviewId(id);
//     },
//     [loadMinutes],
//   );

//   const handleDelete = async (record: MinuteRecord) => {
//     if (!isAdmin && record.user_id !== currentUserId) return;
//     if (!window.confirm(`Delete "${record.title}"? This cannot be undone.`)) {
//       return;
//     }

//     setMutatingId(record.id);
//     setErrorMessage("");
//     setNotice("");

//     const { data: deleted, error } = await supabase
//       .from("minutes")
//       .delete()
//       .eq("id", record.id)
//       .select("id")
//       .maybeSingle();

//     if (error || !deleted) {
//       setErrorMessage(
//         error?.message ?? "You are not allowed to delete this file.",
//       );
//       setMutatingId(null);
//       return;
//     }

//     if (!/^https?:\/\//i.test(record.file_url)) {
//       const { error: storageError } = await supabase.storage
//         .from(STORAGE_BUCKET)
//         .remove([record.file_url]);
//       if (storageError) {
//         console.error(
//           "Minute row deleted, but its file could not be removed:",
//           storageError,
//         );
//       }
//     }

//     if (previewId === record.id) setPreviewId(null);
//     setNotice(
//       "Minute deleted." +
//         (!/^https?:\/\//i.test(record.file_url)
//           ? ""
//           : " The external file was not removed."),
//     );
//     await loadMinutes();
//     setMutatingId(null);
//   };

//   const handleReplace = async (
//     record: MinuteRecord,
//     file: File | undefined,
//   ) => {
//     if (!file || record.user_id !== currentUserId) return;
//     setErrorMessage("");
//     setNotice("");

//     if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
//       setErrorMessage(
//         "Upload a PDF, Word document, or JPG, PNG, or WebP image.",
//       );
//       return;
//     }
//     if (file.size > MAX_FILE_SIZE) {
//       setErrorMessage("Files must be 20 MB or smaller.");
//       return;
//     }

//     setMutatingId(record.id);
//     const safeFileName = file.name
//       .normalize("NFKD")
//       .replace(/[^a-zA-Z0-9._-]+/g, "-");
//     const newObjectPath = `${currentUserId}/${crypto.randomUUID()}-${safeFileName}`;

//     const { error: uploadError } = await supabase.storage
//       .from(STORAGE_BUCKET)
//       .upload(newObjectPath, file, { contentType: file.type, upsert: false });

//     if (uploadError) {
//       setErrorMessage(uploadError.message);
//       setMutatingId(null);
//       return;
//     }

//     const { data: updated, error: updateError } = await supabase
//       .from("minutes")
//       .update({ file_url: newObjectPath })
//       .eq("id", record.id)
//       .eq("user_id", currentUserId)
//       .select("id")
//       .maybeSingle();

//     if (updateError || !updated) {
//       await supabase.storage.from(STORAGE_BUCKET).remove([newObjectPath]);
//       setErrorMessage(
//         updateError?.message ?? "Only the uploader can replace this file.",
//       );
//       setMutatingId(null);
//       return;
//     }

//     if (!/^https?:\/\//i.test(record.file_url)) {
//       const { error: removeError } = await supabase.storage
//         .from(STORAGE_BUCKET)
//         .remove([record.file_url]);
//       if (removeError) {
//         console.error(
//           "Updated minute, but the old file could not be removed:",
//           removeError,
//         );
//       }
//     }

//     setNotice("File replaced successfully.");
//     await loadMinutes();
//     setMutatingId(null);
//   };

//   useEffect(() => {
//     if (previewId === null) return;
//     const handleKeyDown = (event: KeyboardEvent) => {
//       if (event.key === "Escape") closePreview();
//     };
//     document.addEventListener("keydown", handleKeyDown);
//     return () => document.removeEventListener("keydown", handleKeyDown);
//   }, [closePreview, previewId]);

//   return (
//     <div className={styles.page}>
//       <header className={styles.pageHeader}>
//         <div>
//           <p className={styles.eyebrow}>Records / Minutes</p>
//           <h1 className={styles.title}>Minutes archive</h1>
//           <p className={styles.subtitle}>
//             Upload meeting records and review documents shared with your office.
//           </p>
//         </div>
//         <div className={styles.headerActions}>
//           <span className={styles.totalCount}>
//             <FileText size={16} aria-hidden="true" />
//             {minutes.length} {minutes.length === 1 ? "record" : "records"}
//           </span>
//           <button
//             className={styles.uploadButton}
//             type="button"
//             onClick={() => {
//               setNotice("");
//               setUploadOpen(true);
//             }}
//           >
//             <Upload size={17} aria-hidden="true" />
//             Upload minutes
//           </button>
//         </div>
//       </header>

//       <div className={styles.workspace}>
//         <section className={styles.archive} aria-label="Minutes archive">
//           <div className={styles.archiveHeader}>
//             <h2>Minutes table</h2>
//             <label className={styles.searchBox}>
//               <Search size={16} aria-hidden="true" />
//               <span className={styles.visuallyHidden}>Search minutes</span>
//               <input
//                 type="search"
//                 value={search}
//                 onChange={(event) => setSearch(event.target.value)}
//                 placeholder="Search records"
//               />
//             </label>
//           </div>

//           {loading ? (
//             <div className={styles.stateMessage}>
//               <LoaderCircle className={styles.spinner} size={20} />
//               Loading minutes...
//             </div>
//           ) : errorMessage && minutes.length === 0 ? (
//             <div className={styles.stateMessage} role="alert">
//               {errorMessage}
//             </div>
//           ) : filteredMinutes.length === 0 ? (
//             <div className={styles.emptyState}>
//               <FileText size={28} aria-hidden="true" />
//               <h3>{search ? "No matching records" : "No minutes yet"}</h3>
//               <p>
//                 {search
//                   ? "Try another ID, date, title, description, file path, user ID, or email."
//                   : "Uploaded minutes will appear here for you to review."}
//               </p>
//             </div>
//           ) : (
//             <div className={styles.tableScroll}>
//               <table className={styles.recordTable}>
//                 <caption className={styles.visuallyHidden}>
//                   Minutes records with their full database fields
//                 </caption>
//                 <thead>
//                   <tr>
//                     <th scope="col">ID</th>
//                     <th scope="col">Created</th>
//                     <th scope="col">Title</th>
//                     <th scope="col">Description</th>
//                     <th scope="col">Download</th>
//                     <th scope="col">Email</th>
//                     <th scope="col">Preview</th>
//                     <th scope="col">Actions</th>
//                   </tr>
//                 </thead>
//                 <tbody>
//                   {filteredMinutes.map((record) => (
//                     <tr
//                       key={record.id}
//                       className={
//                         record.id === previewId
//                           ? styles.selectedTableRow
//                           : undefined
//                       }
//                     >
//                       <td>{record.id}</td>
//                       <td className={styles.dateCell}>
//                         <time dateTime={record.created_at}>
//                           {new Date(record.created_at).toLocaleString()}
//                         </time>
//                       </td>
//                       <th scope="row" className={styles.titleCell}>
//                         {record.title}
//                       </th>
//                       <td className={styles.descriptionCell}>
//                         {record.description}
//                       </td>
//                       <td className={styles.downloadCell}>
//                         <a
//                           href={downloadUrls[record.id] || undefined}
//                           download
//                           aria-label={`Download ${record.title}`}
//                           title={`Download ${record.title}`}
//                         >
//                           <Download size={15} aria-hidden="true" />
//                           Download
//                         </a>
//                       </td>
//                       <td>{record.email}</td>
//                       <td className={styles.previewCell}>
//                         <button
//                           className={styles.previewButton}
//                           type="button"
//                           onClick={() => setPreviewId(record.id)}
//                           disabled={!previewUrls[record.id]}
//                           aria-label={`Preview ${record.title}`}
//                         >
//                           <Eye size={15} aria-hidden="true" />
//                           Preview
//                         </button>
//                       </td>
//                       <td className={styles.actionsCell}>
//                         {record.user_id === currentUserId && (
//                           <label className={styles.rowAction}>
//                             <RefreshCw size={14} aria-hidden="true" />
//                             Replace
//                             <input
//                               type="file"
//                               accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
//                               disabled={mutatingId === record.id}
//                               onChange={(event) => {
//                                 void handleReplace(
//                                   record,
//                                   event.target.files?.[0],
//                                 );
//                                 event.currentTarget.value = "";
//                               }}
//                               aria-label={`Replace ${record.title}`}
//                             />
//                           </label>
//                         )}
//                         {(isAdmin || record.user_id === currentUserId) && (
//                           <button
//                             className={`${styles.rowAction} ${styles.deleteAction}`}
//                             type="button"
//                             disabled={mutatingId === record.id}
//                             onClick={() => void handleDelete(record)}
//                             aria-label={`Delete ${record.title}`}
//                           >
//                             {mutatingId === record.id ? (
//                               <LoaderCircle
//                                 className={styles.spinner}
//                                 size={14}
//                               />
//                             ) : (
//                               <Trash2 size={14} aria-hidden="true" />
//                             )}
//                             Delete
//                           </button>
//                         )}
//                       </td>
//                     </tr>
//                   ))}
//                 </tbody>
//               </table>
//             </div>
//           )}
//         </section>
//       </div>

//       {errorMessage && minutes.length > 0 && (
//         <p className={styles.inlineError} role="alert">
//           {errorMessage}
//         </p>
//       )}
//       {notice && (
//         <p className={styles.successMessage} role="status">
//           {notice}
//         </p>
//       )}
//       <p className={styles.storageNote}>
//         Files are stored in a private Supabase Storage bucket named minutes.
//       </p>
//       {uploadOpen && (
//         <MinutesUpload onClose={closeUpload} onUploaded={handleUploaded} />
//       )}
//       {previewMinute && (
//         <div
//           className={styles.modalBackdrop}
//           onMouseDown={(event) => {
//             if (event.target === event.currentTarget) closePreview();
//           }}
//         >
//           <section
//             className={styles.previewModal}
//             role="dialog"
//             aria-modal="true"
//             aria-labelledby="minutes-preview-heading"
//           >
//             <header className={styles.modalHeader}>
//               <div className={styles.previewHeading}>
//                 <h2 id="minutes-preview-heading">{previewMinute.title}</h2>
//                 <p>{previewMinute.description}</p>
//               </div>
//               <div className={styles.previewActions}>
//                 {previewUrl && (
//                   <div className={styles.fileActions}>
//                     <a
//                       href={previewUrl}
//                       target="_blank"
//                       rel="noreferrer"
//                       aria-label="Open document in new tab"
//                       title="Open in new tab"
//                     >
//                       <ExternalLink size={16} />
//                     </a>
//                     <a
//                       href={previewUrl}
//                       download
//                       aria-label="Download document"
//                       title="Download"
//                     >
//                       <Download size={16} />
//                     </a>
//                   </div>
//                 )}
//                 <button
//                   className={styles.modalCloseButton}
//                   type="button"
//                   onClick={closePreview}
//                   aria-label="Close preview"
//                 >
//                   <X size={18} />
//                 </button>
//               </div>
//             </header>
//             {previewUrl && canEmbedPreview ? (
//               <iframe
//                 className={styles.previewFrame}
//                 src={previewUrl}
//                 title={`Preview: ${previewMinute.title}`}
//               />
//             ) : (
//               <div className={styles.documentFallback}>
//                 <FileText size={32} aria-hidden="true" />
//                 <p>{previewMinute.title}</p>
//                 <span>
//                   {previewUrl
//                     ? "Preview is not available for this file type."
//                     : "The document preview link could not be created."}
//                 </span>
//                 {previewUrl && (
//                   <a href={previewUrl} target="_blank" rel="noreferrer">
//                     Open document <ExternalLink size={14} />
//                   </a>
//                 )}
//               </div>
//             )}
//           </section>
//         </div>
//       )}
//     </div>
//   );
// }
