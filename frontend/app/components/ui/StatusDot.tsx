"use client";

import { cn } from "@/app/lib/utils";
import type { MatchStatus } from "@/app/lib/types";

export default function StatusDot({ s }: { s: MatchStatus }) {
  const config = {
    CONCILIADO: { color: "bg-emerald-500", label: "Conciliado" },
    PARCIAL: { color: "bg-amber-500", label: "Conciliado parcialmente" },
    NO_CONCILIADO: { color: "bg-rose-500", label: "No conciliado" },
  } as const;

  const { color, label } = config[s];

  return (
    <span className="inline-flex items-center justify-center" title={label} aria-label={label}>
      <span className={cn("h-3 w-3 rounded-full", color)} />
    </span>
  );
}
