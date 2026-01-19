"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function SetPasswordPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const inviteToken = sp.get("invite_token");

  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const can = useMemo(() => {
    if (!inviteToken) return false;
    if (!p1 || p1.length < 8) return false;
    if (p1 !== p2) return false;
    return true;
  }, [inviteToken, p1, p2]);

  const onSave = async () => {
    if (!can) return;
    setErr(null);
    setLoading(true);

    try {
      // 1) asegurar sesión
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        setErr("No hay sesión activa. Abre nuevamente el correo de invitación.");
        return;
      }

      // 2) setear contraseña
      const { error: passErr } = await supabase.auth.updateUser({ password: p1 });
      if (passErr) {
        setErr(passErr.message);
        return;
      }

      // 3) aceptar invitación (crea company_members, actualiza profiles, borra team_invites)
      const { error: accErr } = await supabase.rpc("accept_team_invite", { p_token: inviteToken });
      if (accErr) {
        setErr(accErr.message);
        return;
      }

      // 4) dashboard
      router.replace("/app");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-[0_15px_60px_rgba(15,23,42,0.12)]">
        <div className="text-[12px] font-extrabold tracking-wide text-slate-700 uppercase">Invitación</div>
        <h1 className="mt-2 text-xl font-black text-slate-900">Crea tu contraseña</h1>
        <p className="mt-2 text-[13px] text-slate-600">
          Define una contraseña para tu cuenta y entra al dashboard.
        </p>

        {err && (
          <div className="mt-4 rounded-2xl bg-rose-50 p-3 text-[12px] text-rose-900 ring-1 ring-rose-200">
            ⚠️ {err}
          </div>
        )}

        <div className="mt-5 space-y-3">
          <div>
            <div className="mb-1 text-[12px] font-extrabold tracking-wide text-slate-700 uppercase">
              Contraseña (8+ caracteres)
            </div>
            <input
              type="password"
              value={p1}
              onChange={(e) => setP1(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] outline-none focus:ring-4 focus:ring-slate-200"
            />
          </div>

          <div>
            <div className="mb-1 text-[12px] font-extrabold tracking-wide text-slate-700 uppercase">Repite contraseña</div>
            <input
              type="password"
              value={p2}
              onChange={(e) => setP2(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] outline-none focus:ring-4 focus:ring-slate-200"
            />
          </div>
        </div>

        <button
          onClick={onSave}
          disabled={!can || loading}
          className={[
            "mt-5 h-11 w-full rounded-2xl text-[14px] font-extrabold",
            can && !loading ? "bg-[#123b63] text-white hover:opacity-95 cursor-pointer" : "bg-slate-200 text-slate-500 cursor-not-allowed",
          ].join(" ")}
        >
          {loading ? "Guardando..." : "Guardar y entrar →"}
        </button>
      </div>
    </main>
  );
}
