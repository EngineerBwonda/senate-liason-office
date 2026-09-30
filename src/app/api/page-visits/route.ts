import { isIP } from "node:net";
import { cookies } from "next/headers";
import { createClient } from "../../supabase/server";

function getClientIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const candidates = [
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-real-ip"),
    forwardedFor?.split(",")[0],
  ];

  for (const candidate of candidates) {
    const address = candidate?.trim();
    if (address && isIP(address)) return address;
  }

  return null;
}

export async function POST(request: Request) {
  let path: unknown;
  try {
    ({ path } = await request.json());
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.length > 2048
  ) {
    return Response.json({ error: "Invalid page path." }, { status: 400 });
  }

  const supabase = createClient(await cookies());
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const { error } = await supabase.from("page_visits").insert({
    user_id: user.id,
    path,
    ip_address: getClientIp(request),
  });

  if (error) {
    console.error("Could not insert page visit:", error);
    return Response.json(
      { error: "Could not record page visit." },
      { status: 500 },
    );
  }

  return new Response(null, { status: 204 });
}
