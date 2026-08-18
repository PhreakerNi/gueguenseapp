"use client";

import React, { useState } from "react";
import Link from "next/link";
import { createClient } from "../../../lib/supabase/client";
import { normalizeAuthError, getAuthErrorMessage } from "@gueguense/domain";

export default function AdminForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setErrorMessage("Por favor ingresa tu correo institucional.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        },
      );

      setLoading(false);

      if (error) {
        setErrorMessage(getAuthErrorMessage(normalizeAuthError(error)));
      } else {
        setSuccessMessage(
          "Se ha enviado un enlace para restablecer tu contraseña a tu correo.",
        );
      }
    } catch (err) {
      setLoading(false);
      setErrorMessage(getAuthErrorMessage(normalizeAuthError(err)));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-900">
      <div className="max-w-md w-full p-8 bg-slate-800 rounded-2xl shadow-xl border border-slate-700">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">
            Recuperar Contraseña
          </h1>
          <p className="text-slate-400 text-sm">
            Ingresa tu correo para recibir instrucciones
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm text-center">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="mb-6 p-4 bg-green-900/50 border border-green-700 rounded-lg text-green-200 text-sm text-center">
            {successMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Correo Institucional
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="admin@gueguense.com"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg shadow transition"
          >
            {loading ? "Enviando..." : "Enviar Instrucciones"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link
            href="/login"
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            Volver a Iniciar Sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
