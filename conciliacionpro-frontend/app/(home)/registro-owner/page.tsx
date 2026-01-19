"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function RegistroOwnerPage() {
  const router = useRouter();

  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showAlready, setShowAlready] = useState(false);


  const canSubmit = useMemo(() => {
    if (!nombre.trim() || !email.trim()) return false;
    if (!password || password.length < 8) return false;
    if (password !== password2) return false;
    return true;
  }, [nombre, email, password, password2]);

  const onEmailPassword = async () => {
    if (!canSubmit) return;

    setErrorMsg(null);
    setShowAlready(false);
    setLoading(true);

    try {
      // 1) Intentar login primero (para detectar "ya existe")
      const loginRes = await supabase.auth.signInWithPassword({ email, password });

      if (!loginRes.error) {
        // Ya existe y password correcta -> está entrando, no registrando
        router.push("/onboarding");
        return;
      }

      const loginMsg = (loginRes.error.message || "").toLowerCase();

      // Existe pero NO confirmado
      if (loginMsg.includes("confirm") || loginMsg.includes("not confirmed")) {
        setShowAlready(true);
        setErrorMsg("Este correo ya está registrado, pero aún no has confirmado tu email.");
        return;
      }

      // 2) Si el login falló por credenciales inválidas, intentamos signUp
      // (si el email ya existe, Supabase puede devolver error o puede “silenciarlo”)
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: { full_name: nombre },
        },
      });

      if (signUpError) {
        const msg = (signUpError.message || "").toLowerCase();

        if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
          setShowAlready(true);
          setErrorMsg("Este correo ya está registrado. Ve a iniciar sesión.");
          return;
        }

        if (msg.includes("password")) {
          setErrorMsg("La contraseña no cumple los requisitos. Usa mínimo 8 caracteres.");
          return;
        }
        if (msg.includes("email") || msg.includes("invalid")) {
          setErrorMsg("El email parece inválido. Revisa el formato e inténtalo nuevamente.");
          return;
        }

        throw signUpError;
      }

      // ✅ CLAVE: detectar “ya existía” aunque no venga error
      const identities = (data as any)?.user?.identities;
      if (!identities || identities.length === 0) {
        setShowAlready(true);
        setErrorMsg("Este correo ya está registrado. Ve a iniciar sesión.");
        return;
      }

      // Si llegó hasta aquí, es un registro nuevo real:
      router.push(`/auth/check-email?email=${encodeURIComponent(email)}`);

    } catch (e: any) {
      const msg = e?.message ?? "Error inesperado";
      setErrorMsg(msg);
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
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-black">Crear cuenta principal (Owner)</h1>
                <p className="mt-1 text-[13px] text-white/85">
                  Te enviaremos un correo para confirmar tu cuenta y luego continuarás con el onboarding.
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 px-3 py-2 text-[12px] font-extrabold ring-1 ring-white/15">
                Paso 1 de 3
              </div>
            </div>
          </div>

          <div className="p-6">
            {/* Error general */}
            {errorMsg && (
              <div className="mb-4 rounded-2xl bg-rose-50 p-4 text-[12px] text-rose-900 ring-1 ring-rose-200">
                ⚠️ {errorMsg}

                {showAlready && (
                  <div className="mt-3 flex gap-2">
                    <Link
                      href="/login"
                      className="h-9 rounded-xl bg-[#123b63] px-3 text-white font-extrabold text-[12px] grid place-items-center"
                    >
                      Ir a iniciar sesión
                    </Link>

                    <Link
                      href="/recuperar"
                      className="h-9 rounded-xl bg-white ring-1 ring-slate-200 px-3 text-slate-900 font-extrabold text-[12px] grid place-items-center hover:bg-slate-50"
                    >
                      Recuperar contraseña
                    </Link>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="text-[12px] font-extrabold tracking-wide text-slate-700 uppercase">
                Datos del usuario
              </div>

              <div className="mt-3 space-y-3">
                <Field label="Nombre completo">
                  <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] outline-none focus:ring-4 focus:ring-slate-200"
                    placeholder="Ej: Orlando Paredes"
                    autoComplete="name"
                  />
                </Field>

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

                <Field label="Contraseña (mínimo 8 caracteres)">
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
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-[12px] text-slate-700 ring-1 ring-slate-200">
              <div className="font-bold">Requisitos:</div>
              <ul className="mt-1 space-y-1">
                <li>{password.length >= 8 ? "✅" : "⬜"} 8+ caracteres</li>
                <li>{password && password === password2 ? "✅" : "⬜"} contraseñas iguales</li>
              </ul>
            </div>

            <button
              type="button"
              disabled={!canSubmit || loading}
              onClick={onEmailPassword}
              className={[
                "mt-4 h-11 w-full rounded-2xl text-[14px] font-extrabold",
                canSubmit && !loading
                  ? "bg-[#123b63] text-white hover:opacity-95"
                  : "bg-slate-200 text-slate-500 cursor-not-allowed",
              ].join(" ")}
            >
              {loading ? "Creando cuenta..." : "Crear cuenta"}
            </button>

            <div className="mt-6 rounded-2xl bg-emerald-50 p-4 text-[12px] text-emerald-900 ring-1 ring-emerald-200">
              🔒 Te enviaremos un correo de confirmación. Solo tú podrás activar tu cuenta.
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
