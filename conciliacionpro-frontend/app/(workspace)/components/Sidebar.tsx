"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

type Props = {
  collapsed: boolean;
  onToggle: () => void;
};

type NavItem = { label: string; href: string };
type NavSection = { title: string; items: NavItem[] };

export default function Sidebar({ collapsed, onToggle }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>({
    "Gestión Bancaria": true,
    "Gestión de Ventas": true,
    "Gestión de Compras": true,
    "Gestión Contable": true,
  });

  const sections: NavSection[] = useMemo(
    () => [
      {
        title: "Gestión Bancaria",
        items: [
          { label: "Bancos", href: "/gestionBancaria/bancos" },
          { label: "Conciliación Bancaria", href: "/gestionBancaria/conciliacion" },
        ],
      },
      {
        title: "Gestión de Ventas",
        items: [
          { label: "Clientes", href: "/gestionVentas/clientes" },
          { label: "Ventas", href: "/gestionVentas/ventas" },
        ],
      },
      {
        title: "Gestión de Compras",
        items: [
          { label: "Proveedores", href: "/compras/proveedores" },
          { label: "Compras", href: "/compras/compras" },
        ],
      },
      {
        title: "Gestión Contable",
        items: [{ label: "Por Definir", href: "/contable" }],
      },
    ],
    []
  );

  return (
    <aside
      className={[
        "sticky top-0 h-screen shrink-0",
        // Colores tipo imagen (azul marino)
        "bg-gradient-to-b from-[#0b2b4f] via-[#123b63] to-[#0b2b4f]",
        "text-white",
        "border-r border-white/10",
        collapsed ? "w-[45px]" : "w-[220px]", // ancho más parecido al screenshot
        "transition-all duration-200",
      ].join(" ")}
    >
      {/* Top: Logo igual al header */}
      <div className="flex h-14 items-center justify-between px-3 border-b border-white/10">
        <button
          onClick={onToggle}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10 hover:bg-white/10"
          title={collapsed ? "Expandir" : "Contraer"}
        >
          <span className="text-lg leading-none">≡</span>
        </button>

        {!collapsed && (
          <div className="flex items-center gap-2 pr-1">
            <div className="h-8 w-8 rounded-full bg-[#0b5aa8] ring-2 ring-white/20" />
            <span className="text-sm font-semibold text-white">
              Conciliación<span className="text-[#5fb1ff]">Pro</span>
            </span>
          </div>
        )}
      </div>

      <nav className="px-0 py-3">
        {sections.map((sec) => {
          const isOpen = open[sec.title];

          return (
            <div key={sec.title} className="mb-3">
              {/* Header de sección (barra más clara como en imagen) */}
              <button
                onClick={() => setOpen((s) => ({ ...s, [sec.title]: !s[sec.title] }))}
                className={[
                  "w-full",
                  "flex items-center justify-between",
                  "px-3 py-2",
                  "bg-white/10 hover:bg-white/15",
                  "text-left",
                  "transition",
                ].join(" ")}
              >
                <div className="flex items-center gap-2">
                  <SectionIcon title={sec.title} />
                  <span className={collapsed ? "sr-only" : "text-sm font-semibold text-white/95"}>
                    {sec.title}
                  </span>
                </div>

                {!collapsed && (
                  <ChevronDown
                    className={[
                      "h-4 w-4 text-white/80 transition-transform",
                      isOpen ? "rotate-180" : "",
                    ].join(" ")}
                  />
                )}
              </button>

              {/* Items */}
              {!collapsed && isOpen && (
                <div className="pt-1">
                  {sec.items.map((item) => {
                    const active = pathname === item.href;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={[
                          "relative block",
                          // padding + altura como el screenshot
                          "px-8 py-2",
                          "text-[14px] font-medium",
                          "transition",
                          active
                            ? "bg-white/15 text-white"
                            : "text-white/80 hover:bg-white/10 hover:text-white",
                        ].join(" ")}
                      >
                        {/* barra azul vertical de “activo” */}
                        {active && (
                          <span className="absolute left-0 top-0 h-full w-[6px] bg-[#2f8cff]" />
                        )}
                        {item.label}

                        {/* separador suave abajo (como líneas del screenshot) */}
                        <span className="absolute left-8 right-3 bottom-0 h-px bg-white/10" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

/* ============ ICONOS INLINE (sin librerías) ============ */

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

function SectionIcon({ title }: { title: string }) {
  // Íconos simples tipo “cuadraditos” como en tu screenshot.
  // Puedes cambiarlos luego por lucide/fontawesome, pero esto ya se ve igual.
  const common = "h-4 w-4 text-white/80";

  if (title === "Gestión Bancaria") return <FolderIcon className={common} />;
  if (title === "Gestión de Ventas") return <CalendarIcon className={common} />;
  if (title === "Gestión de Compras") return <CartIcon className={common} />;
  return <FolderIcon className={common} />;
}

function FolderIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M10 4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2h6z" opacity=".9" />
    </svg>
  );
}

function CalendarIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 2h2v3H7V2zm8 0h2v3h-2V2zM4 6h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" opacity=".9" />
    </svg>
  );
}

function CartIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 18a2 2 0 11.001 3.999A2 2 0 017 18zm10 0a2 2 0 11.001 3.999A2 2 0 0117 18zM6 6h16l-2 9H8L6 6z" opacity=".9" />
      <path d="M3 3h2l1 4h-2L3 3z" />
    </svg>
  );
}
