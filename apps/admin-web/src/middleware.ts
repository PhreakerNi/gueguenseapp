import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database, PlatformRole } from "@gueguense/types";

const ADMIN_ALLOWED_ROLES: PlatformRole[] = [
  "super_admin",
  "admin",
  "operator",
  "verification_agent",
];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");
  const isMfaRoute = pathname.startsWith("/mfa");
  const isCallbackRoute = pathname.startsWith("/auth/callback");

  if (isCallbackRoute) {
    return response;
  }

  if (!user) {
    if (!isAuthRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return response;
  }

  // User is authenticated, check platform role
  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("platform_role")
    .eq("id", user.id)
    .single();

  const profile = rawProfile as { platform_role: PlatformRole } | null;
  const platformRole = profile?.platform_role ?? "none";

  if (!ADMIN_ALLOWED_ROLES.includes(platformRole)) {
    if (!isAuthRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "AUTH_ADMIN_ROLE_REQUIRED");
      return NextResponse.redirect(url);
    }
    return response;
  }

  // Check MFA Authenticator Assurance Level
  const { data: aalData } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const currentAal = aalData?.currentLevel;

  if (currentAal !== "aal2") {
    if (!isMfaRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/mfa";
      return NextResponse.redirect(url);
    }
    return response;
  }

  // User has valid admin role and AAL2
  if (isAuthRoute || isMfaRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
