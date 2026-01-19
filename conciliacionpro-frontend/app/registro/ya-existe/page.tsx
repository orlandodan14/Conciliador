"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function YaExistePage() {
  const sp = useSearchParams();
  const email = sp.get("email") ?? "";

  return (
    <main className="min-h-screen bg-slate-100 grid place-items-center px-4">
      <div className="max-w-md w-full overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200 shadow-[0_15px_60px_rgba(15,23,42,0.12)]">
        <div className="bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] px-6 py-5 text-white">
          <h1 className="text-2xl font-black">Este email ya tiene cuenta</h1>
          <p className="mt-1 text-[13px] text-white/85">
            No necesitas registrarte de nuevo.
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 text-[13px] text-slate-700">
            👤 Email: <span className="font-extrabold">{email || "tu email"}</span>
          </div>

          <Link
            href="/login"
            className="block h-11 w-full rounded-2xl bg-[#123b63] text-white hover:opacity-95 text-[14px] font-extrabold grid place-items-center"
          >
            Iniciar sesión
          </Link>

          <Link
            href="/recuperar"
            className="block h-11 w-full rounded-2xl bg-white ring-1 ring-slate-200 hover:bg-slate-50 text-[14px] font-extrabold grid place-items-center text-slate-900"
          >
            Olvidé mi contraseña
          </Link>

          <div className="text-[12px] text-slate-500">
            Si no recuerdas la contraseña, usa “Olvidé mi contraseña” y lo solucionas en 30 segundos.
          </div>
        </div>
      </div>
    </main>
  );
}
