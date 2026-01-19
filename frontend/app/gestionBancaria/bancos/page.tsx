// pages/banks.tsx
"use client";

import { useState, useMemo } from "react";
import AddBankModal from "@/app/gestionBancaria/bancos/components/AddBankModal";

type BankRow = {
  id: string;
  bankName: string;
  accountLabel: string;
  accountNumber: string;
  lastUpdateLabel: string;
  lastUpdateDate: string;
  balance: string;
  balanceAsOf: string;
  logoType: "bch" | "sco" | "bci";
};

export default function BancosPage() {
  const [openModal, setOpenModal] = useState(false);
  const [query, setQuery] = useState("");

  const rows: BankRow[] = useMemo(
    () => [
      {
        id: "1",
        bankName: "Banco Chile",
        accountLabel: "BCH CLP 96098-00",
        accountNumber: "00-160-20598-00",
        lastUpdateLabel: "📅",
        lastUpdateDate: "31/12/2025",
        balance: "$31,580,000",
        balanceAsOf: "Saldo hasta el 31/12/2025",
        logoType: "bch",
      },
      {
        id: "2",
        bankName: "Banco Chile",
        accountLabel: "BCH CLP 22996-00",
        accountNumber: "00-160-22996-00",
        lastUpdateLabel: "📅",
        lastUpdateDate: "30/12/2025",
        balance: "$44,896,000",
        balanceAsOf: "Saldo hasta el 30/12/2025",
        logoType: "bch",
      },
      {
        id: "3",
        bankName: "Banco Scotiabank",
        accountLabel: "SCO CLP 9900",
        accountNumber: "05-160-20598-05",
        lastUpdateLabel: "🕒",
        lastUpdateDate: "28 minutos agó",
        balance: "$76,474,965",
        balanceAsOf: "Saldo hasta el 25/04/2026",
        logoType: "sco",
      },
      {
        id: "4",
        bankName: "Banco Scotiabank",
        accountLabel: "SCO CLP 9900",
        accountNumber: "00-097-44364-26",
        lastUpdateLabel: "📅",
        lastUpdateDate: "20/04/2026",
        balance: "$9,856,124",
        balanceAsOf: "Saldo hasta el 20/04/2026",
        logoType: "sco",
      },
      {
        id: "5",
        bankName: "Banco BCI",
        accountLabel: "BCI CLP 9900",
        accountNumber: "00-097-87261-62",
        lastUpdateLabel: "📅",
        lastUpdateDate: "15/04/2026",
        balance: "$8,480,152",
        balanceAsOf: "Saldo hasta el 15/04/2026",
        logoType: "bci",
      },
    ],
    []
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.bankName.toLowerCase().includes(q) ||
        r.accountLabel.toLowerCase().includes(q) ||
        r.accountNumber.toLowerCase().includes(q)
    );
  }, [query, rows]);

  return (
    <div className="space-y-4">
      {/* Título + Acciones */}
      <div className="mx-auto max-w-[1400px] px-4 py-6">
        <h1 className="text-[28px] font-semibold text-[#2b3340]">
          Gestión de Bancos
        </h1>
      </div>

      {/* Buscador */}
      <div className="flex items-center gap-3">
        <div className="relative w-[360px]">
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7a8798]">
            <IconSearch className="h-5 w-5" />
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar..."
            className="h-11 w-full rounded-lg border border-black/10 bg-white/70 pl-10 pr-10 text-sm text-[#2b3340] shadow-sm outline-none placeholder:text-[#8b97a7] focus:ring-2 focus:ring-[#c7d3e6]"
          />
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#7a8798]">
            <IconSearch className="h-5 w-5" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setOpenModal(true)}
            className="flex items-center gap-2 rounded-md bg-[#cfd9ea] px-3 py-1.5 text-[13px] font-semibold text-[#2f3a4a] shadow-sm ring-1 ring-black/5 hover:bg-[#c3cfe6] transition"
          >
            <IconBank className="h-4 w-4" />
            Registrar Banco +
          </button>
        </div>
      </div>

      {/* Panel */}
      <div className="rounded-2xl bg-white/70 p-4 shadow-sm ring-1 ring-black/5 backdrop-blur">
        {/* Tabla */}
        <div className="mt-4 overflow-hidden rounded-xl border border-black/10 bg-white/60">
          {/* Header tabla */}
          <div className="grid grid-cols-[120px_1.2fr_1.4fr_1fr_220px] items-center bg-[#e6ebf4] px-4 py-3 text-sm font-semibold text-[#4b5666]">
            <div className="flex items-center gap-2">
              Banco <IconChevronDown className="h-4 w-4 text-[#7a8798]" />
            </div>
            <div>Cuenta</div>
            <div className="flex items-center gap-2 justify-center">
              Última Actualización <IconChevronDown className="h-4 w-4 text-[#7a8798]" />
            </div>
            <div className="flex items-center gap-2 justify-center">
              Saldo Disponible <IconChevronDown className="h-4 w-4 text-[#7a8798]" />
            </div>
            <div className="text-center">Acciones</div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-black/10">
            {filtered.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-[120px_1.2fr_1.4fr_1fr_220px] items-center px-4 py-3 bg-white/40"
              >
                {/* Logo */}
                <div className="flex items-center gap-3">
                  <BankLogo kind={r.logoType} />
                </div>

                {/* Cuenta */}
                <div>
                  <div className="text-[14px] font-semibold leading-tight text-[#2b3340]">
                    {r.bankName}
                  </div>
                  <div className="text-[12px] leading-tight text-[#6e7b8c]">{r.accountLabel}</div>
                </div>

                {/* Última actualización */}
                <div className="flex items-center justify-center gap-2 text-[#2b3340]">
                  <div className="text-[#7a8798]">{r.lastUpdateLabel}</div>
                  <div>
                    <div className="text-[13px] font-semibold leading-tight">{r.accountNumber}</div>
                    <div className="text-[12px] leading-tight text-[#6e7b8c]">{r.lastUpdateDate}</div>
                  </div>
                </div>

                {/* Saldo */}
                <div className="flex items-center justify-center gap-3">
                  <div className="text-right">
                    <div className="text-[15px] font-bold leading-tight text-[#2b3340]">
                      {r.balance}
                    </div>
                    <div className="text-[12px] leading-tight text-[#6e7b8c]">{r.balanceAsOf}</div>
                  </div>
                  <div className="text-[#6e7b8c]">
                    <IconLink className="h-4 w-4" />
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex justify-center">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="flex items-center justify-between gap-2 rounded-md bg-[#2f7fd6] px-3 py-1.5 text-[13px] font-semibold text-white shadow-sm ring-1 ring-black/10 hover:bg-[#2a74c4] transition w-[160px]"
                    >
                      <span className="flex items-center gap-2">
                        <IconRefreshWhite className="h-4 w-4" />
                        Actualizar Cartola
                      </span>
                      <IconChevronDown className="h-4 w-4 opacity-90" />
                    </button>

                    <button
                      type="button"
                      title="Eliminar banco"
                      className="flex h-10 w-10 items-center justify-center rounded-md bg-[#c63b3b] text-white shadow-sm ring-1 ring-black/10 hover:bg-[#b33434] transition"
                      onClick={() => {
                        // por ahora solo UI. Luego lo conectamos a BBDD.
                        // console.log("Eliminar banco:", r.id);
                      }}
                    >
                      <IconTrashCan className="h-5 w-5" />
                    </button>
                  </div>
                </div>

              </div>
            ))}
          </div>
        </div>

        {/* Paginación */}
        <div className="mt-6 flex items-center justify-center gap-3 text-sm text-[#4b5666]">
          <button className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-white/60 transition">
            <IconArrowLeft className="h-4 w-4" /> Anterior
          </button>

          <div className="flex overflow-hidden rounded-md border border-black/10 bg-white/60">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className={[
                  "h-9 w-9 text-sm font-semibold transition",
                  n === 1 ? "bg-[#2f8cff] text-white" : "text-[#2b3340] hover:bg-white",
                ].join(" ")}
              >
                {n}
              </button>
            ))}
            <button className="px-3 text-sm font-semibold text-[#2b3340] hover:bg-white transition">
              Siguiente »
            </button>
          </div>
        </div>
      </div>

      {/* Modal */}
      <AddBankModal open={openModal} onClose={() => setOpenModal(false)} />
    </div>
  );
}

