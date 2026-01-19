"use client";

import React from "react";
import { cn } from "@/app/lib/utils";

export function Th({
  children,
  w,
  align,
}: {
  children: React.ReactNode;
  w: string;
  align?: string;
}) {
  return (
    <th
      className={cn(
        "px-3 py-3 font-bold whitespace-nowrap",
        "text-[12px] tracking-wide",
        "text-center",
        w,
        align
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  right,
  center,
  title,
}: {
  children: React.ReactNode;
  right?: boolean;
  center?: boolean;
  title?: string;
}) {
  return (
    <td
      title={title}
      className={cn(
        "px-2 py-2 align-middle",
        "border-r last:border-r-0 border-slate-200/50",
        right && "text-right",
        center && "text-center"
      )}
    >
      {children}
    </td>
  );
}
