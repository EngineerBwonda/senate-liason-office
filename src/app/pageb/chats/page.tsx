"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  ArrowLeft,
  FileText,
  Check,
  CheckCheck,
  LoaderCircle,
  MessageCircle,
  Paperclip,
  Search,
  Send,
  Smile,
  Trash2,
  UsersRound,
  UserRoundPlus,
  X,
} from "lucide-react";
import { createClient } from "../../supabase/client";
import { loadChatSummaries, type ChatSummary } from "../(component)/chat-data";
import styles from "./styles.module.css";

interface StaffMember {
  id: string;
  full_name: string | null;
  position: string | null;
}

interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  created_at: string;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime_type: string | null;
  attachment_size: number | null;
  attachmentUrl?: string;
}

interface ChatReceipt {
  message_id: string;
  user_id: string;
  delivered_at: string | null;
  read_at: string | null;
}

interface TypingPresence {
  userId: string;
  name: string;
  isTyping: boolean;
}

const CHAT_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
const CHAT_ATTACHMENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
];
const CHAT_EMOJIS = [
  "😀",
  "😃",
  "😄",
  "😁",
  "😊",
  "🙂",
  "😉",
  "😍",
  "🥰",
  "😘",
  "😎",
  "🤔",
  "😅",
  "😂",
  "🤣",
  "😭",
  "😢",
  "😮",
  "😡",
  "🙏",
  "👏",
  "👍",
  "👎",
  "❤️",
  "💙",
  "🎉",
  "🔥",
  "✅",
  "✨",
  "💯",
];

