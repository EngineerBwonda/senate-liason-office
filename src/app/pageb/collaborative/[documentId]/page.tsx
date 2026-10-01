"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { HocuspocusProvider, WebSocketStatus } from "@hocuspocus/provider";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  ArrowLeft,
  Bold,
  Check,
  ChevronDown,
  Code,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  LoaderCircle,
  MessageCircle,
  Printer,
  Quote,
  Redo2,
  RotateCcw,
  Share2,
  Send,
  Underline as UnderlineIcon,
  UsersRound,
} from "lucide-react";
import * as Y from "yjs";
import { createClient } from "../../../supabase/client";
import styles from "./styles.module.css";

type Permission = "owner" | "editor" | "commenter" | "viewer";
type DocumentStatus = "draft" | "in_review" | "approved" | "archived";

interface CollaborativeDocument {
  id: string;
  title: string;
  document_type: string;
  created_by: string;
  source_type: "memo" | "minutes" | null;
  source_id: number | null;
  status: DocumentStatus;
  updated_at: string;
}

interface Member {
  user_id: string;
  full_name: string;
  position: string | null;
  permission: Permission;
}

interface Collaborator {
  clientId: number;
  name: string;
  color: string;
}

interface Version {
  id: string;
  version_number: number;
  name: string;
  created_by: string;
  created_at: string;
}

interface DocumentComment {
  id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

interface StaffMember {
  id: string;
  full_name: string | null;
  position: string | null;
}

const PERMISSIONS: { value: Permission; label: string }[] = [
  { value: "editor", label: "Editor" },
  { value: "commenter", label: "Commenter" },
  { value: "viewer", label: "Viewer" },
];

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return window.btoa(binary);
}

