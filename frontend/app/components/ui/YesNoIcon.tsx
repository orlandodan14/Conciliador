"use client";

import { cn } from "@/app/lib/utils";

export default function YesNoIcon({
  yes,
  labelYes,
  labelNo,
}: {
  yes: boolean;
  labelYes: string;
  labelNo: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-lg border text-[12px]",
        yes ? "bg-slate-50 text-slate-900" : "bg-white text-slate-300"
      )}
      title={yes ? labelYes : labelNo}
      aria-label={yes ? labelYes : labelNo}
    >
      {yes ? "✓" : "—"}
    </span>
  );
}
