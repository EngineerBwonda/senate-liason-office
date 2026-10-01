import { getApprovedSession } from "../_server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  if (!UUID_PATTERN.test(documentId)) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }

  const session = await getApprovedSession();
  if (session.error || !session.supabase) return session.error;

  const { data, error } = await session.supabase
    .from("collaborative_documents")
    .select(
      "id, title, document_type, created_by, source_type, source_id, status, created_at, updated_at",
    )
    .eq("id", documentId)
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!data) return Response.json({ error: "Document not found." }, { status: 404 });
  return Response.json({ document: data });
}