import React from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "../lib/supabase/server";
import type { PlatformRole } from "@gueguense/types";

export const dynamic = "force-dynamic";

const ADMIN_ALLOWED_ROLES: PlatformRole[] = [
  "super_admin",
  "admin",
  "operator",
  "verification_agent",
];

type PendingDriverItem = {
  id: string;
  verification_status: string;
  account_status: string;
  created_at: string;
};

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Server-side revalidation of platform_role
  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("platform_role, full_name, phone")
    .eq("id", user.id)
    .single();

  const profile = rawProfile as {
    platform_role: PlatformRole;
    full_name: string | null;
    phone: string | null;
  } | null;

  const platformRole = profile?.platform_role ?? "none";
  if (!ADMIN_ALLOWED_ROLES.includes(platformRole)) {
    redirect("/login?error=AUTH_ADMIN_ROLE_REQUIRED");
  }

  // Server-side revalidation of MFA AAL2
  const { data: aalData } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aalData?.currentLevel !== "aal2") {
    redirect("/mfa");
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const edgeUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

  let pendingDrivers: PendingDriverItem[] = [];

  if (token && edgeUrl) {
    try {
      const res = await fetch(
        `${edgeUrl}/functions/v1/api-v1/admin/verifications/drivers`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        },
      );
      if (res.ok) {
        const data = await res.json();
        pendingDrivers = data.drivers || [];
      }
    } catch {}
  }

  async function handleSignOut() {
    "use server";
    const serverSupabase = await createClient();
    await serverSupabase.auth.signOut();
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-slate-900 text-white">
      <nav className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-8 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold text-white tracking-wide">
            Güegüense Admin
          </h1>
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 uppercase">
            {profile?.platform_role ?? "admin"}
          </span>
        </div>

        <form action={handleSignOut}>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition border border-slate-700 cursor-pointer"
          >
            Cerrar Sesión
          </button>
        </form>
      </nav>

      <div className="max-w-6xl mx-auto p-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-1">
            Panel de Operaciones y Seguridad
          </h2>
          <p className="text-slate-400 text-sm">
            Bienvenido, {profile?.full_name ?? user.email}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="p-6 bg-slate-800 rounded-xl border border-slate-700">
            <h3 className="text-sm font-medium text-slate-400 mb-2">
              Identidad Administrativa
            </h3>
            <p className="text-lg font-bold text-white truncate">
              {user.email}
            </p>
            <p className="text-xs text-slate-500 mt-1 font-mono">
              ID: {user.id}
            </p>
          </div>

          <div className="p-6 bg-slate-800 rounded-xl border border-slate-700">
            <h3 className="text-sm font-medium text-slate-400 mb-2">
              Nivel de Seguridad (MFA)
            </h3>
            <p className="text-lg font-bold text-emerald-400">
              {aalData?.currentLevel === "aal2" ? "AAL2 — TOTP Activo" : "AAL1"}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Sesión protegida por dos factores
            </p>
          </div>

          <div className="p-6 bg-slate-800 rounded-xl border border-slate-700">
            <h3 className="text-sm font-medium text-slate-400 mb-2">
              Rol de Plataforma
            </h3>
            <p className="text-lg font-bold text-blue-400 capitalize">
              {profile?.platform_role?.replace("_", " ") ?? "None"}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {platformRole === "verification_agent" ||
              platformRole === "admin" ||
              platformRole === "super_admin"
                ? "Autorizado para gestionar expedientes de conductores"
                : "Solo lectura (Operador)"}
            </p>
          </div>
        </div>

        {/* Verification Queue Section */}
        <div className="bg-slate-800/80 rounded-xl border border-slate-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-white">
                Cola de Verificación de Conductores
              </h3>
              <p className="text-xs text-slate-400">
                Revisión de expedientes legales y documentos a través de api-v1
              </p>
            </div>
            <span className="px-3 py-1 text-xs font-bold rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {pendingDrivers.length} Pendientes
            </span>
          </div>

          {pendingDrivers.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              No hay conductores pendientes de verificación en este momento.
            </div>
          ) : (
            <div className="space-y-4">
              {pendingDrivers.map((drv) => {
                return (
                  <div
                    key={drv.id}
                    className="p-5 bg-slate-900/90 rounded-lg border border-slate-700/80 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-white">
                          Conductor: {drv.id.slice(0, 8)}...
                        </span>
                        <span className="text-xs font-semibold bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">
                          {drv.verification_status}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          {new Date(drv.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <Link
                        href={`/verifications/${drv.id}`}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-lg transition inline-flex items-center gap-1"
                      >
                        Ver Expediente &rarr;
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
