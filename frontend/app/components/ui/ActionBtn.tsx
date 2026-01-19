"use client";

import { cn } from "@/app/lib/utils";

export default function ActionBtn({
  icon,
  label,
  onClick,
  disabled,
  title,
  primary,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "rounded-xl px-3 py-2 text-[12px] font-semibold shadow-sm border transition",
        "flex items-center gap-2",
        primary
          ? "bg-[#123b63] text-white border-[#123b63]/60 hover:opacity-95 disabled:opacity-40"
          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 disabled:opacity-40"
      )}
    >
      <span className="text-[14px]">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
