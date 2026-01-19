"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function CheckEmailPage() {
  const sp = useSearchParams();
  const email = sp.get("email") ?? "";

  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const masked = useMemo(() => {
    if (!email.includes("@")) return email;
    const [u, d] = email.split("@");
    const safeU = u.length <= 2 ? u[0] + "*" : u.slice(0, 2) + "****";
    return `${safeU}@${d}`;
  }, [email]);

  const resend = async () => {
    setErrorMsg(null);
    setSentOk(false);
    setSending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setSentOk(true);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "No pudimos reenviar el correo.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200 shadow-[0_15px_60px_rgba(15,23,42,0.12)]">
          <div className="bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] px-6 py-5 text-white">
            <h1 className="text-2xl font-black">Revisa tu correo</h1>
            <p className="mt-1 text-[13px] text-white/85">
              Te enviamos un enlace para confirmar tu cuenta. Al confirmar, te llevaremos al onboarding.
            </p>
          </div>

          <div className="p-6 space-y-4">
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 text-[13px] text-slate-700">
              📩 Enviamos el correo a: <span className="font-extrabold">{masked || "tu email"}</span>
              <div className="mt-2 text-[12px] text-slate-500">
                Tip: revisa <b>Spam</b> / <b>Promociones</b>. A veces tarda 1–2 minutos.
              </div>
            </div>

            {sentOk && (
              <div className="rounded-2xl bg-emerald-50 p-4 text-[12px] text-emerald-900 ring-1 ring-emerald-200">
                ✅ Listo. Te reenviamos el correo.
              </div>
            )}

            {errorMsg && (
              <div className="rounded-2xl bg-rose-50 p-4 text-[12px] text-rose-900 ring-1 ring-rose-200">
                ⚠️ {errorMsg}
              </div>
            )}

            <button
              onClick={resend}
              disabled={!email || sending}
              className={[
                "h-11 w-full rounded-2xl text-[14px] font-extrabold",
                email && !sending
                  ? "bg-[#123b63] text-white hover:opacity-95"
                  : "bg-slate-200 text-slate-500 cursor-not-allowed",
              ].join(" ")}
            >
              {sending ? "Reenviando..." : "Reenviar correo"}
            </button>

            <div className="flex items-center justify-between text-[12px]">
              <Link href="/registro-owner" className="font-bold text-slate-700 hover:underline">
                Cambiar email
              </Link>
              <Link href="/" className="font-bold text-slate-700 hover:underline">
                Volver al inicio
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
