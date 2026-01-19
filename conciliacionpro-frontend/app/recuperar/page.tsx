"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function RecuperarPage() {
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentOk, setSentOk] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const qEmail = sp.get("email");
    if (qEmail) setEmail(qEmail);
  }, [sp]);

  const onSend = async () => {
    setErrorMsg(null);
    setSentOk(false);
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (error) throw error;

      setSentOk(true);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "No pudimos enviar el correo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-xl px-4 py-10">
        <Link href="/login" className="text-[13px] font-bold text-slate-700 hover:underline">
          ← Volver al login
        </Link>

        <div className="mt-4 overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200 shadow-[0_15px_60px_rgba(15,23,42,0.12)]">
          <div className="bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] px-6 py-5 text-white">
            <h1 className="text-2xl font-black">Recuperar contraseña</h1>
            <p className="mt-1 text-[13px] text-white/85">
              Te enviaremos un enlace para crear una contraseña nueva.
            </p>
          </div>

          <div className="p-6 space-y-4">
            {sentOk && (
              <div className="rounded-2xl bg-emerald-50 p-4 text-[12px] text-emerald-900 ring-1 ring-emerald-200">
                ✅ Listo. Revisa tu correo (y spam). Abre el enlace para crear una contraseña nueva.
              </div>
            )}

            {errorMsg && (
              <div className="rounded-2xl bg-rose-50 p-4 text-[12px] text-rose-900 ring-1 ring-rose-200">
                ⚠️ {errorMsg}
              </div>
            )}

            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <Field label="Email">
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] outline-none focus:ring-4 focus:ring-slate-200"
                  placeholder="Ej: orlando@email.com"
                  autoComplete="email"
                  inputMode="email"
                />
              </Field>
            </div>

            <button
              type="button"
              disabled={!email || loading}
              onClick={onSend}
              className={[
                "h-11 w-full rounded-2xl text-[14px] font-extrabold",
                email && !loading
                  ? "bg-[#123b63] text-white hover:opacity-95"
                  : "bg-slate-200 text-slate-500 cursor-not-allowed",
              ].join(" ")}
            >
              {loading ? "Enviando..." : "Enviar enlace"}
            </button>

            <div className="text-[12px] text-slate-500">
              Si no te llega, espera 1 minuto y vuelve a intentar.
            </div>
          </div>
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
