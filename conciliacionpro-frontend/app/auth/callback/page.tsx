"use client"; // 👈 Corre en el navegador: usa hooks + Supabase Auth (cliente) + router.

import { useEffect, useState } from "react"; // 👈 Hooks React.
import { useRouter, useSearchParams } from "next/navigation"; // 👈 Router + query params.
import { supabase } from "@/lib/supabaseClient"; // 👈 Cliente Supabase.

/**
 * AuthCallbackPage
 * - Esta pantalla se usa como “callback” después de confirmar email / OAuth.
 * - Su objetivo es:
 *   1) Esperar a que exista una sesión (SIGNED_IN) en el cliente
 *   2) Redirigir según el caso:
 *      - Si viene invite_token => llevar a set-password (flujo de invitación)
 *      - Si no => llevar a /onboarding (flujo normal del Owner)
 */
export default function AuthCallbackPage() {
  // Router para redireccionar sin “back” raro
  const router = useRouter();

  // Query params actuales de la URL
  const sp = useSearchParams();

  // invite_token puede venir si el usuario llegó aquí desde una invitación
  // Ej: /auth/callback?invite_token=XXXX
  const inviteToken = sp.get("invite_token");

  // Mensaje en pantalla (por si luego quieres cambiarlo)
  const [msg, setMsg] = useState("Confirmando tu acceso...");

  useEffect(() => {
    // ------------------------------------------------------------------------
    // go(): decide la ruta final y redirige
    // ------------------------------------------------------------------------
    const go = () => {
      // Si hay token de invitación => el usuario debe definir contraseña
      if (inviteToken) {
        router.replace(`/auth/set-password?invite_token=${encodeURIComponent(inviteToken)}`);
        return;
      }

      // Si no hay invitación => flujo normal al onboarding
      router.replace("/onboarding");
    };

    // ------------------------------------------------------------------------
    // 1) Caso: Supabase ya detectó una sesión “por URL” (muy común en callbacks)
    // ------------------------------------------------------------------------
    supabase.auth.getSession().then(({ data }) => {
      // Si ya existe sesión con usuario, redirigimos
      if (data.session?.user) {
        go();
      }
    });

    // ------------------------------------------------------------------------
    // 2) Caso: Todavía no hay sesión => nos suscribimos al evento de auth
    //    Cuando ocurra SIGNED_IN, redirigimos.
    // ------------------------------------------------------------------------
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // SIGNED_IN = ya se creó sesión en el cliente
      if (event === "SIGNED_IN" && session?.user) {
        go();
      }
    });

    // ------------------------------------------------------------------------
    // Cleanup: cuando se desmonta el componente, cancelamos la suscripción
    // para evitar memory leaks.
    // ------------------------------------------------------------------------
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [router, inviteToken]); // 👈 si cambia inviteToken o router, se recalcula el efecto

  // --------------------------------------------------------------------------
  // UI: pantalla simple mientras se confirma la sesión
  // --------------------------------------------------------------------------
  return (
    <main className="min-h-screen grid place-items-center bg-slate-100 px-4">
      <div className="max-w-md w-full rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow">
        <div className="text-[12px] font-extrabold uppercase text-slate-700">Confirmación</div>

        {/* Mensaje principal */}
        <h1 className="mt-2 text-xl font-black text-slate-900">{msg}</h1>

        {/* Nota */}
        <p className="mt-3 text-[12px] text-slate-500">No cierres esta ventana.</p>
      </div>
    </main>
  );
}
