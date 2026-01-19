// ===============================================================
// FILE: app/gestionBancaria/conciliacion/components/ConciliacionTable.tsx
// ===============================================================
"use client"; // ✅ Next.js: este componente corre en el cliente (usa state, effects, DOM APIs)

import React, { useEffect, useRef, useState } from "react"; // ✅ hooks de React
import { cn } from "@/app/lib/utils"; // ✅ helper para concatenar clases Tailwind
import { Th } from "@/app/components/ui/Table"; // ✅ tu componente TH (ancho + estilos)
import FilterPopover from "@/app/components/ui/FilterPopover"; // ✅ popover de filtros
import { tiposMovimiento } from "@/app/lib/constants"; // ✅ lista de tipos (Transferencia, Pago, etc.)
import type { BankKey, MatchStatus, Movimiento } from "@/app/lib/types"; // ✅ tipos TS
import MovimientoRow from "@/app/gestionBancaria/conciliacion/components/MovimientoRow"; // ✅ fila principal
import MovimientoExpandedRow from "@/app/gestionBancaria/conciliacion/components/MovimientoExpandedRow"; // ✅ fila expandida (detalle)

// =========================
// TIPOS
// =========================

// ✅ Estado de filtros de la tabla (todo vive en el padre y se pasa por props)
export type Filters = {
  fechaFrom: string; // YYYY-MM-DD (desde)
  fechaTo: string; // YYYY-MM-DD (hasta)
  banco: BankKey | "ALL"; // banco seleccionado o todos
  tipo: string | "ALL"; // tipo seleccionado o todos
  rut: string; // texto a buscar (id/rut)
  nombre: string; // texto a buscar (nombre contraparte)
  referencia: string; // texto a buscar (num doc/ref)
  descripcion: string; // texto a buscar (descripcion)
  debMin: string; // rango debito: minimo
  debMax: string; // rango debito: maximo
  credMin: string; // rango credito: minimo
  credMax: string; // rango credito: maximo
  netoMin: string; // rango neto: minimo
  netoMax: string; // rango neto: maximo
  mensaje: "ALL" | "SI" | "NO"; // tiene mensaje?
  conciliacion: "ALL" | MatchStatus; // estado conciliacion
  contabilizado: "ALL" | "SI" | "NO"; // contabilizado?
};

// =========================
// UI / ESTILOS REUTILIZABLES
// (esto lo vamos a separar a un archivo en el siguiente paso si quieres)
// =========================
const ui = {
  pop: cn(
    "w-[260px] rounded-xl bg-white", // caja del popover
    "border border-slate-200", // borde suave
    "shadow-[0_18px_55px_rgba(20,12,70,0.18)]", // sombra elegante
    "p-4" // padding
  ),
  title:
    "mb-3 text-[11px] font-extrabold tracking-[0.08em] uppercase text-[#0b2b4f]", // titulo popover
  fieldLabel:
    "mb-1 text-[10px] font-extrabold tracking-[0.08em] uppercase text-slate-600", // label de inputs
  input: cn(
    "h-8 w-full rounded-lg border border-slate-200 bg-slate-50", // caja input
    "px-2.5 text-[12px] text-slate-900 placeholder:text-slate-400", // tipografia
    "outline-none", // sin outline default
    "focus:bg-white focus:border-[#123b63]/45 focus:shadow-[0_0_0_3px_rgba(18,59,99,0.12)]" // focus bonito
  ),
  select: cn(
    "h-8 w-full rounded-lg border border-slate-200 bg-slate-50", // caja select
    "px-2.5 text-[12px] text-slate-900", // tipografia
    "outline-none", // sin outline default
    "focus:bg-white focus:border-[#123b63]/45 focus:shadow-[0_0_0_3px_rgba(18,59,99,0.12)]" // focus bonito
  ),
  grid2: "grid grid-cols-2 gap-2", // grilla 2 columnas
  actions: "mt-4 flex items-center justify-end gap-2", // fila botones
  btnGhost:
    "h-8 rounded-lg px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-100", // boton secundario
  btnPrimary:
    "h-8 rounded-lg bg-[#123b63] px-3 text-[12px] font-extrabold text-white hover:opacity-95 shadow-[0_10px_20px_rgba(18,59,99,0.22)]", // boton principal
};

// =========================
// COMPONENTES INTERNOS (reutilizables)
// (luego los sacamos a archivos separados)
// =========================

