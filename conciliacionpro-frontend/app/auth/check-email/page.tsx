"use client"; // 👈 Corre en el navegador (hooks, window, Supabase cliente).

import Link from "next/link"; // 👈 Navegación interna Next sin recargar.
import { useMemo, useState } from "react"; // 👈 Hooks React.
import { useSearchParams } from "next/navigation"; // 👈 Leer query params (?email=...).
import { supabase } from "@/lib/supabaseClient"; // 👈 Supabase Auth.

/**
 * CheckEmailPage
 * - Pantalla para avisar: “te enviamos un correo de confirmación”
 * - Permite reenviar el email de confirmación (resend)
 * - Muestra email “enmascarado” para privacidad
 */
export default function CheckEmailPage() {
  // Query params de la URL
  const sp = useSearchParams();

  // Email viene en la URL: /auth/check-email?email=...
  // Normalizamos para evitar espacios y mayúsculas
  const email = (sp.get("email") ?? "").trim().toLowerCase();

  // Estado: reenviando?
  const [sending, setSending] = useState(false);

  // Estado: reenvío exitoso?
  const [sentOk, setSentOk] = useState(false);

  // Estado: error visible
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // Helper accesibilidad: Enter o Space ejecuta acción
  // (para links “tipo botón”)
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
  // Enmascarar email para mostrarlo sin exponerlo completo
  // Ej: or****@dominio.com
  // --------------------------------------------------------------------------
  const masked = useMemo(() => {
    // Si no parece email válido, devolvemos tal cual
    if (!email.includes("@")) return email;

    // Separar usuario y dominio
    const [u, d] = email.split("@");

    // “safeU”: dejamos 1 o 2 letras y luego asteriscos
    const safeU = u.length <= 2 ? u[0] + "*" : u.slice(0, 2) + "****";

    // Unimos de nuevo
    return `${safeU}@${d}`;
  }, [email]);

  // --------------------------------------------------------------------------
  // Se puede reenviar?
  // - Debe haber email
  // - No debe estar enviando
  // --------------------------------------------------------------------------
  const canResend = useMemo(() => {
    return !!email && !sending;
  }, [email, sending]);

  // --------------------------------------------------------------------------
  // Acción: reenviar correo de confirmación
  // --------------------------------------------------------------------------
  const resend = async () => {
    // Si no se puede, no hacemos nada
    if (!email || sending) return;

    // Reset de estados
    setErrorMsg(null);
    setSentOk(false);
    setSending(true);

    try {
      // Supabase resend para “signup”
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: {
          // Cuando confirme el correo, vuelve a tu callback
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      // Si Supabase devolvió error, lo lanzamos al catch
      if (error) throw error;

      // Éxito
      setSentOk(true);
    } catch (e: any) {
      // Error visible
      setErrorMsg(e?.message ?? "No pudimos reenviar el correo.");
    } finally {
      // Apaga loading
      setSending(false);
    }
  };

  // --------------------------------------------------------------------------
  // UI
  // --------------------------------------------------------------------------
  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200 shadow-[0_15px_60px_rgba(15,23,42,0.12)]">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] px-6 py-5 text-white">
            <h1 className="text-2xl font-black">Revisa tu correo</h1>
            <p className="mt-1 text-[13px] text-white/85">
              Te enviamos un enlace para confirmar tu cuenta. Al confirmar, te llevaremos al onboarding.
            </p>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            {/* Caja informativa del email */}
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 text-[13px] text-slate-700">
              📩 Enviamos el correo a:{" "}
              <span className="font-extrabold">{masked || "tu email"}</span>
              <div className="mt-2 text-[12px] text-slate-500">
                Tip: revisa <b>Spam</b> / <b>Promociones</b>. A veces tarda 1–2 minutos.
              </div>
            </div>

            {/* Mensaje éxito */}
            {sentOk && (
              <div className="rounded-2xl bg-emerald-50 p-4 text-[12px] text-emerald-900 ring-1 ring-emerald-200">
                ✅ Listo. Te reenviamos el correo.
              </div>
            )}

            {/* Mensaje error */}
            {errorMsg && (
              <div className="rounded-2xl bg-rose-50 p-4 text-[12px] text-rose-900 ring-1 ring-rose-200">
                ⚠️ {errorMsg}
              </div>
            )}

            {/* Botón reenviar */}
            <button
              type="button"
              onClick={resend}
              disabled={!canResend}
              // Enter/Space ya funcionan por defecto en button, lo dejamos por consistencia.
              onKeyDown={onEnterOrSpace(() => {
                resend();
              })}
              className={[
                "h-11 w-full rounded-2xl text-[14px] font-extrabold",
                canResend
                  ? "bg-[#123b63] text-white hover:opacity-95"
                  : "bg-slate-200 text-slate-500 cursor-not-allowed",
              ].join(" ")}
            >
              {sending ? "Reenviando..." : "Reenviar correo"}
            </button>

            {/* Links inferiores */}
            <div className="flex items-center justify-between text-[12px]">
              <Link
                href="/registro-owner"
                className="font-bold text-slate-700 hover:underline"
                role="button"
                tabIndex={0}
                onKeyDown={onEnterOrSpace(() => {
                  window.location.href = "/registro-owner";
                })}
              >
                Cambiar email
              </Link>

              <Link
                href="/"
                className="font-bold text-slate-700 hover:underline"
                role="button"
                tabIndex={0}
                onKeyDown={onEnterOrSpace(() => {
                  window.location.href = "/";
                })}
              >
                Volver al inicio
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
