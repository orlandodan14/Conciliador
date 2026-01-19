"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const inviteToken = sp.get("invite_token");
  const [msg, setMsg] = useState("Confirmando tu acceso...");

  useEffect(() => {
    const go = () => {
      if (inviteToken) {
        router.replace(`/auth/set-password?invite_token=${encodeURIComponent(inviteToken)}`);
      } else {
        router.replace("/onboarding");
      }
    };

    // Si ya se detectó sesión por URL
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) go();
    });

    // Si aún no, esperar evento
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) go();
    });

    return () => sub.subscription.unsubscribe();
  }, [router, inviteToken]);

  return (
    <main className="min-h-screen grid place-items-center bg-slate-100 px-4">
      <div className="max-w-md w-full rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow">
        <div className="text-[12px] font-extrabold uppercase text-slate-700">Confirmación</div>
        <h1 className="mt-2 text-xl font-black text-slate-900">{msg}</h1>
        <p className="mt-3 text-[12px] text-slate-500">No cierres esta ventana.</p>
      </div>
    </main>
  );
}