/* ================== UI Helpers (logos + icons) ================== */

function BankLogo({ kind }: { kind: "bch" | "sco" | "bci" }) {
  if (kind === "bch") {
    return (
      <div className="h-14 w-20 rounded-lg bg-[#0c2e57] shadow-sm ring-1 ring-black/10 flex items-center justify-center">
        <span className="text-white text-[12px] font-semibold">Banco Chile</span>
      </div>
    );
  }
  if (kind === "sco") {
    return (
      <div className="h-14 w-20 rounded-lg bg-[#b33131] shadow-sm ring-1 ring-black/10 flex items-center justify-center">
        <span className="text-white text-[12px] font-semibold">Scotiabank</span>
      </div>
    );
  }
  return (
    <div className="h-14 w-20 rounded-lg bg-white shadow-sm ring-1 ring-black/10 flex items-center justify-center">
      <span className="text-[#2b3340] text-[18px] font-black">BCI</span>
    </div>
  );
}

function IconChevronDown({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function IconSearch({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M16.5 16.5 21 21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconBank({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3 2 8v2h20V8L12 3Z" />
      <path d="M4 11h3v8H4v-8Zm6 0h4v8h-4v-8Zm7 0h3v8h-3v-8Z" opacity=".9" />
      <path d="M2 20h20v2H2v-2Z" />
    </svg>
  );
}

function IconDownload({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3a1 1 0 0 1 1 1v9.17l2.59-2.58a1 1 0 1 1 1.41 1.41l-4.3 4.3a1 1 0 0 1-1.4 0l-4.3-4.3a1 1 0 1 1 1.41-1.41L11 13.17V4a1 1 0 0 1 1-1Z" />
      <path d="M4 19a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Z" />
    </svg>
  );
}

function IconLink({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10 13a5 5 0 0 1 0-7l1.5-1.5a5 5 0 0 1 7 7L17 13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M14 11a5 5 0 0 1 0 7L12.5 19.5a5 5 0 0 1-7-7L7 11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconRefreshWhite({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 12a8 8 0 1 1-2.34-5.66"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M20 4v6h-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* Toolbar icons (simple) */
const IconMenu = () => <span className="text-[18px] leading-none">≡</span>;
const IconDoc = () => <span className="text-[14px] leading-none">▦</span>;
const IconRefresh = () => <span className="text-[14px] leading-none">↻</span>;
const IconSync = () => <span className="text-[14px] leading-none">⟲</span>;
const IconChat = () => <span className="text-[14px] leading-none">💬</span>;
const IconTrash = () => <span className="text-[14px] leading-none">🗑</span>;
const IconReload = () => <span className="text-[14px] leading-none">⟲</span>;
const IconRotate = () => <span className="text-[14px] leading-none">↺</span>;
const IconArrowLeft = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M14.7 6.3a1 1 0 0 1 0 1.4L11.41 11H20a1 1 0 1 1 0 2h-8.59l3.3 3.3a1 1 0 1 1-1.41 1.4l-5.01-5a1 1 0 0 1 0-1.4l5.01-5a1 1 0 0 1 1.4 0Z" />
  </svg>
);
const IconWand = () => <span className="text-[14px] leading-none">🪄</span>;
const IconGauge = () => <span className="text-[14px] leading-none">⏱</span>;
const IconFolder = () => <span className="text-[14px] leading-none">📁</span>;

function IconTrashCan({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 3h6m-8 4h10m-9 0 1 14h6l1-14M10 11v7m4-7v7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 7h12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
