"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Role = "OWNER" | "EDITOR" | "LECTOR";
type Status = "INVITED" | "ACTIVE" | "DISABLED";

type CompanyPickRow = {
  company_id: string;
  company_name: string;
  role: Role;
  status: Status;
};

function initials(name: string) {
  const clean = (name || "").trim();
  if (!clean) return "C";
  const parts = clean.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function roleLabel(role: Role) {
  if (role === "OWNER") return "Administrador";
  if (role === "EDITOR") return "Editor";
  return "Lector";
}

function rolePill(role: Role) {
  if (role === "OWNER") return { bg: "bg-indigo-50", ring: "ring-indigo-200", text: "text-indigo-900" };
  if (role === "EDITOR") return { bg: "bg-sky-50", ring: "ring-sky-200", text: "text-sky-900" };
  return { bg: "bg-slate-50", ring: "ring-slate-200", text: "text-slate-900" };
}

export default function SelectCompanyPage() {
  const router = useRouter();

  const [rows, setRows] = useState<CompanyPickRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [meEmail, setMeEmail] = useState<string>("");

  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      setLoading(true);

      const { data: s } = await supabase.auth.getSession();
      const user = s.session?.user;
      if (!user) {
        router.push("/login");
        return;
      }

      if (!alive) return;
      setMeEmail(user.email ?? "");

      const { data, error } = await supabase
        .from("company_members")
        .select("company_id,role,status,companies(name)")
        .eq("user_id", user.id)
        .eq("status", "ACTIVE");

      if (!alive) return;

      if (error) {
        console.log("select-company error:", error);
        setRows([]);
        setLoading(false);
        return;
      }

      const mapped: CompanyPickRow[] = (data ?? []).map((r: any) => ({
        company_id: r.company_id,
        company_name: r.companies?.name ?? "Empresa",
        role: r.role,
        status: r.status,
      }));

      mapped.sort((a, b) => {
        const ra = a.role === "OWNER" ? 0 : a.role === "EDITOR" ? 1 : 2;
        const rb = b.role === "OWNER" ? 0 : b.role === "EDITOR" ? 1 : 2;
        if (ra !== rb) return ra - rb;
        return a.company_name.localeCompare(b.company_name);
      });

      setRows(mapped);
      setLoading(false);
    };

    run();
    return () => {
      alive = false;
    };
  }, [router]);

  const subtitle = useMemo(() => {
    if (loading) return "Cargando tus empresas…";
    if (!rows.length) return "Aún no tienes acceso a ninguna empresa.";
    return "Haz click en una empresa para entrar.";
  }, [loading, rows.length]);

  const onPick = (cid: string, name: string) => {
    // 1) Guardamos la empresa activa
    try {
      localStorage.setItem("active_company_id", cid);
      localStorage.setItem("last_company_id", cid);
    } catch {}

    // 2) (Opcional) toast corto, pero navegamos de inmediato
    setToast(`✅ Entrando a: ${name}…`);

    // 3) Navegar al dashboard dentro de workspace
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="overflow-hidden rounded-[28px] bg-white ring-1 ring-slate-200 shadow-[0_18px_70px_rgba(15,23,42,0.12)]">
          {/* Header */}
          <div className="relative bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] px-7 py-8 text-white">
            <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

            <div className="relative">
              <div className="text-[12px] font-extrabold uppercase text-white/80">Bienvenido</div>
              <h1 className="mt-1 text-3xl font-black leading-tight">Elige tu empresa</h1>
              <p className="mt-2 text-[13px] text-white/85">{subtitle}</p>
              {meEmail ? <p className="mt-3 text-[12px] text-white/70">Sesión: {meEmail}</p> : null}

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/15">
                  <div className="text-[12px] font-extrabold">1) Elige empresa</div>
                  <div className="mt-1 text-[12px] text-white/85">Donde vas a trabajar hoy.</div>
                </div>
                <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/15">
                  <div className="text-[12px] font-extrabold">2) Entrar</div>
                  <div className="mt-1 text-[12px] text-white/85">Luego verás tus módulos.</div>
                </div>
                <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/15">
                  <div className="text-[12px] font-extrabold">Tip</div>
                  <div className="mt-1 text-[12px] text-white/85">Si no aparece, pide acceso al OWNER.</div>
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-7">
            {toast ? (
              <div className="mb-4 rounded-2xl bg-emerald-50 p-4 text-[13px] font-extrabold text-emerald-900 ring-1 ring-emerald-200">
                {toast}
              </div>
            ) : null}

            {loading ? (
              <div className="rounded-2xl bg-slate-50 p-4 text-[13px] text-slate-700 ring-1 ring-slate-200">
                Cargando…
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 p-5 text-[13px] text-slate-700 ring-1 ring-slate-200">
                <div className="font-extrabold">No tienes empresas activas todavía.</div>
                <div className="mt-2 text-[12px] text-slate-600">
                  Si eres invitado, asegúrate de haber aceptado la invitación y que el OWNER te haya activado.
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {rows.map((r) => {
                    const pill = rolePill(r.role);

                    return (
                      <button
                        key={r.company_id}
                        onClick={() => onPick(r.company_id, r.company_name)}
                        className="group rounded-[26px] bg-white p-5 text-left ring-1 ring-slate-200 hover:shadow-[0_18px_50px_rgba(15,23,42,0.12)] transition cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 rounded-2xl bg-slate-100 ring-1 ring-slate-200 grid place-items-center text-[16px] font-black text-slate-800">
                            {initials(r.company_name)}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="text-[14px] font-black text-slate-900 truncate">{r.company_name}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex items-center rounded-xl px-3 py-1 text-[11px] font-extrabold ring-1 ${pill.bg} ${pill.ring} ${pill.text}`}
                              >
                                {roleLabel(r.role)}
                              </span>
                              <span className="inline-flex items-center rounded-xl px-3 py-1 text-[11px] font-extrabold ring-1 bg-emerald-50 text-emerald-900 ring-emerald-200">
                                ACTIVA
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between">
                          <span className="inline-flex items-center rounded-xl px-3 py-1 text-[12px] font-extrabold ring-1 bg-slate-50 text-slate-900 ring-slate-200">
                            Entrar
                          </span>
                          <span className="text-[12px] font-extrabold text-[#123b63] group-hover:underline">
                            Abrir →
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-[12px] text-slate-700 ring-1 ring-slate-200">
                  👇 Consejo rápido:
                  <div className="mt-1 text-slate-600">
                    Elige la empresa donde vas a registrar movimientos y ver reportes. Más adelante podrás cambiar con un clic.
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-7 text-center text-[12px] text-slate-500">
          ConciliaciónPro • Selección de empresa
        </div>
      </div>
    </div>
  );
}
