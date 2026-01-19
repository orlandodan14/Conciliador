// ============================================================================
// FILE: app/registro-owner/page.tsx
// ============================================================================

"use client";

import Link from "next/link";
import { useState } from "react";

export default function RegistroOwnerPage() {
  // ✅ Estado local (mock): luego lo conectamos a Supabase Auth + DB
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [empresa, setEmpresa] = useState("");

  const onSubmit = () => {
    // ✅ Por ahora solo mostramos un mensaje (mock)
    alert(
      `Mock registro Owner:\n\nNombre: ${nombre}\nEmail: ${email}\nEmpresa: ${empresa}\n\nSiguiente paso: conectar Supabase.`
    );
  };

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-xl px-4 py-10">
        <Link href="/" className="text-[13px] font-bold text-slate-700 hover:underline">
          ← Volver al inicio
        </Link>

        <div className="mt-4 rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-[0_15px_60px_rgba(15,23,42,0.12)]">
          <h1 className="text-2xl font-black text-slate-900">Registrar Owner</h1>
          <p className="mt-2 text-[13px] text-slate-600">
            Este usuario será el <b>Super Usuario</b>: crea la empresa, configura país/moneda y luego invita a otros usuarios.
          </p>

          <div className="mt-6 space-y-3">
            <Field label="Nombre completo">
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-[14px] outline-none focus:bg-white focus:ring-4 focus:ring-slate-200"
                placeholder="Ej: Orlando Paredes"
              />
            </Field>

            <Field label="Email">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-[14px] outline-none focus:bg-white focus:ring-4 focus:ring-slate-200"
                placeholder="ej: orlando@email.com"
              />
            </Field>

            <Field label="Nombre de la Empresa">
              <input
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-[14px] outline-none focus:bg-white focus:ring-4 focus:ring-slate-200"
                placeholder="Ej: Mi Empresa SpA"
              />
            </Field>

            <button
              type="button"
              onClick={onSubmit}
              className="mt-2 h-11 w-full rounded-2xl bg-[#123b63] text-[14px] font-extrabold text-white hover:opacity-95"
            >
              Crear Owner (mock)
            </button>

            <div className="rounded-2xl bg-emerald-50 p-4 text-[12px] text-emerald-900 ring-1 ring-emerald-200">
              🔒 Más adelante, este flujo se conecta a Supabase Auth (correo + contraseña / magic link)
              y se crea automáticamente la Empresa con su configuración.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[12px] font-extrabold tracking-wide text-slate-700 uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}
