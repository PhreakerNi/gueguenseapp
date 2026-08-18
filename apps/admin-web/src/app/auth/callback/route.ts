import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../lib/supabase/server";

const ALLOWED_NEXT_PATHS = new Set(["/", "/reset-password", "/mfa"]);

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/";

  // Strict allowlist validation against unapproved redirect targets
  const next = ALLOWED_NEXT_PATHS.has(rawNext) ? rawNext : "/";

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`);
      }
    } catch {
      return NextResponse.redirect(
        `${origin}/login?error=AUTH_INVALID_CREDENTIALS`,
      );
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=AUTH_PASSWORD_RECOVERY_INVALID`,
  );
}
