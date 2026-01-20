"use client"; // 👈 Necesario: usa hooks, window y eventos de teclado.

import Link from "next/link"; // 👈 Link de Next para navegar sin recargar.
import { useMemo, useState } from "react"; // 👈 Hooks React (estado + memo).
import { useRouter } from "next/navigation"; // 👈 Router para push/replace.
import { supabase } from "@/lib/supabaseClient"; // 👈 Supabase Auth.

/**
 * RegistroOwnerPage
 * - Paso 1 de onboarding: crear cuenta principal (Owner)
 * - Flow:
 *   1) Intenta login primero con email/password => si entra, ya existía => /onboarding
 *   2) Si login dice “no confirmado”, muestra botones (login / recuperar)
 *   3) Si login falla por credenciales, intenta signUp
 *   4) Si signUp crea usuario nuevo => manda a /auth/check-email
 *   5) Si signUp “silencia” email existente => detecta por identities vacío => mostrar “ya existe”
 */
export default function RegistroOwnerPage() {
  // Router de Next para navegar
  const router = useRouter();

  // ------------------------------
  // Estados de formulario
  // ------------------------------
  const [nombre, setNombre] = useState(""); // nombre completo
  const [email, setEmail] = useState(""); // email
  const [password, setPassword] = useState(""); // contraseña
  const [password2, setPassword2] = useState(""); // repetir contraseña

  // ------------------------------
  // Estados de UI/feedback
  // ------------------------------
  const [loading, setLoading] = useState(false); // bloquea botón mientras trabaja
  const [errorMsg, setErrorMsg] = useState<string | null>(null); // mensaje de error
  const [showAlready, setShowAlready] = useState(false); // muestra CTAs si el correo ya existe

  // --------------------------------------------------------------------------
  // Helper: Enter o Space ejecuta una acción (para “links tipo botón”)
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
  // Normalizamos email (evita problemas con espacios y mayúsculas)
  // --------------------------------------------------------------------------
  const emailNorm = useMemo(() => email.trim().toLowerCase(), [email]);

  // --------------------------------------------------------------------------
  // canSubmit = valida si el formulario está listo para enviar
  // - nombre y email no vacíos
  // - password mínimo 8
  // - password1 == password2
  // - NO loading (evita doble click)
  // --------------------------------------------------------------------------
  const canSubmit = useMemo(() => {
    if (!nombre.trim() || !emailNorm) return false;
    if (!password || password.length < 8) return false;
    if (password !== password2) return false;
    if (loading) return false;
    return true;
  }, [nombre, emailNorm, password, password2, loading]);

  // --------------------------------------------------------------------------
  // Acción: crear cuenta (email + password)
  // - OJO: mantiene tu lógica original:
  //   1) Intentar login primero (para detectar “ya existe”)
  //   2) Luego signUp si corresponde
  //   3) Detectar “ya existía” por identities vacío (caso Supabase)
  // --------------------------------------------------------------------------
  const onEmailPassword = async () => {
    // Si no puede enviarse, no hacemos nada
    if (!canSubmit) return;

    // Limpieza de estado antes de comenzar
    setErrorMsg(null);
    setShowAlready(false);
    setLoading(true);

    try {
      // 1) Intentar login primero para detectar “ya existe”
      // - Si entra, el usuario ya existía y la contraseña era correcta.
      const loginRes = await supabase.auth.signInWithPassword({
        email: emailNorm,
        password,
      });

      // Si no hay error => login OK => ya existe y está entrando
      if (!loginRes.error) {
        router.push("/onboarding");
        return;
      }

      // Guardamos el mensaje del error para analizarlo
      const loginMsg = (loginRes.error.message || "").toLowerCase();

      // Caso: existe pero NO confirmado
      if (loginMsg.includes("confirm") || loginMsg.includes("not confirmed")) {
        setShowAlready(true);
        setErrorMsg("Este correo ya está registrado, pero aún no has confirmado tu email.");
        return;
      }

      // 2) Si login falló por credenciales inválidas (u otro motivo),
      // intentamos signUp para crear cuenta.
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: emailNorm,
        password,
        options: {
          // Ruta que se usa cuando el usuario confirma el correo (callback)
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          // Metadata del usuario (se guarda en auth.users/app_metadata o user_metadata según config)
          data: { full_name: nombre.trim() },
        },
      });

      // Si signUp responde con error explícito
      if (signUpError) {
        const msg = (signUpError.message || "").toLowerCase();

        // Email ya registrado
        if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
          setShowAlready(true);
          setErrorMsg("Este correo ya está registrado. Ve a iniciar sesión.");
          return;
        }

        // Password no cumple requisitos
        if (msg.includes("password")) {
          setErrorMsg("La contraseña no cumple los requisitos. Usa mínimo 8 caracteres.");
          return;
        }

        // Email inválido
        if (msg.includes("email") || msg.includes("invalid")) {
          setErrorMsg("El email parece inválido. Revisa el formato e inténtalo nuevamente.");
          return;
        }

        // Cualquier otro error: lo lanzamos
        throw signUpError;
      }

      // ✅ CLAVE: Supabase puede “silenciar” el caso de email existente:
      // Cuando el email ya existe, a veces no devuelve error, pero user.identities queda vacío.
      const identities = (data as any)?.user?.identities;
      if (!identities || identities.length === 0) {
        setShowAlready(true);
        setErrorMsg("Este correo ya está registrado. Ve a iniciar sesión.");
        return;
      }

      // Si llegó aquí: registro nuevo real => enviar a pantalla de “revisa tu correo”
      router.push(`/auth/check-email?email=${encodeURIComponent(emailNorm)}`);
    } catch (e: any) {
      // Error inesperado
      const msg = e?.message ?? "Error inesperado";
      setErrorMsg(msg);
    } finally {
      // Siempre apagamos loading
      setLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // Enter en cualquier input => intentar “Crear cuenta”
  // --------------------------------------------------------------------------
  const onKeyDownSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onEmailPassword();
    }
  };

  // --------------------------------------------------------------------------
  // UI
  // --------------------------------------------------------------------------
  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-xl px-4 py-10">
        {/* Volver al inicio */}
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

        {/* Card contenedora */}
        <div className="mt-4 overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200 shadow-[0_15px_60px_rgba(15,23,42,0.12)]">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] px-6 py-5 text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-black">Crear cuenta principal (Owner)</h1>
                <p className="mt-1 text-[13px] text-white/85">
                  Te enviaremos un correo para confirmar tu cuenta y luego continuarás con el onboarding.
                </p>
              </div>

              {/* Indicador de pasos */}
              <div className="rounded-2xl bg-white/10 px-3 py-2 text-[12px] font-extrabold ring-1 ring-white/15">
                Paso 1 de 3
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-6">
            {/* Error general */}
            {errorMsg && (
              <div className="mb-4 rounded-2xl bg-rose-50 p-4 text-[12px] text-rose-900 ring-1 ring-rose-200">
                ⚠️ {errorMsg}

                {/* Si detectamos “ya existe”, mostramos CTA a login/recuperar */}
                {showAlready && (
                  <div className="mt-3 flex gap-2">
                    <Link
                      href="/login"
                      className="h-9 rounded-xl bg-[#123b63] px-3 text-white font-extrabold text-[12px] grid place-items-center"
                      role="button"
                      tabIndex={0}
                      onKeyDown={onEnterOrSpace(() => {
                        window.location.href = "/login";
                      })}
                    >
                      Ir a iniciar sesión
                    </Link>

                    <Link
                      href="/recuperar"
                      className="h-9 rounded-xl bg-white ring-1 ring-slate-200 px-3 text-slate-900 font-extrabold text-[12px] grid place-items-center hover:bg-slate-50"
                      role="button"
                      tabIndex={0}
                      onKeyDown={onEnterOrSpace(() => {
                        window.location.href = "/recuperar";
                      })}
                    >
                      Recuperar contraseña
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Caja de inputs */}
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="text-[12px] font-extrabold tracking-wide text-slate-700 uppercase">
                Datos del usuario
              </div>

              <div className="mt-3 space-y-3">
                <Field label="Nombre completo">
                  <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    onKeyDown={onKeyDownSubmit} // 👈 Enter = crear cuenta
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] outline-none focus:ring-4 focus:ring-slate-200"
                    placeholder="Ej: Orlando Paredes"
                    autoComplete="name"
                  />
                </Field>

                <Field label="Email">
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={onKeyDownSubmit} // 👈 Enter = crear cuenta
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
                    onKeyDown={onKeyDownSubmit} // 👈 Enter = crear cuenta
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
                    onKeyDown={onKeyDownSubmit} // 👈 Enter = crear cuenta
                    type="password"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] outline-none focus:ring-4 focus:ring-slate-200"
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </Field>
              </div>
            </div>

            {/* Checklist de requisitos */}
            <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-[12px] text-slate-700 ring-1 ring-slate-200">
              <div className="font-bold">Requisitos:</div>
              <ul className="mt-1 space-y-1">
                <li>{password.length >= 8 ? "✅" : "⬜"} 8+ caracteres</li>
                <li>{password && password === password2 ? "✅" : "⬜"} contraseñas iguales</li>
              </ul>
            </div>

            {/* Botón crear */}
            <button
              type="button"
              disabled={!canSubmit}
              onClick={onEmailPassword}
              // Enter/Space ya funcionan nativo en button,
              // pero lo dejamos explícito para consistencia.
              onKeyDown={onEnterOrSpace(() => {
                onEmailPassword();
              })}
              className={[
                "mt-4 h-11 w-full rounded-2xl text-[14px] font-extrabold",
                canSubmit ? "bg-[#123b63] text-white hover:opacity-95" : "bg-slate-200 text-slate-500 cursor-not-allowed",
              ].join(" ")}
            >
              {loading ? "Creando cuenta..." : "Crear cuenta"}
            </button>

            {/* Mensaje inferior */}
            <div className="mt-6 rounded-2xl bg-emerald-50 p-4 text-[12px] text-emerald-900 ring-1 ring-emerald-200">
              🔒 Te enviaremos un correo de confirmación. Solo tú podrás activar tu cuenta.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

/**
 * Field
 * - Wrapper para label + children (input)
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[12px] font-extrabold tracking-wide text-slate-700 uppercase">{label}</div>
      {children}
    </div>
  );
}
