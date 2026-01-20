"use client"; // 👈 Este componente corre en el navegador (hooks + window).

import Link from "next/link"; // 👈 Navegación interna de Next sin recargar.
import { useEffect, useMemo, useState } from "react"; // 👈 Hooks React.
import { useSearchParams } from "next/navigation"; // 👈 Leer query params (?email=...).
import { supabase } from "@/lib/supabaseClient"; // 👈 Cliente Supabase Auth.

/**
 * RecuperarPage
 * - Envía correo de recuperación de contraseña usando Supabase Auth
 * - Si viene ?email=... pre-llenamos el input
 * - Enter en el input dispara el envío
 */
export default function RecuperarPage() {
  // Query params de la URL (por ejemplo: /recuperar?email=algo@correo.com)
  const sp = useSearchParams();

  // Email que escribe el usuario
  const [email, setEmail] = useState("");

  // Estado de carga (para bloquear el botón y mostrar “Enviando...”)
  const [loading, setLoading] = useState(false);

  // Flag: se envió correctamente
  const [sentOk, setSentOk] = useState(false);

  // Mensaje de error visible en la UI
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
  // Al montar la página, si hay ?email=... lo seteamos en el input
  // --------------------------------------------------------------------------
  useEffect(() => {
    const qEmail = sp.get("email"); // lee el parámetro "email"
    if (qEmail) setEmail(qEmail); // si existe, pre-llenamos el input
  }, [sp]);

  // --------------------------------------------------------------------------
  // Normalizamos el email para evitar errores por espacios/mayúsculas
  // --------------------------------------------------------------------------
  const emailNorm = useMemo(() => email.trim().toLowerCase(), [email]);

  // --------------------------------------------------------------------------
  // canSubmit = se puede enviar?
  // - Debe haber email
  // - No debe estar cargando
  // --------------------------------------------------------------------------
  const canSubmit = useMemo(() => {
    return !!emailNorm && !loading;
  }, [emailNorm, loading]);

  // --------------------------------------------------------------------------
  // Acción: enviar correo de recuperación
  // --------------------------------------------------------------------------
  const onSend = async () => {
    // Si no se puede enviar, no hacemos nada
    if (!canSubmit) return;

    // Limpia estados previos
    setErrorMsg(null); // borra error anterior
    setSentOk(false); // resetea mensaje de éxito
    setLoading(true); // activa loading

    try {
      // Llama a Supabase para enviar el correo de reset
      const { error } = await supabase.auth.resetPasswordForEmail(emailNorm, {
        // A dónde vuelve el usuario cuando hace click en el enlace del correo
        // (Debe existir esa ruta en tu app)
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      // Si Supabase devuelve error, lo lanzamos al catch
      if (error) throw error;

      // Éxito: mostramos mensaje “Revisa tu correo”
      setSentOk(true);
    } catch (e: any) {
      // Error: mostramos mensaje
      setErrorMsg(e?.message ?? "No pudimos enviar el correo.");
    } finally {
      // Siempre: apagamos loading
      setLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // Enter en el input => enviar
  // --------------------------------------------------------------------------
  const onKeyDownSend = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSend();
    }
  };

  // --------------------------------------------------------------------------
  // UI
  // --------------------------------------------------------------------------
  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-xl px-4 py-10">
        {/* Volver al login */}
        <Link
          href="/login"
          className="text-[13px] font-bold text-slate-700 hover:underline"
          role="button"
          tabIndex={0}
          onKeyDown={onEnterOrSpace(() => {
            window.location.href = "/login";
          })}
        >
          ← Volver al login
        </Link>

        {/* Card contenedora */}
        <div className="mt-4 overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200 shadow-[0_15px_60px_rgba(15,23,42,0.12)]">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] px-6 py-5 text-white">
            <h1 className="text-2xl font-black">Recuperar contraseña</h1>
            <p className="mt-1 text-[13px] text-white/85">
              Te enviaremos un enlace para crear una contraseña nueva.
            </p>
          </div>

          {/* Contenido */}
          <div className="p-6 space-y-4">
            {/* Mensaje éxito */}
            {sentOk && (
              <div className="rounded-2xl bg-emerald-50 p-4 text-[12px] text-emerald-900 ring-1 ring-emerald-200">
                ✅ Listo. Revisa tu correo (y spam). Abre el enlace para crear una contraseña nueva.
              </div>
            )}

            {/* Mensaje error */}
            {errorMsg && (
              <div className="rounded-2xl bg-rose-50 p-4 text-[12px] text-rose-900 ring-1 ring-rose-200">
                ⚠️ {errorMsg}
              </div>
            )}

            {/* Input de email */}
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <Field label="Email">
                <input
                  value={email} // muestra el estado
                  onChange={(e) => setEmail(e.target.value)} // actualiza estado
                  onKeyDown={onKeyDownSend} // 👈 Enter = enviar
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] outline-none focus:ring-4 focus:ring-slate-200"
                  placeholder="Ej: orlando@email.com"
                  autoComplete="email"
                  inputMode="email"
                />
              </Field>
            </div>

            {/* Botón enviar */}
            <button
              type="button"
              disabled={!canSubmit}
              onClick={onSend}
              // Enter/Space ya funcionan nativo en button,
              // pero lo dejamos explícito para consistencia con tu patrón.
              onKeyDown={onEnterOrSpace(() => {
                onSend();
              })}
              className={[
                "h-11 w-full rounded-2xl text-[14px] font-extrabold",
                canSubmit ? "bg-[#123b63] text-white hover:opacity-95" : "bg-slate-200 text-slate-500 cursor-not-allowed",
              ].join(" ")}
            >
              {loading ? "Enviando..." : "Enviar enlace"}
            </button>

            {/* Nota */}
            <div className="text-[12px] text-slate-500">
              Si no te llega, espera 1 minuto y vuelve a intentar.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

/**
 * Field
 * - Wrapper simple para label + contenido (input)
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[12px] font-extrabold tracking-wide text-slate-700 uppercase">{label}</div>
      {children}
    </div>
  );
}
