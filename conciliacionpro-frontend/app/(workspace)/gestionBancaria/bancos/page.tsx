"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw } from "lucide-react";
import CuentasBancariasTable from "./components/bancos/BancosTable";
import { MOCK_BANKS } from "./components/bancos/mockData";
import { tradeDocsTheme } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/ui";

function cls(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

function fmt(n: number) {
  return n.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function CuentasBancariasPage() {
  const router = useRouter();
  const [banks] = useState(MOCK_BANKS);

  const stats = useMemo(() => {
    const totalBanks = banks.length;
    const totalAccounts = banks.reduce((s, b) => s + b.accounts.length, 0);
    const clpAccounts = banks.flatMap((b) => b.accounts.filter((a) => a.currency === "CLP"));
    const totalBalanceCLP = clpAccounts.reduce((s, a) => s + a.statement_balance, 0);
    const totalTx = banks.flatMap((b) => b.accounts).reduce((s, a) => s + a.transactions_total, 0);
    const totalRec = banks.flatMap((b) => b.accounts).reduce((s, a) => s + a.transactions_reconciled, 0);
    const pct = totalTx > 0 ? Math.round((totalRec / totalTx) * 100) : 0;
    const hasDiff = banks.flatMap((b) => b.accounts).some((a) => a.difference !== 0);
    return { totalBanks, totalAccounts, totalBalanceCLP, pct, hasDiff, totalTx, totalRec };
  }, [banks]);

  function handleViewMovements(accountId: string) {
    router.push(`/gestionBancaria/movimientos?account=${accountId}`);
  }

  function handleAddAccount(bankId: string) {
    alert(`[MOCK] Abrir modal nueva cuenta para banco ${bankId}`);
  }

  function handleEditAccount(accountId: string) {
    alert(`[MOCK] Abrir modal editar cuenta ${accountId}`);
  }

  return (
    <div className="px-4 py-6 sm:px-6">
      <div className={tradeDocsTheme.shell}>

        {/* ── Header ── */}
        <div className={cls(tradeDocsTheme.header, "px-7 py-7")}>
          <div className={tradeDocsTheme.glowA} />
          <div className={tradeDocsTheme.glowB} />

          <div className="relative flex flex-wrap items-end justify-between gap-4">
            {/* Título + pills */}
            <div className="min-w-0">
              <div className="text-[12px] font-extrabold uppercase text-white/80">
                Gestión Bancaria
              </div>
              <h1 className="mt-1 text-3xl font-black leading-tight">
                Cuentas Bancarias
              </h1>

              <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/90">
                <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 ring-1 ring-white/15">
                  Bancos: <b className="ml-1">{stats.totalBanks}</b>
                </span>
                <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 ring-1 ring-white/15">
                  Cuentas activas: <b className="ml-1">{stats.totalAccounts}</b>
                </span>
                <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 ring-1 ring-white/15">
                  Saldo CLP: <b className="ml-1">$ {fmt(stats.totalBalanceCLP)}</b>
                </span>
                <span
                  className={cls(
                    "inline-flex items-center rounded-full px-2 py-0.5 ring-1",
                    stats.pct >= 90
                      ? "bg-emerald-500/30 ring-emerald-400/40 text-emerald-100"
                      : stats.pct >= 60
                      ? "bg-amber-500/30 ring-amber-400/40 text-amber-100"
                      : "bg-rose-500/30 ring-rose-400/40 text-rose-100"
                  )}
                >
                  Conciliado: <b className="ml-1">{stats.pct}%</b>
                  {stats.hasDiff && (
                    <span className="ml-1 text-rose-200">· Hay diferencias</span>
                  )}
                </span>
                <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 ring-1 ring-white/15">
                  Movimientos: <b className="ml-1">{stats.totalRec}/{stats.totalTx}</b>
                </span>
              </div>
            </div>

            {/* Botones */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={tradeDocsTheme.btnGlass}
                onClick={() => alert("[MOCK] Refrescar datos")}
              >
                <RefreshCw className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
                Refrescar
              </button>

              <button
                type="button"
                className={tradeDocsTheme.btnGlass}
                onClick={() => handleAddAccount("")}
              >
                <Plus className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
                Nueva Cuenta
              </button>
            </div>
          </div>
        </div>

        {/* ── Tabla ── */}
        <div className="bg-white px-6 py-5">
          <CuentasBancariasTable
            banks={banks}
            onViewMovements={handleViewMovements}
            onAddAccount={handleAddAccount}
            onEditAccount={handleEditAccount}
          />
        </div>

      </div>
    </div>
  );
}
