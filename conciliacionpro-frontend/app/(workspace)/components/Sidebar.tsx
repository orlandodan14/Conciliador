"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Props = {
  collapsed: boolean;
  onToggle: () => void;
};

type NavLinkItem = { type: "link"; label: string; href: string };
type NavGroupItem = { type: "group"; label: string; children: NavLinkItem[] };
type NavDividerItem = { type: "divider" };

type NavItem = NavLinkItem | NavGroupItem | NavDividerItem;
type NavSection = { title: string; items: NavItem[] };

/** Activo exacto o por subruta (ej: /configuracion/centros-costos/123) */
function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export default function Sidebar({ collapsed, onToggle }: Props) {
  const pathname = usePathname();

  const sections: NavSection[] = useMemo(
    () => [
      {
        title: "Gestión Bancaria",
        items: [
          { type: "link", label: "Bancos", href: "/gestionBancaria/bancos" },
          { type: "link", label: "Conciliación Bancaria", href: "/gestionBancaria/conciliacion" },
          { type: "link", label: "Cartolas / Movimientos", href: "/gestionBancaria/movimientos" },
        ],
      },
      {
        title: "Gestión de Ventas",
        items: [
          { type: "link", label: "Clientes", href: "/gestionVentas/clientes" },
          { type: "link", label: "Ventas", href: "/gestionVentas/ventas" },
          { type: "link", label: "Pagos / Cobranza", href: "/gestionVentas/cobranza" },
          { type: "link", label: "Notas de crédito", href: "/gestionVentas/notas-credito" },
        ],
      },
      {
        title: "Gestión de Compras",
        items: [
          { type: "link", label: "Proveedores", href: "/compras/proveedores" },
          { type: "link", label: "Compras", href: "/compras/compras" },
          { type: "link", label: "Pagos", href: "/compras/pagos" },
          { type: "link", label: "Gastos", href: "/compras/gastos" },
        ],
      },
      {
        title: "Gestión Contable",
        items: [
          { type: "link", label: "Asientos Contables", href: "/gestionContable/asientos" },
          { type: "link", label: "Diario", href: "/gestionContable/diario" },
          { type: "link", label: "Mayor", href: "/gestionContable/mayor" },
          { type: "link", label: "Balance Comprobacion", href: "/gestionContable/balance-comprobacion" },
          { type: "link", label: "Estado de Resultados", href: "/gestionContable/estado-resultados" },
          { type: "link", label: "Balance General", href: "/gestionContable/balance" },
          { type: "link", label: "Cuadre Contable", href: "/gestionContable/contabilidad/validaciones" },
          { type: "link", label: "Auditoria", href: "/gestionContable/auditoria" },
          { type: "link", label: "Cierre Contable", href: "/gestionContable/cierre" },
          { type: "link", label: "Auxiliares", href: "/gestionContable/auxiliares" },
        ],
      },
      {
        title: "Configuración Contable",
        items: [
          // ✅ Esto lo dejas tal cual (lo que ya tienes diseñado)
          { type: "link", label: "Plan de Cuentas", href: "/configuracion/plan-de-cuentas" },
          { type: "link", label: "Moneda y T/Cambio", href: "/configuracion/monedas" },
          { type: "link", label: "Periódos Contables", href: "/configuracion/periodos-contables" },
          { type: "link", label: "Impuestos", href: "/configuracion/impuestos" },
          { type: "link", label: "Cuentas Default", href: "/configuracion/cuentas-default" },


          // ✅ Segmentación como sub-menú real
          {
            type: "group",
            label: "Segmentación:",
            children: [
              { type: "link", label: "Centros de Costos", href: "/configuracion/centros-costos" },
              { type: "link", label: "Centros de Utilidad", href: "/configuracion/centros-utilidad" },
              { type: "link", label: "Sucursales", href: "/configuracion/sucursales" },
              { type: "link", label: "Articulos", href: "/configuracion/articulos" },
              { type: "link", label: "Pol. de Imputación", href: "/configuracion/politicas-imputacion" },
            ],
          },


          { type: "link", label: "Otros Parametros", href: "/configuracion/parametros-correlativos" },
          { type: "link", label: "Saldos Iniciales", href: "/configuracion/saldos-iniciales" },
        ],
      },
      {
        title: "Administración",
        items: [
          { type: "link", label: "Empresa", href: "/admin/empresa" },
          { type: "link", label: "Usuarios y Roles", href: "/admin/usuarios" },
          { type: "link", label: "Permisos", href: "/admin/permisos" },
          { type: "link", label: "Integraciones", href: "/admin/integraciones" },
        ],
      },
    ],
    []
  );

  // ✅ Todo cerrado por defecto
  const initialOpen: Record<string, boolean> = useMemo(() => {
    const base: Record<string, boolean> = {};
    for (const sec of sections) base[sec.title] = false;
    return base;
  }, [sections]);

  const [open, setOpen] = useState<Record<string, boolean>>(initialOpen);
  const [lastAutoPath, setLastAutoPath] = useState<string>("");

  useEffect(() => {
    if (!pathname) return;
    if (pathname === lastAutoPath) return;

    // Determina qué sección contiene el pathname (soporta links y grupos)
    const activeSection = sections.find((sec) =>
      sec.items.some((it) => {
        if (it.type === "link") return isActivePath(pathname, it.href);
        if (it.type === "group") return it.children.some((c) => isActivePath(pathname, c.href));
        return false;
      })
    );

    setOpen((prev) => {
      const next = { ...prev };
      for (const sec of sections) next[sec.title] = false;
      if (activeSection) next[activeSection.title] = true;
      return next;
    });

    setLastAutoPath(pathname);
  }, [pathname, sections, lastAutoPath]);

  return (
    <aside
      className={[
        "sticky top-0 h-screen shrink-0",
        "flex flex-col",
        "bg-gradient-to-b from-[#0b2b4f] via-[#123b63] to-[#0b2b4f]",
        "text-white",
        "border-r border-white/10",
        collapsed ? "w-[45px]" : "w-[220px]",
        "transition-all duration-200",
      ].join(" ")}
    >
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

      <nav className="flex-1 overflow-y-auto overscroll-contain px-0 py-3">
        {sections.map((sec) => {
          const isOpen = open[sec.title];

          return (
            <div key={sec.title} className="mb-3">
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

              {!collapsed && isOpen && (
                <div className="pt-1">
                  {sec.items.map((item, idx) => {
                    if (item.type === "divider") {
                      return <div key={`div-${sec.title}-${idx}`} className="mx-3 my-2 h-px bg-white/10" />;
                    }

                    if (item.type === "group") {
                      const groupActive = item.children.some((c) => isActivePath(pathname, c.href));

                      return (
                        <div key={`group-${item.label}`} className="pt-1">
                          <div
                            className={[
                              "relative block",
                              "px-6 py-2",
                              "text-[12px] font-semibold uppercase tracking-wide",
                              "transition",
                              groupActive ? "text-white" : "text-white/70",
                            ].join(" ")}
                          >
                            {groupActive && <span className="absolute left-0 top-0 h-full w-[6px] bg-[#2f8cff]" />}
                            {item.label}
                          </div>

                          <div className="pb-1">
                            {item.children.map((child) => {
                              const active = isActivePath(pathname, child.href);

                              return (
                                <Link
                                  key={child.href}
                                  href={child.href}
                                  className={[
                                    "relative block",
                                    "pl-10 pr-3 py-2",
                                    "text-[14px] font-medium",
                                    "transition",
                                    active
                                      ? "bg-white/15 text-white"
                                      : "text-white/80 hover:bg-white/10 hover:text-white",
                                  ].join(" ")}
                                >
                                  {active && (
                                    <span className="absolute left-0 top-0 h-full w-[6px] bg-[#2f8cff]" />
                                  )}
                                  <span className="mr-2 text-white/60">•</span>
                                  {child.label}
                                  <span className="absolute left-8 right-3 bottom-0 h-px bg-white/10" />
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }

                    // item.type === "link"
                    const active = isActivePath(pathname, item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={[
                          "relative block",
                          "px-8 py-2",
                          "text-[14px] font-medium",
                          "transition",
                          active ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white",
                        ].join(" ")}
                      >
                        {active && <span className="absolute left-0 top-0 h-full w-[6px] bg-[#2f8cff]" />}
                        {item.label}
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
  const common = "h-4 w-4 text-white/80";

  if (title === "Gestión Bancaria") return <FolderIcon className={common} />;
  if (title === "Gestión de Ventas") return <CalendarIcon className={common} />;
  if (title === "Gestión de Compras") return <CartIcon className={common} />;
  if (title === "Gestión Contable") return <FolderIcon className={common} />;
  if (title === "Configuración Contable") return <CalendarIcon className={common} />;
  if (title === "Administración") return <FolderIcon className={common} />;
  return <FolderIcon className={common} />;
}

function FolderIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d="M10 4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2h6z"
        opacity=".9"
      />
    </svg>
  );
}

function CalendarIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d="M7 2h2v3H7V2zm8 0h2v3h-2V2zM4 6h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z"
        opacity=".9"
      />
    </svg>
  );
}

function CartIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d="M7 18a2 2 0 11.001 3.999A2 2 0 017 18zm10 0a2 2 0 11.001 3.999A2 2 0 0117 18zM6 6h16l-2 9H8L6 6z"
        opacity=".9"
      />
      <path d="M3 3h2l1 4h-2L3 3z" />
    </svg>
  );
}