// ✅ Contenedor estándar para cualquier popover (titulo + contenido)
function PopShell({
  title,
  children,
}: {
  title: string; // titulo del popover
  children: React.ReactNode; // contenido del popover
}) {
  return (
    <div className={ui.pop}>
      <div className={ui.title}>{title}</div>
      {children}
    </div>
  );
}

// ✅ Acciones estándar del popover (Cerrar/Buscar)
function PopActions({ onClose }: { onClose: () => void }) {
  return (
    <div className={ui.actions}>
      <button type="button" className={ui.btnGhost} onClick={onClose}>
        Cerrar
      </button>
      <button type="button" className={ui.btnPrimary} onClick={onClose}>
        Buscar
      </button>
    </div>
  );
}

// =========================
// PROPS DEL COMPONENTE PRINCIPAL
// (extraído a tipo para mantenerlo limpio)
// =========================
type ConciliacionTableProps = {
  filtered: Movimiento[]; // lista ya filtrada (se filtra arriba)
  banks: { key: BankKey; name: string; logo: string }[]; // lista bancos para select
  bankMap: Record<BankKey, { key: BankKey; name: string; logo: string }>; // mapa por key para lookup rápido
  filters: Filters; // estado de filtros actual
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void; // setter de un filtro (1 a la vez)
  filtersOpen: string | null; // id del popover abierto
  setFiltersOpen: (v: string | null) => void; // abre/cierra popovers
  selectedIds: Set<string>; // ids seleccionados
  toggleSelected: (id: string) => void; // toggle selección de fila
  isAllSelected: boolean; // flag: todos seleccionados?
  toggleSelectAll: () => void; // toggle seleccionar todo
  expandedId: string | null; // id de fila expandida
  toggleExpand: (id: string) => void; // toggle expand
  doConciliarManual: (movId: string) => void; // acción conciliación manual
};

