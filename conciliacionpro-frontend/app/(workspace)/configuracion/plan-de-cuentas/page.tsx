"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabaseClient";

/**
 * =========================
 * Tipos
 * =========================
 */
type Clasificacion =
  | "Activo Corriente"
  | "Activo No Corriente"
  | "Pasivo Corriente"
  | "Pasivo No Corriente"
  | "Patrimonio"
  | "Ingreso"
  | "Costo"
  | "Gasto"
  | "Resultado"
  | "Orden";

type ExcelRow = {
  Clase: string;
  Cod_N1: number | string;
  Nombre_N1: string;
  Cod_N2: number | string;
  Nombre_N2: string;
  Cod_N3: number | string;
  Nombre_N3: string;
  Cod_N4: number | string;
  Nombre_N4: string;
  Clasificación: Clasificacion | string;
};

type ParsedRow = {
  clase: string;
  codN1: string;
  nombreN1: string;
  codN2: string;
  nombreN2: string;
  codN3: string;
  nombreN3: string;
  codN4: string;
  nombreN4: string;
  clasificacion: Clasificacion;
};

type TreeNode = {
  id?: string;          // <-- viene de la BD
  code: string;
  name: string;
  level: 1 | 2 | 3 | 4;
  clasificacion?: Clasificacion;
  children?: TreeNode[];
};


type AccountNodeRow = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  level: number;
  parent_id: string | null;
  clasificacion: string | null;
  created_at?: string;
};

/**
 * =========================
 * Helpers
 * =========================
 */
function cls(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

function normalizeCode(v: any) {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  if (!s) return "";
  const asNum = Number(s);
  if (!Number.isNaN(asNum) && Number.isFinite(asNum)) return String(Math.trunc(asNum));
  // deja solo dígitos
  return s.replace(/\D/g, "");
}

function normalizeText(v: any) {
  return String(v ?? "").trim();
}

function isValidClasificacion(x: string): x is Clasificacion {
  const allowed: Clasificacion[] = [
    "Activo Corriente",
    "Activo No Corriente",
    "Pasivo Corriente",
    "Pasivo No Corriente",
    "Patrimonio",
    "Ingreso",
    "Costo",
    "Gasto",
    "Resultado",
    "Orden",
  ];
  return allowed.includes(x as Clasificacion);
}

/**
 * =========================
 * Excel: descargar formato (archivo fijo en /public)
 * =========================
 */
function downloadTemplateStatic() {
  window.location.href = "/templates/Formato_Plan_de_Cuentas.xlsx";
}

function downloadMyPlanExcel(tree: TreeNode[]) {
  if (!tree?.length) {
    alert("No hay plan de cuentas para descargar.");
    return;
  }

  // a) construir filas en formato "plantilla"
  const rows: ExcelRow[] = [];

  const walk = (n1: TreeNode) => {
    const codN1 = n1.code;
    const nombreN1 = n1.name;

    (n1.children ?? []).forEach((n2) => {
      const codN2 = n2.code;
      const nombreN2 = n2.name;

      (n2.children ?? []).forEach((n3) => {
        const codN3 = n3.code;
        const nombreN3 = n3.name;

        (n3.children ?? []).forEach((n4) => {
          if (n4.level !== 4) return;

          rows.push({
            Clase: "", // opcional: si no lo usas, déjalo vacío
            Cod_N1: codN1,
            Nombre_N1: nombreN1,
            Cod_N2: codN2,
            Nombre_N2: nombreN2,
            Cod_N3: codN3,
            Nombre_N3: nombreN3,
            Cod_N4: n4.code,
            Nombre_N4: n4.name,
            Clasificación: (n4.clasificacion ?? "") as any,
          });
        });
      });
    });
  };

  tree.forEach((n1) => walk(n1));

  // b) crear workbook con hoja PLANTILLA
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows, {
    header: [
      "Clase",
      "Cod_N1",
      "Nombre_N1",
      "Cod_N2",
      "Nombre_N2",
      "Cod_N3",
      "Nombre_N3",
      "Cod_N4",
      "Nombre_N4",
      "Clasificación",
    ],
  });

  // c) opcional: anchos de columnas
  (ws as any)["!cols"] = [
    { wch: 18 }, // Clase
    { wch: 10 }, // Cod_N1
    { wch: 28 }, // Nombre_N1
    { wch: 10 }, // Cod_N2
    { wch: 28 }, // Nombre_N2
    { wch: 10 }, // Cod_N3
    { wch: 28 }, // Nombre_N3
    { wch: 12 }, // Cod_N4
    { wch: 40 }, // Nombre_N4
    { wch: 18 }, // Clasificación
  ];

  XLSX.utils.book_append_sheet(wb, ws, "PLANTILLA");

  // d) nombre archivo
  const yyyy = new Date().getFullYear();
  const mm = String(new Date().getMonth() + 1).padStart(2, "0");
  const dd = String(new Date().getDate()).padStart(2, "0");
  const filename = `Plan_de_Cuentas_${yyyy}-${mm}-${dd}.xlsx`;

  XLSX.writeFile(wb, filename);
}


/**
 * =========================
 * Excel: parse y validar
 * =========================
 */
