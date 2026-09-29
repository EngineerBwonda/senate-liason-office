"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { createClient } from "../../../supabase/client";
import {
  formatMessageTime,
  loadChatSummaries,
  type ChatSummary,
} from "../chat-data";
import styles from "./styles.module.css";

export default function RecentMessages() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [replyConversationId, setReplyConversationId] = useState("");
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let currentUserId = "";

    const load = async () => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (authError || !user) {
        setError(authError?.message ?? "Sign in to view your chats.");
        setLoading(false);
        return;
      }

      setUserId(user.id);
      currentUserId = user.id;
      try {
        const conversations = await loadChatSummaries(supabase, user.id);
        if (!cancelled) {
          setChats(conversations.slice(0, 3));
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          console.error("Could not load dashboard chat previews:", loadError);
          setError("Recent chats could not be loaded.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const channel = supabase
      .channel("dashboard-recent-chats")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        async (payload) => {
          const message = payload.new as {
            conversation_id: string;
            id: string;
            sender_id: string;
          };
          if (currentUserId && message.sender_id !== currentUserId) {
            const { error: receiptError } = await supabase.rpc(
              "mark_chat_messages_delivered",
              {
                target_conversation_id: message.conversation_id,
                target_message_ids: [message.id],
              },
            );
            if (receiptError) {
              console.error(
                "Could not mark dashboard message delivered:",
                receiptError,
              );
            }
          }
          void load();
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_conversations" },
        () => void load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  const sendQuickReply = async (
    event: FormEvent<HTMLFormElement>,
    chat: ChatSummary,
  ) => {
    event.preventDefault();
    const body = replyText.trim();
    if (!body || !userId || sending) return;

    setSending(true);
    setError("");
    const supabase = createClient();
    const { error: sendError } = await supabase.from("chat_messages").insert({
      conversation_id: chat.conversationId,
      sender_id: userId,
      body,
    });

    if (sendError) {
      setError(sendError.message);
    } else {
      setReplyText("");
      setReplyConversationId("");
      try {
        setChats((await loadChatSummaries(supabase, userId)).slice(0, 3));
      } catch (loadError) {
        console.error("Could not refresh dashboard chat previews:", loadError);
      }
    }
    setSending(false);
  };

  return (
    <section className={styles.card} aria-labelledby="recent-messages-heading">
      <div className={styles.header}>
        <h2 className={styles.title} id="recent-messages-heading">
          Recent chats
        </h2>
        <Link href="/pageb/chats" className={styles.link}>
          All chats
        </Link>
      </div>
      {loading ? (
        <p className={styles.status} role="status">
          Loading chats...
        </p>
      ) : error && chats.length === 0 ? (
        <p className={styles.status} role="alert">
          {error}
        </p>
      ) : chats.length === 0 ? (
        <p className={styles.status}>
          No conversations yet. Start one from All chats.
        </p>
      ) : (
        <ul className={styles.list}>
          {chats.map((chat) => (
            <li key={chat.conversationId} className={styles.item}>
              <Link
                href={`/pageb/chats?conversation=${chat.conversationId}`}
                className={styles.messageLink}
              >
                <span className={styles.avatar} aria-hidden="true">
                  {chat.name
                    .split(" ")
                    .map((part) => part[0])
                    .slice(-2)
                    .join("")}
                </span>
                <span className={styles.body}>
                  <span className={styles.messageHeader}>
                    <span className={styles.name}>{chat.name}</span>
                    <span className={styles.time}>
                      {formatMessageTime(chat.lastMessageAt)}
                    </span>
                  </span>
                  <span className={styles.snippet}>{chat.lastMessage}</span>
                </span>
                {chat.unread && (
                  <span className={styles.unreadDot} aria-label="Unread" />
                )}
              </Link>
              <button
                className={styles.replyToggle}
                type="button"
                onClick={() => {
                  setReplyConversationId((current) =>
                    current === chat.conversationId ? "" : chat.conversationId,
                  );
                  setReplyText("");
                }}
                aria-expanded={replyConversationId === chat.conversationId}
              >
                Reply
              </button>
              {replyConversationId === chat.conversationId && (
                <form
                  className={styles.replyForm}
                  onSubmit={(event) => void sendQuickReply(event, chat)}
                >
                  <input
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    maxLength={5000}
                    placeholder={`Reply to ${chat.name}`}
                    aria-label={`Reply to ${chat.name}`}
                    required
                  />
                  <button
                    type="submit"
                    disabled={sending || !replyText.trim()}
                    aria-label="Send reply"
                    title="Send reply"
                  >
                    <Send size={15} />
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && chats.length > 0 && (
        <p className={styles.status} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
