"use client"; // 👈 Este archivo corre en el navegador (para usar hooks y eventos).

import Link from "next/link"; // 👈 Navegación interna de Next sin recargar.
import { useEffect, useMemo, useState } from "react"; // 👈 Hooks de React.
import { useRouter, useSearchParams } from "next/navigation"; // 👈 Router + lectura de query params.
import { supabase } from "@/lib/supabaseClient"; // 👈 Cliente Supabase configurado en tu proyecto.

/**
 * Página de Login
 * - Permite iniciar sesión con email + password (Supabase Auth)
 * - Si el correo no está confirmado, redirige a /auth/check-email
 * - Si inicia sesión OK, decide a qué pantalla ir según membresías e invitaciones
 */
export default function LoginPage() {
  // Router de Next (para navegar / reemplazar rutas)
  const router = useRouter();

  // Lee query params: por ejemplo /login?email=algo@correo.com
  const sp = useSearchParams();

  // Estado: email escrito por el usuario
  const [email, setEmail] = useState("");

  // Estado: password escrito por el usuario
  const [password, setPassword] = useState("");

  // Estado: "cargando" (bloquea el botón y evita dobles clicks)
  const [loading, setLoading] = useState(false);

  // Estado: mensaje de error para mostrar en UI
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // Helper accesibilidad/teclado:
  // - Hace que elementos tipo botón respondan a Enter o Space.
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
  // Cuando la página carga, si viene ?email=... lo pone en el input de email.
  // Ejemplo: /login?email=orlando@email.com
  // --------------------------------------------------------------------------
  useEffect(() => {
    const qEmail = sp.get("email"); // 👈 lee "email" desde la URL
    if (qEmail) setEmail(qEmail); // 👈 si existe, lo setea en el state
  }, [sp]);

  // --------------------------------------------------------------------------
  // canSubmit = "se puede enviar el login?"
  // - Debe haber email no vacío
  // - Debe haber password
  // - No debe estar cargando
  // --------------------------------------------------------------------------
  const canSubmit = useMemo(() => {
    return !!email.trim() && !!password && !loading;
  }, [email, password, loading]);

  // --------------------------------------------------------------------------
  // Decide a qué ruta enviarlo después del login:
  // - Si no tiene empresa => /onboarding
  // - Si tiene empresa y ya hay otro miembro o invitaciones => /onboarding/select-company
  // - Si falla algo, por seguridad lo manda a /onboarding (no saltarse setup)
  // --------------------------------------------------------------------------
  const decidePostLoginRoute = async (): Promise<string> => {
    const { data: uRes } = await supabase.auth.getUser();
    const user = uRes.user;

    if (!user) return "/login";

    const { data: myMemberships, error: memErr } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", user.id)
      .limit(1);

    if (memErr) {
      console.log("company_members read error:", memErr);
      return "/onboarding";
    }

    return (myMemberships?.length ?? 0) > 0 ? "/onboarding/select-company" : "/onboarding";
  };

  // --------------------------------------------------------------------------
  // onLogin = acción principal de iniciar sesión
  // - Valida canSubmit
  // - Normaliza email
  // - signInWithPassword
  // - Maneja caso "email no confirmado"
  // - Si session existe => decide ruta post login
  // --------------------------------------------------------------------------
  const onLogin = async () => {
    // Evita ejecutar si no puede enviar
    if (!canSubmit) return;

    // Limpia error previo y activa loading
    setErrorMsg(null);
    setLoading(true);

    try {
      // Normaliza email (sin espacios + minúsculas)
      const emailNorm = email.trim().toLowerCase();

      // Login con Supabase
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailNorm,
        password,
      });

      // Si hubo error de login
      if (error) {
        const msg = (error.message || "").toLowerCase();

        // Caso: email no confirmado (o similar)
        if (msg.includes("confirm") || msg.includes("not confirmed")) {
          // Redirige a pantalla que explica y permite reenviar mail
          router.push(`/auth/check-email?email=${encodeURIComponent(emailNorm)}`);
          return;
        }

        // Error general
        setErrorMsg("Email o contraseña incorrectos.");
        return;
      }

      // Si hay sesión, decide a dónde enviar al usuario
      if (data.session) {
        const route = await decidePostLoginRoute();
        router.replace(route);
        return;
      }

      // Caso raro: no error, pero tampoco sesión
      setErrorMsg("No pudimos iniciar sesión. Intenta nuevamente.");
    } catch (e: any) {
      // Captura de errores inesperados
      setErrorMsg(e?.message ?? "Error inesperado.");
    } finally {
      // Siempre apaga loading
      setLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // onKeyDownLogin = si presionas Enter en inputs, ejecuta login
  // - Solo lo hace si canSubmit = true
  // --------------------------------------------------------------------------
  const onKeyDownLogin = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onLogin();
    }
  };

  // --------------------------------------------------------------------------
  // Render UI
  // --------------------------------------------------------------------------
  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-xl px-4 py-10">
        {/* Link volver al inicio */}
        <Link
          href="/"
          className="text-[13px] font-bold text-slate-700 hover:underline"
          role="button"
          tabIndex={0}
          onKeyDown={onEnterOrSpace(() => {
            window.location.href = "/";
          })}
        >
          ← Volver al inicio
        </Link>

        {/* Card principal */}
        <div className="mt-4 overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200 shadow-[0_15px_60px_rgba(15,23,42,0.12)]">
          {/* Header con gradiente */}
          <div className="bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] px-6 py-5 text-white">
            <h1 className="text-2xl font-black">Iniciar sesión</h1>
            <p className="mt-1 text-[13px] text-white/85">
              Entra con tu email y contraseña. Si no recuerdas la contraseña, recupérala en 30 segundos.
            </p>
          </div>

          {/* Contenido */}
          <div className="p-6">
            {/* Error visible si existe */}
            {errorMsg && (
              <div className="mb-4 rounded-2xl bg-rose-50 p-4 text-[12px] text-rose-900 ring-1 ring-rose-200">
                ⚠️ {errorMsg}
              </div>
            )}

            {/* Caja inputs */}
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="space-y-3">
                <Field label="Email">
                  <input
                    value={email} // valor del state
                    onChange={(e) => setEmail(e.target.value)} // actualiza state
                    onKeyDown={onKeyDownLogin} // 👈 Enter = login
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
                    onKeyDown={onKeyDownLogin} // 👈 Enter = login
                    type="password"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] outline-none focus:ring-4 focus:ring-slate-200"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </Field>
              </div>
            </div>

            {/* Botón login */}
            <button
              type="button"
              disabled={!canSubmit}
              onClick={onLogin}
              // Enter/Space ya funcionan nativo en <button>,
              // pero lo dejamos explícito para consistencia.
              onKeyDown={onEnterOrSpace(() => {
                onLogin();
              })}
              className={[
                "mt-4 h-11 w-full rounded-2xl text-[14px] font-extrabold",
                canSubmit
                  ? "bg-[#123b63] text-white hover:opacity-95 cursor-pointer"
                  : "bg-slate-200 text-slate-500 cursor-not-allowed",
              ].join(" ")}
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>

            {/* Links secundarios */}
            <div className="mt-3 flex items-center justify-between text-[12px]">
              <Link
                href={`/recuperar?email=${encodeURIComponent(email || "")}`}
                className="font-bold text-slate-700 hover:underline"
                role="button"
                tabIndex={0}
                onKeyDown={onEnterOrSpace(() => {
                  window.location.href = `/recuperar?email=${encodeURIComponent(email || "")}`;
                })}
              >
                Olvidé mi contraseña
              </Link>

              <Link
                href="/registro-owner"
                className="font-bold text-slate-700 hover:underline"
                role="button"
                tabIndex={0}
                onKeyDown={onEnterOrSpace(() => {
                  window.location.href = "/registro-owner";
                })}
              >
                Crear cuenta
              </Link>
            </div>

            {/* Mensaje de seguridad */}
            <div className="mt-6 rounded-2xl bg-emerald-50 p-4 text-[12px] text-emerald-900 ring-1 ring-emerald-200">
              🔒 Si tu correo no está confirmado, te reenviaremos el enlace automáticamente.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

/**
 * Field
 * - Simple wrapper para mostrar label + contenido (input)
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      {/* Label en mayúsculas y estilo consistente */}
      <div className="mb-1 text-[12px] font-extrabold tracking-wide text-slate-700 uppercase">{label}</div>
      {/* El input u otro elemento que pases */}
      {children}
    </div>
  );
}
