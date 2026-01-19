// ===============================================================
// FILE: app/gestionBancaria/conciliacion/components/FilterPopover.tsx
// ===============================================================
"use client"; // ✅ Next.js: este componente usa eventos/estado del cliente

import React, { useCallback, useMemo } from "react"; // ✅ hooks para optimizar callbacks y clases
import { cn } from "@/app/lib/utils"; // ✅ helper para combinar clases Tailwind

// =========================
// TIPOS
// =========================

// ✅ lado donde “ancla” el popover dentro del contenedor relativo
// - "left": abre pegado a la esquina izquierda del contenedor
// - "right": abre pegado a la esquina derecha del contenedor
type PopoverSide = "left" | "right";

// ✅ Props del componente (extraído a type para legibilidad)
type FilterPopoverProps = {
  id: string; // identificador único de este popover (ej: "fecha", "banco", "deb")
  label: string; // etiqueta humana (solo para title/aria)
  openId: string | null; // id actualmente abierto (estado vive en el padre)
  setOpenId: (v: string | null) => void; // setter que abre/cierra popovers (estado vive en el padre)
  children: React.ReactNode; // contenido del popover (forms, selects, etc.)
  w?: string; // clases tailwind para ancho (ej: "w-72", "w-[280px]")
  side?: PopoverSide; // si se ancla a izquierda o derecha
  buttonClassName?: string; // opcional: clases extra para el botón
  panelClassName?: string; // opcional: clases extra para el panel
};

// =========================
// COMPONENTE
// =========================

export default function FilterPopover({
  id,
  label,
  openId,
  setOpenId,
  children,
  w = "w-72", // ✅ ancho default
  side = "left", // ✅ lado default
  buttonClassName,
  panelClassName,
}: FilterPopoverProps) {
  // ✅ está abierto si el openId global coincide con el id de este popover
  const isOpen = openId === id;

  // ✅ clases de anclaje del panel (no recalcula si no cambia `side`)
  const sideClass = useMemo(
    () => (side === "right" ? "right-0" : "left-0"),
    [side]
  );

  // ✅ handler del botón (optimizado)
  const handleToggle = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation(); // ✅ evita que el click se “escape” y cierre por listeners externos
      setOpenId(isOpen ? null : id); // ✅ toggle: si está abierto -> cierra, si no -> abre
    },
    [id, isOpen, setOpenId]
  );

  // ✅ evita que clicks dentro del panel cierren el popover por bubbling
  const handlePanelClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // ✅ el click queda dentro del popover
  }, []);

  return (
    <>
      {/* ✅ Botón “gatillo” del filtro */}
      <button
        type="button" // ✅ evita submit accidental si está dentro de un <form>
        onClick={handleToggle} // ✅ abre/cierra
        className={cn(
          // layout del botón
          "ml-1 inline-flex h-5 w-5 items-center justify-center rounded-md",
          // colores y hover
          "text-emerald-700 hover:text-emerald-900 hover:bg-emerald-200/60",
          // accesibilidad visual: focus ring
          "focus:outline-none focus:ring-2 focus:ring-emerald-300/60",
          // clases extras opcionales
          buttonClassName
        )}
        title={`Filtrar ${label}`} // ✅ tooltip
        aria-label={`Filtrar ${label}`} // ✅ screen readers
        aria-expanded={isOpen} // ✅ accesibilidad: estado abierto/cerrado
        aria-controls={`filter-popover-${id}`} // ✅ accesibilidad: vincula botón con panel
      >
        {/* caret simple (puedes cambiar a icono luego) */}
        <span className="text-[10px] leading-none">▾</span>
      </button>

      {/* ✅ Panel del popover (solo se renderiza si está abierto) */}
      {isOpen && (
        <div
          id={`filter-popover-${id}`} // ✅ id para aria-controls
          className={cn(
            // posiciona debajo del botón (asume que el contenedor padre tiene `relative`)
            "absolute top-full z-[999] mt-2",
            // anclaje: izquierda o derecha
            sideClass,
            // ancho del panel
            w,
            // opcional: clases extra
            panelClassName
          )}
          onClick={handlePanelClick} // ✅ evita cierre por bubbling
          role="dialog" // ✅ accesibilidad básica (popover)
          aria-label={`Popover filtro ${label}`} // ✅ accesibilidad
        >
          {children}
        </div>
      )}
    </>
  );
}
