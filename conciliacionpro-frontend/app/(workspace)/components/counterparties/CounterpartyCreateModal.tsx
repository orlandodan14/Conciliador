"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** Helpers */
function cls(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

function normalizeIdentifier(raw: string) {
  // Solo alfanumérico + uppercase (multi-país)
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]+/g, "");
}

type CounterpartyType = "CLIENTE" | "PROVEEDOR" | "OTRO";

export type Counterparty = {
  id: string;
  company_id: string;
  identifier: string;
  identifier_normalized?: string; // puede venir o no según select
  name: string;
  type: CounterpartyType;
  is_active: boolean;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  extra?: any;
};

function SimpleModal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[min(820px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-xl border overflow-hidden">
        {/* Header azul (igual que otros modales) */}
        <div className="relative rounded-t-2xl bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] text-white px-5 py-4">
        {/* glows */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

            <div className="relative flex items-center justify-between gap-3">
                <h3 className="truncate text-lg font-black text-white">{title}</h3>

                <button
                className="ml-3 rounded-xl px-3 py-1.5 text-sm font-extrabold text-white/90 hover:bg-white/10"
                onClick={onClose}
                title="Cerrar"
                aria-label="Cerrar"
                >
                ✕
                </button>
            </div>
        </div>
        <div className="border-t border-white/10 p-5">{children}</div>
      </div>
    </div>
  );
}

export function CounterpartyCreateModal({
  open,
  companyId,
  initialIdentifier,
  onClose,
  onCreated,
}: {
  open: boolean;
  companyId: string;
  initialIdentifier?: string;
  onClose: () => void;
  onCreated: (cp: Counterparty) => void;
}) {
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<{
    identifier: string;
    name: string;
    type: CounterpartyType;
    email: string;
    phone: string;
    address: string;
    notes: string;
    extraJson: string;
    is_active: boolean;
  }>({
    identifier: "",
    name: "",
    type: "OTRO",
    email: "",
    phone: "",
    address: "",
    notes: "",
    extraJson: "{}",
    is_active: true,
  });

  // Cada vez que se abre, precargamos identifier
  useEffect(() => {
    if (!open) return;
    setForm((p) => ({
      ...p,
      identifier: initialIdentifier ? String(initialIdentifier) : "",
      name: "",
      type: "OTRO",
      email: "",
      phone: "",
      address: "",
      notes: "",
      extraJson: "{}",
      is_active: true,
    }));
  }, [open, initialIdentifier]);

  const normalized = useMemo(() => normalizeIdentifier(form.identifier), [form.identifier]);

  async function save() {
    setSaving(true);
    try {
      if (!companyId) throw new Error("Falta companyId.");
      if (!form.identifier.trim()) throw new Error("identifier requerido.");
      if (!form.name.trim()) throw new Error("name requerido.");

      const identNorm = normalizeIdentifier(form.identifier);
      if (!identNorm) throw new Error("identifier inválido.");

      let extraObj: any = {};
      try {
        extraObj = form.extraJson?.trim() ? JSON.parse(form.extraJson) : {};
      } catch {
        throw new Error("extraJson no es JSON válido.");
      }

      // 1) Intentar buscar si ya existe por identifier_normalized (regla anti-duplicados)
      const { data: existing, error: findErr } = await supabase
        .from("counterparties")
        .select("id,company_id,identifier,identifier_normalized,name,type,is_active,email,phone,address,notes,extra")
        .eq("company_id", companyId)
        .eq("identifier_normalized", identNorm)
        .maybeSingle();

      if (findErr) throw findErr;

      if (existing?.id) {
        // Si existe, opcionalmente actualizamos nombre/contacto si estaban vacíos.
        // (No forzamos cambios si no quieres; esto evita “pisar” datos.)
        onCreated(existing as any);
        onClose();
        return;
      }

      // 2) Insertar
      const payload: any = {
        company_id: companyId,
        identifier: form.identifier.trim(),
        name: form.name.trim(),
        type: form.type,
        is_active: !!form.is_active,
        extra: extraObj,
      };
      if (form.email.trim()) payload.email = form.email.trim();
      if (form.phone.trim()) payload.phone = form.phone.trim();
      if (form.address.trim()) payload.address = form.address.trim();
      if (form.notes.trim()) payload.notes = form.notes.trim();

      const { data, error } = await supabase
        .from("counterparties")
        .insert(payload)
        .select("id,company_id,identifier,identifier_normalized,name,type,is_active,email,phone,address,notes,extra")
        .single();

      if (error) {
        // Si chocó por unique (otro creó al mismo tiempo), re-leemos y devolvemos.
        const msg = String((error as any)?.message ?? "");
        if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
          const { data: again, error: againErr } = await supabase
            .from("counterparties")
            .select("id,company_id,identifier,identifier_normalized,name,type,is_active,email,phone,address,notes,extra")
            .eq("company_id", companyId)
            .eq("identifier_normalized", identNorm)
            .single();
          if (againErr) throw againErr;
          onCreated(again as any);
          onClose();
          return;
        }
        throw error;
      }

      onCreated(data as any);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <SimpleModal
      open={open}
      title={`Crear tercero (${form.identifier || "—"})`}
      onClose={onClose}
    >
      <div className="space-y-4">
        {/* Aviso de normalización */}
        <div className="rounded-xl border bg-slate-50 px-3 py-2 text-xs text-slate-700">
          Se normaliza como: <b>{normalized || "—"}</b> (solo letras/números, sin puntos/guiones).
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-600">identifier</label>
            <div className="text-[11px] text-slate-500">RUT/NIT/RFC/Documento</div>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={form.identifier}
              onChange={(e) => setForm((p) => ({ ...p, identifier: e.target.value }))}
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs text-slate-600">name</label>
            <div className="text-[11px] text-slate-500">Razón social</div>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Ej: Comercial ABC SpA"
            />
          </div>

          <div>
            <label className="text-xs text-slate-600">type / Tipo de tercero</label>
            <select
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={form.type}
              onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as CounterpartyType }))}
            >
              <option value="CLIENTE">CLIENTE</option>
              <option value="PROVEEDOR">PROVEEDOR</option>
              <option value="OTRO">OTRO</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-600">email (opcional)</label>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="contacto@empresa.com"
            />
          </div>

          <div>
            <label className="text-xs text-slate-600">phone (opcional)</label>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              placeholder="+56 9 ..."
            />
          </div>

          <div className="md:col-span-3">
            <label className="text-xs text-slate-600">address (opcional)</label>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={form.address}
              onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
              placeholder="Dirección"
            />
          </div>

          <div className="md:col-span-3">
            <label className="text-xs text-slate-600">notes (opcional)</label>
            <textarea
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm max-h-[80px]"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Notas internas..."
            />
          </div>

          <div className="md:col-span-3">
            <label className="text-xs text-slate-600">extra (json)</label>
            <div className="text-[11px] text-slate-500">
              Se guarda en extra (jsonb). Ej: {"{ \"tags\": [\"vip\"] }"}
            </div>
            <textarea
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-mono max-h-[90px]"
              value={form.extraJson}
              onChange={(e) => setForm((p) => ({ ...p, extraJson: e.target.value }))}
            />
          </div>

          <div className="md:col-span-3 flex items-center gap-2">
            <input
              id="cp-active"
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
            />
            <label htmlFor="cp-active" className="text-sm text-slate-700">
              is_active
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            className={cls(
              "rounded-lg px-3 py-2 text-sm text-white",
              saving ? "bg-slate-400" : "bg-slate-900 hover:bg-slate-800"
            )}
            onClick={save}
            disabled={saving}
          >
            {saving ? "Guardando..." : "Crear"}
          </button>
        </div>
      </div>
    </SimpleModal>
  );
}

export default CounterpartyCreateModal;