"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function OnboardingPage() {
  const router = useRouter();

  const [email, setEmail] = useState<string>("");
  const [nombre, setNombre] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const initials = useMemo(() => {
    const n = (nombre || "").trim();
    if (!n) return "O";
    const parts = n.split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase()).join("");
  }, [nombre]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);

      const { data: userRes } = await supabase.auth.getUser();
      if (!alive) return;

      const user = userRes.user;
      if (!user) {
        router.replace("/login");
        return;
      }

      setEmail(user.email ?? "");

      // 1) Intentar nombre desde metadata (cuando registras)
      const metaName = (user.user_metadata as any)?.full_name as string | undefined;
      if (metaName) setNombre(metaName);

      // 2) Intentar nombre desde profiles (por si lo guardas ahí)
      try {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .maybeSingle();
        if (!alive) return;

        if (prof?.full_name) setNombre(prof.full_name);
      } catch {
        // si falla, no pasa nada para onboarding explicativo
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [router]);

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-10">
        {/* Top */}
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="text-[13px] font-bold text-slate-700 hover:underline">
            ← Volver al inicio
          </Link>

          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.push("/login");
            }}
            className="text-[13px] font-extrabold text-slate-700 hover:underline"
          >
            Cerrar sesión
          </button>
        </div>

        {/* Card */}
        <div className="mt-4 overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200 shadow-[0_15px_60px_rgba(15,23,42,0.12)]">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] px-6 py-6 text-white">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-[12px] font-extrabold ring-1 ring-white/15">
                  ✅ Cuenta activa
                </div>

                <h1 className="mt-3 text-3xl font-black leading-tight">
                  Bienvenido{nombre ? `, ${nombre.split(" ")[0]}` : ""} 👋
                </h1>

                <p className="mt-2 max-w-2xl text-[13px] text-white/85">
                  Vamos a dejar tu plataforma lista en 2 pasos sencillos. Sin tecnicismos: primero creas tu empresa, luego
                  invitas a tu equipo.
                </p>
              </div>

              {/* User pill */}
              <div className="flex items-center gap-3 rounded-3xl bg-white/10 p-3 ring-1 ring-white/15">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-[#123b63] font-black">
                  {initials}
                </div>
                <div>
                  <div className="text-[12px] font-extrabold">Owner</div>
                  <div className="text-[12px] text-white/85">{loading ? "Cargando..." : email || "—"}</div>
                </div>
              </div>
            </div>

            {/* Progress */}
            <div className="mt-5 rounded-2xl bg-white/10 p-3 ring-1 ring-white/15">
              <div className="flex items-center justify-between text-[12px] font-extrabold">
                <span>Progreso</span>
                <span>Paso 1 de 3 ✅</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/15">
                <div className="h-2 w-1/3 rounded-full bg-white" />
              </div>
              <div className="mt-2 text-[12px] text-white/85">
                Ya creaste tu cuenta principal. Ahora toca configurar tu empresa.
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Intro */}
            <div className="grid gap-4 md:grid-cols-2">
              <InfoCard
                title="¿Qué vas a hacer ahora?"
                desc="Solo 2 pasos para que la plataforma empiece a funcionar en serio."
                bullets={[
                  "Paso 2: Registrar tu empresa (o varias).",
                  "Paso 3: Invitar a tu equipo (roles y permisos).",
                ]}
              />
              <InfoCard
                title="¿Por qué es así?"
                desc="Porque primero definimos “dónde pasa todo” (tu empresa) y después “quién trabaja” (tu equipo)."
                bullets={[
                  "Empresa = tus cuentas, bancos, documentos, reglas.",
                  "Equipo = personas con accesos controlados.",
                ]}
              />
            </div>

            {/* Steps */}
            <div className="mt-6">
              <div className="text-[12px] font-extrabold tracking-wide text-slate-700 uppercase">
                Tu onboarding (simple y guiado)
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <StepCard
                  step="Paso 1"
                  badge="Listo ✅"
                  title="Crear cuenta Owner"
                  text="Ya lo hiciste. Esta cuenta administra todo."
                />
                <StepCard
                  step="Paso 2"
                  badge="Ahora"
                  title="Registrar tu empresa"
                  text="Nombre, país/moneda y datos básicos. Puedes crear más de una."
                  highlight
                />
                <StepCard
                  step="Paso 3"
                  badge="Luego"
                  title="Invitar a tu equipo"
                  text="Crea usuarios y define quién puede ver, editar o aprobar."
                />
              </div>

              <div className="mt-6 flex flex-col gap-2 md:flex-row">
                <Link
                  href="/onboarding/empresa"
                  className="h-12 w-full md:w-auto rounded-2xl bg-[#123b63] px-5 text-white font-extrabold text-[14px] grid place-items-center hover:opacity-95"
                >
                  Ir al Paso 2: Registrar empresa →
                </Link>

              </div>

              <div className="mt-3 rounded-2xl bg-amber-50 p-4 text-[12px] text-amber-900 ring-1 ring-amber-200">
                ℹ️ Recomendación: haz el Paso 2 primero. Sin empresa creada, no hay nada que administrar.
              </div>
            </div>

            {/* Trust */}
            <div className="mt-6 rounded-2xl bg-emerald-50 p-4 text-[12px] text-emerald-900 ring-1 ring-emerald-200">
              🔒 Tu información está protegida. Cada usuario solo verá lo que su rol permita.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

/* =========================
  UI Components
========================= */

function InfoCard({
  title,
  desc,
  bullets,
}: {
  title: string;
  desc: string;
  bullets: string[];
}) {
  return (
    <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200">
      <div className="text-[12px] font-extrabold tracking-wide text-slate-700 uppercase">{title}</div>
      <div className="mt-2 text-[14px] font-black text-slate-900">{desc}</div>
      <ul className="mt-3 space-y-2 text-[13px] text-slate-700">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <span className="mt-[2px]">✅</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepCard({
  step,
  badge,
  title,
  text,
  highlight,
}: {
  step: string;
  badge: string;
  title: string;
  text: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-3xl p-5 ring-1",
        highlight
          ? "bg-[#123b63] text-white ring-[#123b63]"
          : "bg-white text-slate-900 ring-slate-200",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <div className={["text-[12px] font-extrabold", highlight ? "text-white/85" : "text-slate-600"].join(" ")}>
          {step}
        </div>
        <div
          className={[
            "rounded-2xl px-3 py-1 text-[12px] font-extrabold ring-1",
            highlight ? "bg-white/10 text-white ring-white/15" : "bg-slate-50 text-slate-700 ring-slate-200",
          ].join(" ")}
        >
          {badge}
        </div>
      </div>

      <div className="mt-3 text-[16px] font-black">{title}</div>
      <div className={["mt-2 text-[13px]", highlight ? "text-white/85" : "text-slate-600"].join(" ")}>
        {text}
      </div>
    </div>
  );
}
