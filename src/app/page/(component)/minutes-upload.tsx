"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { FileText, LoaderCircle, Upload, X } from "lucide-react";
import { createClient } from "../../supabase/client";
import styles from "../../pageb/minutes/styles.module.css";

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

interface MinutesUploadProps {
  onClose: () => void;
  onUploaded: (id: number) => Promise<void>;
}

export default function MinutesUpload({
  onClose,
  onUploaded,
}: MinutesUploadProps) {
  const supabase = createClient();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !uploading) onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, uploading]);

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setErrorMessage("");

    if (!file) {
      setErrorMessage("Choose a file to upload.");
      return;
    }
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

    setUploading(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error(authError?.message ?? "Sign in to upload minutes.");
      }
      if (!user.email) {
        throw new Error(
          "Your account needs an email address to upload minutes.",
        );
      }

      const safeFileName = file.name
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9._-]+/g, "-");
      const objectPath = `${user.id}/${crypto.randomUUID()}-${safeFileName}`;
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(objectPath, file, { contentType: file.type, upsert: false });

      if (uploadError) throw new Error(uploadError.message);

      const { data: inserted, error: insertError } = await supabase
        .from("minutes")
        .insert({
          title: title.trim(),
          description: description.trim(),
          file_url: objectPath,
          user_id: user.id,
          email: user.email,
        })
        .select("id")
        .single();

      if (insertError) {
        await supabase.storage.from(STORAGE_BUCKET).remove([objectPath]);
        throw new Error(insertError.message);
      }

      form.reset();
      await onUploaded(inserted.id);
      onClose();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The file could not be uploaded.",
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className={styles.modalBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !uploading) onClose();
      }}
    >
      <section
        className={styles.uploadModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="minutes-upload-heading"
      >
        <header className={styles.modalHeader}>
          <div className={styles.sectionHeading}>
            <span className={styles.sectionIcon} aria-hidden="true">
              <FileText size={17} />
            </span>
            <div>
              <h2 id="minutes-upload-heading">Upload minutes</h2>
              <p>Add a document to the minutes archive.</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            className={styles.modalCloseButton}
            type="button"
            onClick={onClose}
            disabled={uploading}
            aria-label="Close upload dialog"
          >
            <X size={18} />
          </button>
        </header>

        <form className={styles.uploadForm} onSubmit={handleUpload}>
          <label className={styles.field}>
            <span>Title</span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Senate sitting, 24 September"
              maxLength={160}
              required
            />
          </label>
          <label className={styles.field}>
            <span>Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Add a brief summary of this record"
              rows={3}
              required
            />
          </label>
          <label className={styles.fileField}>
            <span className={styles.filePickerCopy}>
              <Upload size={17} aria-hidden="true" />
              <span>{file?.name ?? "Choose a document"}</span>
            </span>
            <span className={styles.fileHint}>
              PDF, DOC, DOCX, JPG, PNG or WebP · max 20 MB
            </span>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              required
            />
          </label>

          {errorMessage && (
            <p className={styles.errorMessage} role="alert">
              {errorMessage}
            </p>
          )}

          <footer className={styles.modalActions}>
            <button
              className={styles.cancelButton}
              type="button"
              onClick={onClose}
              disabled={uploading}
            >
              Cancel
            </button>
            <button
              className={styles.uploadButton}
              type="submit"
              disabled={uploading}
            >
              {uploading ? (
                <LoaderCircle className={styles.spinner} size={17} />
              ) : (
                <Upload size={17} />
              )}
              {uploading ? "Uploading..." : "Upload record"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
