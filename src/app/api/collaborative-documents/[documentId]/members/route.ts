import { getApprovedSession } from "../../_server";

const PERMISSIONS = ["editor", "commenter", "viewer"] as const;
type SharePermission = (typeof PERMISSIONS)[number];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  const session = await getApprovedSession();
  if (session.error || !session.supabase) return session.error;

  const { data, error } = await session.supabase.rpc(
    "list_collaborative_document_members",
    { target_document_id: documentId },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ members: data ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  const session = await getApprovedSession();
  if (session.error || !session.supabase || !session.user) return session.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const input = body as { userId?: unknown; permission?: unknown } | null;
  if (
    !input ||
    typeof input.userId !== "string" ||
    input.userId === session.user.id ||
    typeof input.permission !== "string" ||
    !PERMISSIONS.includes(input.permission as SharePermission)
  ) {
    return Response.json({ error: "Choose an approved staff member and permission." }, { status: 400 });
  }

  const { data, error } = await session.supabase
    .from("collaborative_document_members")
    .insert({
      document_id: documentId,
      user_id: input.userId,
      permission: input.permission,
      invited_by: session.user.id,
    })
    .select("document_id, user_id, permission, created_at")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 403 });
  }

  const { error: activityError } = await session.supabase
    .from("collaborative_document_activity")
    .insert({
      document_id: documentId,
      actor_id: session.user.id,
      event_type: "shared",
      details: { user_id: input.userId, permission: input.permission },
    });
  if (activityError) console.error("Could not log document sharing:", activityError);

  return Response.json({ member: data }, { status: 201 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  const session = await getApprovedSession();
  if (session.error || !session.supabase || !session.user) return session.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const input = body as { userId?: unknown; permission?: unknown } | null;
  if (
    !input ||
    typeof input.userId !== "string" ||
    typeof input.permission !== "string" ||
    !PERMISSIONS.includes(input.permission as SharePermission)
  ) {
    return Response.json({ error: "Invalid member permission." }, { status: 400 });
  }

  const { data, error } = await session.supabase
    .from("collaborative_document_members")
    .update({ permission: input.permission })
    .eq("document_id", documentId)
    .eq("user_id", input.userId)
    .neq("permission", "owner")
    .select("document_id, user_id, permission, created_at")
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 403 });
  if (!data) return Response.json({ error: "Member not found." }, { status: 404 });

  const { error: activityError } = await session.supabase
    .from("collaborative_document_activity")
    .insert({
      document_id: documentId,
      actor_id: session.user.id,
      event_type: "permission_changed",
      details: { user_id: input.userId, permission: input.permission },
    });
  if (activityError) console.error("Could not log permission change:", activityError);

  return Response.json({ member: data });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  const session = await getApprovedSession();
  if (session.error || !session.supabase || !session.user) return session.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const input = body as { userId?: unknown } | null;
  if (!input || typeof input.userId !== "string") {
    return Response.json({ error: "Invalid member." }, { status: 400 });
  }

  const { data, error } = await session.supabase
    .from("collaborative_document_members")
    .delete()
    .eq("document_id", documentId)
    .eq("user_id", input.userId)
    .neq("permission", "owner")
    .select("user_id")
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 403 });
  if (!data) return Response.json({ error: "Member not found." }, { status: 404 });

  const { error: activityError } = await session.supabase
    .from("collaborative_document_activity")
    .insert({
      document_id: documentId,
      actor_id: session.user.id,
      event_type: "member_removed",
      details: { user_id: input.userId },
    });
  if (activityError) console.error("Could not log member removal:", activityError);

  return new Response(null, { status: 204 });
}