function formatAttachmentSize(size: number | null): string {
  if (!size || size < 1024) return `${size ?? 0} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [conversations, setConversations] = useState<ChatSummary[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [receiptStatus, setReceiptStatus] = useState<
    Record<string, "sent" | "delivered" | "read">
  >({});
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(true);
  const [startingChatId, setStartingChatId] = useState("");
  const [groupActionId, setGroupActionId] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const typingNameRef = useRef("Staff member");
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  const refreshConversations = useCallback(async (currentUserId: string) => {
    const supabase = createClient();
    const summaries = await loadChatSummaries(supabase, currentUserId);
    setConversations(summaries);
    return summaries;
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | undefined;

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
        .select("is_approved")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) return;
      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        return;
      }
      if (!profile?.is_approved) {
        router.replace("/pending");
        return;
      }

      setUserId(user.id);
      const initialConversation = new URLSearchParams(
        window.location.search,
      ).get("conversation");
      if (initialConversation) {
        setThreadLoading(true);
        setActiveId(initialConversation);
      }

      const { data: directory, error: directoryError } = await supabase
        .from("chat_staff_directory")
        .select("id, full_name, position")
        .order("full_name", { ascending: true });

      if (cancelled) return;
      if (directoryError) {
        setError(directoryError.message);
      } else {
        setStaff((directory ?? []) as StaffMember[]);
      }

      try {
        const summaries = await refreshConversations(user.id);
        if (
          !cancelled &&
          initialConversation &&
          !summaries.some((chat) => chat.conversationId === initialConversation)
        ) {
          setActiveId("");
        }
      } catch (loadError) {
        console.error("Could not load conversations:", loadError);
        if (!cancelled) setError("Your conversations could not be loaded.");
      }

      if (!cancelled) setLoading(false);

      channel = supabase
        .channel(`chat-inbox-${user.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "chat_messages" },
          async (payload) => {
            const newMessage = payload.new as ChatMessage;
            if (newMessage.sender_id !== user.id) {
              const { error: receiptError } = await supabase.rpc(
                "mark_chat_messages_delivered",
                {
                  target_conversation_id: newMessage.conversation_id,
                  target_message_ids: [newMessage.id],
                },
              );
              if (receiptError) {
                console.error(
                  "Could not mark chat message delivered:",
                  receiptError,
                );
              }
            }
            void refreshConversations(user.id).catch((loadError) => {
              console.error("Could not refresh conversations:", loadError);
            });
          },
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "chat_conversations" },
          () => {
            void refreshConversations(user.id).catch((loadError) => {
              console.error("Could not refresh conversations:", loadError);
            });
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "chat_participants" },
          () => {
            void refreshConversations(user.id).catch((loadError) => {
              console.error("Could not refresh group membership:", loadError);
            });
          },
        )
        .subscribe();
    };

    void initialize();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [refreshConversations, router]);

  useEffect(() => {
    if (!activeId || !userId) return;

    const supabase = createClient();
    let cancelled = false;
    const refreshThread = async () => {
      const { data, error: messagesError } = await supabase
        .from("chat_messages")
        .select(
          "id, conversation_id, sender_id, body, created_at, attachment_path, attachment_name, attachment_mime_type, attachment_size",
        )
        .eq("conversation_id", activeId)
        .order("created_at", { ascending: true })
        .limit(300);

      if (cancelled) return;
      if (messagesError) {
        setError(messagesError.message);
      } else {
        const threadMessages = await Promise.all(
          ((data ?? []) as ChatMessage[]).map(async (message) => {
            if (!message.attachment_path) return message;
            const { data: signedUrlData, error: signedUrlError } =
              await supabase.storage
                .from("chat-attachments")
                .createSignedUrl(message.attachment_path, 60 * 60);
            if (signedUrlError) {
              console.error(
                "Could not create chat attachment link:",
                signedUrlError,
              );
            }
            return { ...message, attachmentUrl: signedUrlData?.signedUrl };
          }),
        );
        setMessages(threadMessages);
        setError("");

        const messageIds = threadMessages.map((message) => message.id);
        const inboundIds = threadMessages
          .filter((message) => message.sender_id !== userId)
          .map((message) => message.id);

        if (inboundIds.length > 0) {
          const { error: readError } = await supabase.rpc(
            "mark_chat_messages_read",
            {
              target_conversation_id: activeId,
              target_message_ids: inboundIds,
            },
          );
          if (readError)
            console.error("Could not mark messages read:", readError);
        }

        const [participantsResult, receiptsResult] = await Promise.all([
          supabase
            .from("chat_participants")
            .select("user_id")
            .eq("conversation_id", activeId),
          messageIds.length
            ? supabase
                .from("chat_message_receipts")
                .select("message_id, user_id, delivered_at, read_at")
                .eq("conversation_id", activeId)
                .in("message_id", messageIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (participantsResult.error) {
          console.error(
            "Could not load chat participants:",
            participantsResult.error,
          );
        }
        if (receiptsResult.error) {
          console.error(
            "Could not load message receipts:",
            receiptsResult.error,
          );
        } else {
          const receipts = (receiptsResult.data ?? []) as ChatReceipt[];
          const participants = participantsResult.data ?? [];
          const statuses: Record<string, "sent" | "delivered" | "read"> = {};

          for (const message of threadMessages) {
            if (message.sender_id !== userId) continue;
            const recipients = participants.filter(
              (participant) => participant.user_id !== message.sender_id,
            );
            const messageReceipts = receipts.filter(
              (receipt) => receipt.message_id === message.id,
            );
            const deliveredCount = new Set(
              messageReceipts
                .filter((receipt) => receipt.delivered_at)
                .map((receipt) => receipt.user_id),
            ).size;
            const readCount = new Set(
              messageReceipts
                .filter((receipt) => receipt.read_at)
                .map((receipt) => receipt.user_id),
            ).size;

            statuses[message.id] =
              recipients.length > 0 && readCount >= recipients.length
                ? "read"
                : recipients.length > 0 && deliveredCount >= recipients.length
                  ? "delivered"
                  : "sent";
          }

          setReceiptStatus(statuses);
        }

        await supabase
          .from("chat_participants")
          .update({ last_read_at: new Date().toISOString() })
          .eq("conversation_id", activeId)
          .eq("user_id", userId);
        void refreshConversations(userId);
      }
      if (!cancelled) setThreadLoading(false);
    };

    const channel = supabase
      .channel(`chat-thread-${activeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${activeId}`,
        },
        () => void refreshThread(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_message_receipts",
          filter: `conversation_id=eq.${activeId}`,
        },
        () => void refreshThread(),
      )
      .subscribe((status, channelError) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error(
            "Chat thread realtime subscription failed:",
            channelError,
          );
        }
      });

    void refreshThread();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [activeId, refreshConversations, userId]);

  useEffect(() => {
    if (!activeId || !userId) return;

    const supabase = createClient();
    let cancelled = false;
    const channel = supabase.channel(`chat-typing-${activeId}`, {
      config: { presence: { key: userId } },
    });
    typingChannelRef.current = channel;

    const updateTypingUsers = () => {
      const typing = Object.values(channel.presenceState())
        .flatMap((entries) => entries as unknown as TypingPresence[])
        .filter((entry) => entry.userId !== userId && entry.isTyping)
        .map((entry) => entry.name);
      setTypingUsers([...new Set(typing)]);
    };

    const start = async () => {
      const { data: profile } = await supabase
        .from("profilec")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle();

      if (cancelled) return;
      typingNameRef.current = profile?.full_name?.trim() || "Staff member";

      channel
        .on("presence", { event: "sync" }, updateTypingUsers)
        .on("presence", { event: "join" }, updateTypingUsers)
        .on("presence", { event: "leave" }, updateTypingUsers)
        .subscribe(async (status, channelError) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            await channel.track({
              userId,
              name: typingNameRef.current,
              isTyping: false,
            });
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error("Chat typing presence failed:", channelError);
          }
        });
    };

    void start();
    return () => {
      cancelled = true;
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingChannelRef.current = null;
      setTypingUsers([]);
      void supabase.removeChannel(channel);
    };
  }, [activeId, userId]);

  const filteredStaff = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return staff;
    return staff.filter((member) =>
      `${member.full_name ?? ""} ${member.position ?? ""}`
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [search, staff]);

  const activeConversation = conversations.find(
    (chat) => chat.conversationId === activeId,
  );
  const activeStaff = staff.find(
    (member) => member.id === activeConversation?.participantId,
  );
  const activeName =
    activeConversation?.name ?? activeStaff?.full_name ?? "Conversation";
  const activeRole = activeConversation?.role ?? activeStaff?.position ?? "";

  const updateMessageText = (value: string) => {
    setMessageText(value);
    const channel = typingChannelRef.current;
    if (!channel || !activeId || !userId) return;

    void channel.track({
      userId,
      name: typingNameRef.current,
      isTyping: Boolean(value.trim()),
    });

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (value.trim()) {
      typingTimerRef.current = setTimeout(() => {
        void channel.track({
          userId,
          name: typingNameRef.current,
          isTyping: false,
        });
      }, 1800);
    }
  };

  const openConversation = (conversationId: string) => {
    setMessages([]);
    setMessageText("");
    setAttachment(null);
    setEmojiPickerOpen(false);
    setThreadLoading(true);
    setActiveId(conversationId);
    router.replace(`/pageb/chats?conversation=${conversationId}`, {
      scroll: false,
    });
  };

  const startConversation = async (member: StaffMember) => {
    if (!userId || startingChatId) return;
    setStartingChatId(member.id);
    setError("");
    const supabase = createClient();
    const { data, error: createError } = await supabase.rpc(
      "create_direct_chat",
      {
        target_user_id: member.id,
      },
    );

    if (createError || !data) {
      setError(createError?.message ?? "Could not start this chat.");
      setStartingChatId("");
      return;
    }

    const conversationId = data as string;
    try {
      await refreshConversations(userId);
      openConversation(conversationId);
    } catch (loadError) {
      console.error("Could not open the new conversation:", loadError);
      setError("The chat was created, but could not be loaded.");
    }
    setStartingChatId("");
  };

  const toggleGroupMember = (memberId: string) => {
    setGroupMemberIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId],
    );
  };

  const createGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = groupTitle.trim();
    if (!title || groupMemberIds.length < 2 || !userId || groupActionId) return;

    setGroupActionId("create");
    setError("");
    const supabase = createClient();
    const { data, error: createError } = await supabase.rpc(
      "create_group_chat",
      {
        target_title: title,
        target_user_ids: groupMemberIds,
      },
    );

    if (createError || !data) {
      setError(createError?.message ?? "Could not create the group.");
      setGroupActionId("");
      return;
    }

    const conversationId = data as string;
    setGroupTitle("");
    setGroupMemberIds([]);
    try {
      await refreshConversations(userId);
      openConversation(conversationId);
    } catch (loadError) {
      console.error("Could not load the new group:", loadError);
      setError("The group was created, but could not be loaded.");
    }
    setGroupActionId("");
  };

  const removeGroupMember = async (memberId: string, memberName: string) => {
    if (!activeConversation || activeConversation.type !== "group") return;
    if (
      !window.confirm(`Remove ${memberName} from ${activeConversation.name}?`)
    ) {
      return;
    }

    setGroupActionId(memberId);
    setError("");
    const supabase = createClient();
    const { error: removeError } = await supabase.rpc("remove_group_member", {
      target_conversation_id: activeConversation.conversationId,
      target_user_id: memberId,
    });

    if (removeError) {
      setError(removeError.message);
    } else if (userId) {
      await refreshConversations(userId);
    }
    setGroupActionId("");
  };

  const deleteGroup = async () => {
    if (!activeConversation || activeConversation.type !== "group") return;
    if (
      !window.confirm(`Delete ${activeConversation.name} and its messages?`)
    ) {
      return;
    }

    setGroupActionId("delete");
    setError("");
    const supabase = createClient();
    const { error: deleteError } = await supabase.rpc("delete_group_chat", {
      target_conversation_id: activeConversation.conversationId,
    });

    if (deleteError) {
      setError(deleteError.message);
    } else {
      setMessages([]);
      setActiveId("");
      router.replace("/pageb/chats", { scroll: false });
      if (userId) await refreshConversations(userId);
    }
    setGroupActionId("");
  };

  const selectAttachment = (file: File | undefined) => {
    if (!file) return;
    setAttachment(null);
    setError("");
    if (!CHAT_ATTACHMENT_TYPES.includes(file.type)) {
      setError("Choose a PDF, Word document, image, or text file.");
      return;
    }
    if (file.size > CHAT_ATTACHMENT_MAX_BYTES) {
      setError("Attachments must be 20 MB or smaller.");
      return;
    }
    setAttachment(file);
  };

  const insertEmoji = (emoji: string) => {
    const input = messageInputRef.current;
    const start = input?.selectionStart ?? messageText.length;
    const end = input?.selectionEnd ?? messageText.length;
    const nextText = `${messageText.slice(0, start)}${emoji}${messageText.slice(end)}`;
    setMessageText(nextText);
    setEmojiPickerOpen(false);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = messageText.trim();
    if ((!body && !attachment) || !activeId || !userId || sending) return;

    setSending(true);
    setError("");
    const supabase = createClient();
    let attachmentPath: string | null = null;

    if (attachment) {
      const safeFileName = attachment.name
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9._-]+/g, "-");
      attachmentPath = `${activeId}/${userId}/${crypto.randomUUID()}-${safeFileName}`;
      const { error: uploadError } = await supabase.storage
        .from("chat-attachments")
        .upload(attachmentPath, attachment, {
          contentType: attachment.type,
          upsert: false,
        });

      if (uploadError) {
        setError(uploadError.message);
        setSending(false);
        return;
      }
    }

    const { error: sendError } = await supabase.from("chat_messages").insert({
      conversation_id: activeId,
      sender_id: userId,
      body: body || null,
      attachment_path: attachmentPath,
      attachment_name: attachment?.name ?? null,
      attachment_mime_type: attachment?.type ?? null,
      attachment_size: attachment?.size ?? null,
    });

    if (sendError) {
      if (attachmentPath) {
        const { error: cleanupError } = await supabase.storage
          .from("chat-attachments")
          .remove([attachmentPath]);
        if (cleanupError) {
          console.error(
            "Could not remove orphaned chat attachment:",
            cleanupError,
          );
        }
      }
      setError(sendError.message);
    } else {
      setMessageText("");
      setAttachment(null);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      void typingChannelRef.current?.track({
        userId,
        name: typingNameRef.current,
        isTyping: false,
      });
      try {
        await refreshConversations(userId);
      } catch (loadError) {
        console.error("Could not refresh after sending:", loadError);
      }
    }
    setSending(false);
  };

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Communications / Private chats</p>
          <h1 className={styles.title}>Messages</h1>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.staffCount}>
            {staff.length} approved staff
          </span>
          <Link className={styles.backToMenu} href="/pageb/menu">
            <ArrowLeft size={16} aria-hidden="true" />
            Back to menu
          </Link>
        </div>
      </header>

      {error && (
        <p className={styles.errorMessage} role="alert">
          {error}
        </p>
      )}

      <div
        className={`${styles.workspace} ${activeId ? styles.workspaceThreadOpen : ""}`}
      >
        <aside
          className={styles.conversationPanel}
          aria-label="Chats and staff"
        >
          <label className={styles.searchBox}>
            <Search size={16} aria-hidden="true" />
            <span className={styles.visuallyHidden}>Search approved staff</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find a staff member"
            />
          </label>

          <section className={styles.panelSection}>
            <h2 className={styles.sectionTitle}>Create a group</h2>
            <form className={styles.groupForm} onSubmit={createGroup}>
              <label className={styles.groupNameField}>
                <span className={styles.visuallyHidden}>Group name</span>
                <input
                  value={groupTitle}
                  onChange={(event) => setGroupTitle(event.target.value)}
                  maxLength={100}
                  placeholder="Name this group"
                  required
                />
              </label>
              <p className={styles.groupHint}>
                Select at least two approved staff members.
              </p>
              <ul className={styles.groupMemberPicker}>
                {staff.map((member) => (
                  <li key={member.id}>
                    <label className={styles.groupMemberOption}>
                      <input
                        type="checkbox"
                        checked={groupMemberIds.includes(member.id)}
                        onChange={() => toggleGroupMember(member.id)}
                      />
                      <span>{member.full_name || "Staff member"}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <button
                className={styles.createGroupButton}
                type="submit"
                disabled={
                  Boolean(groupActionId) ||
                  groupMemberIds.length < 2 ||
                  !groupTitle.trim()
                }
              >
                {groupActionId === "create" ? (
                  <LoaderCircle size={15} className={styles.spinner} />
                ) : (
                  <UsersRound size={15} aria-hidden="true" />
                )}
                Create group
              </button>
            </form>
          </section>

          <section className={styles.panelSection}>
            <h2 className={styles.sectionTitle}>Conversations</h2>
            {loading ? (
              <p className={styles.panelState}>Loading conversations...</p>
            ) : conversations.length === 0 ? (
              <p className={styles.panelState}>
                Start a chat with an approved staff member.
              </p>
            ) : (
              <ul className={styles.conversationList}>
                {conversations.map((chat) => (
                  <li key={chat.conversationId}>
                    <button
                      className={`${styles.conversationButton} ${activeId === chat.conversationId ? styles.conversationActive : ""}`}
                      type="button"
                      onClick={() => openConversation(chat.conversationId)}
                    >
                      <span className={styles.avatar} aria-hidden="true">
                        {chat.name
                          .split(" ")
                          .map((part) => part[0])
                          .slice(-2)
                          .join("")}
                      </span>
                      <span className={styles.contactDetails}>
                        <span className={styles.contactName}>
                          {chat.type === "group"
                            ? `Group · ${chat.name}`
                            : chat.name}
                        </span>
                        <span className={styles.preview}>
                          {chat.lastMessage}
                        </span>
                      </span>
                      {chat.unread && (
                        <span
                          className={styles.unreadDot}
                          aria-label="Unread"
                        />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.panelSection}>
            <h2 className={styles.sectionTitle}>Start a conversation</h2>
            {filteredStaff.length === 0 ? (
              <p className={styles.panelState}>No approved staff found.</p>
            ) : (
              <ul className={styles.staffList}>
                {filteredStaff.map((member) => (
                  <li key={member.id} className={styles.staffRow}>
                    <span className={styles.avatar} aria-hidden="true">
                      {(member.full_name || "Staff member")
                        .split(" ")
                        .map((part) => part[0])
                        .slice(-2)
                        .join("")}
                    </span>
                    <span className={styles.contactDetails}>
                      <span className={styles.contactName}>
                        {member.full_name || "Staff member"}
                      </span>
                      <span className={styles.preview}>
                        {member.position || "Staff"}
                      </span>
                    </span>
                    <button
                      className={styles.startButton}
                      type="button"
                      onClick={() => void startConversation(member)}
                      disabled={Boolean(startingChatId)}
                      aria-label={`Start a chat with ${member.full_name || "staff member"}`}
                      title="Start chat"
                    >
                      {startingChatId === member.id ? (
                        <LoaderCircle size={16} className={styles.spinner} />
                      ) : (
                        <UserRoundPlus size={16} />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <section className={styles.threadPanel} aria-label="Conversation">
          {activeId ? (
            <>
              <header className={styles.threadHeader}>
                <button
                  className={styles.mobileBackButton}
                  type="button"
                  onClick={() => {
                    setMessages([]);
                    setActiveId("");
                    setThreadLoading(true);
                    router.replace("/pageb/chats", { scroll: false });
                  }}
                  aria-label="Back to conversations"
                >
                  <ArrowLeft size={18} aria-hidden="true" />
                </button>
                <span className={styles.avatar} aria-hidden="true">
                  {activeName
                    .split(" ")
                    .map((part) => part[0])
                    .slice(-2)
                    .join("")}
                </span>
                <span className={styles.contactDetails}>
                  <strong className={styles.contactName}>{activeName}</strong>
                  <span className={styles.preview}>{activeRole}</span>
                </span>
                {activeConversation?.type === "group" &&
                  activeConversation.createdBy === userId && (
                    <button
                      className={styles.deleteGroupButton}
                      type="button"
                      onClick={() => void deleteGroup()}
                      disabled={Boolean(groupActionId)}
                    >
                      {groupActionId === "delete" ? (
                        <LoaderCircle size={15} className={styles.spinner} />
                      ) : (
                        <Trash2 size={15} aria-hidden="true" />
                      )}
                      Delete group
                    </button>
                  )}
              </header>
              {activeConversation?.type === "group" && (
                <div className={styles.groupMembers}>
                  {activeConversation.members.map((member) => (
                    <span className={styles.groupMember} key={member.userId}>
                      <span>{member.name}</span>
                      {activeConversation.createdBy === userId &&
                        member.userId !== userId && (
                          <button
                            type="button"
                            onClick={() =>
                              void removeGroupMember(member.userId, member.name)
                            }
                            disabled={Boolean(groupActionId)}
                            aria-label={`Remove ${member.name} from group`}
                            title={`Remove ${member.name}`}
                          >
                            ×
                          </button>
                        )}
                    </span>
                  ))}
                </div>
              )}
              {typingUsers.length > 0 && (
                <p className={styles.typingStatus} role="status">
                  {typingUsers.join(", ")}{" "}
                  {typingUsers.length === 1 ? "is" : "are"} typing...
                </p>
              )}
              <div className={styles.messageList} aria-live="polite">
                {threadLoading ? (
                  <p className={styles.threadState}>Loading messages...</p>
                ) : messages.length === 0 ? (
                  <p className={styles.threadState}>
                    This is the beginning of your conversation.
                  </p>
                ) : (
                  messages.map((message) => (
                    <article
                      key={message.id}
                      className={`${styles.message} ${message.sender_id === userId ? styles.ownMessage : styles.otherMessage}`}
                    >
                      {message.body && <p>{message.body}</p>}
                      {message.attachment_path && (
                        <a
                          className={styles.attachmentLink}
                          href={message.attachmentUrl}
                          download={message.attachment_name || true}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <FileText size={16} aria-hidden="true" />
                          <span className={styles.attachmentDetails}>
                            <strong>
                              {message.attachment_name || "Chat attachment"}
                            </strong>
                            <small>
                              {formatAttachmentSize(message.attachment_size)}
                            </small>
                          </span>
                        </a>
                      )}
                      <span className={styles.messageMeta}>
                        <time dateTime={message.created_at}>
                          {new Date(message.created_at).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </time>
                        {message.sender_id === userId && (
                          <span
                            className={`${styles.receipt} ${receiptStatus[message.id] === "read" ? styles.receiptRead : receiptStatus[message.id] === "delivered" ? styles.receiptDelivered : styles.receiptPending}`}
                            aria-label={`${receiptStatus[message.id] ?? "sent"} message`}
                            title={`${receiptStatus[message.id] ?? "sent"}`}
                          >
                            {receiptStatus[message.id] === "sent" ? (
                              <Check size={14} aria-hidden="true" />
                            ) : (
                              <CheckCheck size={14} aria-hidden="true" />
                            )}
                          </span>
                        )}
                      </span>
                    </article>
                  ))
                )}
              </div>
              <form
                className={styles.composer}
                onSubmit={(event) => void sendMessage(event)}
              >
                <div className={styles.composerTools}>
                  <input
                    ref={attachmentInputRef}
                    className={styles.fileInput}
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.txt"
                    onChange={(event) => {
                      selectAttachment(event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                    aria-label="Attach a file"
                  />
                  <button
                    className={styles.composerIconButton}
                    type="button"
                    onClick={() => attachmentInputRef.current?.click()}
                    aria-label="Attach file"
                    title="Attach file"
                    disabled={sending}
                  >
                    <Paperclip size={18} />
                  </button>
                  <div className={styles.emojiControl}>
                    <button
                      className={styles.composerIconButton}
                      type="button"
                      onClick={() => setEmojiPickerOpen((open) => !open)}
                      aria-label="Choose emoji"
                      aria-expanded={emojiPickerOpen}
                      title="Choose emoji"
                    >
                      <Smile size={18} />
                    </button>
                    {emojiPickerOpen && (
                      <div
                        className={styles.emojiPicker}
                        aria-label="Emoji picker"
                      >
                        {CHAT_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => insertEmoji(emoji)}
                            aria-label={`Insert ${emoji}`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <textarea
                  ref={messageInputRef}
                  value={messageText}
                  onChange={(event) => updateMessageText(event.target.value)}
                  maxLength={5000}
                  placeholder="Write a message..."
                  aria-label="Write a message"
                  rows={2}
                />
                {attachment && (
                  <span className={styles.selectedAttachment}>
                    <Paperclip size={14} aria-hidden="true" />
                    <span>{attachment.name}</span>
                    <button
                      type="button"
                      onClick={() => setAttachment(null)}
                      aria-label="Remove attached file"
                      title="Remove attached file"
                    >
                      <X size={14} />
                    </button>
                  </span>
                )}
                <button
                  type="submit"
                  disabled={sending || (!messageText.trim() && !attachment)}
                  aria-label="Send message"
                  title="Send message"
                >
                  <Send size={18} />
                </button>
              </form>
            </>
          ) : (
            <div className={styles.selectPrompt}>
              <MessageCircle size={30} aria-hidden="true" />
              <h2>Select a conversation</h2>
              <p>
                Choose an existing chat or start a new one with approved staff.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
