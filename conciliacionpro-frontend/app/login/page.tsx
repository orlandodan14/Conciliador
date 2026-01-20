"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Role = "OWNER" | "EDITOR" | "LECTOR";
type Status = "INVITED" | "ACTIVE" | "DISABLED";

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const qEmail = sp.get("email");
    if (qEmail) setEmail(qEmail);
  }, [sp]);

  const canSubmit = useMemo(() => {
    return !!email.trim() && !!password && !loading;
  }, [email, password, loading]);

  const decidePostLoginRoute = async (): Promise<string> => {
    const { data: uRes } = await supabase.auth.getUser();
    const user = uRes.user;
    if (!user) return "/login";

    // 1) Empresas donde el usuario ya pertenece (membresía real)
    const { data: myMemberships, error: memErr } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", user.id);

    if (memErr) {
      console.log("company_members read error:", memErr);
      return "/onboarding";
    }

    const companyIds = Array.from(new Set((myMemberships ?? []).map((m) => m.company_id)));

    // No tiene empresa registrada todavía
    if (companyIds.length === 0) return "/onboarding";

    // 2) ¿Ya existe al menos 1 miembro adicional real?
    const otherMemberReq = supabase
      .from("company_members")
      .select("user_id")
      .in("company_id", companyIds)
      .neq("user_id", user.id)
      .limit(1);

    // 3) ¿O al menos 1 invitación pendiente?
    const inviteReq = supabase
      .from("team_invites")
      .select("id")
      .in("company_id", companyIds)
      // ajusta este filtro si tu status se llama distinto
      .neq("status", "CANCELLED")
      .limit(1);

    const [{ data: otherMember, error: otherErr }, { data: invites, error: invErr }] =
      await Promise.all([otherMemberReq, inviteReq]);

    if (otherErr) console.log("other members check error:", otherErr);
    if (invErr) console.log("team_invites check error:", invErr);

    // Si cualquiera falla, mejor no dejarlo saltarse el setup
    if (otherErr || invErr) return "/onboarding";

    const hasOtherMember = (otherMember?.length ?? 0) > 0;
    const hasInvites = (invites?.length ?? 0) > 0;

    // ✅ Si ya hay miembros o ya hay invitaciones => onboarding “listo”
    return hasOtherMember || hasInvites ? "/onboarding/select-company" : "/onboarding";
  };


  const onLogin = async () => {
    if (!canSubmit) return;

    setErrorMsg(null);
    setLoading(true);

    try {
      const emailNorm = email.trim().toLowerCase();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailNorm,
        password,
      });

      if (error) {
        const msg = (error.message || "").toLowerCase();

        if (msg.includes("confirm") || msg.includes("not confirmed")) {
          router.push(`/auth/check-email?email=${encodeURIComponent(emailNorm)}`);
          return;
        }

        setErrorMsg("Email o contraseña incorrectos.");
        return;
      }

      if (data.session) {
        const route = await decidePostLoginRoute();
        router.replace(route);
        return;
      }

      setErrorMsg("No pudimos iniciar sesión. Intenta nuevamente.");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-xl px-4 py-10">
        <Link href="/" className="text-[13px] font-bold text-slate-700 hover:underline">
          ← Volver al inicio
        </Link>

        <div className="mt-4 overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200 shadow-[0_15px_60px_rgba(15,23,42,0.12)]">
          <div className="bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] px-6 py-5 text-white">
            <h1 className="text-2xl font-black">Iniciar sesión</h1>
            <p className="mt-1 text-[13px] text-white/85">
              Entra con tu email y contraseña. Si no recuerdas la contraseña, recupérala en 30 segundos.
            </p>
          </div>

          <div className="p-6">
            {errorMsg && (
              <div className="mb-4 rounded-2xl bg-rose-50 p-4 text-[12px] text-rose-900 ring-1 ring-rose-200">
                ⚠️ {errorMsg}
              </div>
            )}

            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="space-y-3">
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

                <Field label="Contraseña">
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] outline-none focus:ring-4 focus:ring-slate-200"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </Field>
              </div>
            </div>

            <button
              type="button"
              disabled={!canSubmit}
              onClick={onLogin}
              className={[
                "mt-4 h-11 w-full rounded-2xl text-[14px] font-extrabold",
                canSubmit ? "bg-[#123b63] text-white hover:opacity-95 cursor-pointer" : "bg-slate-200 text-slate-500 cursor-not-allowed",
              ].join(" ")}
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>

            <div className="mt-3 flex items-center justify-between text-[12px]">
              <Link
                href={`/recuperar?email=${encodeURIComponent(email || "")}`}
                className="font-bold text-slate-700 hover:underline"
              >
                Olvidé mi contraseña
              </Link>

              <Link href="/registro-owner" className="font-bold text-slate-700 hover:underline">
                Crear cuenta
              </Link>
            </div>

            <div className="mt-6 rounded-2xl bg-emerald-50 p-4 text-[12px] text-emerald-900 ring-1 ring-emerald-200">
              🔒 Si tu correo no está confirmado, te reenviaremos el enlace automáticamente.
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
