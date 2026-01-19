"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const can = password.length >= 8 && password === password2;

  const onUpdate = async () => {
    if (!can) return;

    setErrorMsg(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setOk(true);
      // opcional: mandar al onboarding o login
      setTimeout(() => router.push("/login"), 800);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "No pudimos actualizar la contraseña.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 grid place-items-center px-4">
      <div className="max-w-md w-full rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-[0_15px_60px_rgba(15,23,42,0.12)]">
        <div className="text-[12px] font-extrabold tracking-wide text-slate-700 uppercase">
          Nueva contraseña
        </div>
        <h1 className="mt-2 text-xl font-black text-slate-900">Crea tu contraseña nueva</h1>

        {ok && (
          <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-[12px] text-emerald-900 ring-1 ring-emerald-200">
            ✅ Contraseña actualizada. Redirigiendo al login...
          </div>
        )}

        {errorMsg && (
          <div className="mt-4 rounded-2xl bg-rose-50 p-4 text-[12px] text-rose-900 ring-1 ring-rose-200">
            ⚠️ {errorMsg}
          </div>
        )}

        <div className="mt-4 space-y-3">
          <Field label="Nueva contraseña (mínimo 8 caracteres)">
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
              type="password"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] outline-none focus:ring-4 focus:ring-slate-200"
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </Field>

          <div className="rounded-2xl bg-slate-50 p-3 text-[12px] text-slate-700 ring-1 ring-slate-200">
            <div className="font-bold">Requisitos:</div>
            <ul className="mt-1 space-y-1">
              <li>{password.length >= 8 ? "✅" : "⬜"} 8+ caracteres</li>
              <li>{password && password === password2 ? "✅" : "⬜"} contraseñas iguales</li>
            </ul>
          </div>

          <button
            type="button"
            disabled={!can || loading || ok}
            onClick={onUpdate}
            className={[
              "h-11 w-full rounded-2xl text-[14px] font-extrabold",
              can && !loading && !ok
                ? "bg-[#123b63] text-white hover:opacity-95"
                : "bg-slate-200 text-slate-500 cursor-not-allowed",
            ].join(" ")}
          >
            {loading ? "Guardando..." : "Guardar contraseña"}
          </button>

          <Link href="/login" className="block text-center text-[12px] font-bold text-slate-700 hover:underline">
            Volver al login
          </Link>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[12px] font-extrabold tracking-wide text-slate-700 uppercase">{label}</div>
      {children}
    </div>
  );
}
