"use client"; // 👈 Necesario: usa hooks, window y Supabase en cliente.

import { useState } from "react"; // 👈 Estado local.
import { useRouter } from "next/navigation"; // 👈 Navegación programática.
import Link from "next/link"; // 👈 Links Next sin recarga.
import { supabase } from "@/lib/supabaseClient"; // 👈 Supabase Auth.

/**
 * ResetPasswordPage
 * - Pantalla donde el usuario define una contraseña nueva
 * - Llega aquí desde el enlace del correo de recuperación
 * - Al guardar:
 *   - updateUser({ password })
 *   - muestra OK
 *   - redirige a /login
 */
export default function ResetPasswordPage() {
  const router = useRouter();

  // ------------------------------
  // Estados de formulario
  // ------------------------------
  const [password, setPassword] = useState(""); // nueva contraseña
  const [password2, setPassword2] = useState(""); // repetir contraseña

  // ------------------------------
  // Estados de UI
  // ------------------------------
  const [loading, setLoading] = useState(false); // bloquea botón
  const [errorMsg, setErrorMsg] = useState<string | null>(null); // error visible
  const [ok, setOk] = useState(false); // éxito (ya se actualizó)

  // --------------------------------------------------------------------------
  // Helper accesibilidad: Enter o Space ejecuta acción
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
  // Validaciones del formulario
  // - 8+ caracteres
  // - contraseñas iguales
  // - no loading
  // - no ok (evita reintentos tras éxito)
  // --------------------------------------------------------------------------
  const canSubmit =
    password.length >= 8 &&
    password === password2 &&
    !loading &&
    !ok;

  // --------------------------------------------------------------------------
  // Acción: actualizar contraseña en Supabase
  // --------------------------------------------------------------------------
  const onUpdate = async () => {
    // Si no cumple validaciones, no hacemos nada
    if (!canSubmit) return;

    // Limpia errores previos y activa loading
    setErrorMsg(null);
    setLoading(true);

    try {
      // Actualiza la contraseña del usuario actual (session activa)
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // Éxito
      setOk(true);

      // Redirección suave al login (opcional)
      setTimeout(() => router.push("/login"), 800);
    } catch (e: any) {
      // Error visible
      setErrorMsg(e?.message ?? "No pudimos actualizar la contraseña.");
    } finally {
      // Apaga loading
      setLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // Enter en inputs => Guardar contraseña
  // --------------------------------------------------------------------------
  const onKeyDownSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onUpdate();
    }
  };

  // --------------------------------------------------------------------------
  // UI
  // --------------------------------------------------------------------------
  return (
    <main className="min-h-screen bg-slate-100 grid place-items-center px-4">
      <div className="max-w-md w-full rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-[0_15px_60px_rgba(15,23,42,0.12)]">
        {/* Encabezado */}
        <div className="text-[12px] font-extrabold tracking-wide text-slate-700 uppercase">
          Nueva contraseña
        </div>
        <h1 className="mt-2 text-xl font-black text-slate-900">
          Crea tu contraseña nueva
        </h1>

        {/* Mensaje éxito */}
        {ok && (
          <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-[12px] text-emerald-900 ring-1 ring-emerald-200">
            ✅ Contraseña actualizada. Redirigiendo al login...
          </div>
        )}

        {/* Mensaje error */}
        {errorMsg && (
          <div className="mt-4 rounded-2xl bg-rose-50 p-4 text-[12px] text-rose-900 ring-1 ring-rose-200">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Formulario */}
        <div className="mt-4 space-y-3">
          <Field label="Nueva contraseña (mínimo 8 caracteres)">
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={onKeyDownSubmit} // 👈 Enter = guardar
              type="password"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] outline-none focus:ring-4 focus:ring-slate-200"
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </Field>

          <Field label="Repite la contraseña">
            <input
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              onKeyDown={onKeyDownSubmit} // 👈 Enter = guardar
              type="password"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] outline-none focus:ring-4 focus:ring-slate-200"
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </Field>

          {/* Checklist visual */}
          <div className="rounded-2xl bg-slate-50 p-3 text-[12px] text-slate-700 ring-1 ring-slate-200">
            <div className="font-bold">Requisitos:</div>
            <ul className="mt-1 space-y-1">
              <li>{password.length >= 8 ? "✅" : "⬜"} 8+ caracteres</li>
              <li>{password && password === password2 ? "✅" : "⬜"} contraseñas iguales</li>
            </ul>
          </div>

          {/* Botón guardar */}
          <button
            type="button"
            disabled={!canSubmit}
            onClick={onUpdate}
            // Enter/Space funcionan nativo, lo dejamos por consistencia
            onKeyDown={onEnterOrSpace(() => {
              onUpdate();
            })}
            className={[
              "h-11 w-full rounded-2xl text-[14px] font-extrabold",
              canSubmit
                ? "bg-[#123b63] text-white hover:opacity-95"
                : "bg-slate-200 text-slate-500 cursor-not-allowed",
            ].join(" ")}
          >
            {loading ? "Guardando..." : "Guardar contraseña"}
          </button>

          {/* Link volver */}
          <Link
            href="/login"
            className="block text-center text-[12px] font-bold text-slate-700 hover:underline"
            role="button"
            tabIndex={0}
            onKeyDown={onEnterOrSpace(() => {
              router.push("/login");
            })}
          >
            Volver al login
          </Link>
        </div>
      </div>
    </main>
  );
}

/**
 * Field
 * - Wrapper simple para label + input
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[12px] font-extrabold tracking-wide text-slate-700 uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}
