import React from "react";
import { redirect } from "next/navigation";
import { createClient } from "../lib/supabase/server";
import type { PlatformRole } from "@gueguense/types";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

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

  const { data: aalData } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

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
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition border border-slate-700"
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
              Acceso asignado por política interna
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
