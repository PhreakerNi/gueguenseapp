"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "../../../lib/supabase/client";
import { normalizeAuthError, getAuthErrorMessage } from "@gueguense/domain";

export default function AdminMfaPage() {
  const router = useRouter();

  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function setupMfa() {
      try {
        const supabase = createClient();
        const { data: factorsData, error: factorsError } =
          await supabase.auth.mfa.listFactors();

        if (factorsError) {
          setErrorMessage(
            getAuthErrorMessage(normalizeAuthError(factorsError)),
          );
          setInitializing(false);
          return;
        }

        const totpFactors = factorsData?.totp || [];
        const verifiedFactor = totpFactors.find((f) => f.status === "verified");

        if (verifiedFactor) {
          setFactorId(verifiedFactor.id);
          setIsEnrolling(false);
        } else {
          // Unverified factor or no factors enrolled: initiate enrollment
          setIsEnrolling(true);
          const { data: enrollData, error: enrollError } =
            await supabase.auth.mfa.enroll({
              factorType: "totp",
              issuer: "Gueguense",
            });

          if (enrollError) {
            setErrorMessage(
              getAuthErrorMessage(normalizeAuthError(enrollError)),
            );
          } else if (enrollData) {
            setFactorId(enrollData.id);
            setQrCode(enrollData.totp.qr_code);
            setSecret(enrollData.totp.secret);
          }
        }
      } catch (err) {
        setErrorMessage(getAuthErrorMessage(normalizeAuthError(err)));
      } finally {
        setInitializing(false);
      }
    }

    setupMfa();
  }, []);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId || !code) {
      setErrorMessage(getAuthErrorMessage("AUTH_MFA_INVALID"));
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: code.trim(),
      });

      setLoading(false);

      if (error) {
        setErrorMessage(getAuthErrorMessage(normalizeAuthError(error)));
      } else {
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setLoading(false);
      setErrorMessage(getAuthErrorMessage(normalizeAuthError(err)));
    }
  };

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-900 text-white">
        <div className="animate-pulse">
          Cargando verificación de seguridad...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-900">
      <div className="max-w-md w-full p-8 bg-slate-800 rounded-2xl shadow-xl border border-slate-700">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">
            Autenticación de Dos Factores (MFA)
          </h1>
          <p className="text-slate-400 text-sm">
            {isEnrolling
              ? "Escanea el código QR en tu app de autenticación (Google Authenticator, Authy, etc.)"
              : "Ingresa el código TOTP de 6 dígitos generado por tu app"}
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm text-center">
            {errorMessage}
          </div>
        )}

        {isEnrolling && qrCode && (
          <div className="mb-6 flex flex-col items-center">
            <div className="p-3 bg-white rounded-xl mb-3 shadow-md">
              <Image
                src={qrCode}
                alt="MFA QR Code"
                width={192}
                height={192}
                className="w-48 h-48"
                unoptimized
              />
            </div>
            {secret && (
              <p className="text-xs text-slate-400 text-center select-all">
                Clave manual:{" "}
                <span className="font-mono text-blue-400">{secret}</span>
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Código de Verificación (6 dígitos)
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              className="w-full px-4 py-3 text-center tracking-widest text-2xl font-mono bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="000000"
              autoFocus
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg shadow transition"
          >
            {loading ? "Verificando..." : "Validar y Continuar"}
          </button>
        </form>
      </div>
    </div>
  );
}
