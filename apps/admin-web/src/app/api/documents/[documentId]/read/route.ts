import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import type { PlatformRole } from "@gueguense/types";

const CAN_VERIFY_ROLES: PlatformRole[] = [
  "super_admin",
  "admin",
  "verification_agent",
];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  const supabase = await createClient();

  // 1. Validate user authentication
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Validate platform_role from public.profiles
  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("platform_role")
    .eq("id", user.id)
    .single();

  const profile = rawProfile as {
    platform_role: PlatformRole;
  } | null;

  const platformRole = profile?.platform_role ?? "none";
  if (!CAN_VERIFY_ROLES.includes(platformRole)) {
    return NextResponse.json(
      { error: "Forbidden: Admin role required" },
      { status: 403 },
    );
  }

  // 3. Validate AAL2
  const { data: aalData } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aalData?.currentLevel !== "aal2") {
    return NextResponse.json(
      { error: "Forbidden: AAL2 MFA required" },
      { status: 403 },
    );
  }

  // 4. Call Edge Function with Bearer token
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const edgeUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!edgeUrl || !token) {
    return NextResponse.json(
      { error: "Server Configuration Error" },
      { status: 500 },
    );
  }

  const edgeRes = await fetch(
    `${edgeUrl}/functions/v1/api-v1/admin/driver-documents/${documentId}/read-url`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!edgeRes.ok) {
    const errorData = await edgeRes.json().catch(() => ({}));
    return NextResponse.json(
      { error: errorData?.error?.message || "Failed to get document read URL" },
      { status: edgeRes.status },
    );
  }

  const { read_url } = await edgeRes.json();
  if (!read_url) {
    return NextResponse.json(
      { error: "Read URL not returned by storage engine" },
      { status: 500 },
    );
  }

  // 5. Redirect to signed storage URL with strict security headers
  const response = NextResponse.redirect(read_url, 307);
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Referrer-Policy", "no-referrer");

  return response;
}
