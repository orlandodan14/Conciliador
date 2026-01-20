"use client"; // 👈 Corre en el navegador: hooks + Supabase auth client + router.

import { useMemo, useState } from "react"; // 👈 Hooks React.
import { useRouter, useSearchParams } from "next/navigation"; // 👈 Router + query params.
import { supabase } from "@/lib/supabaseClient"; // 👈 Supabase Auth + RPC.

/**
 * SetPasswordPage
 * - Flujo para invitados:
 *   1) El usuario llega con ?invite_token=...
 *   2) Define contraseña
 *   3) Se asegura que exista sesión
 *   4) Actualiza password
 *   5) Ejecuta RPC accept_team_invite (crea/actualiza relaciones)
 *   6) Entra al selector de empresa
 */
export default function SetPasswordPage() {
  // Router para redireccionar (replace evita que el usuario vuelva atrás al paso anterior)
  const router = useRouter();

  // Query params de la URL
  const sp = useSearchParams();

  // Token de invitación
  const inviteToken = sp.get("invite_token");

  // ------------------------------
  // Estados de formulario
  // ------------------------------
  const [p1, setP1] = useState(""); // contraseña
  const [p2, setP2] = useState(""); // repetir contraseña

  // ------------------------------
  // Estados de UI
  // ------------------------------
  const [loading, setLoading] = useState(false); // bloquea el botón
  const [err, setErr] = useState<string | null>(null); // error visible

  // --------------------------------------------------------------------------
  // Helper accesibilidad: Enter o Space ejecuta una acción
  // --------------------------------------------------------------------------
  const onEnterOrSpace =
    (action: () => void) =>
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        action();
      }
    };

  // --------------------------------------------------------------------------
  // Validación del formulario:
  // - Debe existir inviteToken (si no, no hay nada que aceptar)
  // - p1 mínimo 8
  // - p1 == p2
  // - no loading (evita doble submit)
  // --------------------------------------------------------------------------
  const canSubmit = useMemo(() => {
    if (!inviteToken) return false;
    if (!p1 || p1.length < 8) return false;
    if (p1 !== p2) return false;
    if (loading) return false;
    return true;
  }, [inviteToken, p1, p2, loading]);

  // --------------------------------------------------------------------------
  // Acción: guardar contraseña + aceptar invitación + entrar
  // --------------------------------------------------------------------------
  const onSave = async () => {
    // Si no cumple requisitos, no hacemos nada
    if (!canSubmit) return;

    // Limpia error previo y activa loading
    setErr(null);
    setLoading(true);

    try {
      // 1) Asegurar que exista sesión (el link de invitación normalmente crea sesión)
      const { data: sess } = await supabase.auth.getSession();

      // Si no hay sesión activa, no puede actualizar password ni aceptar invite
      if (!sess.session) {
        setErr("No hay sesión activa. Abre nuevamente el correo de invitación.");
        return;
      }

      // 2) Setear/actualizar contraseña del usuario logueado
      const { error: passErr } = await supabase.auth.updateUser({ password: p1 });
      if (passErr) {
        setErr(passErr.message);
        return;
      }

      // 3) Aceptar invitación:
      // - crea company_members
      // - actualiza profiles si aplica
      // - borra team_invites
      // (según tu función accept_team_invite)
      const { error: accErr } = await supabase.rpc("accept_team_invite", { p_token: inviteToken });
      if (accErr) {
        setErr(accErr.message);
        return;
      }

      // 4) Enviar al selector de empresa (dashboard / siguiente paso)
      router.replace("/onboarding/select-company");
    } finally {
      // Siempre apagamos loading (incluso si hubo returns antes)
      setLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // Enter en inputs => Guardar y entrar
  // --------------------------------------------------------------------------
  const onKeyDownSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSave();
    }
  };

  // --------------------------------------------------------------------------
  // UI
  // --------------------------------------------------------------------------
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-[0_15px_60px_rgba(15,23,42,0.12)]">
        <div className="text-[12px] font-extrabold tracking-wide text-slate-700 uppercase">
          Invitación
        </div>

        <h1 className="mt-2 text-xl font-black text-slate-900">Crea tu contraseña</h1>

        <p className="mt-2 text-[13px] text-slate-600">
          Define una contraseña para tu cuenta y entra al dashboard.
        </p>

        {/* Si falta token, lo avisamos (no rompe nada, solo guía) */}
        {!inviteToken && (
          <div className="mt-4 rounded-2xl bg-rose-50 p-3 text-[12px] text-rose-900 ring-1 ring-rose-200">
            ⚠️ Falta el token de invitación. Abre nuevamente el correo de invitación y usa ese enlace.
          </div>
        )}

        {/* Error normal */}
        {err && (
          <div className="mt-4 rounded-2xl bg-rose-50 p-3 text-[12px] text-rose-900 ring-1 ring-rose-200">
            ⚠️ {err}
          </div>
        )}

        {/* Inputs */}
        <div className="mt-5 space-y-3">
          <div>
            <div className="mb-1 text-[12px] font-extrabold tracking-wide text-slate-700 uppercase">
              Contraseña (8+ caracteres)
            </div>
            <input
              type="password"
              value={p1}
              onChange={(e) => setP1(e.target.value)}
              onKeyDown={onKeyDownSubmit} // 👈 Enter = guardar
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] outline-none focus:ring-4 focus:ring-slate-200"
            />
          </div>

          <div>
            <div className="mb-1 text-[12px] font-extrabold tracking-wide text-slate-700 uppercase">
              Repite contraseña
            </div>
            <input
              type="password"
              value={p2}
              onChange={(e) => setP2(e.target.value)}
              onKeyDown={onKeyDownSubmit} // 👈 Enter = guardar
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] outline-none focus:ring-4 focus:ring-slate-200"
            />
          </div>
        </div>

        {/* Botón */}
        <button
          type="button"
          onClick={onSave}
          disabled={!canSubmit}
          // Enter/Space funcionan nativo en button, lo dejamos por consistencia
          onKeyDown={onEnterOrSpace(() => {
            onSave();
          })}
          className={[
            "mt-5 h-11 w-full rounded-2xl text-[14px] font-extrabold",
            canSubmit
              ? "bg-[#123b63] text-white hover:opacity-95 cursor-pointer"
              : "bg-slate-200 text-slate-500 cursor-not-allowed",
          ].join(" ")}
        >
          {loading ? "Guardando..." : "Guardar y entrar →"}
        </button>
      </div>
    </main>
  );
}

