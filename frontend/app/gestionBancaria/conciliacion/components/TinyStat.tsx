"use client";

import { cn } from "@/app/lib/utils";

export default function TinyStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "emerald" | "amber";
}) {
  const toneCls =
    tone === "blue"
      ? "bg-blue-50 text-blue-800 border-blue-100"
      : tone === "emerald"
      ? "bg-emerald-50 text-emerald-800 border-emerald-100"
      : "bg-amber-50 text-amber-900 border-amber-100";

  return (
    <div className={cn("flex items-center gap-2 rounded-xl border px-3 py-2", toneCls)}>
      <div className="text-[11px] leading-4 opacity-80">{label}</div>
      <div className="text-[12px] font-semibold">{value}</div>
    </div>
  );
}
