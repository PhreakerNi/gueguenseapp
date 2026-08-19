import React from "react";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "../lib/supabase/server";
import type { PlatformRole } from "@gueguense/types";

export const dynamic = "force-dynamic";

const ADMIN_ALLOWED_ROLES: PlatformRole[] = [
  "super_admin",
  "admin",
  "operator",
  "verification_agent",
];

const CAN_VERIFY_ROLES: PlatformRole[] = [
  "super_admin",
  "admin",
  "verification_agent",
];

type PendingDriverItem = {
  id: string;
  verification_status: string;
  account_status: string;
  national_id_number: string | null;
  license_number: string | null;
  created_at: string;
  profiles: {
    full_name: string | null;
    phone: string | null;
  } | null;
  vehicles: Array<{
    make: string;
    model: string;
    year: number;
    color: string;
    license_plate: string;
  }> | null;
  driver_documents: Array<{
    id: string;
    document_type: string;
    storage_path: string;
    verification_status: string;
  }> | null;
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

  // Fetch pending drivers for verification queue
  const { data: rawPendingDrivers } = await supabase
    .from("drivers")
    .select(
      `
      id,
      verification_status,
      account_status,
      national_id_number,
      license_number,
      created_at,
      profiles:id (
        full_name,
        phone
      ),
      vehicles (
        make,
        model,
        year,
        color,
        license_plate
      ),
      driver_documents (
        id,
        document_type,
        storage_path,
        verification_status
      )
    `,
    )
    .in("verification_status", ["PENDING", "UNDER_REVIEW"])
    .order("created_at", { ascending: true });

  const pendingDrivers =
    (rawPendingDrivers as unknown as PendingDriverItem[]) ?? [];
  const canVerify = CAN_VERIFY_ROLES.includes(platformRole);

  async function handleSignOut() {
    "use server";
    const serverSupabase = await createClient();
    await serverSupabase.auth.signOut();
    redirect("/login");
  }

  async function handleVerifyDriver(formData: FormData) {
    "use server";
    const driverId = formData.get("driverId") as string;
    const decision = formData.get("decision") as string;
    const rejectionReason = formData.get("rejectionReason") as string | null;

    if (!driverId || !decision) return;

    const serverSupabase = await createClient();
    const rpcParams: {
      p_driver_id: string;
      p_decision: string;
      p_rejection_reason?: string;
    } = {
      p_driver_id: driverId,
      p_decision: decision,
    };
    if (rejectionReason) {
      rpcParams.p_rejection_reason = rejectionReason;
    }

    await (
      serverSupabase.rpc as unknown as (
        fn: string,
        args?: Record<string, unknown>,
      ) => Promise<unknown>
    )("admin_verify_driver", rpcParams);

    revalidatePath("/");
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
              {canVerify
                ? "Autorizado para aprobar conductores"
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
                Revisión de expedientes legales, documentos y motocicletas
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
                const vehicle = drv.vehicles?.[0];
                const profileInfo = drv.profiles;
                return (
                  <div
                    key={drv.id}
                    className="p-5 bg-slate-900/90 rounded-lg border border-slate-700/80 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-white">
                          {profileInfo?.full_name ?? "Conductor"}
                        </span>
                        <span className="text-xs font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                          Cédula: {drv.national_id_number}
                        </span>
                        <span className="text-xs font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                          Licencia: {drv.license_number}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        Vehículo: {vehicle?.make} {vehicle?.model} (
                        {vehicle?.year}) • Color: {vehicle?.color} • Placa:{" "}
                        {vehicle?.license_plate}
                      </p>
                      <p className="text-xs text-slate-500">
                        Documentos adjuntos: {drv.driver_documents?.length ?? 0}
                      </p>
                    </div>

                    {canVerify ? (
                      <div className="flex items-center space-x-3">
                        <form action={handleVerifyDriver}>
                          <input type="hidden" name="driverId" value={drv.id} />
                          <input
                            type="hidden"
                            name="decision"
                            value="APPROVE"
                          />
                          <button
                            type="submit"
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                          >
                            Aprobar
                          </button>
                        </form>

                        <form
                          action={handleVerifyDriver}
                          className="flex items-center space-x-2"
                        >
                          <input type="hidden" name="driverId" value={drv.id} />
                          <input type="hidden" name="decision" value="REJECT" />
                          <input
                            type="text"
                            name="rejectionReason"
                            placeholder="Motivo de rechazo"
                            defaultValue="Documentos ilegibles"
                            required
                            className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white placeholder-slate-500"
                          />
                          <button
                            type="submit"
                            className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                          >
                            Rechazar
                          </button>
                        </form>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 italic">
                        Aprobación restringida a verification_agent
                      </span>
                    )}
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
