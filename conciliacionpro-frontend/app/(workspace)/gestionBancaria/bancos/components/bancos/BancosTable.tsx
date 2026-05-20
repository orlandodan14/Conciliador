"use client";

import React, { useState } from "react";
import {
  ChevronUp, ChevronDown, ChevronsUpDown,
  Eye, Pencil, Plus, Building2,
} from "lucide-react";
import type { BankRow, BankAccount } from "./types";

function cls(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

function fmt(n: number, currency = "CLP") {
  const d = currency === "CLP" ? 0 : 2;
  return n.toLocaleString("es-CL", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ─── Sort icon (idéntico al de TradeDocsTable) ────────────────────────────────

type SortDirection = "asc" | "desc";

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400" />;
  return direction === "asc"
    ? <ChevronUp className="h-3.5 w-3.5 text-[#123b63]" />
    : <ChevronDown className="h-3.5 w-3.5 text-[#123b63]" />;
}

// ─── TableTh — replica exacta de TradeDocsTable ───────────────────────────────

function TableTh({
  children,
  align,
  sortable = false,
  active = false,
  direction = "asc",
  onSort,
}: {
  children: React.ReactNode;
  align?: string;
  sortable?: boolean;
  active?: boolean;
  direction?: SortDirection;
  onSort?: () => void;
}) {
  return (
    <th
      className={cls(
        "px-1.5 py-3 font-extrabold",
        "text-[10px] uppercase tracking-[0.06em]",
        "text-center text-[#0b2b4f] overflow-hidden",
        align
      )}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={cls(
            "mx-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors",
            "hover:bg-white/60",
            active && "bg-white/70"
          )}
        >
          <span>{children}</span>
          <SortIcon active={active} direction={direction} />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

// ─── TableTd — replica exacta de TradeDocsTable ───────────────────────────────

function TableTd({
  children, right, center, title, className,
}: {
  children: React.ReactNode;
  right?: boolean;
  center?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <td
      title={title}
      className={cls(
        "px-2 py-2 align-middle",
        "border-r last:border-r-0 border-slate-200/50",
        right && "text-right",
        center && "text-center",
        className
      )}
    >
      {children}
    </td>
  );
}

// ─── Barra de conciliación ────────────────────────────────────────────────────

function ReconciliationBar({ pct }: { pct: number }) {
  const barColor =
    pct >= 90 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-400" : "bg-rose-400";
  const textColor =
    pct >= 90 ? "text-emerald-700" : pct >= 60 ? "text-amber-700" : "text-rose-600";
  return (
    <div className="flex items-center gap-1.5 min-w-[100px]">
      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className={cls("h-full rounded-full", barColor)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cls("text-[11px] font-bold tabular-nums w-8 text-right", textColor)}>
        {pct}%
      </span>
    </div>
  );
}

// ─── Sub-tabla de cuentas en el ExpanderRow ───────────────────────────────────

function AccountsSubTable({
  bank,
  onViewMovements,
  onEditAccount,
  onAddAccount,
}: {
  bank: BankRow;
  onViewMovements?: (id: string) => void;
  onEditAccount?: (id: string) => void;
  onAddAccount?: (bankId: string) => void;
}) {
  return (
    <div className="bg-[#f4f8fd] border-b-2 border-[#123b63]/20">
      {/* Sub-header */}
      <div className="flex items-center justify-between px-6 pt-3 pb-2">
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#123b63]/60">
          Cuentas de {bank.name}
        </span>
        <button
          onClick={() => onAddAccount?.(bank.id)}
          className="flex items-center gap-1 px-3 py-1.5 bg-[#0b2b4f] hover:bg-[#0a4f96] text-white text-[11px] font-bold rounded-lg transition"
        >
          <Plus className="h-3 w-3" />
          Nueva cuenta
        </button>
      </div>

      {/* Sub-tabla */}
      <table className="w-full table-fixed text-[12px]">
        <colgroup>
          <col style={{ width: "4%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "7%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "8%" }} />
        </colgroup>
        <thead>
          <tr className="bg-[#dce8f6]/60 border-b border-[#123b63]/15">
            <th className="px-1.5 py-2" />
            {[
              "N° Cuenta", "Nombre", "Moneda",
              "Saldo Cartola", "Saldo Contable", "Diferencia",
              "Conc. / Total", "% Conciliado", "Últ. Import.", "Acciones",
            ].map((h, i) => (
              <th
                key={h}
                className={cls(
                  "px-2 py-2 text-[9px] font-extrabold uppercase tracking-[0.06em] text-[#123b63]/70",
                  i >= 2 ? "text-right" : "text-left",
                  i === 2 && "text-center",
                  i === 6 && "text-center",
                  i === 7 && "text-left",
                  i === 9 && "text-center",
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bank.accounts.map((acc, i) => {
            const pct =
              acc.transactions_total > 0
                ? Math.round((acc.transactions_reconciled / acc.transactions_total) * 100)
                : 100;
            const hasDiff = acc.difference !== 0;

            return (
              <tr
                key={acc.id}
                className={cls(
                  "border-b border-slate-200/60 transition-colors",
                  i % 2 === 0 ? "bg-white/70" : "bg-[#f0f5fb]/70",
                  "hover:bg-sky-50/60"
                )}
              >
                {/* indent */}
                <td className="px-2 py-2 text-center text-slate-300">
                  <span className="inline-block w-px h-4 bg-slate-300" />
                </td>

                {/* N° cuenta */}
                <td className="px-2 py-2 border-r border-slate-200/50">
                  <span className="font-mono text-[11px] text-slate-600">{acc.account_number}</span>
                </td>

                {/* Nombre */}
                <td className="px-2 py-2 border-r border-slate-200/50">
                  <span className="font-semibold text-[#0b2b4f]">{acc.account_name}</span>
                  {acc.accounting_account_code && (
                    <span className="block text-[10px] text-slate-400 mt-0.5">
                      {acc.accounting_account_code} — {acc.accounting_account_name}
                    </span>
                  )}
                </td>

                {/* Moneda */}
                <td className="px-2 py-2 border-r border-slate-200/50 text-center">
                  <span className="inline-flex px-1.5 py-0.5 bg-sky-100 text-sky-700 text-[10px] font-bold rounded">
                    {acc.currency}
                  </span>
                </td>

                {/* Saldo Cartola */}
                <td className="px-2 py-2 border-r border-slate-200/50 text-right">
                  <span className="font-mono font-semibold text-slate-700 tabular-nums">
                    {acc.currency !== "CLP" ? acc.currency + " " : "$ "}
                    {fmt(acc.statement_balance, acc.currency)}
                  </span>
                </td>

                {/* Saldo Contable */}
                <td className="px-2 py-2 border-r border-slate-200/50 text-right">
                  <span className="font-mono font-semibold text-slate-700 tabular-nums">
                    {acc.currency !== "CLP" ? acc.currency + " " : "$ "}
                    {fmt(acc.accounting_balance, acc.currency)}
                  </span>
                </td>

                {/* Diferencia */}
                <td className="px-2 py-2 border-r border-slate-200/50 text-right">
                  <span
                    className={cls(
                      "font-mono font-semibold tabular-nums text-[12px]",
                      hasDiff ? "text-rose-600" : "text-emerald-600"
                    )}
                  >
                    {hasDiff
                      ? `▲ ${fmt(acc.difference, acc.currency)}`
                      : "✓ —"}
                  </span>
                </td>

                {/* Conc./Total */}
                <td className="px-2 py-2 border-r border-slate-200/50 text-center">
                  <span className="tabular-nums text-slate-600 font-medium">
                    {acc.transactions_reconciled} / {acc.transactions_total}
                  </span>
                </td>

                {/* % barra */}
                <td className="px-2 py-2 border-r border-slate-200/50">
                  <ReconciliationBar pct={pct} />
                </td>

                {/* Últ. importación */}
                <td className="px-2 py-2 border-r border-slate-200/50 text-right">
                  <span className="text-[11px] text-slate-500">{fmtDate(acc.last_import_date)}</span>
                </td>

                {/* Acciones */}
                <td className="px-2 py-2 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => onViewMovements?.(acc.id)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-sky-50 hover:border-sky-300 hover:text-[#0b5aa8] transition"
                      title="Ver movimientos"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => onEditAccount?.(acc.id)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition"
                      title="Editar cuenta"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="h-2" />
    </div>
  );
}

// ─── Sort key ─────────────────────────────────────────────────────────────────

type SortKey = "name" | "accounts" | "statement" | "reconciled" | "pct";

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  banks: BankRow[];
  onViewMovements?: (accountId: string) => void;
  onAddAccount?: (bankId: string) => void;
  onEditAccount?: (accountId: string) => void;
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CuentasBancariasTable({
  banks,
  onViewMovements,
  onAddAccount,
  onEditAccount,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function handleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  }

  // Compute per-bank aggregates
  function bankAgg(bank: BankRow) {
    const currencies = [...new Set(bank.accounts.map((a) => a.currency))];
    const isMulti = currencies.length > 1;
    const clp = bank.accounts.filter((a) => a.currency === "CLP");
    const totalStatementCLP = clp.reduce((s, a) => s + a.statement_balance, 0);
    const totalAccountingCLP = clp.reduce((s, a) => s + a.accounting_balance, 0);
    const totalDiffCLP = clp.reduce((s, a) => s + a.difference, 0);
    const totalTx = bank.accounts.reduce((s, a) => s + a.transactions_total, 0);
    const totalRec = bank.accounts.reduce((s, a) => s + a.transactions_reconciled, 0);
    const pct = totalTx > 0 ? Math.round((totalRec / totalTx) * 100) : 100;
    return { currencies, isMulti, totalStatementCLP, totalAccountingCLP, totalDiffCLP, totalTx, totalRec, pct };
  }

  const sorted = [...banks].sort((a, b) => {
    const aa = bankAgg(a);
    const ba = bankAgg(b);
    let cmp = 0;
    if (sortKey === "name") cmp = a.name.localeCompare(b.name);
    else if (sortKey === "accounts") cmp = a.accounts.length - b.accounts.length;
    else if (sortKey === "statement") cmp = aa.totalStatementCLP - ba.totalStatementCLP;
    else if (sortKey === "reconciled") cmp = aa.totalRec - ba.totalRec;
    else if (sortKey === "pct") cmp = aa.pct - ba.pct;
    return sortDir === "asc" ? cmp : -cmp;
  });

  return (
    <div className="mt-0 rounded-2xl bg-white shadow-[0_8px_30px_rgba(20,12,70,0.12)] ring-1 ring-slate-200/60">
      <div className="w-full overflow-x-hidden rounded-2xl overflow-y-visible">
        <table className="w-full table-fixed">
          <colgroup>
            <col style={{ width: "4%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "15%" }} />
          </colgroup>

          {/* ── THEAD — gradiente idéntico a docs-tribut ── */}
          <thead
            className={cls(
              "sticky top-0 z-20",
              "bg-gradient-to-b from-[#eaf2fb] via-[#dde9f7] to-[#d6e4f5]",
              "border-b-2 border-[#123b63]/40",
              "shadow-[0_2px_0_rgba(18,59,99,0.35)]"
            )}
          >
            <tr>
              <TableTh>{" "}</TableTh>

              <TableTh
                align="text-left"
                sortable
                active={sortKey === "name"}
                direction={sortDir}
                onSort={() => handleSort("name")}
              >
                Banco
              </TableTh>

              <TableTh
                sortable
                active={sortKey === "accounts"}
                direction={sortDir}
                onSort={() => handleSort("accounts")}
              >
                Cuentas
              </TableTh>

              <TableTh>Monedas</TableTh>

              <TableTh
                align="text-right"
                sortable
                active={sortKey === "statement"}
                direction={sortDir}
                onSort={() => handleSort("statement")}
              >
                Saldo Cartola
              </TableTh>

              <TableTh align="text-right">Saldo Contable</TableTh>

              <TableTh align="text-right">Diferencia</TableTh>

              <TableTh
                sortable
                active={sortKey === "reconciled"}
                direction={sortDir}
                onSort={() => handleSort("reconciled")}
              >
                Conc. / Total
              </TableTh>

              <TableTh
                align="text-left"
                sortable
                active={sortKey === "pct"}
                direction={sortDir}
                onSort={() => handleSort("pct")}
              >
                % Conciliado
              </TableTh>
            </tr>
          </thead>

          {/* ── TBODY ── */}
          <tbody className="text-[12px]">
            {banks.length === 0 && (
              <tr>
                <td colSpan={9} className="p-10 text-center text-slate-500">
                  No hay bancos registrados. Agrega una cuenta bancaria para comenzar.
                </td>
              </tr>
            )}

            {sorted.map((bank, idx) => {
              const { currencies, isMulti, totalStatementCLP, totalAccountingCLP, totalDiffCLP, totalTx, totalRec, pct } =
                bankAgg(bank);
              const expanded = expandedId === bank.id;
              const hasDiff = totalDiffCLP !== 0;

              return (
                <React.Fragment key={bank.id}>
                  {/* ── Fila banco ── */}
                  <tr
                    onClick={() => toggleExpand(bank.id)}
                    className={cls(
                      "cursor-pointer border-t transition-colors",
                      idx % 2 === 0 ? "bg-white" : "bg-slate-50",
                      "hover:bg-sky-50/40",
                      expanded && "bg-sky-50/70"
                    )}
                  >
                    {/* Expand toggle */}
                    <TableTd center>
                      {expanded
                        ? <ChevronDown className="h-4 w-4 inline text-[#123b63]" />
                        : <ChevronDown className="h-4 w-4 inline text-slate-400 -rotate-90" />}
                    </TableTd>

                    {/* Banco */}
                    <TableTd>
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-[#0b2b4f]/10 flex items-center justify-center shrink-0">
                          <Building2 className="h-3.5 w-3.5 text-[#0b2b4f]" />
                        </div>
                        <div>
                          <span className="font-semibold text-[#0b2b4f]">{bank.name}</span>
                          <span className="block text-[10px] text-slate-400 font-mono">{bank.code}</span>
                        </div>
                      </div>
                    </TableTd>

                    {/* N° Cuentas */}
                    <TableTd center>
                      <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                        {bank.accounts.length}
                      </span>
                    </TableTd>

                    {/* Monedas */}
                    <TableTd center>
                      <div className="flex flex-wrap justify-center gap-1">
                        {currencies.map((c) => (
                          <span key={c} className="px-1.5 py-0.5 bg-sky-100 text-sky-700 text-[10px] font-bold rounded">
                            {c}
                          </span>
                        ))}
                      </div>
                    </TableTd>

                    {/* Saldo Cartola */}
                    <TableTd right>
                      {isMulti
                        ? <span className="text-slate-400 italic text-[11px]">Ver detalle</span>
                        : <span className="font-mono font-semibold text-slate-700 tabular-nums">$ {fmt(totalStatementCLP)}</span>}
                    </TableTd>

                    {/* Saldo Contable */}
                    <TableTd right>
                      {isMulti
                        ? <span className="text-slate-400 italic text-[11px]">Ver detalle</span>
                        : <span className="font-mono font-semibold text-slate-700 tabular-nums">$ {fmt(totalAccountingCLP)}</span>}
                    </TableTd>

                    {/* Diferencia */}
                    <TableTd right>
                      {isMulti
                        ? <span className="text-slate-400 italic text-[11px]">Ver detalle</span>
                        : hasDiff
                        ? <span className="font-mono font-semibold text-rose-600 tabular-nums">▲ $ {fmt(totalDiffCLP)}</span>
                        : <span className="font-semibold text-emerald-600">✓ —</span>}
                    </TableTd>

                    {/* Conc./Total */}
                    <TableTd center>
                      <span
                        className={cls(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold",
                          pct >= 90 ? "bg-emerald-100/70 text-emerald-900"
                            : pct >= 60 ? "bg-amber-100/70 text-amber-900"
                            : "bg-rose-100/70 text-rose-900"
                        )}
                      >
                        {totalRec} / {totalTx}
                      </span>
                    </TableTd>

                    {/* % barra */}
                    <TableTd>
                      <ReconciliationBar pct={pct} />
                    </TableTd>
                  </tr>

                  {/* ── ExpanderRow: sub-tabla de cuentas ── */}
                  {expanded && (
                    <tr className="border-t border-[#123b63]/10">
                      <td colSpan={9} className="p-0">
                        <AccountsSubTable
                          bank={bank}
                          onViewMovements={onViewMovements}
                          onEditAccount={onEditAccount}
                          onAddAccount={onAddAccount}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