function parseExcel(file: File): Promise<ExcelRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });

        const sheetName = wb.SheetNames.find((n) => n.toUpperCase() === "PLANTILLA") ?? wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];

        resolve(json as ExcelRow[]);
      } catch (err: any) {
        reject(new Error(err?.message ?? "Error al procesar Excel."));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function validateAndNormalize(rows: ExcelRow[]) {
  const errors: string[] = [];
  const cleaned: ParsedRow[] = [];

  if (!rows.length) return { ok: false, errors: ["El archivo no contiene filas."], cleaned: [] as ParsedRow[] };

  const required = [
    "Clase",
    "Cod_N1",
    "Nombre_N1",
    "Cod_N2",
    "Nombre_N2",
    "Cod_N3",
    "Nombre_N3",
    "Cod_N4",
    "Nombre_N4",
    "Clasificación",
  ];

  const keys = Object.keys(rows[0] || {});
  const missing = required.filter((k) => !keys.includes(k));
  if (missing.length) return { ok: false, errors: [`Faltan columnas: ${missing.join(", ")}`], cleaned: [] };

  const seenCod4 = new Set<string>();

  rows.forEach((r, idx) => {
    const rowNum = idx + 2;

    const clase = normalizeText((r as any)["Clase"]);
    const codN1 = normalizeCode((r as any)["Cod_N1"]);
    const nombreN1 = normalizeText((r as any)["Nombre_N1"]);
    const codN2 = normalizeCode((r as any)["Cod_N2"]);
    const nombreN2 = normalizeText((r as any)["Nombre_N2"]);
    const codN3 = normalizeCode((r as any)["Cod_N3"]);
    const nombreN3 = normalizeText((r as any)["Nombre_N3"]);
    const codN4 = normalizeCode((r as any)["Cod_N4"]);
    const nombreN4 = normalizeText((r as any)["Nombre_N4"]);
    const clasifRaw = normalizeText((r as any)["Clasificación"]);

    const isEmpty =
      !clase && !codN1 && !nombreN1 && !codN2 && !nombreN2 && !codN3 && !nombreN3 && !codN4 && !nombreN4 && !clasifRaw;
    if (isEmpty) return;

    if (!codN4 || !nombreN4) errors.push(`Fila ${rowNum}: Cod_N4 y Nombre_N4 son obligatorios.`);
    if (!codN1 || !nombreN1) errors.push(`Fila ${rowNum}: Cod_N1 y Nombre_N1 son obligatorios.`);
    if (!codN2 || !nombreN2) errors.push(`Fila ${rowNum}: Cod_N2 y Nombre_N2 son obligatorios.`);
    if (!codN3 || !nombreN3) errors.push(`Fila ${rowNum}: Cod_N3 y Nombre_N3 son obligatorios.`);
    if (!clasifRaw) errors.push(`Fila ${rowNum}: Clasificación es obligatoria.`);

    if (clasifRaw && !isValidClasificacion(clasifRaw)) {
      errors.push(`Fila ${rowNum}: Clasificación inválida "${clasifRaw}".`);
    }

    if (codN4) {
      if (seenCod4.has(codN4)) errors.push(`Fila ${rowNum}: Cod_N4 duplicado (${codN4}).`);
      seenCod4.add(codN4);
    }

    [codN1, codN2, codN3, codN4].forEach((v, i) => {
      const label = ["Cod_N1", "Cod_N2", "Cod_N3", "Cod_N4"][i];
      if (v && !/^\d+$/.test(v)) errors.push(`Fila ${rowNum}: ${label} debe contener solo números.`);
    });

    if (codN4 && nombreN4 && isValidClasificacion(clasifRaw)) {
      cleaned.push({
        clase,
        codN1,
        nombreN1,
        codN2,
        nombreN2,
        codN3,
        nombreN3,
        codN4,
        nombreN4,
        clasificacion: clasifRaw,
      });
    }
  });

  return { ok: errors.length === 0 && cleaned.length > 0, errors, cleaned };
}

/**
 * =========================
 * Armar árbol desde EXCEL (solo memoria)
 * =========================
 */
function buildTree(rows: ParsedRow[]): TreeNode[] {
  const mapN1 = new Map<string, TreeNode>();
  const mapN2 = new Map<string, TreeNode>();
  const mapN3 = new Map<string, TreeNode>();

  rows.forEach((r) => {
    if (!mapN1.has(r.codN1)) mapN1.set(r.codN1, { code: r.codN1, name: r.nombreN1, level: 1, children: [] });

    if (!mapN2.has(r.codN2)) {
      mapN2.set(r.codN2, { code: r.codN2, name: r.nombreN2, level: 2, children: [] });
      mapN1.get(r.codN1)!.children!.push(mapN2.get(r.codN2)!);
    }

    if (!mapN3.has(r.codN3)) {
      mapN3.set(r.codN3, { code: r.codN3, name: r.nombreN3, level: 3, children: [] });
      mapN2.get(r.codN2)!.children!.push(mapN3.get(r.codN3)!);
    }

    mapN3.get(r.codN3)!.children!.push({
      code: r.codN4,
      name: r.nombreN4,
      level: 4,
      clasificacion: r.clasificacion,
    });
  });

  const sortNode = (n: TreeNode) => {
    n.children?.sort((a, b) => a.code.localeCompare(b.code));
    n.children?.forEach(sortNode);
  };

  const roots = Array.from(mapN1.values()).sort((a, b) => a.code.localeCompare(b.code));
  roots.forEach(sortNode);
  return roots;
}

/**
 * =========================
 * Armar árbol desde BD (account_nodes)
 * =========================
 */
function buildTreeFromDb(rows: AccountNodeRow[]): TreeNode[] {
  const map = new Map<string, TreeNode & { _id: string; _parent: string | null }>();

  rows.forEach((r) => {
    const lvl = (r.level ?? 0) as 1 | 2 | 3 | 4;
    if (lvl < 1 || lvl > 4) return;

    map.set(r.id, {
      _id: r.id,
      _parent: r.parent_id ?? null,
      id: r.id, // ✅
      code: String(r.code),
      name: String(r.name),
      level: lvl,
      clasificacion: r.clasificacion ? (r.clasificacion as Clasificacion) : undefined,
      children: [],
    });
  });

  const roots: Array<TreeNode & { _id: string; _parent: string | null }> = [];
  map.forEach((node) => {
    if (!node._parent) {
      roots.push(node);
      return;
    }
    const parent = map.get(node._parent);
    if (parent) parent.children!.push(node);
    else roots.push(node);
  });

  const sortNode = (n: any) => {
    if (n.children?.length) {
      n.children.sort((a: any, b: any) => String(a.code).localeCompare(String(b.code)));
      n.children.forEach(sortNode);
    } else {
      delete n.children;
    }
  };

  roots.sort((a, b) => String(a.code).localeCompare(String(b.code)));
  roots.forEach(sortNode);

  // ✅ strip pero manteniendo id
  const strip = (n: any): TreeNode => {
    const out: any = { id: n.id, code: n.code, name: n.name, level: n.level };
    if (n.level === 4 && n.clasificacion) out.clasificacion = n.clasificacion;
    if (n.children?.length) out.children = n.children.map(strip);
    return out as TreeNode;
  };

  return roots.map(strip);
}


/**
 * =========================
 * Modal
 * =========================
 */
function Modal({
  open,
  title,
  children,
  onClose,
  footer,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/35 p-4 sm:p-6" role="dialog" aria-modal="true">
      <div className="mx-auto flex h-full max-w-2xl items-center justify-center">
        <div
          className={cls(
            "w-full overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5",
            "max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)]"
          )}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white/90 px-5 py-4 backdrop-blur">
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold text-slate-900">{title}</div>
              <div className="mt-0.5 text-xs font-semibold text-slate-500">Configuración contable</div>
            </div>

            <button
              onClick={onClose}
              className="ml-3 rounded-xl px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              aria-label="Cerrar"
              title="Cerrar"
            >
              ✕
            </button>
          </div>

          <div
            className={cls(
              "px-5 py-4 overflow-y-auto",
              footer
                ? "max-h-[calc(100vh-2rem-160px)] sm:max-h-[calc(100vh-3rem-160px)]"
                : "max-h-[calc(100vh-2rem-88px)] sm:max-h-[calc(100vh-3rem-88px)]"
            )}
          >
            {children}
          </div>

          {footer ? <div className="sticky bottom-0 z-10 border-t bg-white/90 px-5 py-4 backdrop-blur">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}

/**
 * =========================
 * UI bits
 * =========================
 */
function Pill({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{children}</span>;
}

function ExpandIcon({ open }: { open: boolean }) {
  return <span className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700">{open ? "−" : "+"}</span>;
}

function ClasifCard({
  value,
  selected,
  onSelect,
}: {
  value: Clasificacion;
  selected: boolean;
  onSelect: (v: Clasificacion) => void;
}) {
  const meta: Record<Clasificacion, { title: string; desc: string; icon: string }> = {
    "Activo Corriente": { title: "Lo que tienes (rápido)", desc: "Caja, bancos, clientes, etc.", icon: "💰" },
    "Activo No Corriente": { title: "Lo que tienes (largo)", desc: "Propiedades, equipos, vehículos…", icon: "🏠" },
    "Pasivo Corriente": { title: "Lo que debes (rápido)", desc: "Proveedores, impuestos por pagar…", icon: "⏳" },
    "Pasivo No Corriente": { title: "Lo que debes (largo)", desc: "Créditos largos, leasing…", icon: "🧱" },
    Patrimonio: { title: "Lo que queda (tuyo)", desc: "Capital, utilidades acumuladas…", icon: "👑" },
    Ingreso: { title: "Dinero que entra", desc: "Ventas, servicios…", icon: "📥" },
    Costo: { title: "Costo de lo que vendes", desc: "Costo del producto/servicio…", icon: "🏷️" },
    Gasto: { title: "Gastos del día a día", desc: "Arriendo, sueldos, marketing…", icon: "🧾" },
    Resultado: { title: "Ganancia o pérdida", desc: "Resultado del período…", icon: "📊" },
    Orden: { title: "Solo control", desc: "Cuentas de control internas…", icon: "📌" },
  };

  const m = meta[value];

  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cls("w-full rounded-2xl border p-4 text-left transition", selected ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:bg-slate-50")}
    >
      <div className="flex items-start gap-3">
        <div className="text-2xl">{m.icon}</div>
        <div className="min-w-0">
          <div className="text-sm font-black text-slate-900">{m.title}</div>
          <div className="mt-0.5 text-xs font-semibold text-slate-600">{m.desc}</div>
          <div className="mt-2">
            <span
              className={cls(
                "inline-flex rounded-full px-2.5 py-1 text-[11px] font-black",
                selected ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
              )}
            >
              {selected ? "Seleccionado" : "Elegir"}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

/**
 * =========================
 * Árbol helpers (para el modal)
 * =========================
 */
function removeNodeById(tree: TreeNode[], id: string): TreeNode[] {
  const walk = (nodes: TreeNode[]): TreeNode[] => {
    const out: TreeNode[] = [];
    for (const n of nodes) {
      if (n.id === id) continue;

      if (n.children?.length) {
        const nextChildren = walk(n.children);
        out.push(nextChildren.length ? { ...n, children: nextChildren } : { ...n, children: undefined });
      } else {
        out.push(n);
      }
    }
    return out;
  };

  return walk(tree);
}


function collectLevel(tree: TreeNode[], level: 1 | 2 | 3) {
  const out: Array<{ code: string; name: string; parent1?: string; parent2?: string }> = [];
  const walk = (n: TreeNode, p1?: string, p2?: string) => {
    if (n.level === level) out.push({ code: n.code, name: n.name, parent1: p1, parent2: p2 });
    n.children?.forEach((c) => {
      if (n.level === 1) walk(c, n.code, p2);
      else if (n.level === 2) walk(c, p1, n.code);
      else walk(c, p1, p2);
    });
  };
  tree.forEach((r) => walk(r));
  const map = new Map<string, (typeof out)[0]>();
  out.forEach((x) => map.set(x.code, x));
  return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
}

function collectLeafCodes(tree: TreeNode[]) {
  const codes: number[] = [];
  const walk = (n: TreeNode) => {
    if (n.level === 4) {
      const num = Number(n.code);
      if (!Number.isNaN(num)) codes.push(num);
    }
    n.children?.forEach(walk);
  };
  tree.forEach(walk);
  return codes;
}

function hasLeafCode(tree: TreeNode[], code: string) {
  let found = false;
  const walk = (n: TreeNode) => {
    if (found) return;
    if (n.level === 4 && n.code === code) found = true;
    n.children?.forEach(walk);
  };
  tree.forEach(walk);
  return found;
}

function addLeafToTree(params: { tree: TreeNode[]; n1: string; n2: string; n3: string; leaf: TreeNode }) {
  const { tree, n1, n2, n3, leaf } = params;

  return tree.map((lvl1) => {
    if (lvl1.code !== n1) return lvl1;

    const children2 = (lvl1.children ?? []).map((lvl2) => {
      if (lvl2.code !== n2) return lvl2;

      const children3 = (lvl2.children ?? []).map((lvl3) => {
        if (lvl3.code !== n3) return lvl3;

        const kids = [...(lvl3.children ?? [])];
        kids.push(leaf);
        kids.sort((a, b) => a.code.localeCompare(b.code));

        return { ...lvl3, children: kids };
      });

      return { ...lvl2, children: children3 };
    });

    return { ...lvl1, children: children2 };
  });
}

/** ✅ Nuevos helpers para construir plan manual (N1/N2/N3) */
function hasNodeAtLevel(tree: TreeNode[], level: 1 | 2 | 3, code: string) {
  let found = false;
  const walk = (n: TreeNode) => {
    if (found) return;
    if (n.level === level && n.code === code) found = true;
    n.children?.forEach(walk);
  };
  tree.forEach(walk);
  return found;
}

function addLevel1(tree: TreeNode[], node: { code: string; name: string }) {
  if (hasNodeAtLevel(tree, 1, node.code)) return tree;
  const next = [...tree, { level: 1 as const, code: node.code, name: node.name, children: [] as TreeNode[] }];
  next.sort((a, b) => a.code.localeCompare(b.code));
  return next;
}

function addLevel2(tree: TreeNode[], n1: string, node: { code: string; name: string }) {
  if (hasNodeAtLevel(tree, 2, node.code)) return tree;
  return tree.map((lvl1) => {
    if (lvl1.code !== n1) return lvl1;
    const kids = [...(lvl1.children ?? [])];
    kids.push({ level: 2 as const, code: node.code, name: node.name, children: [] as TreeNode[] });
    kids.sort((a, b) => a.code.localeCompare(b.code));
    return { ...lvl1, children: kids };
  });
}

function addLevel3(tree: TreeNode[], n1: string, n2: string, node: { code: string; name: string }) {
  if (hasNodeAtLevel(tree, 3, node.code)) return tree;

  return tree.map((lvl1) => {
    if (lvl1.code !== n1) return lvl1;

    const children2 = (lvl1.children ?? []).map((lvl2) => {
      if (lvl2.code !== n2) return lvl2;

      const kids = [...(lvl2.children ?? [])];
      kids.push({ level: 3 as const, code: node.code, name: node.name, children: [] as TreeNode[] });
      kids.sort((a, b) => a.code.localeCompare(b.code));
      return { ...lvl2, children: kids };
    });

    return { ...lvl1, children: children2 };
  });
}

/**
 * =========================
 * Página
 * =========================
 */
export default function PlanDeCuentasPage() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [q, setQ] = useState("");
  const [filterClasif, setFilterClasif] = useState<string>("Mostrar Todos");

  // estado empresa activa
  const [activeCompanyId, setActiveCompanyId] = useState<string>("");

  // Modal upload
  const [openUpload, setOpenUpload] = useState(false);
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [uploading, setUploading] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<ParsedRow[]>([]);
  const [previewErrors, setPreviewErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ✅ Modal creación manual
  type CreateKind = "N1" | "N2" | "N3" | "N4";
  const [createKind, setCreateKind] = useState<CreateKind>("N4");

  // inputs para crear nodos
  const [newGroupCode, setNewGroupCode] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newSubCode, setNewSubCode] = useState("");
  const [newSubName, setNewSubName] = useState("");
  const [newCatCode, setNewCatCode] = useState("");
  const [newCatName, setNewCatName] = useState("");

  // flags “crear nuevo” desde selects
  const [useNewN1, setUseNewN1] = useState(false);
  const [useNewN2, setUseNewN2] = useState(false);
  const [useNewN3, setUseNewN3] = useState(false);

  const [openNew, setOpenNew] = useState(false);
  const [newStep, setNewStep] = useState<1 | 2 | 3>(1);
  const [newClasif, setNewClasif] = useState<Clasificacion | null>(null);

  const [newN1, setNewN1] = useState("");
  const [newN2, setNewN2] = useState("");
  const [newN3, setNewN3] = useState("");

  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newErr, setNewErr] = useState<string>("");

  const allClasifs = useMemo(
    () => [
      "Mostrar Todos",
      "Activo Corriente",
      "Activo No Corriente",
      "Pasivo Corriente",
      "Pasivo No Corriente",
      "Patrimonio",
      "Ingreso",
      "Costo",
      "Gasto",
      "Resultado",
      "Orden",
    ],
    []
  );

  const hasPlan = tree.length > 0;

  /**
   * =========================
   * Empresa activa (localStorage) + cargar plan desde BD
   * =========================
   */
  useEffect(() => {
    const readCompany = () => {
      let cid = "";
      try {
        cid = localStorage.getItem("active_company_id") ?? "";
      } catch {}
      setActiveCompanyId(cid);
      return cid;
    };

    const load = async () => {
      const cid = readCompany();
      if (!cid) {
        setTree([]);
        setExpanded({});
        return;
      }
      await loadPlanFromDb(cid);
    };

    load();

    const onCompanyChanged = () => load();
    window.addEventListener("company:changed", onCompanyChanged as any);
    return () => window.removeEventListener("company:changed", onCompanyChanged as any);
  }, []);

  async function loadPlanFromDb(companyId: string) {
    const { data, error } = await supabase
      .from("account_nodes")
      .select("id,company_id,code,name,level,parent_id,clasificacion,created_at")
      .eq("company_id", companyId)
      .order("level", { ascending: true })
      .order("code", { ascending: true });

    if (error) {
      console.log("loadPlanFromDb error:", error);
      setTree([]);
      setExpanded({});
      return;
    }

    const rows = (data ?? []) as AccountNodeRow[];
    const t = buildTreeFromDb(rows);
    setTree(t);

    // expandir N1 por defecto
    const exp: Record<string, boolean> = {};
    t.forEach((n1) => (exp[getNodeKey(n1)] = true));
    setExpanded(exp);

  }

  /**
   * =========================
   * Guardar desde Excel a BD
   * (crea N1->N4 con parent_id correcto)
   * =========================
   */
  async function saveParsedRowsToDb(companyId: string, rows: ParsedRow[]) {
    // 1) cargar mapa actual code->id por nivel (y total)
    const { data: existing, error: e1 } = await supabase
      .from("account_nodes")
      .select("id,code,level,parent_id")
      .eq("company_id", companyId);

    if (e1) throw e1;

    const existingRows = (existing ?? []) as Pick<AccountNodeRow, "id" | "code" | "level" | "parent_id">[];

    const byKey = new Map<string, string>(); // key = `${level}:${code}` -> id
    existingRows.forEach((r) => byKey.set(`${r.level}:${r.code}`, r.id));

    // helpers
    const upsertMany = async (payload: Array<Partial<AccountNodeRow>>) => {
      if (!payload.length) return;
      const { error } = await supabase
        .from("account_nodes")
        .upsert(payload as any, { onConflict: "company_id,code" });
      if (error) throw error;
    };

    // 2) N1 (sin parent)
    const n1Map = new Map<string, { code: string; name: string }>();
    rows.forEach((r) => {
      n1Map.set(r.codN1, { code: r.codN1, name: r.nombreN1 });
    });

    await upsertMany(
      Array.from(n1Map.values()).map((x) => ({
        company_id: companyId,
        code: x.code,
        name: x.name,
        level: 1,
        parent_id: null,
        clasificacion: null,
      }))
    );

    // re-fetch ids N1
    const { data: n1Db, error: eN1 } = await supabase
      .from("account_nodes")
      .select("id,code,level")
      .eq("company_id", companyId)
      .eq("level", 1);

    if (eN1) throw eN1;
    (n1Db ?? []).forEach((r: any) => byKey.set(`1:${r.code}`, r.id));

    // 3) N2 (parent N1)
    const n2Map = new Map<string, { code: string; name: string; parentCode: string }>();
    rows.forEach((r) => {
      n2Map.set(r.codN2, { code: r.codN2, name: r.nombreN2, parentCode: r.codN1 });
    });

    await upsertMany(
      Array.from(n2Map.values()).map((x) => ({
        company_id: companyId,
        code: x.code,
        name: x.name,
        level: 2,
        parent_id: byKey.get(`1:${x.parentCode}`) ?? null,
        clasificacion: null,
      }))
    );

    const { data: n2Db, error: eN2 } = await supabase
      .from("account_nodes")
      .select("id,code,level")
      .eq("company_id", companyId)
      .eq("level", 2);

    if (eN2) throw eN2;
    (n2Db ?? []).forEach((r: any) => byKey.set(`2:${r.code}`, r.id));

    // 4) N3 (parent N2)
    const n3Map = new Map<string, { code: string; name: string; parentCode: string }>();
    rows.forEach((r) => {
      n3Map.set(r.codN3, { code: r.codN3, name: r.nombreN3, parentCode: r.codN2 });
    });

    await upsertMany(
      Array.from(n3Map.values()).map((x) => ({
        company_id: companyId,
        code: x.code,
        name: x.name,
        level: 3,
        parent_id: byKey.get(`2:${x.parentCode}`) ?? null,
        clasificacion: null,
      }))
    );

    const { data: n3Db, error: eN3 } = await supabase
      .from("account_nodes")
      .select("id,code,level")
      .eq("company_id", companyId)
      .eq("level", 3);

    if (eN3) throw eN3;
    (n3Db ?? []).forEach((r: any) => byKey.set(`3:${r.code}`, r.id));

    // 5) N4 (parent N3 + clasificacion)
    const n4Payload = rows.map((r) => ({
      company_id: companyId,
      code: r.codN4,
      name: r.nombreN4,
      level: 4,
      parent_id: byKey.get(`3:${r.codN3}`) ?? null,
      clasificacion: r.clasificacion,
    }));

    await upsertMany(n4Payload);
  }

  /**
   * =========================
   * UI: filtros / expandir
   * =========================
   */
  const filteredTree = useMemo(() => {
    if (!hasPlan) return [];
    const query = q.trim().toLowerCase();

    const matchLeaf = (leaf: TreeNode) => {
      const text = `${leaf.code} ${leaf.name}`.toLowerCase();
      const okQ = !query || text.includes(query);
      const okC = filterClasif === "Mostrar Todos" || leaf.clasificacion === filterClasif;
      return okQ && okC;
    };

    const prune = (node: TreeNode): TreeNode | null => {
      if (node.level === 4) return matchLeaf(node) ? node : null;
      const kids = (node.children ?? []).map(prune).filter(Boolean) as TreeNode[];
      if (kids.length) return { ...node, children: kids };

      const text = `${node.code} ${node.name}`.toLowerCase();
      if (query && text.includes(query)) return node;
      return null;
    };

    return tree.map(prune).filter(Boolean) as TreeNode[];
  }, [tree, hasPlan, q, filterClasif]);

  function toggle(key: string) {
    const y = window.scrollY;                 // 👈 guarda scroll actual
    setExpanded((p) => ({ ...p, [key]: !p[key] }));
    requestAnimationFrame(() => window.scrollTo({ top: y })); // 👈 restaura
  }


  function getNodeKey(n: TreeNode) {
    return n.id ?? `${n.level}:${n.code}`;
  }


  function setAllExpanded(value: boolean) {
    const next: Record<string, boolean> = {};
    const walk = (n: TreeNode) => {
      if (n.level !== 4) next[getNodeKey(n)] = value;
      n.children?.forEach(walk);
    };
    tree.forEach(walk);
    setExpanded(next);
  }


  function resetUploadModal() {
    setStep("upload");
    setFile(null);
    setPreviewRows([]);
    setPreviewErrors([]);
    setUploading(false);
  }

  function openUploadModal() {
    resetUploadModal();
    setOpenUpload(true);
  }

  async function handlePickFile(f: File) {
    setFile(f);
    setUploading(true);
    try {
      const raw = await parseExcel(f);
      const { errors, cleaned } = validateAndNormalize(raw);
      setPreviewErrors(errors);
      setPreviewRows(cleaned);
      setStep("review");
    } catch (e: any) {
      setPreviewErrors([e?.message ?? "Error procesando archivo."]);
      setPreviewRows([]);
      setStep("review");
    } finally {
      setUploading(false);
    }
  }

  async function onConfirmLoad() {
    if (previewErrors.length) return;
    if (!activeCompanyId) {
      alert("No hay empresa activa. Selecciona una empresa primero.");
      return;
    }

    setUploading(true);
    try {
      // 1) guarda en BD
      await saveParsedRowsToDb(activeCompanyId, previewRows);

      // 2) recarga desde BD
      await loadPlanFromDb(activeCompanyId);

      // 3) cierra
      setOpenUpload(false);
      resetUploadModal();
    } catch (err: any) {
      console.log("onConfirmLoad error:", err);
      alert(err?.message ?? "Error al guardar el plan en BD.");
    } finally {
      setUploading(false);
    }
  }

  /**
   * =========================
   * Modal: opciones del árbol
   * =========================
   */
  const n1Options = useMemo(() => collectLevel(tree, 1), [tree]);
  const n2Options = useMemo(() => collectLevel(tree, 2), [tree]);
  const n3Options = useMemo(() => collectLevel(tree, 3), [tree]);

  // filtro por padres (solo aplica cuando NO estás creando nuevos)
  const n2Filtered = useMemo(() => n2Options.filter((x) => !newN1 || x.parent1 === newN1), [n2Options, newN1]);
  const n3Filtered = useMemo(
    () => n3Options.filter((x) => (!newN1 || x.parent1 === newN1) && (!newN2 || x.parent2 === newN2)),
    [n3Options, newN1, newN2]
  );

  function resetNewModal() {
    setNewStep(1);
    setCreateKind("N4");

    setNewClasif(null);
    setNewN1("");
    setNewN2("");
    setNewN3("");
    setNewCode("");
    setNewName("");
    setNewErr("");

    setUseNewN1(false);
    setUseNewN2(false);
    setUseNewN3(false);

    setNewGroupCode("");
    setNewGroupName("");
    setNewSubCode("");
    setNewSubName("");
    setNewCatCode("");
    setNewCatName("");
  }

  function openNewModal() {
    resetNewModal();
    setOpenNew(true);
    if (n1Options[0]) setNewN1(n1Options[0].code);
  }

  function suggestNextCode() {
    const nums: number[] = [];

    const effectiveN3 = useNewN3 ? normalizeCode(newCatCode) : newN3;

    const walk = (n: TreeNode) => {
      if (n.level === 3 && n.code === effectiveN3) {
        (n.children ?? []).forEach((c) => {
          if (c.level === 4) {
            const num = Number(c.code);
            if (!Number.isNaN(num)) nums.push(num);
          }
        });
        return;
      }
      n.children?.forEach(walk);
    };

    tree.forEach(walk);

    if (!nums.length) {
      const all = collectLeafCodes(tree);
      const maxAll = all.length ? Math.max(...all) : 1000;
      setNewCode(String(maxAll + 1));
      return;
    }

    const max = Math.max(...nums);
    setNewCode(String(max + 1));
  }

  useEffect(() => {
    if (openNew && newStep === 3 && createKind === "N4") {
      if (!normalizeCode(newCode)) {
        suggestNextCode();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNew, newStep, newN3, useNewN3, newCatCode, createKind]);

  function goNextNew() {
    setNewErr("");

    if (newStep === 1) {
      if (createKind === "N4" && !newClasif) return setNewErr("Selecciona el tipo de cuenta para continuar.");
      setNewStep(2);
      return;
    }

    if (newStep === 2) {
      if (createKind === "N1") {
        setNewStep(3);
        return;
      }

      if (createKind === "N2") {
        if (!useNewN1 && !newN1) return setNewErr("Selecciona un Grupo (N1) o crea uno nuevo.");
        setNewStep(3);
        return;
      }

      if (createKind === "N3") {
        if (!useNewN1 && !newN1) return setNewErr("Selecciona/crea Grupo (N1).");
        if (!useNewN2 && !newN2) return setNewErr("Selecciona/crea Subgrupo (N2).");
        setNewStep(3);
        return;
      }

      if (createKind === "N4") {
        const okN1 = useNewN1 ? !!normalizeCode(newGroupCode) : !!newN1;
        const okN2 = useNewN2 ? !!normalizeCode(newSubCode) : !!newN2;
        const okN3 = useNewN3 ? !!normalizeCode(newCatCode) : !!newN3;

        if (!okN1 || !okN2 || !okN3) return setNewErr("Selecciona/crea Grupo, Subgrupo y Categoría.");
        setNewStep(3);
        return;
      }
    }
  }

  function goBackNew() {
    setNewErr("");
    setNewStep((s) => (s === 1 ? 1 : ((s - 1) as any)));
  }

  /**
   * =========================
   * Crear en BD (manual)
   * =========================
   */
  async function ensureNodeInDb(params: {
    companyId: string;
    level: 1 | 2 | 3 | 4;
    code: string;
    name: string;
    parentId: string | null;
    clasificacion: string | null;
  }) {
    const { companyId, level, code, name, parentId, clasificacion } = params;

    const { error } = await supabase
      .from("account_nodes")
      .upsert(
        {
          company_id: companyId,
          code,
          name,
          level,
          parent_id: parentId,
          clasificacion,
        } as any,
        { onConflict: "company_id,code" }
      );

    if (error) throw error;

    const { data, error: e2 } = await supabase
      .from("account_nodes")
      .select("id,code,level,parent_id")
      .eq("company_id", companyId)
      .eq("code", code)
      .maybeSingle();

    if (e2) throw e2;
    return data as any as { id: string };
  }

  async function findNodeId(companyId: string, level: 1 | 2 | 3, code: string) {
    const { data, error } = await supabase
      .from("account_nodes")
      .select("id")
      .eq("company_id", companyId)
      .eq("level", level)
      .eq("code", code)
      .maybeSingle();

    if (error) throw error;
    return (data?.id as string) || "";
  }

  /** ✅ Confirmación final: crea N1/N2/N3 o N4 (AHORA EN BD) */
  async function confirmCreate() {
    setNewErr("");
    if (!activeCompanyId) return setNewErr("No hay empresa activa. Selecciona una empresa primero.");

    const effN1 = useNewN1 ? normalizeCode(newGroupCode) : newN1;
    const effN2 = useNewN2 ? normalizeCode(newSubCode) : newN2;
    const effN3 = useNewN3 ? normalizeCode(newCatCode) : newN3;

    const mustDigits = (s: string) => /^\d+$/.test(s);

    try {
      setUploading(true);

      if (createKind === "N1") {
        const c = normalizeCode(newGroupCode);
        const n = normalizeText(newGroupName);
        if (!c || !n) return setNewErr("Código y nombre de Grupo son obligatorios.");
        if (!mustDigits(c)) return setNewErr("Código de Grupo debe ser numérico.");

        await ensureNodeInDb({
          companyId: activeCompanyId,
          level: 1,
          code: c,
          name: n,
          parentId: null,
          clasificacion: null,
        });

        await loadPlanFromDb(activeCompanyId);
        setOpenNew(false);
        resetNewModal();
        return;
      }

      if (createKind === "N2") {
        if (useNewN1) {
          const c1 = normalizeCode(newGroupCode);
          const n1 = normalizeText(newGroupName);
          if (!c1 || !n1) return setNewErr("Para crear Subgrupo: completa Código y nombre del Grupo (N1).");
          if (!mustDigits(c1)) return setNewErr("Código de Grupo debe ser numérico.");

          await ensureNodeInDb({
            companyId: activeCompanyId,
            level: 1,
            code: c1,
            name: n1,
            parentId: null,
            clasificacion: null,
          });
        } else {
          if (!effN1) return setNewErr("Selecciona un Grupo (N1) o crea uno nuevo.");
        }

        const c2 = normalizeCode(newSubCode);
        const n2 = normalizeText(newSubName);
        if (!c2 || !n2) return setNewErr("Código y nombre de Subgrupo son obligatorios.");
        if (!mustDigits(c2)) return setNewErr("Código de Subgrupo debe ser numérico.");

        const parentN1 = useNewN1 ? normalizeCode(newGroupCode) : effN1;
        const parentId = await findNodeId(activeCompanyId, 1, parentN1);

        await ensureNodeInDb({
          companyId: activeCompanyId,
          level: 2,
          code: c2,
          name: n2,
          parentId: parentId || null,
          clasificacion: null,
        });

        await loadPlanFromDb(activeCompanyId);
        setOpenNew(false);
        resetNewModal();
        return;
      }

      if (createKind === "N3") {
        // N1
        if (useNewN1) {
          const c1 = normalizeCode(newGroupCode);
          const n1 = normalizeText(newGroupName);
          if (!c1 || !n1) return setNewErr("Completa Código y nombre del Grupo (N1).");
          if (!mustDigits(c1)) return setNewErr("Código de Grupo debe ser numérico.");

          await ensureNodeInDb({
            companyId: activeCompanyId,
            level: 1,
            code: c1,
            name: n1,
            parentId: null,
            clasificacion: null,
          });
        } else {
          if (!effN1) return setNewErr("Selecciona/crea Grupo (N1).");
        }

        // N2
        if (useNewN2) {
          const c2 = normalizeCode(newSubCode);
          const n2 = normalizeText(newSubName);
          if (!c2 || !n2) return setNewErr("Completa Código y nombre del Subgrupo (N2).");
          if (!mustDigits(c2)) return setNewErr("Código de Subgrupo debe ser numérico.");

          const parentN1 = useNewN1 ? normalizeCode(newGroupCode) : effN1;
          const parentIdN1 = await findNodeId(activeCompanyId, 1, parentN1);

          await ensureNodeInDb({
            companyId: activeCompanyId,
            level: 2,
            code: c2,
            name: n2,
            parentId: parentIdN1 || null,
            clasificacion: null,
          });
        } else {
          if (!effN2) return setNewErr("Selecciona/crea Subgrupo (N2).");
        }

        const c3 = normalizeCode(newCatCode);
        const n3 = normalizeText(newCatName);
        if (!c3 || !n3) return setNewErr("Código y nombre de Categoría son obligatorios.");
        if (!mustDigits(c3)) return setNewErr("Código de Categoría debe ser numérico.");

        const parentN2 = useNewN2 ? normalizeCode(newSubCode) : effN2;
        const parentIdN2 = await findNodeId(activeCompanyId, 2, parentN2);

        await ensureNodeInDb({
          companyId: activeCompanyId,
          level: 3,
          code: c3,
          name: n3,
          parentId: parentIdN2 || null,
          clasificacion: null,
        });

        await loadPlanFromDb(activeCompanyId);
        setOpenNew(false);
        resetNewModal();
        return;
      }

      // N4
      if (!newClasif) return setNewErr("Selecciona clasificación.");

      // validar ruta
      if (useNewN1) {
        const c1 = normalizeCode(newGroupCode);
        const n1 = normalizeText(newGroupName);
        if (!c1 || !n1) return setNewErr("Completa Código y nombre del Grupo (N1).");
        if (!mustDigits(c1)) return setNewErr("Código de Grupo debe ser numérico.");
      } else if (!effN1) return setNewErr("Selecciona/crea Grupo (N1).");

      if (useNewN2) {
        const c2 = normalizeCode(newSubCode);
        const n2 = normalizeText(newSubName);
        if (!c2 || !n2) return setNewErr("Completa Código y nombre del Subgrupo (N2).");
        if (!mustDigits(c2)) return setNewErr("Código de Subgrupo debe ser numérico.");
      } else if (!effN2) return setNewErr("Selecciona/crea Subgrupo (N2).");

      if (useNewN3) {
        const c3 = normalizeCode(newCatCode);
        const n3 = normalizeText(newCatName);
        if (!c3 || !n3) return setNewErr("Completa Código y nombre de la Categoría (N3).");
        if (!mustDigits(c3)) return setNewErr("Código de Categoría debe ser numérico.");
      } else if (!effN3) return setNewErr("Selecciona/crea Categoría (N3).");

      // validar cuenta
      const code = normalizeCode(newCode);
      const name = normalizeText(newName);
      if (!code) return setNewErr("El código es obligatorio.");
      if (!mustDigits(code)) return setNewErr("El código debe tener solo números.");
      if (hasLeafCode(tree, code)) return setNewErr(`Ya existe una cuenta con código ${code}.`);
      if (!name) return setNewErr("El nombre es obligatorio.");

      // asegura N1/N2/N3 en BD si fueron "nuevos"
      const finalN1 = useNewN1 ? normalizeCode(newGroupCode) : effN1;
      const finalN2 = useNewN2 ? normalizeCode(newSubCode) : effN2;
      const finalN3 = useNewN3 ? normalizeCode(newCatCode) : effN3;

      if (useNewN1) {
        await ensureNodeInDb({
          companyId: activeCompanyId,
          level: 1,
          code: finalN1,
          name: normalizeText(newGroupName),
          parentId: null,
          clasificacion: null,
        });
      }

      const n1Id = await findNodeId(activeCompanyId, 1, finalN1);

      if (useNewN2) {
        await ensureNodeInDb({
          companyId: activeCompanyId,
          level: 2,
          code: finalN2,
          name: normalizeText(newSubName),
          parentId: n1Id || null,
          clasificacion: null,
        });
      }

      const n2Id = await findNodeId(activeCompanyId, 2, finalN2);

      if (useNewN3) {
        await ensureNodeInDb({
          companyId: activeCompanyId,
          level: 3,
          code: finalN3,
          name: normalizeText(newCatName),
          parentId: n2Id || null,
          clasificacion: null,
        });
      }

      const n3Id = await findNodeId(activeCompanyId, 3, finalN3);

      // crea cuenta N4
      await ensureNodeInDb({
        companyId: activeCompanyId,
        level: 4,
        code,
        name,
        parentId: n3Id || null,
        clasificacion: newClasif,
      });

      await loadPlanFromDb(activeCompanyId);
      setOpenNew(false);
      resetNewModal();
    } catch (err: any) {
      console.log("confirmCreate error:", err);
      setNewErr(err?.message ?? "Error creando en BD.");
    } finally {
      setUploading(false);
    }
  }

  /**
   * =========================
   * Delete (BD) - botón 🗑️
   * =========================
   */
  async function handleDeleteNode(node: TreeNode) {
    if (!activeCompanyId) {
      alert("No hay empresa activa.");
      return;
    }

    if (node.children?.length) {
      alert("No se puede borrar porque tiene hijos. Primero borra los hijos.");
      return;
    }

    const ok = confirm(`¿Seguro que quieres eliminar: ${node.code} — ${node.name}?`);
    if (!ok) return;

    const nodeId = node.id;
    if (!nodeId) {
      // fallback: si por alguna razón no vino id, mantén el comportamiento anterior
      const { error } = await supabase
        .from("account_nodes")
        .delete()
        .eq("company_id", activeCompanyId)
        .eq("code", node.code)
        .eq("level", node.level);

      if (error) {
        console.log("delete error:", error);
        alert(error.message);
        return;
      }

      await loadPlanFromDb(activeCompanyId);
      return;
    }

    // ✅ Optimista: quita de UI al tiro (sin refrescar)
    const prevTree = tree;
    const prevExpanded = expanded;

    setTree((t) => removeNodeById(t, nodeId));
    setExpanded((p) => {
      const copy = { ...p };
      delete copy[nodeId];
      return copy;
    });

    // ✅ Borra en BD por id (más seguro)
    const { error } = await supabase
      .from("account_nodes")
      .delete()
      .eq("id", nodeId)
      .eq("company_id", activeCompanyId);

    if (error) {
      console.log("delete error:", error);
      alert(error.message);

      // rollback
      setTree(prevTree);
      setExpanded(prevExpanded);
      return;
    }

    // ✅ listo: NO recargamos
  }


  /**
   * Render accordion
   */
  const Row = ({
    node,
    indent,
    hasChildren,
    open,
    onToggle,
    right,
  }: {
    node: TreeNode;
    indent: number;
    hasChildren: boolean;
    open: boolean;
    onToggle?: () => void;
    right?: React.ReactNode;
  }) => {
    return (
      <div
        className={cls(
          "group grid items-center border-b border-slate-100 px-5 hover:bg-slate-50",
          node.level === 1 ? "py-2.5" : node.level === 4 ? "py-1.5" : "py-2",
          "grid-cols-[32px_260px_1fr_260px_80px]",
          node.level === 1 && "bg-slate-50/70"
        )}
      >
        <div className="flex justify-center">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300" />
        </div>

        <div className="min-w-0 pr-4 border-r border-slate-200">
          <div className="flex items-center gap-2" style={{ paddingLeft: indent }}>
            {hasChildren ? (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()} // 👈 evita focus/scroll raro
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggle?.();
                }}
                className="shrink-0"
                title={open ? "Contraer" : "Expandir"}
              >
                <ExpandIcon open={open} />
              </button>

            ) : (
              <div className="h-7 w-7 shrink-0" />
            )}

            <div
              className={cls(
                "text-[13px] leading-5",
                node.level <= 2 ? "font-black text-slate-900" : "font-extrabold text-slate-700",
                "break-all"
              )}
              title={node.code}
            >
              {node.code}
            </div>
          </div>
        </div>

        <div className="min-w-0 px-4 border-r border-slate-200">
          <div
            className={cls("min-w-0 text-[13px] leading-5", node.level <= 2 ? "font-black text-slate-900" : "text-slate-800", "truncate")}
            style={{ paddingLeft: indent }}
            title={node.name}
          >
            {node.name}
          </div>
        </div>

        <div className="min-w-0 px-4 border-r border-slate-200 flex justify-end">{right}</div>

        <div className="pl-4 flex justify-end">
          <button
            onClick={() => handleDeleteNode(node)}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Eliminar"
            type="button"
          >
            🗑️
          </button>
        </div>
      </div>
    );
  };

  const renderNode = (node: TreeNode) => {
    const hasChildren = !!node.children?.length;
    const nodeKey = getNodeKey(node);
    const open = expanded[nodeKey] ?? false;



    const indent = node.level === 1 ? 0 : node.level === 2 ? 18 : node.level === 3 ? 40 : 62;

    const right =
      node.level === 4 ? <Pill>{node.clasificacion}</Pill> : <span className="text-[12px] font-extrabold text-slate-400">—</span>;

    return (
      <React.Fragment key={node.id ?? `${node.level}-${node.code}`}>
        <Row
          node={node}
          indent={indent}
          hasChildren={hasChildren}
          open={open}
          onToggle={hasChildren ? () => toggle(nodeKey) : undefined}
          right={right}
        />

        {hasChildren && open ? node.children!.map(renderNode) : null}
      </React.Fragment>
    );
  };

  return (
    <div className="p-6">
      <div className="overflow-hidden rounded-[28px] bg-white ring-1 ring-slate-200 shadow-[0_18px_70px_rgba(15,23,42,0.10)]">
        <div className="relative bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] px-7 py-7 text-white">
          <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[12px] font-extrabold uppercase text-white/80">Configuración contable</div>
              <h1 className="mt-1 text-3xl font-black leading-tight">Plan de cuentas</h1>
              <div className="mt-2 text-[13px] text-white/85">Sube tu plan en Excel o constrúyelo manualmente.</div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={downloadTemplateStatic}
                className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition"
              >
                Descargar formato
              </button>

              <button
                onClick={openUploadModal}
                className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition"
              >
                Cargar desde Excel
              </button>

              <button
                onClick={openNewModal}
                className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition"
              >
                + Nueva Cuenta
              </button>

              <button
                onClick={() => downloadMyPlanExcel(tree)}
                disabled={!hasPlan}
                className={cls(
                  "rounded-2xl px-4 py-2 text-[12px] font-extrabold ring-1 transition",
                  hasPlan
                    ? "bg-white/10 ring-white/15 hover:bg-white/15 text-white"
                    : "bg-white/5 ring-white/10 text-white/50 cursor-not-allowed"
                )}
                title={hasPlan ? "Descargar tu plan actual" : "Primero carga o crea un plan"}
              >
                Descargar mi plan
              </button>


              {hasPlan ? (
                <>
                  <button type="button" onClick={() => setAllExpanded(true)} className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition">
                    Expandir
                  </button>
                  <button type="button" onClick={() => setAllExpanded(false)} className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition">
                    Contraer
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="p-7">
          {!hasPlan ? (
            <div className="rounded-[26px] bg-white p-7 ring-1 ring-slate-200">
              <div className="mx-auto max-w-2xl text-center">
                <div className="text-5xl">📄</div>
                <h2 className="mt-4 text-[22px] font-black text-slate-900">Todavía no hay un plan de cuentas cargado</h2>
                <p className="mt-2 text-[13px] text-slate-600">
                  Puedes cargar por Excel o empezar a crear el plan manualmente con <b>+ Nueva Cuenta</b>.
                </p>

                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  <button type="button" className="rounded-2xl bg-slate-900 px-4 py-2 text-[12px] font-extrabold text-white hover:opacity-95 transition" onClick={downloadTemplateStatic}>
                    Descargar formato Excel
                  </button>

                  <button type="button" className="rounded-2xl bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50 transition" onClick={openUploadModal}>
                    Cargar desde Excel
                  </button>
                </div>

                {!activeCompanyId ? (
                  <div className="mt-4 text-xs font-semibold text-amber-700">⚠️ No hay empresa activa. Selecciona una empresa arriba.</div>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-[26px] bg-white p-5 ring-1 ring-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Buscar por código o nombre..."
                        className="w-96 max-w-full rounded-2xl border border-slate-200 bg-white px-11 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                      />
                      <span className="absolute left-4 top-2 text-slate-400">🔎</span>
                      {q ? (
                        <button type="button" onClick={() => setQ("")} className="absolute right-4 top-2 text-slate-400 hover:text-slate-600" title="Limpiar">
                          ✕
                        </button>
                      ) : null}
                    </div>

                    <select
                      value={filterClasif}
                      onChange={(e) => setFilterClasif(e.target.value)}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                    >
                      {allClasifs.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="text-[12px] font-extrabold text-slate-600">
                    Tip: usa <span className="text-slate-900">Expandir</span> para ver niveles rápido.
                  </div>
                </div>
              </div>

              <div className="mt-3 overflow-hidden rounded-[26px] bg-white ring-1 ring-slate-200">
                <div className={cls("grid items-center border-b border-slate-200 bg-slate-50 px-5 py-2.5", "grid-cols-[32px_260px_1fr_260px_80px]")}>
                  <div></div>
                  <div className="text-[11px] font-extrabold uppercase text-slate-600 pr-4 border-r border-slate-200">Código</div>
                  <div className="text-[11px] font-extrabold uppercase text-slate-600 px-4 border-r border-slate-200">Cuenta</div>
                  <div className="text-[11px] font-extrabold uppercase text-slate-600 px-4 border-r border-slate-200 text-right">Clasificación</div>
                  <div className="text-[11px] font-extrabold uppercase text-slate-600 pl-4 text-right">Acciones</div>
                </div>

                {filteredTree.length ? (
                  filteredTree.map(renderNode)
                ) : (
                  <div className="px-5 py-14 text-center text-[13px] text-slate-600">No hay resultados.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-6 text-center text-[12px] text-slate-500">ConciliaciónPro • Configuración contable</div>

      {/* Modal upload */}
      <Modal
        open={openUpload}
        title={step === "upload" ? "Cargar plan de cuentas" : "Revisión del archivo"}
        onClose={() => {
          setOpenUpload(false);
          resetUploadModal();
        }}
        footer={
          step === "upload" ? (
            <div className="flex items-center justify-between">
              <button type="button" onClick={downloadTemplateStatic} className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Descargar formato
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setOpenUpload(false);
                    resetUploadModal();
                  }}
                  className="rounded-full px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>

                <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                  Seleccionar archivo
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setStep("upload");
                  setFile(null);
                  setPreviewRows([]);
                  setPreviewErrors([]);
                }}
                className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Volver
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setOpenUpload(false);
                    resetUploadModal();
                  }}
                  className="rounded-full px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>

                <button
                  disabled={previewErrors.length > 0 || uploading}
                  onClick={onConfirmLoad}
                  className={cls("rounded-full px-5 py-2 text-sm font-semibold text-white", previewErrors.length > 0 || uploading ? "bg-slate-400" : "bg-slate-900 hover:bg-slate-800")}
                >
                  {uploading ? "Guardando..." : "Confirmar y cargar"}
                </button>
              </div>
            </div>
          )
        }
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handlePickFile(f);
          }}
        />

        {step === "upload" ? (
          <div>
            <div
              className={cls(
                "flex min-h-[190px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center",
                uploading ? "border-slate-200 bg-slate-50" : "border-slate-200 hover:bg-slate-50"
              )}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const f = e.dataTransfer.files?.[0];
                if (f) handlePickFile(f);
              }}
            >
              <div className="text-4xl">📄</div>
              <div className="mt-3 text-base font-bold text-slate-900">{uploading ? "Procesando archivo..." : "Arrastra tu Excel aquí o haz clic para seleccionar"}</div>
              <div className="mt-1 text-sm text-slate-500">Formato soportado: .xlsx</div>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
              <b>Tip:</b> Completa la hoja <b>PLANTILLA</b>. La carga se valida antes de guardar.
            </div>

            {!activeCompanyId ? (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                ⚠️ Debes seleccionar una <b>empresa activa</b> antes de guardar en BD.
              </div>
            ) : null}
          </div>
        ) : (
          <div>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-slate-500">Archivo</div>
                <div className="truncate font-bold text-slate-900">{file?.name ?? "—"}</div>
              </div>

              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <div>
                  <b>{previewRows.length}</b> filas válidas
                </div>
                <div className="text-slate-500">{previewErrors.length ? `${previewErrors.length} error(es)` : "0 errores"}</div>
              </div>
            </div>

            {previewErrors.length ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <div className="font-bold text-rose-900">Corrige estos errores antes de cargar</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-800">
                  {previewErrors.slice(0, 12).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
                {previewErrors.length > 12 ? <div className="mt-2 text-sm text-rose-700">…y {previewErrors.length - 12} más.</div> : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="font-bold text-emerald-900">Todo OK ✅</div>
                <div className="mt-1 text-sm text-emerald-800">Puedes confirmar para cargar el plan de cuentas.</div>
              </div>
            )}

            <div className="mt-4">
              <div className="mb-2 text-sm font-bold text-slate-700">Vista previa (primeras 10 filas)</div>
              <div className="max-h-[260px] overflow-auto rounded-2xl border border-slate-200">
                <div className="grid grid-cols-[160px_1fr_220px] gap-3 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
                  <div>Cod_N4</div>
                  <div>Nombre_N4</div>
                  <div className="text-right">Clasificación</div>
                </div>

                {previewRows.slice(0, 10).map((r, i) => (
                  <div key={i} className="grid grid-cols-[160px_1fr_220px] items-center gap-3 border-t px-3 py-2">
                    <div className="truncate text-sm font-semibold text-slate-700">{r.codN4}</div>
                    <div className="truncate text-sm text-slate-900">{r.nombreN4}</div>
                    <div className="flex justify-end">
                      <Pill>{r.clasificacion}</Pill>
                    </div>
                  </div>
                ))}

                {!previewRows.length ? <div className="px-3 py-8 text-center text-sm text-slate-500">No se detectaron filas válidas.</div> : null}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ✅ Modal Crear (plan manual) */}
      <Modal
        open={openNew}
        title="Crear (plan manual)"
        onClose={() => {
          setOpenNew(false);
          resetNewModal();
        }}
        footer={
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-slate-500">
              Paso <span className="font-black text-slate-900">{newStep}</span> de 3
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setOpenNew(false);
                  resetNewModal();
                }}
                className="rounded-full px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>

              {newStep > 1 ? (
                <button type="button" onClick={goBackNew} className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Volver
                </button>
              ) : null}

              {newStep < 3 ? (
                <button type="button" onClick={goNextNew} className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                  Continuar
                </button>
              ) : (
                <button type="button" onClick={confirmCreate} className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                  {uploading ? "Creando..." : "Crear"}
                </button>
              )}
            </div>
          </div>
        }
      >
        {newErr ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{newErr}</div> : null}

        {!activeCompanyId ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            ⚠️ Debes seleccionar una <b>empresa activa</b> arriba antes de crear en BD.
          </div>
        ) : null}

        {/* Selector de qué crear */}
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-black text-slate-600">¿Qué quieres crear?</div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { k: "N1", t: "Grupo", d: "Nivel 1" },
              { k: "N2", t: "Subgrupo", d: "Nivel 2" },
              { k: "N3", t: "Categoría", d: "Nivel 3" },
              { k: "N4", t: "Cuenta", d: "Nivel 4" },
            ].map((x) => (
              <button
                key={x.k}
                type="button"
                onClick={() => {
                  setCreateKind(x.k as any);
                  setNewErr("");
                }}
                className={cls("rounded-2xl border p-3 text-left", createKind === x.k ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:bg-slate-50")}
              >
                <div className="text-sm font-black text-slate-900">{x.t}</div>
                <div className="text-xs font-semibold text-slate-500">{x.d}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Paso 1 */}
        {newStep === 1 ? (
          createKind === "N4" ? (
            <div>
              <div className="text-sm font-black text-slate-900">1) Tipo / Clasificación</div>
              <div className="mt-1 text-sm text-slate-600">Elige la opción que mejor describe la cuenta.</div>

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(
                  [
                    "Activo Corriente",
                    "Activo No Corriente",
                    "Pasivo Corriente",
                    "Pasivo No Corriente",
                    "Patrimonio",
                    "Ingreso",
                    "Costo",
                    "Gasto",
                    "Resultado",
                    "Orden",
                  ] as Clasificacion[]
                ).map((c) => (
                  <ClasifCard key={c} value={c} selected={newClasif === c} onSelect={setNewClasif} />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-600">
              Vas a crear un{" "}
              <b>{createKind === "N1" ? "Grupo" : createKind === "N2" ? "Subgrupo" : "Categoría"}</b>. En el siguiente paso eliges dónde cuelga (si aplica).
            </div>
          )
        ) : null}

        {/* Paso 2: Seleccionar/crear ruta */}
        {newStep === 2 ? (
          <div>
            <div className="text-sm font-black text-slate-900">2) Ubicación</div>
            <div className="mt-1 text-sm text-slate-600">Selecciona dónde cuelga o crea niveles nuevos.</div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              {/* N1 */}
              <div>
                <div className="text-xs font-black text-slate-600">Grupo (Nivel 1)</div>

                <select
                  value={createKind === "N1" ? "" : useNewN1 ? "__new__" : newN1}
                  onChange={(e) => {
                    const v = e.target.value;
                    const isNew = v === "__new__";
                    setUseNewN1(isNew);
                    if (!isNew) setNewN1(v);
                    setUseNewN2(false);
                    setUseNewN3(false);
                    setNewN2("");
                    setNewN3("");
                    setNewErr("");
                  }}
                  disabled={createKind === "N1"}
                  className={cls(
                    "mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none",
                    createKind === "N1" && "opacity-60"
                  )}
                >
                  <option value="">{createKind === "N1" ? "No aplica" : "Selecciona..."}</option>
                  <option value="__new__">+ Crear nuevo grupo</option>
                  {n1Options.map((x) => (
                    <option key={x.code} value={x.code}>
                      {x.code} — {x.name}
                    </option>
                  ))}
                </select>

                {useNewN1 ? (
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      value={newGroupCode}
                      onChange={(e) => setNewGroupCode(e.target.value)}
                      placeholder="Código N1 (solo números)"
                      className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold"
                    />
                    <input
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="Nombre N1 (ej: Activo)"
                      className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold"
                    />
                  </div>
                ) : null}
              </div>

              {/* N2 */}
              <div>
                <div className="text-xs font-black text-slate-600">Subgrupo (Nivel 2)</div>

                <select
                  value={useNewN2 ? "__new__" : newN2}
                  onChange={(e) => {
                    const v = e.target.value;
                    const isNew = v === "__new__";
                    setUseNewN2(isNew);
                    if (!isNew) setNewN2(v);
                    setUseNewN3(false);
                    setNewN3("");
                    setNewErr("");
                  }}
                  disabled={createKind === "N1" || (!useNewN1 && !newN1) || (useNewN1 && !normalizeCode(newGroupCode))}
                  className={cls(
                    "mt-1 w-full rounded-2xl border bg-white px-4 py-2 text-sm font-semibold outline-none",
                    (createKind === "N1" || (!useNewN1 && !newN1) || (useNewN1 && !normalizeCode(newGroupCode))) ? "border-slate-200 text-slate-400" : "border-slate-200 text-slate-900"
                  )}
                >
                  <option value="">
                    {createKind === "N1"
                      ? "No aplica"
                      : (useNewN1 ? normalizeCode(newGroupCode) : newN1)
                      ? "Selecciona..."
                      : "Primero elige/crea Grupo"}
                  </option>
                  <option value="__new__">+ Crear nuevo subgrupo</option>
                  {n2Filtered.map((x) => (
                    <option key={x.code} value={x.code}>
                      {x.code} — {x.name}
                    </option>
                  ))}
                </select>

                {useNewN2 ? (
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      value={newSubCode}
                      onChange={(e) => setNewSubCode(e.target.value)}
                      placeholder="Código N2 (solo números)"
                      className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold"
                    />
                    <input
                      value={newSubName}
                      onChange={(e) => setNewSubName(e.target.value)}
                      placeholder="Nombre N2 (ej: Bancos)"
                      className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold"
                    />
                  </div>
                ) : null}
              </div>

              {/* N3 */}
              <div>
                <div className="text-xs font-black text-slate-600">Categoría (Nivel 3)</div>

                <select
                  value={useNewN3 ? "__new__" : newN3}
                  onChange={(e) => {
                    const v = e.target.value;
                    const isNew = v === "__new__";
                    setUseNewN3(isNew);
                    if (!isNew) setNewN3(v);
                    setNewErr("");
                  }}
                  disabled={createKind === "N1" || createKind === "N2" || (useNewN2 ? !normalizeCode(newSubCode) : !newN2) || (useNewN1 && !normalizeCode(newGroupCode))}
                  className={cls(
                    "mt-1 w-full rounded-2xl border bg-white px-4 py-2 text-sm font-semibold outline-none",
                    (createKind === "N1" || createKind === "N2" || (useNewN2 ? !normalizeCode(newSubCode) : !newN2) || (useNewN1 && !normalizeCode(newGroupCode)))
                      ? "border-slate-200 text-slate-400"
                      : "border-slate-200 text-slate-900"
                  )}
                >
                  <option value="">
                    {createKind === "N1" || createKind === "N2"
                      ? "No aplica"
                      : (useNewN2 ? normalizeCode(newSubCode) : newN2)
                      ? "Selecciona..."
                      : "Primero elige/crea Subgrupo"}
                  </option>
                  <option value="__new__">+ Crear nueva categoría</option>
                  {n3Filtered.map((x) => (
                    <option key={x.code} value={x.code}>
                      {x.code} — {x.name}
                    </option>
                  ))}
                </select>

                {useNewN3 ? (
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      value={newCatCode}
                      onChange={(e) => setNewCatCode(e.target.value)}
                      placeholder="Código N3 (solo números)"
                      className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold"
                    />
                    <input
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      placeholder="Nombre N3 (ej: Bancos CLP)"
                      className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold"
                    />
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
                <b>Tip:</b> Puedes crear los niveles (N1/N2/N3) y luego crear cuentas (N4) dentro.
              </div>
            </div>
          </div>
        ) : null}

        {/* Paso 3 */}
        {newStep === 3 ? (
          <div className="grid grid-cols-1 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-black text-slate-600">Resumen</div>

              <div className="mt-2 text-sm text-slate-700">
                Creando:{" "}
                <span className="font-black text-slate-900">
                  {createKind === "N1" ? "Grupo (N1)" : createKind === "N2" ? "Subgrupo (N2)" : createKind === "N3" ? "Categoría (N3)" : "Cuenta (N4)"}
                </span>
              </div>

              {createKind === "N4" ? (
                <div className="mt-1 text-sm text-slate-700">
                  Clasificación: <span className="font-black text-slate-900">{newClasif ?? "—"}</span>
                </div>
              ) : null}

              {createKind !== "N1" ? (
                <div className="mt-1 text-sm text-slate-700">
                  Ruta:{" "}
                  <span className="font-semibold">
                    {(useNewN1 ? normalizeCode(newGroupCode) : newN1) || "—"} → {(useNewN2 ? normalizeCode(newSubCode) : newN2) || "—"} → {(useNewN3 ? normalizeCode(newCatCode) : newN3) || "—"}
                  </span>
                </div>
              ) : null}
            </div>

            {/* N1/N2/N3 */}
            {createKind !== "N4" ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-black text-slate-600">Código y nombre</div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    value={createKind === "N1" ? newGroupCode : createKind === "N2" ? newSubCode : newCatCode}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (createKind === "N1") setNewGroupCode(v);
                      else if (createKind === "N2") setNewSubCode(v);
                      else setNewCatCode(v);
                      setNewErr("");
                    }}
                    placeholder="Código (solo números)"
                    className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold"
                  />

                  <input
                    value={createKind === "N1" ? newGroupName : createKind === "N2" ? newSubName : newCatName}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (createKind === "N1") setNewGroupName(v);
                      else if (createKind === "N2") setNewSubName(v);
                      else setNewCatName(v);
                      setNewErr("");
                    }}
                    placeholder="Nombre"
                    className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold"
                  />
                </div>
              </div>
            ) : null}

            {/* N4 */}
            {createKind === "N4" ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-black text-slate-600">Datos de la cuenta</div>

                <div className="mt-2">
                  <div className="text-xs font-black text-slate-600">Código (sugerido, editable)</div>
                  <div className="mt-1 flex gap-2">
                    <input
                      value={newCode}
                      onChange={(e) => {
                        setNewCode(e.target.value);
                        setNewErr("");
                      }}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold"
                      placeholder="Ej: 110501"
                    />
                    <button
                      type="button"
                      onClick={suggestNextCode}
                      className="shrink-0 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      Re-sugerir
                    </button>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">Puedes cambiarlo manualmente si quieres.</div>
                </div>

                <div className="mt-3">
                  <div className="text-xs font-black text-slate-600">Nombre</div>
                  <input
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value);
                      setNewErr("");
                    }}
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold"
                    placeholder="Ej: Banco Itaú - Cuenta Corriente"
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}


