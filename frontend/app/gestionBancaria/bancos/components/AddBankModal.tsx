"use client";

import { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function AddBankModal({ open, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <button
        className="absolute inset-0 bg-[#0b2b4f]/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Cerrar modal"
      />

      {/* ✅ CENTRADO REAL (sin py que “bota” el modal hacia abajo) */}
      <div className="relative inset-0 flex h-full w-full items-center justify-center px-4">
        <div
          className={[
            "w-[620px] max-w-[92vw]",
            // ✅ el modal completo nunca se sale; normalmente NO habrá scroll
            "max-h-[calc(100vh-120px)]",
          ].join(" ")}
        >
          <div className="flex max-h-[calc(100vh-120px)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10">
            {/* Header (más bajo) */}
            <div className="relative bg-gradient-to-r from-[#0c3f8a] via-[#1b5fb8] to-[#0c3f8a] px-5 py-3">
              <h2 className="text-center text-[18px] font-extrabold text-white tracking-tight">
                Registrar Nuevo Banco
              </h2>

              <button
                onClick={onClose}
                className="absolute right-3 top-2 rounded-md p-2 text-white/90 hover:bg-white/10 transition"
                aria-label="Cerrar"
                type="button"
              >
                <span className="text-[22px] leading-none">×</span>
              </button>
            </div>

            {/* Body (sin forzar scroll; solo si la pantalla es muy baja) */}
            <div className="flex-1 overflow-auto px-5 py-4">
              <div className="text-center">
                <div className="text-[14px] font-semibold text-[#2b3340]">
                  Ingresa los datos para registrar un banco.
                </div>
                <div className="mt-0.5 text-[12px] text-[#6e7b8c]">
                  Completa los campos para acceder a tus cartolas de forma automática.
                </div>
              </div>

              <div className="my-3 h-px w-full bg-black/10" />

              {/* Inputs principales */}
              <div className="space-y-2">
                <InputRow icon={<IconBank />} placeholder="Nombre del Banco" />
                <InputRow icon={<IconCard />} placeholder="Número de Cuenta" />
                <InputRow icon={<IconLink />} placeholder="Cuenta Contable (Opcional)" />
              </div>

              <div className="my-3 h-px w-full bg-black/10" />

              {/* Seguridad */}
              <div className="flex items-center gap-3 text-[#2b3340]">
                <div className="text-[12px] font-semibold">Datos de Acceso Seguro</div>
                <div className="h-px flex-1 bg-black/10" />
              </div>

              <p className="mt-2 text-[12px] text-[#4b5666] leading-5">
                Tus credenciales son cifradas y seguras. Solo se usarán para actualizar
                automáticamente tus cartolas.
              </p>

              <div className="mt-3 space-y-2">
                <InputRow icon={<IconLock />} placeholder="Usuario" />
                <InputRow icon={<IconLock />} placeholder="Contraseña" type="password" />
              </div>

              {/* Banner protegido (más chico) */}
              <div className="mt-3 rounded-xl bg-gradient-to-r from-[#e7f0ff] to-[#eaf2ff] px-4 py-2.5 ring-1 ring-black/10">
                <div className="flex items-center gap-3">
                  <ShieldIcon />
                  <div className="text-[12px] font-semibold text-[#2b3340]">
                    Tu información está protegida y segura.
                  </div>
                </div>
              </div>
            </div>

            {/* Footer botones (más bajo) */}
            <div className="flex items-center justify-center gap-3 px-5 py-3 bg-[#f4f6fb] border-t border-black/10">
              <button
                onClick={onClose}
                className="h-9 w-[160px] rounded-xl bg-white text-[#2b3340] text-[12px] font-semibold shadow-sm ring-1 ring-black/15 hover:bg-[#f7f9ff] transition"
                type="button"
              >
                Cancelar
              </button>

              <button
                className="h-9 w-[200px] rounded-xl bg-gradient-to-b from-[#63b255] to-[#2f7d2b] text-white text-[12px] font-extrabold shadow-sm ring-1 ring-black/15 hover:brightness-105 transition"
                type="button"
              >
                Registrar Banco
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InputRow({
  icon,
  placeholder,
  type = "text",
}: {
  icon: React.ReactNode;
  placeholder: string;
  type?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-black/15 bg-white px-3 py-2 shadow-sm">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#eef2f7] text-[#2f4f76] ring-1 ring-black/10">
        {icon}
      </div>
      <input
        type={type}
        placeholder={placeholder}
        className="h-8 w-full bg-transparent text-[13px] font-semibold text-[#2b3340] outline-none placeholder:text-[#526173]"
      />
    </div>
  );
}

/* ===== ICONOS ===== */

function IconBank() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path d="M12 3 2 8v2h20V8L12 3Z" />
      <path d="M4 11h3v8H4v-8Zm6 0h4v8h-4v-8Zm7 0h3v8h-3v-8Z" opacity=".9" />
      <path d="M2 20h20v2H2v-2Z" />
    </svg>
  );
}

function IconCard() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2H3V6Z" />
      <path d="M3 10h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8Z" opacity=".9" />
      <path d="M6 14h6v2H6v-2Z" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M10 13a5 5 0 0 1 0-7l1.5-1.5a5 5 0 0 1 7 7L17 13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M14 11a5 5 0 0 1 0 7L12.5 19.5a5 5 0 0 1-7-7L7 11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconLock() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 0 1 6 0v3H9Z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 64 64" className="h-9 w-9 shrink-0" aria-hidden="true">
      <path
        d="M32 4 8 14v18c0 16 10.6 25.7 24 28 13.4-2.3 24-12 24-28V14L32 4Z"
        fill="#1bbd7a"
        stroke="#0b5aa8"
        strokeWidth="3"
      />
      <path
        d="M20 34l8 8 18-20"
        fill="none"
        stroke="#ffffff"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
