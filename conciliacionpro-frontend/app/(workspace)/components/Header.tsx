"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type HeaderProps = {
  collapsed?: boolean;
};

type Role = "OWNER" | "EDITOR" | "LECTOR";
type Status = "INVITED" | "ACTIVE" | "DISABLED";

type CompanyPickRow = {
  company_id: string;
  company_name: string;
  role: Role;
  status: Status;
};

export default function Header({ collapsed }: HeaderProps) {
  const router = useRouter();

  const [companyName, setCompanyName] = useState("Empresa XYZ S.A.");
  const [activeCompanyId, setActiveCompanyId] = useState<string>("");
  const [companies, setCompanies] = useState<CompanyPickRow[]>([]);
  const [openCompanyMenu, setOpenCompanyMenu] = useState(false);
  const companyMenuRef = useRef<HTMLDivElement | null>(null);

  const [userName, setUserName] = useState("Carlos Pérez");
  const [userEmail, setUserEmail] = useState<string>("");

  const [openUserMenu, setOpenUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  // =========================
  // Cargar empresa + usuario + lista empresas
  // =========================
  useEffect(() => {
    let alive = true;

    const load = async () => {
      // --- USER ---
      const { data: auth } = await supabase.auth.getUser();
      const u = auth?.user;

      if (!alive) return;

      if (u) {
        setUserEmail((u.email ?? "").trim());

        const { data: p } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", u.id)
          .maybeSingle();

        if (!alive) return;

        const name = (p?.full_name ?? "").trim();
        setUserName(name || u.email || "Usuario");

        // --- COMPANIES (activas del usuario) ---
        const { data: cm, error: cmErr } = await supabase
          .from("company_members")
          .select("company_id,role,status,companies(name)")
          .eq("user_id", u.id)
          .eq("status", "ACTIVE");

        if (!alive) return;

        if (cmErr) {
          console.log("header companies error:", cmErr);
          setCompanies([]);
        } else {
          const mapped: CompanyPickRow[] = (cm ?? []).map((r: any) => ({
            company_id: r.company_id,
            company_name: r.companies?.name ?? "Empresa",
            role: r.role,
            status: r.status,
          }));

          mapped.sort((a, b) => a.company_name.localeCompare(b.company_name));
          setCompanies(mapped);
        }
      } else {
        setUserName("Usuario");
        setUserEmail("");
        setCompanies([]);
      }

      // --- ACTIVE COMPANY (desde localStorage) ---
      let cid = "";
      try {
        cid = localStorage.getItem("active_company_id") ?? "";
      } catch {}

      setActiveCompanyId(cid);

      if (!cid) {
        setCompanyName("Selecciona empresa");
        return;
      }

      // Si ya viene en la lista, úsalo (evita query extra)
      const found = companies.find((x) => x.company_id === cid);
      if (found?.company_name) {
        setCompanyName(found.company_name.trim() || "Empresa");
        return;
      }

      const { data: c } = await supabase
        .from("companies")
        .select("name")
        .eq("id", cid)
        .maybeSingle();

      if (!alive) return;

      setCompanyName((c?.name ?? "Empresa").trim() || "Empresa");
    };

    load();

    const onProfileUpdated = () => load();
    window.addEventListener("profile:updated", onProfileUpdated as any);

    const onCompanyChanged = () => load();
    window.addEventListener("company:changed", onCompanyChanged as any);

    return () => {
      alive = false;
      window.removeEventListener("profile:updated", onProfileUpdated as any);
      window.removeEventListener("company:changed", onCompanyChanged as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // =========================
  // Cerrar menús al click afuera / ESC
  // =========================
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      // user menu
      if (openUserMenu) {
        const el = userMenuRef.current;
        if (el && !el.contains(e.target as Node)) setOpenUserMenu(false);
      }

      // company menu
      if (openCompanyMenu) {
        const el2 = companyMenuRef.current;
        if (el2 && !el2.contains(e.target as Node)) setOpenCompanyMenu(false);
      }
    };

    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenUserMenu(false);
        setOpenCompanyMenu(false);
      }
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [openUserMenu, openCompanyMenu]);

  // =========================
  // Acciones menú usuario
  // =========================
  const goAccount = () => {
    setOpenUserMenu(false);
    router.push("/account");
  };

  const onLogout = async () => {
    setOpenUserMenu(false);
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  // =========================
  // Acciones menú empresa
  // =========================
  const onPickCompany = (cid: string) => {
    try {
      localStorage.setItem("active_company_id", cid);
      localStorage.setItem("last_company_id", cid);
    } catch {}

    setActiveCompanyId(cid);

    const picked = companies.find((c) => c.company_id === cid);
    if (picked?.company_name) setCompanyName(picked.company_name);

    setOpenCompanyMenu(false);

    // avisa a toda la app
    window.dispatchEvent(new CustomEvent("company:changed"));

    // ir al dashboard del workspace
    router.push("/dashboard");
    router.refresh();
  };

  const otherCompanies = companies.filter((c) => c.company_id !== activeCompanyId);

  return (
    <header className="sticky top-0 z-40">
      <div
        className={[
          "h-14 w-full",
          "bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f]",
          "shadow",
        ].join(" ")}
      >
        <div className="mx-auto flex h-14 items-center justify-between px-4">
          {/* CENTRO: Empresa (dropdown) */}
          <div className="relative hidden md:block" ref={companyMenuRef}>
            <button
              className={[
                "flex",
                "items-center gap-2",
                "rounded-md px-3 py-2",
                "text-sm font-medium text-white/90",
                "hover:bg-white/10",
                "transition",
              ].join(" ")}
              title="Cambiar empresa"
              onClick={() => setOpenCompanyMenu((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={openCompanyMenu}
              type="button"
            >
              <span className="max-w-[360px] truncate">{companyName}</span>
              <ChevronDown className="h-4 w-4 text-white/80" />
            </button>

            {openCompanyMenu && (
              <div
                className="absolute left-0 mt-2 w-80 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 shadow-[0_18px_60px_rgba(15,23,42,0.25)]"
                role="menu"
              >
                {/* header */}
                <div className="px-4 py-3">
                  <div className="text-[12px] font-extrabold text-slate-900">
                    Empresa activa
                  </div>
                  <div className="mt-1 text-[12px] text-slate-600 truncate">
                    {companyName}
                  </div>
                </div>

                <div className="h-px bg-slate-100" />

                {companies.length === 0 ? (
                  <div className="px-4 py-3 text-[13px] font-extrabold text-slate-700">
                    No tienes empresas activas.
                  </div>
                ) : otherCompanies.length === 0 ? (
                  <div className="px-4 py-3 text-[13px] font-extrabold text-slate-700">
                    No hay más empresas registradas.
                  </div>
                ) : (
                  <div className="py-2">
                    {otherCompanies.map((c) => (
                      <button
                        key={c.company_id}
                        onClick={() => onPickCompany(c.company_id)}
                        className="w-full text-left px-4 py-3 text-[13px] font-extrabold text-slate-900 hover:bg-slate-50"
                        role="menuitem"
                      >
                        {c.company_name}
                      </button>
                    ))}
                  </div>
                )}

                <div className="h-px bg-slate-100" />

                {/* fallback para quien quiera ir a la pantalla de selección */}
                <button
                  onClick={() => {
                    setOpenCompanyMenu(false);
                    router.push("/onboarding/select-company");
                  }}
                  className="w-full text-left px-4 py-3 text-[13px] font-extrabold text-slate-900 hover:bg-slate-50"
                  role="menuitem"
                >
                  Ver todas / Administrar →
                </button>
              </div>
            )}
          </div>

          {/* DERECHA: Usuario */}
          <div className="relative" ref={userMenuRef}>
            <button
              className={[
                "flex items-center gap-2",
                "rounded-md px-2 py-1.5",
                "hover:bg-white/10 transition",
              ].join(" ")}
              onClick={() => setOpenUserMenu((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={openUserMenu}
              type="button"
            >
              <div className="h-8 w-8 overflow-hidden rounded-full ring-2 ring-white/25 bg-white/10">
                <div className="h-full w-full bg-gradient-to-b from-white/10 to-white/0" />
              </div>

              <span className="hidden md:block text-sm font-medium text-white/90">
                {userName}
              </span>
              <ChevronDown className="h-4 w-4 text-white/80" />
            </button>

            {openUserMenu && (
              <div
                className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 shadow-[0_18px_60px_rgba(15,23,42,0.25)]"
                role="menu"
              >
                <div className="px-4 py-3">
                  <div className="text-[13px] font-extrabold text-slate-900">
                    {userName}
                  </div>
                  <div className="mt-1 text-[12px] text-slate-600 truncate">
                    {userEmail || "—"}
                  </div>
                </div>

                <div className="h-px bg-slate-100" />

                <button
                  onClick={goAccount}
                  className="w-full text-left px-4 py-3 text-[13px] font-extrabold text-slate-900 hover:bg-slate-50 flex items-center gap-2"
                  role="menuitem"
                >
                  <span className="opacity-70">⚙️</span>
                  Configuración de cuenta
                </button>

                <div className="h-px bg-slate-100" />

                <button
                  onClick={onLogout}
                  className="w-full text-left px-4 py-3 text-[13px] font-extrabold text-red-700 hover:bg-red-50 flex items-center gap-2"
                  role="menuitem"
                >
                  <span className="opacity-70">⛔</span>
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="h-px w-full bg-black/10" />
    </header>
  );
}

function ChevronDown({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

