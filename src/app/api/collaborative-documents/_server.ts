import { cookies } from "next/headers";
import { createClient } from "../../supabase/server";

export async function getApprovedSession() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      error: Response.json({ error: "Authentication required." }, { status: 401 }),
      supabase: null,
      user: null,
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profilec")
    .select("is_approved")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return {
      error: Response.json({ error: profileError.message }, { status: 500 }),
      supabase: null,
      user: null,
    };
  }
  if (!profile?.is_approved) {
    return {
      error: Response.json({ error: "Approved staff access required." }, { status: 403 }),
      supabase: null,
      user: null,
    };
  }

  return { error: null, supabase, user };
}