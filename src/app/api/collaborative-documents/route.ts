import { getApprovedSession } from "./_server";

const DOCUMENT_TYPES = [
  "memo",
  "minutes",
  "report",
  "correspondence",
  "other",
] as const;

export async function GET(request: Request) {
  const session = await getApprovedSession();
  if (session.error || !session.supabase) return session.error;

  const url = new URL(request.url);
  const sourceType = url.searchParams.get("sourceType");
  const sourceId = url.searchParams.get("sourceId");
  let query = session.supabase
    .from("collaborative_documents")
    .select(
      "id, title, document_type, created_by, source_type, source_id, status, created_at, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(100);

  if (sourceType === "memo" || sourceType === "minutes") {
    query = query.eq("source_type", sourceType);
  }
  if (sourceId) query = query.eq("source_id", sourceId);

  const { data, error } = await query;
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ documents: data ?? [] });
}

export async function POST(request: Request) {
  const session = await getApprovedSession();
  if (session.error || !session.supabase || !session.user) return session.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid document details." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const documentType = input.documentType;
  const sourceType = input.sourceType;
  const sourceId = input.sourceId;

  if (
    !title ||
    title.length > 180 ||
    typeof documentType !== "string" ||
    !DOCUMENT_TYPES.includes(documentType as (typeof DOCUMENT_TYPES)[number])
  ) {
    return Response.json({ error: "Invalid title or document type." }, { status: 400 });
  }
  if (
    (sourceType !== undefined && sourceType !== null &&
      sourceType !== "memo" &&
      sourceType !== "minutes") ||
    (sourceId !== undefined &&
      sourceId !== null &&
      (!Number.isSafeInteger(sourceId) || Number(sourceId) < 1)) ||
    ((sourceType === undefined || sourceType === null) !==
      (sourceId === undefined || sourceId === null))
  ) {
    return Response.json({ error: "Invalid source document reference." }, { status: 400 });
  }

  const { data, error } = await session.supabase
    .from("collaborative_documents")
    .insert({
      title,
      document_type: documentType,
      created_by: session.user.id,
      source_type: sourceType ?? null,
      source_id: sourceId ?? null,
      status: "draft",
    })
    .select(
      "id, title, document_type, created_by, source_type, source_id, status, created_at, updated_at",
    )
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ document: data }, { status: 201 });
}