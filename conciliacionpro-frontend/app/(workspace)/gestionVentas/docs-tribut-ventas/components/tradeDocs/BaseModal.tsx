"use client";

import React from "react";
import { cls } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/helpers";
import { tradeDocsTheme } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/ui";

type BaseModalProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  widthClass?: string;
};

export default function BaseModal({
  open,
  title,
  subtitle,
  children,
  onClose,
  footer,
  widthClass = "w-[min(1200px,96vw)]",
}: BaseModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div
        className={cls(
          "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
          widthClass
        )}
      >
        <div className="flex max-h-[min(84vh,780px)] flex-col overflow-hidden rounded-[22px] bg-white shadow-xl ring-1 ring-black/5">
          <div className={cls("relative px-5 py-4", tradeDocsTheme.header)}>
            <div className={tradeDocsTheme.glowA} />
            <div className={tradeDocsTheme.glowB} />

            <div className="relative flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-extrabold uppercase text-white/80">
                  {subtitle || "Ventas"}
                </div>
                <h3 className="truncate text-lg font-black text-white">{title}</h3>
              </div>

              <button
                className="ml-3 rounded-xl px-3 py-1.5 text-sm font-extrabold text-white/90 hover:bg-white/10"
                onClick={onClose}
                title="Cerrar"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden p-5">
            {children}
          </div>

          {footer ? (
            <div className="shrink-0 border-t bg-white/95 px-5 py-3 backdrop-blur">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}