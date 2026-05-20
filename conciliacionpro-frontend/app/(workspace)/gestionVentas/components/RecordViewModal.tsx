"use client";

/**
 * RecordViewModal — router de visualización de registros
 * ──────────────────────────────────────────────────────
 * Delega cada tipo a su wrapper self-loading correspondiente,
 * que reutiliza el modal editor real con readOnly/mode="view".
 *
 *   FISCAL     → FiscalDocViewModal  (TradeDocEditorModal mode="view")
 *   NON_FISCAL → OtherDocViewModal   (OtherDocEditorModal readOnly)
 *   PAYMENT    → CobrosViewModal     (CobrosEditorModal   readOnly)
 */

import React from "react";
import { FiscalDocViewModal } from "@/app/(workspace)/gestionVentas/components/FiscalDocViewModal";
import { OtherDocViewModal }  from "@/app/(workspace)/gestionVentas/components/OtherDocViewModal";
import { CobrosViewModal }    from "@/app/(workspace)/gestionVentas/components/CobrosViewModal";

// ─── Props ────────────────────────────────────────────────────────────────────

export type RecordViewModalProps = {
  companyId: string | null | undefined;
  open: boolean;
  onClose: () => void;
  recordId: string | null | undefined;
  recordType: "FISCAL" | "NON_FISCAL" | "PAYMENT" | null | undefined;
  /** No se usa — cada wrapper define su propio z-index. Mantenido por compatibilidad. */
  zIndexClass?: string;
};

// ─── Componente ───────────────────────────────────────────────────────────────

export function RecordViewModal({
  companyId,
  open,
  onClose,
  recordId,
  recordType,
}: RecordViewModalProps) {

  if (recordType === "FISCAL") {
    return (
      <FiscalDocViewModal
        companyId={companyId}
        open={open}
        onClose={onClose}
        recordId={recordId}
      />
    );
  }

  if (recordType === "NON_FISCAL") {
    return (
      <OtherDocViewModal
        companyId={companyId}
        open={open}
        onClose={onClose}
        recordId={recordId}
      />
    );
  }

  if (recordType === "PAYMENT") {
    return (
      <CobrosViewModal
        companyId={companyId}
        open={open}
        onClose={onClose}
        recordId={recordId}
      />
    );
  }

  // recordType null/undefined → no renderizar nada
  return null;
}
