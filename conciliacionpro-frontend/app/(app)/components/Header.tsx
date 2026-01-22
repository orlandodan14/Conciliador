"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type HeaderProps = {
  collapsed?: boolean;
  /**
   * En onboarding debe ser false (no hay empresa activa todavía).
   * En la app principal (ya trabajando dentro de una empresa), lo pones true.
   */
  showCompanySwitch?: boolean;
  /** Texto a mostrar cuando sí hay empresa activa (más adelante lo haremos dinámico) */
  companyLabel?: string;
};

type UserView = {
  id: string;
  email: string | null;
  name: string; // display
};

export default function Header({
  collapsed,
  showCompanySwitch = true,
  companyLabel = "Empresa",
}: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

  // ✅ Onboarding: ocultar selector empresa automáticamente
  const isOnboarding = useMemo(() => pathname?.startsWith("/onboarding"), [pathname]);
  const canShowCompany = showCompanySwitch && !isOnboarding;

  const [user, setUser] = useState<UserView | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Cargar usuario (y escuchar cambios de sesión)
  useEffect(() => {
    let alive = true;

    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;

      if (!alive) return;

      if (!u) {
        setUser(null);
        return;
      }

      // Nombre preferido: user_metadata.full_name / name / email
      const meta: any = u.user_metadata ?? {};
      const display =
        (meta.full_name as string) ||
        (meta.name as string) ||
        (u.email?.split("@")[0] ?? "Usuario");

      setUser({
        id: u.id,
        email: u.email ?? null,
        name: display,
      });
    };

    loadUser();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      loadUser();
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Cerrar menú al hacer click afuera o ESC
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const initials = useMemo(() => {
    if (!user?.name) return "U";
    const parts = user.name.trim().split(/\s+/);
    const a = parts[0]?.[0] ?? "U";
    const b = parts[1]?.[0] ?? "";
    return (a + b).toUpperCase();
  }, [user]);

  const onAccountSettings = () => {
    setMenuOpen(false);
    // Ajusta esta ruta a la que decidas para settings
    router.push("/account");
  };

  const onLogout = async () => {
    setMenuOpen(false);
    await supabase.auth.signOut();
    router.push("/login");
  };

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
          {/* IZQUIERDA: Marca / título (opcional) */}
          <div className="flex items-center gap-2 text-white/90">
            <span className="font-extrabold text-[13px] tracking-wide">
              Conciliación<span className="text-[#5fb1ff]">Pro</span>
            </span>
          </div>

          {/* CENTRO: Empresa (solo fuera de onboarding) */}
          {canShowCompany ? (
            <button
              type="button"
              className={[
                "hidden md:flex",
                "items-center gap-2",
                "rounded-md px-3 py-2",
                "text-sm font-medium text-white/90",
                "hover:bg-white/10",
                "transition",
              ].join(" ")}
              onClick={() => {
                // Más adelante: abrir dropdown de empresas
                // Por ahora no hace nada
              }}
              title="Cambiar empresa"
            >
              <span>{companyLabel}</span>
              <ChevronDown className="h-4 w-4 text-white/80" />
            </button>
          ) : (
            <div className="hidden md:block" />
          )}

          {/* DERECHA: Usuario + menú */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className={[
                "flex items-center gap-2",
                "rounded-md px-2 py-1.5",
                "hover:bg-white/10 transition",
              ].join(" ")}
            >
              {/* Avatar */}
              <div className="h-8 w-8 overflow-hidden rounded-full ring-2 ring-white/25 bg-white/10 grid place-items-center">
                <span className="text-[12px] font-extrabold text-white/90">
                  {initials}
                </span>
              </div>

              <span className="hidden md:block text-sm font-medium text-white/90">
                {user?.name ?? "Cuenta"}
              </span>

              <ChevronDown className="h-4 w-4 text-white/80" />
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 shadow-[0_15px_50px_rgba(2,6,23,0.18)]">
                <div className="px-4 py-3">
                  <div className="text-[12px] font-extrabold text-slate-900">
                    {user?.name ?? "Cuenta"}
                  </div>
                  <div className="mt-1 text-[12px] text-slate-600 truncate">
                    {user?.email ?? ""}
                  </div>
                </div>

                <div className="h-px bg-slate-100" />

                <button
                  type="button"
                  onClick={onAccountSettings}
                  className="w-full px-4 py-3 text-left text-[13px] font-bold text-slate-800 hover:bg-slate-50"
                >
                  ⚙️ Configuración de cuenta
                </button>

                <button
                  type="button"
                  onClick={onLogout}
                  className="w-full px-4 py-3 text-left text-[13px] font-bold text-rose-700 hover:bg-rose-50"
                >
                  🚪 Cerrar sesión
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

/* ============ ICONOS INLINE ============ */
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