// =========================
// COMPONENTE PRINCIPAL
// =========================
export default function ConciliacionTable({
  filtered,
  banks,
  bankMap,
  filters,
  setFilter,
  filtersOpen,
  setFiltersOpen,
  selectedIds,
  toggleSelected,
  isAllSelected,
  toggleSelectAll,
  expandedId,
  toggleExpand,
  doConciliarManual,
}: ConciliacionTableProps) {
  // ✅ ref al <table> para medir columnas reales (DOM)
  const tableRef = useRef<HTMLTableElement | null>(null);

  // ✅ guardamos anchos de columnas para que el expanded row calce perfecto
  const [colWeights, setColWeights] = useState<number[] | null>(null);

  // ✅ función que mide los TH y guarda sus anchos (en px)
  const computeColWeights = () => {
    const table = tableRef.current; // tabla actual
    if (!table) return; // si aún no existe, salir

    // tomamos todos los TH del thead
    const ths = Array.from(table.querySelectorAll("thead th")) as HTMLElement[];
    if (!ths.length) return; // si no hay TH, salir

    // medimos el ancho real de cada TH
    const widths = ths.map((th) =>
      Math.max(1, Math.round(th.getBoundingClientRect().width))
    );

    // guardamos solo las primeras 14 (tu tabla tiene 14 columnas)
    setColWeights(widths.slice(0, 14));
  };

  // ✅ efecto inicial: mide + escucha cambios de tamaño
  useEffect(() => {
    computeColWeights(); // primera medición

    const table = tableRef.current; // tabla actual
    if (!table) return; // si no existe, salir

    // ResizeObserver para recalcular cuando cambie el tamaño
    const ro = new ResizeObserver(() => computeColWeights());
    ro.observe(table); // observa la tabla completa

    // observa también cada TH (para cambios finos por layout)
    const ths = Array.from(table.querySelectorAll("thead th")) as HTMLElement[];
    ths.forEach((th) => ro.observe(th));

    // además, escuchamos resize del window (fallback)
    window.addEventListener("resize", computeColWeights);

    // cleanup: desconecta observer + listener
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", computeColWeights);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ cuando cambia largo de lista o expandido, re-mide
  useEffect(() => {
    // defer 0ms para esperar a que el DOM termine de ajustar
    const t = window.setTimeout(() => computeColWeights(), 0);
    return () => window.clearTimeout(t); // cleanup timeout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length, expandedId]);

  // ✅ helper para cerrar cualquier popover abierto
  const close = () => setFiltersOpen(null);

  return (
    <div className="mt-4 rounded-2xl bg-white ring-1 ring-slate-200/60 shadow-[0_8px_30px_rgba(20,12,70,0.2)]">
      {/* ✅ contenedor con scroll SOLO para la tabla */}
      <div className="w-full overflow-auto max-h-[calc(100vh-220px)] rounded-2xl">
        {/* ✅ tabla */}
        <table ref={tableRef} className="w-full table-fixed">
          {/* ✅ cabecera sticky (se queda fija dentro del contenedor con scroll) */}
          <thead
            className={cn(
              "sticky top-0 z-50", // sticky dentro del scroll container
              "bg-gradient-to-b from-[#eaf2fb] via-[#dde9f7] to-[#d6e4f5]", // fondo
              "text-[#0b2b4f]", // color texto
              "border-b-2 border-[#123b63]/40", // borde inferior
              "shadow-[0_2px_0_rgba(18,59,99,0.35)]" // linea sombra
            )}
          >
            {/* ✅ fila de títulos */}
            <tr className="text-[11px] uppercase tracking-[0.08em] font-extrabold">
              {/* ✅ checkbox select all */}
              <Th w="w-[36px]">
                <div className="relative flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4"
                    aria-label="Seleccionar todos"
                  />
                </div>
              </Th>

              {/* ======================================================
                  NOTA: La optimización fuerte viene ahora:
                  Vamos a mover TODA esta cabecera a un componente:
                  <ConciliacionTableHeader ... />
                  para que esta pantalla quede limpia.
                 ====================================================== */}

              {/* FECHA */}
              <Th w="w-[88px]">
                <div className="relative flex items-center justify-between">
                  <span>Fecha</span>
                  <FilterPopover
                    id="fecha"
                    label="fecha"
                    openId={filtersOpen}
                    setOpenId={setFiltersOpen}
                    side="left"
                    w="w-[280px]"
                  >
                    <PopShell title="Fecha">
                      <div className={ui.grid2}>
                        <div>
                          <div className={ui.fieldLabel}>Desde</div>
                          <input
                            type="date"
                            value={filters.fechaFrom}
                            onChange={(e) =>
                              setFilter("fechaFrom", e.target.value)
                            }
                            className={ui.input}
                          />
                        </div>
                        <div>
                          <div className={ui.fieldLabel}>Hasta</div>
                          <input
                            type="date"
                            value={filters.fechaTo}
                            onChange={(e) => setFilter("fechaTo", e.target.value)}
                            className={ui.input}
                          />
                        </div>
                      </div>
                      <PopActions onClose={close} />
                    </PopShell>
                  </FilterPopover>
                </div>
              </Th>

              {/* BANCO */}
              <Th w="w-[100px]">
                <div className="relative flex items-center justify-center">
                  <span>Banco</span>
                  <FilterPopover
                    id="banco"
                    label="banco"
                    openId={filtersOpen}
                    setOpenId={setFiltersOpen}
                    side="left"
                  >
                    <PopShell title="Banco">
                      <select
                        value={filters.banco}
                        onChange={(e) =>
                          setFilter("banco", e.target.value as any)
                        }
                        className={ui.select}
                      >
                        <option value="ALL">Todos</option>
                        {banks.map((b) => (
                          <option key={b.key} value={b.key}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                      <PopActions onClose={close} />
                    </PopShell>
                  </FilterPopover>
                </div>
              </Th>

              {/* TIPO */}
              <Th w="w-[100px]">
                <div className="relative flex items-center justify-center">
                  <span>Tipo</span>
                  <FilterPopover
                    id="tipo"
                    label="tipo"
                    openId={filtersOpen}
                    setOpenId={setFiltersOpen}
                    side="left"
                  >
                    <PopShell title="Tipo">
                      <select
                        value={filters.tipo}
                        onChange={(e) => setFilter("tipo", e.target.value)}
                        className={ui.select}
                      >
                        <option value="ALL">Todos</option>
                        {tiposMovimiento.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <PopActions onClose={close} />
                    </PopShell>
                  </FilterPopover>
                </div>
              </Th>

              {/* ID */}
              <Th w="w-[110px]">
                <div className="relative flex items-center justify-center">
                  <span>ID. IDENT.</span>
                  <FilterPopover
                    id="rut"
                    label="rut"
                    openId={filtersOpen}
                    setOpenId={setFiltersOpen}
                    side="left"
                  >
                    <PopShell title="ID. IDENT.">
                      <input
                        value={filters.rut}
                        onChange={(e) => setFilter("rut", e.target.value)}
                        placeholder="Ej: 12.345.678-9"
                        className={ui.input}
                      />
                      <PopActions onClose={close} />
                    </PopShell>
                  </FilterPopover>
                </div>
              </Th>

              {/* NOMBRE */}
              <Th w="w-[120px]">
                <div className="relative flex items-center justify-center">
                  <span>Nombre</span>
                  <FilterPopover
                    id="nombre"
                    label="nombre"
                    openId={filtersOpen}
                    setOpenId={setFiltersOpen}
                    side="left"
                  >
                    <PopShell title="Nombre">
                      <input
                        value={filters.nombre}
                        onChange={(e) => setFilter("nombre", e.target.value)}
                        placeholder="Ej: Banco / Pérez"
                        className={ui.input}
                      />
                      <PopActions onClose={close} />
                    </PopShell>
                  </FilterPopover>
                </div>
              </Th>

              {/* NUM DOC */}
              <Th w="w-[100px]">
                <div className="relative flex items-center justify-center">
                  <span>Num. Doc.</span>
                  <FilterPopover
                    id="ref"
                    label="referencia"
                    openId={filtersOpen}
                    setOpenId={setFiltersOpen}
                    side="left"
                  >
                    <PopShell title="Num. Doc.">
                      <input
                        value={filters.referencia}
                        onChange={(e) => setFilter("referencia", e.target.value)}
                        placeholder="Ej: TRF12545"
                        className={ui.input}
                      />
                      <PopActions onClose={close} />
                    </PopShell>
                  </FilterPopover>
                </div>
              </Th>

              {/* DESCRIPCIÓN */}
              <Th w="w-[120px]">
                <div className="relative flex items-center justify-center">
                  <span>Descripción</span>
                  <FilterPopover
                    id="desc"
                    label="descripción"
                    openId={filtersOpen}
                    setOpenId={setFiltersOpen}
                    side="left"
                  >
                    <PopShell title="Descripción">
                      <input
                        value={filters.descripcion}
                        onChange={(e) =>
                          setFilter("descripcion", e.target.value)
                        }
                        placeholder="Ej: comisión / abono"
                        className={ui.input}
                      />
                      <PopActions onClose={close} />
                    </PopShell>
                  </FilterPopover>
                </div>
              </Th>

              {/* DÉBITO */}
              <Th w="w-[108px]">
                <div className="relative flex items-center justify-center">
                  <span>Débito</span>
                  <FilterPopover
                    id="deb"
                    label="débitos"
                    openId={filtersOpen}
                    setOpenId={setFiltersOpen}
                    side="right"
                  >
                    <PopShell title="Débito">
                      <div className={ui.grid2}>
                        <input
                          value={filters.debMin}
                          onChange={(e) => setFilter("debMin", e.target.value)}
                          placeholder="Desde"
                          className={ui.input}
                          inputMode="numeric"
                        />
                        <input
                          value={filters.debMax}
                          onChange={(e) => setFilter("debMax", e.target.value)}
                          placeholder="Hasta"
                          className={ui.input}
                          inputMode="numeric"
                        />
                      </div>
                      <PopActions onClose={close} />
                    </PopShell>
                  </FilterPopover>
                </div>
              </Th>

              {/* CRÉDITO */}
              <Th w="w-[108px]">
                <div className="relative flex items-center justify-center">
                  <span>Crédito</span>
                  <FilterPopover
                    id="cred"
                    label="créditos"
                    openId={filtersOpen}
                    setOpenId={setFiltersOpen}
                    side="right"
                  >
                    <PopShell title="Crédito">
                      <div className={ui.grid2}>
                        <input
                          value={filters.credMin}
                          onChange={(e) => setFilter("credMin", e.target.value)}
                          placeholder="Desde"
                          className={ui.input}
                          inputMode="numeric"
                        />
                        <input
                          value={filters.credMax}
                          onChange={(e) => setFilter("credMax", e.target.value)}
                          placeholder="Hasta"
                          className={ui.input}
                          inputMode="numeric"
                        />
                      </div>
                      <PopActions onClose={close} />
                    </PopShell>
                  </FilterPopover>
                </div>
              </Th>

              {/* NETO */}
              <Th w="w-[108px]">
                <div className="relative flex items-center justify-center">
                  <span>Neto</span>
                  <FilterPopover
                    id="neto"
                    label="neto"
                    openId={filtersOpen}
                    setOpenId={setFiltersOpen}
                    side="right"
                  >
                    <PopShell title="Neto">
                      <div className={ui.grid2}>
                        <input
                          value={filters.netoMin}
                          onChange={(e) => setFilter("netoMin", e.target.value)}
                          placeholder="Desde"
                          className={ui.input}
                          inputMode="numeric"
                        />
                        <input
                          value={filters.netoMax}
                          onChange={(e) => setFilter("netoMax", e.target.value)}
                          placeholder="Hasta"
                          className={ui.input}
                          inputMode="numeric"
                        />
                      </div>
                      <PopActions onClose={close} />
                    </PopShell>
                  </FilterPopover>
                </div>
              </Th>

              {/* MENSAJE */}
              <Th w="w-[44px]" align="text-center">
                <div className="relative flex items-center justify-center gap-1">
                  <span title="Mensaje" aria-label="Mensaje">
                    💬
                  </span>
                  <FilterPopover
                    id="msg"
                    label="mensaje"
                    openId={filtersOpen}
                    setOpenId={setFiltersOpen}
                    w="w-60"
                    side="right"
                  >
                    <PopShell title="Mensaje">
                      <select
                        value={filters.mensaje}
                        onChange={(e) =>
                          setFilter("mensaje", e.target.value as any)
                        }
                        className={ui.select}
                      >
                        <option value="ALL">Todos</option>
                        <option value="SI">Sí</option>
                        <option value="NO">No</option>
                      </select>
                      <PopActions onClose={close} />
                    </PopShell>
                  </FilterPopover>
                </div>
              </Th>

              {/* CONCILIACIÓN */}
              <Th w="w-[44px]" align="text-center">
                <div className="relative flex items-center justify-center gap-1">
                  <span title="Conciliación" aria-label="Conciliación">
                    🔗
                  </span>
                  <FilterPopover
                    id="conci"
                    label="conciliación"
                    openId={filtersOpen}
                    setOpenId={setFiltersOpen}
                    side="right"
                  >
                    <PopShell title="Conciliación">
                      <select
                        value={filters.conciliacion}
                        onChange={(e) =>
                          setFilter("conciliacion", e.target.value as any)
                        }
                        className={ui.select}
                      >
                        <option value="ALL">Todos</option>
                        <option value="CONCILIADO">Conciliado</option>
                        <option value="PARCIAL">Parcial</option>
                        <option value="NO_CONCILIADO">No conciliado</option>
                      </select>
                      <PopActions onClose={close} />
                    </PopShell>
                  </FilterPopover>
                </div>
              </Th>

              {/* CONTABILIZADO */}
              <Th w="w-[44px]" align="text-center">
                <div className="relative flex items-center justify-center gap-1">
                  <span title="Contabilizado" aria-label="Contabilizado">
                    🧾
                  </span>
                  <FilterPopover
                    id="conta"
                    label="contabilizado"
                    openId={filtersOpen}
                    setOpenId={setFiltersOpen}
                    w="w-60"
                    side="right"
                  >
                    <PopShell title="Contabilizado">
                      <select
                        value={filters.contabilizado}
                        onChange={(e) =>
                          setFilter("contabilizado", e.target.value as any)
                        }
                        className={ui.select}
                      >
                        <option value="ALL">Todos</option>
                        <option value="SI">Sí</option>
                        <option value="NO">No</option>
                      </select>
                      <PopActions onClose={close} />
                    </PopShell>
                  </FilterPopover>
                </div>
              </Th>
            </tr>
          </thead>

          {/* ✅ body de la tabla */}
          <tbody className="text-[12px]">
            {filtered.map((m, idx) => {
              const bank = bankMap[m.banco]; // lookup del banco por key
              const expanded = expandedId === m.id; // si esta fila está expandida

              return (
                <React.Fragment key={m.id}>
                  {/* fila normal */}
                  <MovimientoRow
                    m={m}
                    idx={idx}
                    expanded={expanded}
                    bank={bank}
                    isSelected={selectedIds.has(m.id)}
                    onToggleExpand={toggleExpand}
                    onToggleSelected={toggleSelected}
                  />

                  {/* fila expandida (detalle) */}
                  {expanded && (
                    <MovimientoExpandedRow
                      m={m}
                      bank={bank}
                      colSpan={14}
                      colWeights={colWeights}
                      onConciliarManual={doConciliarManual}
                      onEditarMatch={(movId) =>
                        alert(`Editar conciliación ${movId} (mock).`)
                      }
                      onContabilizarMovimiento={(movId) =>
                        alert(`Contabilizar movimiento ${movId} (mock).`)
                      }
                      onEliminarMatch={(movId, docId) =>
                        alert(
                          `Eliminar match ${docId} del movimiento ${movId} (mock).`
                        )
                      }
                    />
                  )}
                </React.Fragment>
              );
            })}

            {/* estado vacío */}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={14} className="p-10 text-center text-slate-500">
                  No hay movimientos con los filtros actuales.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ✅ overlay para cerrar popovers al click afuera */}
      {filtersOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setFiltersOpen(null)}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
