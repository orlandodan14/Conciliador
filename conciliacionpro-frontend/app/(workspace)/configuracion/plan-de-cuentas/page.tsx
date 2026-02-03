"use client";

import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

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
  code: string;
  name: string;
  level: 1 | 2 | 3 | 4;
  clasificacion?: Clasificacion; // solo nivel 4
  children?: TreeNode[];
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
 * Armar árbol
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="text-lg font-semibold text-slate-900">{title}</div>
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
            ✕
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer ? <div className="border-t px-5 py-4">{footer}</div> : null}
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
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
      {children}
    </span>
  );
}

function ExpandIcon({ open }: { open: boolean }) {
  return (
    <span className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700">
      {open ? "−" : "+"}
    </span>
  );
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

  const [openUpload, setOpenUpload] = useState(false);
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [uploading, setUploading] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<ParsedRow[]>([]);
  const [previewErrors, setPreviewErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  function toggle(code: string) {
    setExpanded((p) => ({ ...p, [code]: !p[code] }));
  }

  function setAllExpanded(value: boolean) {
    const next: Record<string, boolean> = {};
    const walk = (n: TreeNode) => {
      if (n.level !== 4) next[n.code] = value;
      n.children?.forEach(walk);
    };
    tree.forEach(walk);
    setExpanded(next);
  }

  function resetModal() {
    setStep("upload");
    setFile(null);
    setPreviewRows([]);
    setPreviewErrors([]);
    setUploading(false);
  }

  function openUploadModal() {
    resetModal();
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

    const newTree = buildTree(previewRows);
    setTree(newTree);

    const exp: Record<string, boolean> = {};
    newTree.forEach((n1) => (exp[n1.code] = true));
    setExpanded(exp);

    setOpenUpload(false);
    resetModal();
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
    const density = node.level === 1 ? "py-3.5" : node.level === 4 ? "py-2.5" : "py-3";

    return (
      <div
        className={cls(
          "group grid grid-cols-[32px_150px_1fr_240px_44px] items-center gap-3 border-b border-slate-100 px-5",
          density,
          node.level === 1 && "bg-slate-50/70",
          "hover:bg-slate-50"
        )}
      >
        {/* checkbox */}
        <div className="flex justify-center">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300" />
        </div>

        {/* código + toggle */}
        <div className="min-w-0">
          <div className="flex items-center gap-2" style={{ paddingLeft: indent }}>
            {hasChildren ? (
              <button onClick={onToggle} className="shrink-0" title={open ? "Contraer" : "Expandir"}>
                <ExpandIcon open={open} />
              </button>
            ) : (
              <div className="h-7 w-7 shrink-0" />
            )}

            <div
              className={cls(
                "min-w-0 truncate text-[13px]",
                node.level <= 2 ? "font-black text-slate-900" : "font-extrabold text-slate-700"
              )}
            >
              {node.code}
            </div>
          </div>
        </div>

        {/* nombre */}
        <div className="min-w-0">
          <div
            className={cls(
              "min-w-0 truncate text-[13px]",
              node.level <= 2 ? "font-black text-slate-900" : "text-slate-800"
            )}
            style={{ paddingLeft: indent }}
            title={node.name}
          >
            {node.name}
          </div>
        </div>

        {/* clasificación */}
        <div className="flex min-w-0 items-center justify-end">{right}</div>

        {/* acciones */}
        <button className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Eliminar (luego)">
          🗑️
        </button>
      </div>
    );
  };

  const renderNode = (node: TreeNode) => {
    const hasChildren = !!node.children?.length;
    const open = expanded[node.code] ?? false;

    const indent = node.level === 1 ? 0 : node.level === 2 ? 18 : node.level === 3 ? 40 : 62;

    const right =
      node.level === 4 ? (
        <Pill>{node.clasificacion}</Pill>
      ) : (
        <span className="text-[12px] font-extrabold text-slate-400">—</span>
      );

    return (
      <React.Fragment key={node.code}>
        <Row
          node={node}
          indent={indent}
          hasChildren={hasChildren}
          open={open}
          onToggle={hasChildren ? () => toggle(node.code) : undefined}
          right={right}
        />
        {hasChildren && open ? node.children!.map(renderNode) : null}
      </React.Fragment>
    );
  };

  return (
    <div className="p-6">
      {/* CONTENEDOR PRINCIPAL COMO DASHBOARD */}
      <div className="overflow-hidden rounded-[28px] bg-white ring-1 ring-slate-200 shadow-[0_18px_70px_rgba(15,23,42,0.10)]">
        {/* HEADER AZUL (MISMO QUE DASHBOARD) */}
        <div className="relative bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] px-7 py-7 text-white">
          <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[12px] font-extrabold uppercase text-white/80">Configuración contable</div>
              <h1 className="mt-1 text-3xl font-black leading-tight">Plan de cuentas</h1>
              <div className="mt-2 text-[13px] text-white/85">
                Sube tu plan en Excel, lo validamos antes de guardarlo y lo mostramos en formato acordeón.
              </div>
            </div>

            {/* BOTONES: EXACTO DASHBOARD */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={openUploadModal}
                className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition"
              >
                Cargar desde Excel
              </button>

              <button
                onClick={downloadTemplateStatic}
                className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition"
              >
                Descargar formato
              </button>

              <button
                onClick={() => alert("Nueva Cuenta: luego lo conectamos")}
                disabled={!hasPlan}
                title={!hasPlan ? "Primero carga un plan de cuentas" : "Crear cuenta manual"}
                className={cls(
                  "rounded-2xl px-4 py-2 text-[12px] font-extrabold ring-1 transition",
                  hasPlan
                    ? "bg-white/10 ring-white/15 hover:bg-white/15"
                    : "bg-white/5 ring-white/10 opacity-60 cursor-not-allowed"
                )}
              >
                + Nueva cuenta
              </button>

              {hasPlan ? (
                <>
                  <button
                    onClick={() => setAllExpanded(true)}
                    className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition"
                  >
                    Expandir
                  </button>
                  <button
                    onClick={() => setAllExpanded(false)}
                    className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition"
                  >
                    Contraer
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* CONTENIDO (MISMO PADDING QUE DASHBOARD) */}
        <div className="p-7">
          {!hasPlan ? (
            <div className="rounded-[26px] bg-white p-7 ring-1 ring-slate-200">
              <div className="mx-auto max-w-2xl text-center">
                <div className="text-5xl">📄</div>
                <h2 className="mt-4 text-[22px] font-black text-slate-900">Todavía no hay un plan de cuentas cargado</h2>
                <p className="mt-2 text-[13px] text-slate-600">
                  Descarga el formato, completa la hoja <b>PLANTILLA</b> y luego cárgalo. Antes de guardar te mostramos errores y una vista previa.
                </p>

                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  <button
                    className="rounded-2xl bg-slate-900 px-4 py-2 text-[12px] font-extrabold text-white hover:opacity-95 transition"
                    onClick={downloadTemplateStatic}
                  >
                    Descargar formato Excel
                  </button>

                  <button
                    className="rounded-2xl bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50 transition"
                    onClick={openUploadModal}
                  >
                    Cargar desde Excel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Toolbar como dashboard */}
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
                        <button
                          onClick={() => setQ("")}
                          className="absolute right-4 top-2 text-slate-400 hover:text-slate-600"
                          title="Limpiar"
                        >
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

              {/* Accordion card grande como dashboard */}
              <div className="mt-3 overflow-hidden rounded-[26px] bg-white ring-1 ring-slate-200">
                <div className="grid grid-cols-[32px_150px_1fr_240px_44px] items-center gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-extrabold uppercase text-slate-600">
                  <div></div>
                  <div>Código</div>
                  <div>Cuenta</div>
                  <div className="text-right">Clasificación</div>
                  <div></div>
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

      {/* FOOT */}
      <div className="mt-6 text-center text-[12px] text-slate-500">ConciliaciónPro • Configuración contable</div>

      {/* Modal upload */}
      <Modal
        open={openUpload}
        title={step === "upload" ? "Cargar plan de cuentas" : "Revisión del archivo"}
        onClose={() => {
          setOpenUpload(false);
          resetModal();
        }}
        footer={
          step === "upload" ? (
            <div className="flex items-center justify-between">
              <button
                onClick={downloadTemplateStatic}
                className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Descargar formato
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setOpenUpload(false);
                    resetModal();
                  }}
                  className="rounded-full px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
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
                    resetModal();
                  }}
                  className="rounded-full px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>

                <button
                  disabled={previewErrors.length > 0}
                  onClick={onConfirmLoad}
                  className={cls(
                    "rounded-full px-5 py-2 text-sm font-semibold text-white",
                    previewErrors.length > 0 ? "bg-slate-400" : "bg-slate-900 hover:bg-slate-800"
                  )}
                >
                  Confirmar y cargar
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
              <div className="mt-3 text-base font-bold text-slate-900">
                {uploading ? "Procesando archivo..." : "Arrastra tu Excel aquí o haz clic para seleccionar"}
              </div>
              <div className="mt-1 text-sm text-slate-500">Formato soportado: .xlsx</div>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
              <b>Tip:</b> Completa la hoja <b>PLANTILLA</b>. La carga se valida antes de guardar.
            </div>
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
                {previewErrors.length > 12 ? (
                  <div className="mt-2 text-sm text-rose-700">…y {previewErrors.length - 12} más.</div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="font-bold text-emerald-900">Todo OK ✅</div>
                <div className="mt-1 text-sm text-emerald-800">Puedes confirmar para cargar el plan de cuentas.</div>
              </div>
            )}

            <div className="mt-4">
              <div className="mb-2 text-sm font-bold text-slate-700">Vista previa (primeras 10 filas)</div>
              <div className="overflow-hidden rounded-2xl border border-slate-200">
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

                {!previewRows.length ? (
                  <div className="px-3 py-8 text-center text-sm text-slate-500">No se detectaron filas válidas.</div>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
