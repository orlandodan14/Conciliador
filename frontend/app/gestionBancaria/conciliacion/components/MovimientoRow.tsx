"use client";

import React, { useMemo } from "react";
import { cn } from "@/app/lib/utils";
import { Td } from "@/app/components/ui/Table";
import YesNoIcon from "@/app/components/ui/YesNoIcon";
import StatusDot from "@/app/components/ui/StatusDot";
import { formatCLP } from "@/app/lib/format";
import type { Movimiento, BankKey } from "@/app/lib/types";

/**
 * ================================================
 * MovimientoRow
 * --------------------------------
 * Fila principal de la tabla de conciliación:
 * - Click en la fila => expande/colapsa (toggleExpand)
 * - Checkbox => selecciona sin expandir (stopPropagation)
 *
 * ✅ Optimización aplicada:
 * - Constantes de clases fuera del return (más legible).
 * - Memo de textos/clases derivadas (solo lo que aporta).
 * - Helpers locales para “mostrar monto o —” sin repetir código.
 * - Comentado por bloques (no ruido, sí claridad).
 * ================================================
 */

// ✅ Helpers simples: evitan repetir ternarios en cada celda
function moneyOrDash(v: number) {
  return v > 0 ? formatCLP(v) : "—";
}

function moneyTone(v: number) {
  return v > 0 ? "text-slate-900" : "text-slate-300";
}

export default function MovimientoRow({
  m,
  idx,
  expanded,
  bank,
  isSelected,
  onToggleExpand,
  onToggleSelected,
}: {
  m: Movimiento;
  idx: number;
  expanded: boolean;
  bank?: { key: BankKey; name: string; logo: string };
  isSelected: boolean;
  onToggleExpand: (id: string) => void;
  onToggleSelected: (id: string) => void;
}) {
  // ✅ Zebra + hover + estado expanded
  const rowClass = useMemo(
    () =>
      cn(
        "border-t cursor-pointer transition-colors",
        idx % 2 === 0 ? "bg-white" : "bg-slate-50",
        "hover:bg-blue-50",
        expanded && "bg-blue-50"
      ),
    [idx, expanded]
  );

  // ✅ Render del banco con fallback (si no viene en bankMap)
  const bankLogo = bank?.logo ?? "🏦";
  const bankName = bank?.name ?? m.banco;

  // ✅ Clases de montos (solo cambia color, formato queda centralizado)
  const debTone = useMemo(() => moneyTone(m.debito), [m.debito]);
  const credTone = useMemo(() => moneyTone(m.credito), [m.credito]);

  return (
    <tr
      // Click en cualquier parte de la fila (excepto controles que detienen eventos) => expand/collapse
      onClick={() => onToggleExpand(m.id)}
      className={rowClass}
    >
      {/* ========================= */}
      {/* 1) CHECK SELECCIÓN         */}
      {/* ========================= */}
      <Td center>
        <input
          type="checkbox"
          checked={isSelected}
          // ✅ Evita que el mouse down dispare el click de la fila
          onMouseDown={(e) => e.stopPropagation()}
          // ✅ Evita que el click “suba” y expanda la fila
          onClick={(e) => e.stopPropagation()}
          // ✅ Cambia selección sin expandir
          onChange={(e) => {
            e.stopPropagation();
            onToggleSelected(m.id);
          }}
          className="h-4 w-4"
          aria-label={`Seleccionar ${m.id}`}
        />
      </Td>

      {/* ========================= */}
      {/* 2) FECHA                  */}
      {/* ========================= */}
      <Td>{m.fecha}</Td>

      {/* ========================= */}
      {/* 3) BANCO (logo + nombre)  */}
      {/* ========================= */}
      <Td>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[16px]" aria-hidden="true">
            {bankLogo}
          </span>
          <span className="truncate" title={bankName}>
            {bankName}
          </span>
        </div>
      </Td>

      {/* ========================= */}
      {/* 4) TIPO                   */}
      {/* ========================= */}
      <Td>
        <span className="truncate block" title={m.tipo}>
          {m.tipo}
        </span>
      </Td>

      {/* ========================= */}
      {/* 5) RUT/ID                 */}
      {/* ========================= */}
      <Td>
        <span className="truncate block" title={m.rut}>
          {m.rut}
        </span>
      </Td>

      {/* ========================= */}
      {/* 6) NOMBRE                 */}
      {/* ========================= */}
      <Td>
        <span className="truncate block" title={m.nombre}>
          {m.nombre}
        </span>
      </Td>

      {/* ========================= */}
      {/* 7) REFERENCIA             */}
      {/* ========================= */}
      <Td>
        <span className="truncate block" title={m.referencia}>
          {m.referencia}
        </span>
      </Td>

      {/* ========================= */}
      {/* 8) DESCRIPCIÓN            */}
      {/* ========================= */}
      <Td title={m.descripcion}>
        <span className="truncate block">{m.descripcion}</span>
      </Td>

      {/* ========================= */}
      {/* 9) DÉBITO                 */}
      {/* ========================= */}
      <Td right>
        <span className={cn("font-semibold", debTone)}>
          {moneyOrDash(m.debito)}
        </span>
      </Td>

      {/* ========================= */}
      {/* 10) CRÉDITO               */}
      {/* ========================= */}
      <Td right>
        <span className={cn("font-semibold", credTone)}>
          {moneyOrDash(m.credito)}
        </span>
      </Td>

      {/* ========================= */}
      {/* 11) NETO (signo importa)  */}
      {/* ========================= */}
      <Td right>
        <span
          className={cn(
            "font-semibold",
            (m.neto ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"
          )}
        >
          {formatCLP(m.neto)}
        </span>
      </Td>

      {/* ========================= */}
      {/* 12) MENSAJE (sí/no)       */}
      {/* ========================= */}
      <Td center>
        <YesNoIcon
          yes={m.tieneMensaje}
          labelYes="Tiene mensaje"
          labelNo="Sin mensaje"
        />
      </Td>

      {/* ========================= */}
      {/* 13) ESTADO CONCILIACIÓN   */}
      {/* ========================= */}
      <Td center>
        <StatusDot s={m.conciliacion} />
      </Td>

      {/* ========================= */}
      {/* 14) CONTABILIZADO (sí/no) */}
      {/* ========================= */}
      <Td center>
        <YesNoIcon
          yes={m.contabilizado}
          labelYes="Contabilizado"
          labelNo="No contabilizado"
        />
      </Td>
    </tr>
  );
}