function userColor(userId: string) {
  const palette = ["#3b82c4", "#38a878", "#ca7d46", "#c45c63", "#7483c4"];
  const hash = [...userId].reduce((total, character) => total + character.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

export default function CollaborativeEditorPage() {
  const params = useParams<{ documentId: string }>();
  const documentId = params.documentId;
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const ydoc = useMemo(() => new Y.Doc({ guid: documentId }), [documentId]);
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const [document, setDocument] = useState<CollaborativeDocument | null>(null);
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("Staff member");
  const [permission, setPermission] = useState<Permission | null>(null);
  const [title, setTitle] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<WebSocketStatus>(
    WebSocketStatus.Connecting,
  );
  const [synced, setSynced] = useState(false);
  const [unsyncedChanges, setUnsyncedChanges] = useState(0);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [comments, setComments] = useState<DocumentComment[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffSearch, setStaffSearch] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [selectedPermission, setSelectedPermission] =
    useState<Permission>("editor");
  const [versionName, setVersionName] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);
  const [error, setError] = useState("");
  const canEdit =
    (permission === "owner" || permission === "editor") &&
    (document?.status === "draft" || document?.status === "in_review");
  const canManageSharing = permission === "owner";
  const canComment =
    (canEdit || permission === "commenter") &&
    (document?.status === "draft" || document?.status === "in_review");

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        Collaboration.configure({ document: ydoc }),
        ...(provider
          ? [
              CollaborationCaret.configure({
                provider,
                user: { name: userName, color: userColor(userId) },
              }),
            ]
          : []),
      ],
      editable: canEdit,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: styles.editorContent,
          "aria-label": "Collaborative document editor",
        },
      },
    },
    [documentId, provider, canEdit],
  );

  const refreshMembers = useCallback(async () => {
    const response = await fetch(
      `/api/collaborative-documents/${documentId}/members`,
      { cache: "no-store" },
    );
    const result = (await response.json()) as {
      members?: Member[];
      error?: string;
    };
    if (!response.ok) throw new Error(result.error ?? "Could not load members.");
    setMembers(result.members ?? []);
  }, [documentId]);

  const refreshVersions = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from("collaborative_document_versions")
      .select("id, version_number, name, created_by, created_at")
      .eq("document_id", documentId)
      .order("version_number", { ascending: false });
    if (queryError) throw queryError;
    setVersions((data ?? []) as Version[]);
  }, [documentId, supabase]);

  const refreshComments = useCallback(async () => {
    const { data, error: queryError } = await supabase.rpc(
      "list_collaborative_document_comments",
      { target_document_id: documentId },
    );
    if (queryError) throw queryError;
    setComments((data ?? []) as DocumentComment[]);
  }, [documentId, supabase]);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (authError || !user) {
        router.replace("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profilec")
        .select("full_name, is_approved")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (profileError || !profile?.is_approved) {
        router.replace("/pending");
        return;
      }

      const response = await fetch(`/api/collaborative-documents/${documentId}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as {
        document?: CollaborativeDocument;
        error?: string;
      };
      if (cancelled) return;
      if (!response.ok || !result.document) {
        setError(result.error ?? "You do not have access to this document.");
        setLoading(false);
        return;
      }

      setUserId(user.id);
      setUserName(profile.full_name?.trim() || "Staff member");
      setDocument(result.document);
      setTitle(result.document.title);
      setPermission(
        result.document.created_by === user.id
          ? "owner"
          : (result.document as CollaborativeDocument & {
              current_permission?: Permission;
            }).current_permission ?? null,
      );

      const { data: ownMembership } = await supabase
        .from("collaborative_document_members")
        .select("permission")
        .eq("document_id", documentId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (result.document.created_by !== user.id) {
        setPermission((ownMembership?.permission as Permission | undefined) ?? null);
      }

      setLoading(false);
    };

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [documentId, router, supabase]);

  useEffect(() => {
    if (!userId || !document || providerRef.current) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      const websocketUrl = process.env.NEXT_PUBLIC_COLLABORATION_URL;
      if (!websocketUrl) {
        setError("The collaboration server URL is not configured.");
        return;
      }

      const nextProvider = new HocuspocusProvider({
        url: websocketUrl,
        name: documentId,
        document: ydoc,
        token: async () => {
          const { data } = await supabase.auth.getSession();
          return data.session?.access_token ?? "";
        },
        onStatus: ({ status }) => setConnectionStatus(status),
        onSynced: ({ state }) => setSynced(state),
        onUnsyncedChanges: ({ number }) => setUnsyncedChanges(number),
        onAuthenticationFailed: ({ reason }) => setError(reason),
        onAwarenessUpdate: ({ states }) => {
          const activeUsers = states.flatMap((state) => {
            const awarenessUser = state.user as
              | { name?: string; color?: string }
              | undefined;
            if (!awarenessUser?.name) return [];
            return [
              {
                clientId: state.clientId,
                name: awarenessUser.name,
                color: awarenessUser.color ?? "#3b82c4",
              },
            ];
          });
          setCollaborators(activeUsers);
        },
      });

      if (cancelled) {
        nextProvider.destroy();
        return;
      }
      nextProvider.setAwarenessField("user", {
        name: userName,
        color: userColor(userId),
      });
      providerRef.current = nextProvider;
      setProvider(nextProvider);
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      providerRef.current?.destroy();
      providerRef.current = null;
      ydoc.destroy();
    };
  }, [document, documentId, supabase, userId, userName, ydoc]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(Boolean(canEdit));
  }, [canEdit, editor]);

  useEffect(() => {
    if (!shareOpen) return;
    let cancelled = false;
    const loadShareData = async () => {
      try {
        const { data, error: staffError } = await supabase
          .from("chat_staff_directory")
          .select("id, full_name, position")
          .order("full_name", { ascending: true });
        if (staffError) throw staffError;
        await refreshMembers();
        if (!cancelled) setStaff((data ?? []) as StaffMember[]);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load sharing information.",
          );
        }
      }
    };
    void loadShareData();
    return () => {
      cancelled = true;
    };
  }, [refreshMembers, shareOpen, supabase]);

  useEffect(() => {
    if (!versionOpen) return;
    const timer = window.setTimeout(() => {
      void refreshVersions().catch((loadError: unknown) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load version history.",
        );
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshVersions, versionOpen]);

  useEffect(() => {
    if (!commentsOpen) return;
    const timer = window.setTimeout(() => {
      void refreshComments().catch((loadError: unknown) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load comments.",
        );
      });
    }, 0);
    const channel = supabase
      .channel(`collaborative-comments-${documentId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "collaborative_document_comments",
          filter: `document_id=eq.${documentId}`,
        },
        () => void refreshComments(),
      )
      .subscribe();

    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [commentsOpen, documentId, refreshComments, supabase]);

  const matchingStaff = staff.filter((member) =>
    `${member.full_name ?? ""} ${member.position ?? ""}`
      .toLocaleLowerCase()
      .includes(staffSearch.trim().toLocaleLowerCase()),
  );

  const shareMember = async () => {
    if (!selectedStaffId) return;
    const response = await fetch(
      `/api/collaborative-documents/${documentId}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedStaffId,
          permission: selectedPermission,
        }),
      },
    );
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "Could not share this document.");
      return;
    }
    setSelectedStaffId("");
    await refreshMembers();
  };

  const updateMemberPermission = async (
    memberId: string,
    nextPermission: Permission,
  ) => {
    const response = await fetch(
      `/api/collaborative-documents/${documentId}/members`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: memberId, permission: nextPermission }),
      },
    );
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "Could not update this permission.");
      return;
    }
    await refreshMembers();
  };

  const removeMember = async (memberId: string) => {
    const response = await fetch(
      `/api/collaborative-documents/${documentId}/members`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: memberId }),
      },
    );
    const result = response.status === 204
      ? {}
      : ((await response.json()) as { error?: string });
    if (!response.ok) {
      setError(result.error ?? "Could not remove this member.");
      return;
    }
    await refreshMembers();
  };

  const saveVersion = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor || !provider || !versionName.trim()) return;

    setSavingVersion(true);
    setError("");
    provider.flushPendingUpdates();
    const state = bytesToBase64(Y.encodeStateAsUpdate(ydoc));
    const { error: versionError } = await supabase.rpc(
      "create_collaborative_document_version",
      {
        target_document_id: documentId,
        version_name: versionName.trim(),
        snapshot_base64: state,
        content_json: editor.getJSON(),
      },
    );
    if (versionError) {
      setError(versionError.message);
    } else {
      setVersionName("");
      await refreshVersions();
    }
    setSavingVersion(false);
  };

  const restoreVersion = async (versionId: string) => {
    if (!editor || !window.confirm("Restore this version into the live document?")) {
      return;
    }
    const { data, error: restoreError } = await supabase.rpc(
      "restore_collaborative_document_version",
      {
        target_document_id: documentId,
        target_version_id: versionId,
      },
    );
    if (restoreError) {
      setError(restoreError.message);
      return;
    }
    editor.commands.setContent(data as Parameters<typeof editor.commands.setContent>[0]);
  };

  const postComment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = commentDraft.trim();
    if (!body || !canComment || postingComment) return;

    setPostingComment(true);
    const { error: commentError } = await supabase
      .from("collaborative_document_comments")
      .insert({ document_id: documentId, author_id: userId, body });
    if (commentError) {
      setError(commentError.message);
    } else {
      setCommentDraft("");
      await refreshComments();
    }
    setPostingComment(false);
  };

  const changeStatus = async (nextStatus: DocumentStatus) => {
    if (!document || permission !== "owner") return;
    const { data, error: updateError } = await supabase
      .from("collaborative_documents")
      .update({ status: nextStatus })
      .eq("id", documentId)
      .select("id, title, document_type, created_by, source_type, source_id, status, updated_at")
      .single();
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDocument(data as CollaborativeDocument);
    if (nextStatus === "in_review" || nextStatus === "approved" || nextStatus === "archived") {
      const eventType = nextStatus === "in_review" ? "submitted" : nextStatus;
      await supabase.from("collaborative_document_activity").insert({
        document_id: documentId,
        actor_id: userId,
        event_type: eventType,
      });
    }
  };

  const renameDocument = async () => {
    if (!document || permission !== "owner" || !title.trim()) return;
    const { data, error: updateError } = await supabase
      .from("collaborative_documents")
      .update({ title: title.trim() })
      .eq("id", documentId)
      .select("id, title, document_type, created_by, source_type, source_id, status, updated_at")
      .single();
    if (updateError) setError(updateError.message);
    else setDocument(data as CollaborativeDocument);
  };

  const statusText =
    connectionStatus === WebSocketStatus.Connected
      ? unsyncedChanges > 0
        ? "Syncing changes..."
        : synced
          ? "All changes synced"
          : "Connecting document..."
      : connectionStatus === WebSocketStatus.Connecting
        ? "Connecting..."
        : "Reconnecting...";

  if (loading) {
    return (
      <main className={styles.loadingState}>
        <LoaderCircle className={styles.spinner} size={24} />
        Loading collaborative document...
      </main>
    );
  }

  if (!document) {
    return (
      <main className={styles.page}>
        <Link className={styles.backLink} href="/pageb/collaborative">
          <ArrowLeft size={16} aria-hidden="true" />
          Collaborative drafts
        </Link>
        <p className={styles.error} role="alert">
          {error || "This document is unavailable."}
        </p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <Link className={styles.backLink} href="/pageb/collaborative">
            <ArrowLeft size={16} aria-hidden="true" />
            Drafts
          </Link>
          <label className={styles.titleField}>
            <span className={styles.visuallyHidden}>Document title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => void renameDocument()}
              disabled={permission !== "owner"}
              maxLength={180}
            />
          </label>
          <span className={styles.documentMeta}>
            {document.document_type} · {document.status.replace("_", " ")}
            {document.source_type && document.source_id
              ? ` · Source ${document.source_type} #${document.source_id}`
              : " · Collaborative draft"}
          </span>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.connectionStatus} data-status={connectionStatus}>
            <span className={styles.statusDot} aria-hidden="true" />
            {statusText}
          </div>
          <div className={styles.presence} aria-label={`${collaborators.length} collaborators online`}>
            {collaborators.slice(0, 4).map((collaborator) => (
              <span
                className={styles.presenceAvatar}
                key={collaborator.clientId}
                style={{ backgroundColor: collaborator.color }}
                title={collaborator.name}
              >
                {collaborator.name
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")
                  .toUpperCase()}
              </span>
            ))}
            <span className={styles.presenceCount}>
              <UsersRound size={15} aria-hidden="true" />
              {collaborators.length}
            </span>
          </div>
          {canManageSharing && (
            <button
              className={styles.actionButton}
              type="button"
              onClick={() => setShareOpen((open) => !open)}
              aria-expanded={shareOpen}
            >
              <Share2 size={16} aria-hidden="true" />
              Share
            </button>
          )}
          <button
            className={styles.actionButton}
            type="button"
            onClick={() => setCommentsOpen((open) => !open)}
            aria-expanded={commentsOpen}
          >
            <MessageCircle size={16} aria-hidden="true" />
            Comments
          </button>
          <button
            className={styles.iconButton}
            type="button"
            onClick={() => window.print()}
            aria-label="Print or save as PDF"
            title="Print or save as PDF"
          >
            <Printer size={17} aria-hidden="true" />
          </button>
        </div>
      </header>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {shareOpen && canManageSharing && (
        <section className={styles.sharePanel} aria-label="Document sharing">
          <header className={styles.panelHeader}>
            <h2>Share with approved staff</h2>
            <button
              className={styles.iconButton}
              type="button"
              onClick={() => setShareOpen(false)}
              aria-label="Close sharing panel"
            >
              <ChevronDown size={17} aria-hidden="true" />
            </button>
          </header>
          <div className={styles.shareForm}>
            <input
              type="search"
              value={staffSearch}
              onChange={(event) => setStaffSearch(event.target.value)}
              placeholder="Find approved staff"
              aria-label="Search approved staff"
            />
            <select
              value={selectedStaffId}
              onChange={(event) => setSelectedStaffId(event.target.value)}
              aria-label="Choose staff member"
            >
              <option value="">Select staff member</option>
              {matchingStaff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name || "Staff member"}
                  {member.position ? ` · ${member.position}` : ""}
                </option>
              ))}
            </select>
            <select
              value={selectedPermission}
              onChange={(event) =>
                setSelectedPermission(event.target.value as Permission)
              }
              aria-label="Permission"
            >
              {PERMISSIONS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
            <button
              className={styles.actionButton}
              type="button"
              onClick={() => void shareMember()}
              disabled={!selectedStaffId}
            >
              Add
            </button>
          </div>
          <ul className={styles.memberList}>
            {members.map((member) => (
              <li key={member.user_id}>
                <span className={styles.memberIdentity}>
                  <strong>{member.full_name}</strong>
                  <small>{member.position || member.permission}</small>
                </span>
                {member.permission === "owner" ? (
                  <span className={styles.ownerLabel}>Owner</span>
                ) : (
                  <>
                    <select
                      value={member.permission}
                      onChange={(event) =>
                        void updateMemberPermission(
                          member.user_id,
                          event.target.value as Permission,
                        )
                      }
                      aria-label={`Permission for ${member.full_name}`}
                    >
                      {PERMISSIONS.map((entry) => (
                        <option key={entry.value} value={entry.value}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                    <button
                      className={styles.removeButton}
                      type="button"
                      onClick={() => void removeMember(member.user_id)}
                      aria-label={`Remove ${member.full_name}`}
                    >
                      Remove
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {commentsOpen && (
        <section className={styles.commentsPanel} aria-label="Document comments">
          <header className={styles.panelHeader}>
            <h2>Comments</h2>
            <span>{comments.length}</span>
          </header>
          {comments.length === 0 ? (
            <p className={styles.panelEmpty}>No comments yet.</p>
          ) : (
            <ul className={styles.commentList}>
              {comments.map((comment) => (
                <li key={comment.id}>
                  <div className={styles.commentHeading}>
                    <strong>
                      {comment.author_id === userId ? "You" : comment.author_name}
                    </strong>
                    <time dateTime={comment.created_at}>
                      {new Date(comment.created_at).toLocaleString()}
                    </time>
                  </div>
                  <p>{comment.body}</p>
                </li>
              ))}
            </ul>
          )}
          {canComment ? (
            <form className={styles.commentForm} onSubmit={postComment}>
              <textarea
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                maxLength={4000}
                rows={2}
                placeholder="Write a comment"
                aria-label="Write a comment"
                required
              />
              <button
                className={styles.iconButton}
                type="submit"
                disabled={!commentDraft.trim() || postingComment}
                aria-label="Post comment"
                title="Post comment"
              >
                {postingComment ? (
                  <LoaderCircle className={styles.spinner} size={16} />
                ) : (
                  <Send size={16} aria-hidden="true" />
                )}
              </button>
            </form>
          ) : (
            <p className={styles.panelEmpty}>Comments are read-only for your access level.</p>
          )}
        </section>
      )}

      <section className={styles.toolbar} aria-label="Formatting toolbar">
        <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} disabled={!canEdit || !editor} aria-label="Bold" title="Bold" aria-pressed={editor?.isActive("bold")}>
          <Bold size={16} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} disabled={!canEdit || !editor} aria-label="Italic" title="Italic" aria-pressed={editor?.isActive("italic")}>
          <Italic size={16} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => editor?.chain().focus().toggleUnderline().run()} disabled={!canEdit || !editor} aria-label="Underline" title="Underline" aria-pressed={editor?.isActive("underline")}>
          <UnderlineIcon size={16} aria-hidden="true" />
        </button>
        <span className={styles.toolbarDivider} />
        <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} disabled={!canEdit || !editor} aria-label="Heading 1" title="Heading 1" aria-pressed={editor?.isActive("heading", { level: 1 })}>
          <Heading1 size={17} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} disabled={!canEdit || !editor} aria-label="Heading 2" title="Heading 2" aria-pressed={editor?.isActive("heading", { level: 2 })}>
          <Heading2 size={17} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} disabled={!canEdit || !editor} aria-label="Bullet list" title="Bullet list" aria-pressed={editor?.isActive("bulletList")}>
          <List size={16} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()} disabled={!canEdit || !editor} aria-label="Numbered list" title="Numbered list" aria-pressed={editor?.isActive("orderedList")}>
          <ListOrdered size={16} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => editor?.chain().focus().toggleBlockquote().run()} disabled={!canEdit || !editor} aria-label="Blockquote" title="Blockquote" aria-pressed={editor?.isActive("blockquote")}>
          <Quote size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => {
            const href = window.prompt("Enter link URL");
            if (href) editor?.chain().focus().setLink({ href }).run();
            else editor?.chain().focus().unsetLink().run();
          }}
          disabled={!canEdit || !editor}
          aria-label="Add link"
          title="Add link"
        >
          <Link2 size={16} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => editor?.chain().focus().toggleCodeBlock().run()} disabled={!canEdit || !editor} aria-label="Code block" title="Code block" aria-pressed={editor?.isActive("codeBlock")}>
          <Code size={16} aria-hidden="true" />
        </button>
        <span className={styles.toolbarDivider} />
        <button type="button" onClick={() => editor?.chain().focus().undo().run()} disabled={!canEdit || !editor} aria-label="Undo" title="Undo">
          <RotateCcw size={16} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => editor?.chain().focus().redo().run()} disabled={!canEdit || !editor} aria-label="Redo" title="Redo">
          <Redo2 size={16} aria-hidden="true" />
        </button>
      </section>

      <section className={styles.editorFrame} aria-label="Document editor">
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          <div className={styles.loadingEditor}>
            <LoaderCircle className={styles.spinner} size={20} />
            Connecting editor...
          </div>
        )}
        {!canEdit && (
          <p className={styles.readOnlyNotice}>
            You have {permission ?? "view-only"} access. This document is read-only for you.
          </p>
        )}
      </section>

      <section className={styles.versionSection}>
        <button
          className={styles.versionToggle}
          type="button"
          onClick={() => setVersionOpen((open) => !open)}
          aria-expanded={versionOpen}
        >
          Version history <span>{versions.length}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
        {versionOpen && (
          <div className={styles.versionPanel}>
            {canEdit && (
              <form className={styles.versionForm} onSubmit={saveVersion}>
                <input
                  value={versionName}
                  onChange={(event) => setVersionName(event.target.value)}
                  placeholder="Name this version"
                  maxLength={120}
                  required
                  aria-label="Version name"
                />
                <button
                  className={styles.actionButton}
                  type="submit"
                  disabled={savingVersion || !synced}
                >
                  {savingVersion ? "Saving..." : "Save version"}
                </button>
              </form>
            )}
            {versions.length === 0 ? (
              <p className={styles.panelEmpty}>No named versions yet.</p>
            ) : (
              <ul className={styles.versionList}>
                {versions.map((version) => (
                  <li key={version.id}>
                    <span>
                      <strong>{version.name}</strong>
                      <small>
                        Version {version.version_number} · {new Date(version.created_at).toLocaleString()}
                      </small>
                    </span>
                    {canEdit && (
                      <button
                        className={styles.removeButton}
                        type="button"
                        onClick={() => void restoreVersion(version.id)}
                      >
                        Restore
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {permission === "owner" && document.status === "draft" && (
        <button
          className={styles.statusButton}
          type="button"
          onClick={() => void changeStatus("in_review")}
        >
          <Check size={16} aria-hidden="true" />
          Submit for review
        </button>
      )}
      {permission === "owner" && document.status === "in_review" && (
        <button
          className={styles.statusButton}
          type="button"
          onClick={() => void changeStatus("approved")}
        >
          <Check size={16} aria-hidden="true" />
          Approve and finalize
        </button>
      )}
    </main>
  );
}