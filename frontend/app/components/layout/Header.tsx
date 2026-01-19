"use client";

type HeaderProps = {
  collapsed?: boolean;
};

export default function Header({ collapsed }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40">
      {/* Fondo azul similar al screenshot */}
      <div
        className={[
          "h-14 w-full",
          // Azul + leve variación (simula “textura”/profundidad)
          "bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f]",
          "shadow",
        ].join(" ")}
      >
        <div className="mx-auto flex h-14 items-center justify-between px-4">

          {/* CENTRO: Empresa (dropdown) */}
          <button
            className={[
              "hidden md:flex",
              "items-center gap-2",
              "rounded-md px-3 py-2",
              "text-sm font-medium text-white/90",
              "hover:bg-white/10",
              "transition",
            ].join(" ")}
          >
            <span>Empresa XYZ S.A.</span>
            <ChevronDown className="h-4 w-4 text-white/80" />
          </button>

          {/* DERECHA: Usuario (avatar + nombre + chevron) */}
          <button
            className={[
              "flex items-center gap-2",
              "rounded-md px-2 py-1.5",
              "hover:bg-white/10 transition",
            ].join(" ")}
          >
            {/* Avatar */}
            <div className="h-8 w-8 overflow-hidden rounded-full ring-2 ring-white/25 bg-white/10">
              {/* Placeholder (si luego quieres foto real, reemplazas por <img />) */}
              <div className="h-full w-full bg-gradient-to-b from-white/10 to-white/0" />
            </div>

            <span className="hidden md:block text-sm font-medium text-white/90">
              Carlos Pérez
            </span>
            <ChevronDown className="h-4 w-4 text-white/80" />
          </button>
        </div>
      </div>

      {/* Línea divisora inferior suave (como en la imagen) */}
      <div className="h-px w-full bg-black/10" />
    </header>
  );
}

/* ============ ICONOS INLINE (sin instalar nada) ============ */

function ChevronDown({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
