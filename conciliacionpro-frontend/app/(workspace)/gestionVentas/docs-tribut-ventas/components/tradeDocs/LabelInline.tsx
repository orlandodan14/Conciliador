"use client";

import React from "react";
import { cls } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/helpers";

type LabelInlineProps = {
  label: string;
  field: string;
  className?: string;
};

export function LabelInline({
  label,
  field,
  className,
}: LabelInlineProps) {
  return (
    <div
      className={cls(
        "flex items-baseline gap-1 text-xs font-medium text-slate-600",
        className
      )}
    >
      <span>{label}</span>
      <span className="text-slate-300">/</span>
      <span className="text-[11px] font-normal text-slate-500">{field}</span>
    </div>
  );
}