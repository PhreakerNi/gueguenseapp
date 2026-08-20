import React from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../../lib/supabase/server";
import type { PlatformRole } from "@gueguense/types";

export const dynamic = "force-dynamic";

const CAN_VERIFY_ROLES: PlatformRole[] = [
  "super_admin",
  "admin",
  "verification_agent",
];

type DriverDocument = {
  id: string;
  driver_id: string;
  document_type: string;
  storage_path: string;
  file_size_bytes: number;
  mime_type: string;
  verification_status: string;
  rejection_reason: string | null;
  created_at: string;
};

type Vehicle = {
  id: string;
  driver_id: string;
  make: string;
  model: string;
  year: number;
  color: string;
  license_plate: string;
};

type DriverDetail = {
  id: string;
  user_id: string;
  national_id_number: string | null;
  license_number: string | null;
  verification_status: string;
  account_status: string;
  created_at: string;
};

export default async function DriverVerificationDetailPage({
  params,
}: {
  params: Promise<{ driverId: string }>;
}) {
  const { driverId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Server-side validation of platform_role
  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("platform_role, full_name")
    .eq("id", user.id)
    .single();

  const profile = rawProfile as {
    platform_role: PlatformRole;
    full_name: string | null;
  } | null;

  const platformRole = profile?.platform_role ?? "none";
  if (!CAN_VERIFY_ROLES.includes(platformRole)) {
    redirect("/?error=AUTH_ADMIN_ROLE_REQUIRED");
  }

  // Server-side validation of MFA AAL2
  const { data: aalData } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aalData?.currentLevel !== "aal2") {
    redirect("/mfa");
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const edgeUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

  let driver: DriverDetail | null = null;
  let vehicle: Vehicle | null = null;
  let documents: DriverDocument[] = [];
  let fetchError: string | null = null;

  if (token && edgeUrl) {
    try {
      const res = await fetch(
        `${edgeUrl}/functions/v1/api-v1/admin/verifications/drivers/${driverId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        },
      );
      if (res.ok) {
        const data = await res.json();
        driver = data.driver;
        vehicle = data.vehicle;
        documents = data.documents || [];
      } else {
        const err = await res.json().catch(() => ({}));
        fetchError =
          err.error?.message || "No se pudo cargar el detalle del conductor.";
      }
    } catch {
      fetchError = "Error de red al consultar el expediente.";
    }
  }

  async function handleApprove() {
    "use server";
    const serverSupabase = await createClient();
    const { data: sData } = await serverSupabase.auth.getSession();
    const authToken = sData.session?.access_token;
    const sEdgeUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

    if (!authToken) redirect("/login");
    if (!sEdgeUrl) throw new Error("Configuración de servidor no disponible");

    const idempotencyKey = crypto.randomUUID();
    const res = await fetch(
      `${sEdgeUrl}/functions/v1/api-v1/admin/drivers/${driverId}/approve`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({}),
      },
    );

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || "Error al aprobar conductor");
    }

    redirect("/");
  }

  async function handleReject(formData: FormData) {
    "use server";
    const reason = formData.get("reason") as string;
    if (!reason || !reason.trim()) {
      throw new Error("Motivo de rechazo requerido");
    }

    const serverSupabase = await createClient();
    const { data: sData } = await serverSupabase.auth.getSession();
    const authToken = sData.session?.access_token;
    const sEdgeUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

    if (!authToken) redirect("/login");
    if (!sEdgeUrl) throw new Error("Configuración de servidor no disponible");

    const idempotencyKey = crypto.randomUUID();
    const res = await fetch(
      `${sEdgeUrl}/functions/v1/api-v1/admin/drivers/${driverId}/reject`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ rejection_reason: reason.trim() }),
      },
    );

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || "Error al rechazar conductor");
    }

    redirect("/");
  }

  if (fetchError || !driver) {
    return (
      <main className="min-h-screen bg-neutral-900 text-neutral-100 p-8">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/"
            className="text-amber-500 hover:text-amber-400 mb-6 inline-block text-sm"
          >
            &larr; Volver al Panel
          </Link>
          <div className="bg-red-950/40 border border-red-800/60 rounded-xl p-6 text-red-200">
            <h2 className="text-xl font-bold mb-2">Error de Carga</h2>
            <p>{fetchError || "El conductor no existe o no está accesible."}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-900 text-neutral-100 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <Link
              href="/"
              className="text-amber-500 hover:text-amber-400 text-sm mb-2 inline-block"
            >
              &larr; Volver a Cola de Verificación
            </Link>
            <h1 className="text-3xl font-bold text-neutral-50">
              Dossier de Verificación
            </h1>
            <p className="text-sm text-neutral-400 mt-1">
              Driver ID: <code className="text-neutral-300">{driver.id}</code>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 text-xs font-semibold rounded-full ${
                driver.verification_status === "VERIFIED"
                  ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800"
                  : driver.verification_status === "REJECTED"
                    ? "bg-red-950/60 text-red-400 border border-red-800"
                    : "bg-amber-950/60 text-amber-400 border border-amber-800"
              }`}
            >
              {driver.verification_status}
            </span>
          </div>
        </div>

        {/* Driver Details Card */}
        <section className="bg-neutral-800/80 border border-neutral-700/60 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-neutral-200">
            Información del Conductor
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-neutral-400">Cédula de Identidad:</span>
              <p className="font-mono text-neutral-100 font-medium mt-0.5">
                {driver.national_id_number || "No registrado"}
              </p>
            </div>
            <div>
              <span className="text-neutral-400">Licencia de Conducir:</span>
              <p className="font-mono text-neutral-100 font-medium mt-0.5">
                {driver.license_number || "No registrado"}
              </p>
            </div>
            <div>
              <span className="text-neutral-400">Estado de Cuenta:</span>
              <p className="text-neutral-100 font-medium mt-0.5">
                {driver.account_status}
              </p>
            </div>
            <div>
              <span className="text-neutral-400">Fecha de Registro:</span>
              <p className="text-neutral-100 font-medium mt-0.5">
                {new Date(driver.created_at).toLocaleString()}
              </p>
            </div>
          </div>
        </section>

        {/* Vehicle Information */}
        <section className="bg-neutral-800/80 border border-neutral-700/60 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-neutral-200">
            Vehículo Registrado
          </h2>
          {vehicle ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-neutral-400">Marca / Modelo:</span>
                <p className="text-neutral-100 font-medium mt-0.5">
                  {vehicle.make} {vehicle.model} ({vehicle.year})
                </p>
              </div>
              <div>
                <span className="text-neutral-400">Color:</span>
                <p className="text-neutral-100 font-medium mt-0.5">
                  {vehicle.color}
                </p>
              </div>
              <div>
                <span className="text-neutral-400">Placa:</span>
                <p className="font-mono text-neutral-100 font-medium mt-0.5">
                  {vehicle.license_plate}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutral-400 italic">
              No hay vehículos registrados para este conductor.
            </p>
          )}
        </section>

        {/* Documents Dossier */}
        <section className="bg-neutral-800/80 border border-neutral-700/60 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-neutral-200">
            Documentos del Expediente ({documents.length})
          </h2>
          {documents.length > 0 ? (
            <div className="divide-y divide-neutral-700/60">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="py-4 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-neutral-100">
                        {doc.document_type}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-[11px] font-semibold rounded ${
                          doc.verification_status === "VERIFIED"
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                            : doc.verification_status === "REJECTED"
                              ? "bg-red-950 text-red-400 border border-red-800"
                              : "bg-amber-950 text-amber-400 border border-amber-800"
                        }`}
                      >
                        {doc.verification_status}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400 mt-1">
                      MIME: {doc.mime_type} | Tamaño:{" "}
                      {Math.round(doc.file_size_bytes / 1024)} KB | Subido:{" "}
                      {new Date(doc.created_at).toLocaleString()}
                    </p>
                    {doc.rejection_reason && (
                      <p className="text-xs text-red-400 mt-1">
                        Motivo de rechazo: {doc.rejection_reason}
                      </p>
                    )}
                  </div>
                  <a
                    href={`/api/documents/${doc.id}/read`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="px-3 py-1.5 text-xs font-medium bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded-lg transition-colors inline-flex items-center gap-1.5 self-start md:self-auto"
                  >
                    Ver Documento (Firmado)
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-400 italic">
              No hay documentos cargados en el expediente.
            </p>
          )}
        </section>

        {/* Actions (Approve / Reject) */}
        {driver.verification_status !== "VERIFIED" && (
          <section className="bg-neutral-800/80 border border-neutral-700/60 rounded-xl p-6 space-y-6">
            <h2 className="text-lg font-semibold text-neutral-200">
              Decisión de Verificación
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Approve Form */}
              <form action={handleApprove} className="space-y-3">
                <p className="text-sm text-neutral-400">
                  Al aprobar, el conductor pasará a estado{" "}
                  <strong>VERIFIED</strong> y su cuenta se activará
                  inmediatamente en presencia OFFLINE.
                </p>
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 font-semibold text-white rounded-lg transition-colors text-sm"
                >
                  Aprobar Conductor
                </button>
              </form>

              {/* Reject Form */}
              <form action={handleReject} className="space-y-3">
                <label className="block text-sm text-neutral-400">
                  Motivo de Rechazo:
                  <textarea
                    name="reason"
                    rows={2}
                    required
                    placeholder="Ej. Cédula ilegible o vencida"
                    className="w-full mt-1.5 px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-sm text-neutral-100 focus:outline-none focus:border-amber-500 resize-none"
                  />
                </label>
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-red-700 hover:bg-red-600 font-semibold text-white rounded-lg transition-colors text-sm"
                >
                  Rechazar Conductor
                </button>
              </form>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
