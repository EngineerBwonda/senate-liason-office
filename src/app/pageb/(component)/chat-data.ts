import type { SupabaseClient } from "@supabase/supabase-js";

export interface ChatSummary {
  conversationId: string;
  participantId: string;
  type: "direct" | "group";
  title: string | null;
  createdBy: string;
  members: ChatMemberSummary[];
  name: string;
  role: string;
  lastMessage: string;
  lastMessageAt: string;
  unread: boolean;
}

export interface ChatMemberSummary {
  userId: string;
  name: string;
  role: string;
}

interface ParticipantRow {
  conversation_id: string;
  user_id: string;
  last_read_at: string | null;
}

interface ConversationRow {
  id: string;
  last_message_at: string;
  conversation_type: "direct" | "group";
  title: string | null;
  created_by: string;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  position: string | null;
}

interface MessageRow {
  conversation_id: string;
  sender_id: string;
  body: string | null;
  attachment_name: string | null;
  created_at: string;
}

export async function loadChatSummaries(
  supabase: SupabaseClient,
  userId: string,
): Promise<ChatSummary[]> {
  const { data: membershipData, error: membershipError } = await supabase
    .from("chat_participants")
    .select("conversation_id, user_id, last_read_at")
    .eq("user_id", userId);

  if (membershipError) throw membershipError;

  const memberships = (membershipData ?? []) as ParticipantRow[];
  const conversationIds = memberships.map((row) => row.conversation_id);
  if (conversationIds.length === 0) return [];

  const [conversationResult, peersResult, messagesResult] = await Promise.all([
    supabase
      .from("chat_conversations")
      .select("id, last_message_at, conversation_type, title, created_by")
      .in("id", conversationIds)
      .order("last_message_at", { ascending: false }),
    supabase
      .from("chat_participants")
      .select("conversation_id, user_id, last_read_at")
      .in("conversation_id", conversationIds)
      .neq("user_id", userId),
    supabase
      .from("chat_messages")
      .select("conversation_id, sender_id, body, attachment_name, created_at")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  if (conversationResult.error) throw conversationResult.error;
  if (peersResult.error) throw peersResult.error;
  if (messagesResult.error) throw messagesResult.error;

  const conversations = (conversationResult.data ?? []) as ConversationRow[];
  const peers = (peersResult.data ?? []) as ParticipantRow[];
  const messages = (messagesResult.data ?? []) as MessageRow[];
  const memberIds = [
    ...new Set([...memberships, ...peers].map((row) => row.user_id)),
  ];

  const { data: profilesData, error: profilesError } = memberIds.length
    ? await supabase
        .from("chat_staff_directory")
        .select("id, full_name, position")
        .in("id", memberIds)
    : { data: [], error: null };

  if (profilesError) throw profilesError;

  const profiles = (profilesData ?? []) as ProfileRow[];
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const membershipByConversation = new Map(
    memberships.map((row) => [row.conversation_id, row]),
  );
  const peersByConversation = new Map<string, ParticipantRow[]>();
  for (const peer of peers) {
    const group = peersByConversation.get(peer.conversation_id) ?? [];
    group.push(peer);
    peersByConversation.set(peer.conversation_id, group);
  }
  const latestMessageByConversation = new Map<string, MessageRow>();

  for (const message of messages) {
    if (!latestMessageByConversation.has(message.conversation_id)) {
      latestMessageByConversation.set(message.conversation_id, message);
    }
  }

  return conversations.flatMap((conversation) => {
    const membership = membershipByConversation.get(conversation.id);
    if (!membership) return [];

    const conversationPeers = peersByConversation.get(conversation.id) ?? [];
    const conversationMembers = [membership, ...conversationPeers].flatMap(
      (member) => {
        const profile = profileById.get(member.user_id);
        if (!profile && member.user_id !== userId) return [];
        return [
          {
            userId: member.user_id,
            name:
              profile?.full_name?.trim() ||
              (member.user_id === userId ? "You" : "Staff member"),
            role: profile?.position?.trim() || "Staff",
          },
        ];
      },
    );

    const firstPeer = conversationPeers[0];
    const firstPeerProfile = firstPeer
      ? profileById.get(firstPeer.user_id)
      : undefined;
    const directName = firstPeerProfile?.full_name?.trim() || "Staff member";
    const directRole = firstPeerProfile?.position?.trim() || "Staff";
    const displayName =
      conversation.conversation_type === "group"
        ? conversation.title?.trim() || "Group chat"
        : directName;
    const displayRole =
      conversation.conversation_type === "group"
        ? `${conversationMembers.length} members`
        : directRole;

    const latestMessage = latestMessageByConversation.get(conversation.id);

    return [
      {
        conversationId: conversation.id,
        participantId: firstPeer?.user_id ?? userId,
        type: conversation.conversation_type || "direct",
        title: conversation.title,
        createdBy: conversation.created_by,
        members: conversationMembers,
        name: displayName,
        role: displayRole,
        lastMessage:
          latestMessage?.body?.trim() ||
          (latestMessage?.attachment_name
            ? `📎 ${latestMessage.attachment_name}`
            : "Start the conversation"),
        lastMessageAt:
          latestMessage?.created_at ?? conversation.last_message_at,
        unread: Boolean(
          latestMessage &&
          latestMessage.sender_id !== userId &&
          (!membership.last_read_at ||
            latestMessage.created_at > membership.last_read_at),
        ),
      },
    ];
  });
}

export function formatMessageTime(value: string): string {
  const date = new Date(value);
  const delta = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
