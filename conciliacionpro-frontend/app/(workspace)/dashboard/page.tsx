"use client";

import { useEffect, useMemo, useState } from "react";

type Kpi = {
  label: string;
  value: string;
  sub?: string;
  trend?: "up" | "down" | "flat";
  delta?: string;
  spark?: number[];
};

type BankRow = {
  bank: string;
  account: string;
  balance: number;
  currency: "CLP" | "USD";
  lastMove: string;
  reconciledPct: number; // 0-100
};

type JournalRow = {
  date: string;
  ref: string;
  desc: string;
  debit: number;
  credit: number;
  status: "POSTED" | "DRAFT";
};

function cls(...s: Array<string | false | null | undefined>) {
  return s.filter(Boolean).join(" ");
}

function fmtMoney(n: number, currency: "CLP" | "USD" = "CLP") {
  const locale = currency === "USD" ? "en-US" : "es-CL";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "CLP" ? 0 : 2,
  }).format(n);
}

function fmtPct(n: number) {
  return `${Math.round(n)}%`;
}

function Sparkline({ data }: { data: number[] }) {
  // SVG simple (sin libs)
  const w = 120;
  const h = 28;
  const pad = 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = pad + (i * (w - pad * 2)) / (data.length - 1 || 1);
      const y = pad + (1 - (v - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="opacity-90">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}

function BarMini({ value, max }: { value: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div className="h-2 w-full rounded-full bg-slate-100 ring-1 ring-slate-200 overflow-hidden">
      <div className="h-full rounded-full bg-slate-900/70" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Donut({
  pct,
  label,
}: {
  pct: number; // 0-100
  label: string;
}) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;

  return (
    <div className="flex items-center gap-3">
      <svg width="42" height="42" viewBox="0 0 42 42">
        <circle cx="21" cy="21" r={r} fill="none" stroke="rgba(15,23,42,0.12)" strokeWidth="6" />
        <circle
          cx="21"
          cy="21"
          r={r}
          fill="none"
          stroke="rgba(15,23,42,0.85)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform="rotate(-90 21 21)"
        />
      </svg>
      <div className="min-w-0">
        <div className="text-[12px] font-extrabold text-slate-900">{label}</div>
        <div className="text-[12px] text-slate-600">{fmtPct(pct)}</div>
      </div>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[13px] font-extrabold text-slate-900">{title}</div>
        {subtitle ? <div className="mt-1 text-[12px] text-slate-600">{subtitle}</div> : null}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [companyId, setCompanyId] = useState("");
  const [companyName, setCompanyName] = useState("Empresa");

  useEffect(() => {
    try {
      const cid = localStorage.getItem("active_company_id") ?? "";
      setCompanyId(cid);
    } catch {}

    // Simulación: si después quieres, aquí haremos fetch a supabase companies.name
    // Por ahora, usamos un nombre bonito en base al id:
    setCompanyName("Empresa ABC S.A.");

    const onCompanyChanged = () => {
      try {
        const cid = localStorage.getItem("active_company_id") ?? "";
        setCompanyId(cid);
      } catch {}
      setCompanyName("Empresa ABC S.A.");
    };

    window.addEventListener("company:changed", onCompanyChanged as any);
    return () => window.removeEventListener("company:changed", onCompanyChanged as any);
  }, []);

  // ========= MOCK DATA (luego lo conectamos a datos reales) =========
  const kpis: Kpi[] = useMemo(
    () => [
      {
        label: "Saldo caja + bancos",
        value: fmtMoney(187_450_000, "CLP"),
        sub: "Últimos 30 días",
        trend: "up",
        delta: "+8.4%",
        spark: [120, 118, 125, 132, 128, 140, 150, 155, 162, 168, 175, 187],
      },
      {
        label: "Flujo neto (mes)",
        value: fmtMoney(24_300_000, "CLP"),
        sub: "Ingresos - Egresos",
        trend: "up",
        delta: "+3.1%",
        spark: [12, 9, 14, 11, 15, 13, 16, 18, 17, 19, 21, 24],
      },
      {
        label: "Conciliación bancaria",
        value: "92%",
        sub: "Movimientos conciliados",
        trend: "flat",
        delta: "+1.0%",
        spark: [78, 80, 82, 84, 86, 87, 88, 89, 90, 91, 91, 92],
      },
      {
        label: "Asientos pendientes",
        value: "14",
        sub: "Borradores / por revisar",
        trend: "down",
        delta: "-22%",
        spark: [30, 28, 26, 24, 23, 22, 20, 18, 17, 16, 15, 14],
      },
    ],
    []
  );

  const bankRows: BankRow[] = useMemo(
    () => [
      {
        bank: "Banco de Chile",
        account: "CTA Corriente 001-234",
        balance: 92_300_000,
        currency: "CLP",
        lastMove: "Hoy 10:41",
        reconciledPct: 96,
      },
      {
        bank: "Santander",
        account: "CTA Corriente 009-002",
        balance: 61_800_000,
        currency: "CLP",
        lastMove: "Ayer 18:07",
        reconciledPct: 90,
      },
      {
        bank: "BCI",
        account: "CTA Vista 110-778",
        balance: 28_700_000,
        currency: "CLP",
        lastMove: "Ayer 12:22",
        reconciledPct: 88,
      },
      {
        bank: "PayPal / USD",
        account: "Wallet",
        balance: 4_250,
        currency: "USD",
        lastMove: "Hoy 09:10",
        reconciledPct: 72,
      },
    ],
    []
  );

  const journal: JournalRow[] = useMemo(
    () => [
      { date: "22-01-2026", ref: "AS-10293", desc: "Pago proveedores (TEF)", debit: 4_120_000, credit: 4_120_000, status: "POSTED" },
      { date: "22-01-2026", ref: "AS-10294", desc: "Depósito clientes", debit: 8_540_000, credit: 8_540_000, status: "POSTED" },
      { date: "21-01-2026", ref: "AS-10295", desc: "Provisión gastos (servicios)", debit: 1_230_000, credit: 1_230_000, status: "DRAFT" },
      { date: "20-01-2026", ref: "AS-10296", desc: "Pago remuneraciones", debit: 12_800_000, credit: 12_800_000, status: "POSTED" },
      { date: "20-01-2026", ref: "AS-10297", desc: "Ajuste diferencia cambio", debit: 320_000, credit: 320_000, status: "DRAFT" },
    ],
    []
  );

  const cashflowBars = useMemo(() => {
    // 12 semanas: ingresos / egresos (mock)
    const weeks = ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W12"];
    const inflow = [18, 14, 20, 16, 22, 19, 24, 21, 26, 23, 28, 30];
    const outflow = [14, 13, 15, 14, 17, 16, 18, 17, 19, 18, 21, 22];
    const max = Math.max(...inflow, ...outflow);
    return { weeks, inflow, outflow, max };
  }, []);

  const reconciliation = useMemo(() => {
    const conciliated = 92;
    const pending = 6;
    const unmatched = 2;
    return { conciliated, pending, unmatched };
  }, []);

  const aging = useMemo(() => {
    // mock aging CxC/CxP
    return {
      ar: [
        { bucket: "0-15", amount: 34_200_000 },
        { bucket: "16-30", amount: 21_500_000 },
        { bucket: "31-60", amount: 12_800_000 },
        { bucket: "61-90", amount: 6_900_000 },
        { bucket: "90+", amount: 3_600_000 },
      ],
      ap: [
        { bucket: "0-15", amount: 18_400_000 },
        { bucket: "16-30", amount: 9_200_000 },
        { bucket: "31-60", amount: 5_700_000 },
        { bucket: "61-90", amount: 2_900_000 },
        { bucket: "90+", amount: 1_100_000 },
      ],
    };
  }, []);

  const maxAging = Math.max(
    ...aging.ar.map((x) => x.amount),
    ...aging.ap.map((x) => x.amount)
  );

  // ================================================================
  return (
    <div className="p-6">
      {/* HERO / ENCABEZADO */}
      <div className="overflow-hidden rounded-[28px] bg-white ring-1 ring-slate-200 shadow-[0_18px_70px_rgba(15,23,42,0.10)]">
        <div className="relative bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] px-7 py-7 text-white">
          <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[12px] font-extrabold uppercase text-white/80">Resumen contable</div>
              <h1 className="mt-1 text-3xl font-black leading-tight">Dashboard</h1>
              <div className="mt-2 text-[13px] text-white/85">
                {companyName} <span className="text-white/60">•</span>{" "}
                <span className="text-white/70">ID: {companyId || "—"}</span>
              </div>
            </div>

            {/* Filtros (simulados) */}
            <div className="flex flex-wrap items-center gap-2">
              <button className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition">
                Últimos 30 días
              </button>
              <button className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition">
                Comparar mes anterior
              </button>
              <button className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition">
                Exportar (pronto)
              </button>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="p-7">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {kpis.map((k) => (
              <div
                key={k.label}
                className="rounded-[26px] bg-white p-5 ring-1 ring-slate-200 hover:shadow-[0_18px_50px_rgba(15,23,42,0.10)] transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[12px] font-extrabold text-slate-600">{k.label}</div>
                    <div className="mt-2 text-[22px] font-black text-slate-900">{k.value}</div>
                    {k.sub ? <div className="mt-1 text-[12px] text-slate-600">{k.sub}</div> : null}
                  </div>

                  <div className="text-right">
                    <div
                      className={cls(
                        "inline-flex items-center rounded-xl px-3 py-1 text-[11px] font-extrabold ring-1",
                        k.trend === "up" && "bg-emerald-50 text-emerald-900 ring-emerald-200",
                        k.trend === "down" && "bg-rose-50 text-rose-900 ring-rose-200",
                        k.trend === "flat" && "bg-slate-50 text-slate-900 ring-slate-200"
                      )}
                    >
                      {k.trend === "up" ? "▲" : k.trend === "down" ? "▼" : "•"} {k.delta ?? "—"}
                    </div>

                    <div className="mt-2 text-slate-400">
                      {k.spark ? <Sparkline data={k.spark} /> : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* GRID principal */}
          <div className="mt-6 grid gap-3 xl:grid-cols-12">
            {/* CASHFLOW */}
            <div className="xl:col-span-7 rounded-[26px] bg-white p-5 ring-1 ring-slate-200">
              <SectionTitle
                title="Flujo de caja (simulado)"
                subtitle="Ingresos vs egresos semanal • Ideal para ver tendencia y tensión de caja."
              />

              <div className="mt-5 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="flex items-center justify-between text-[12px] text-slate-600">
                  <div className="font-extrabold text-slate-900">Últimas 12 semanas</div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-slate-900/70" />
                      Ingresos
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-slate-400" />
                      Egresos
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-12 gap-2 items-end">
                  {cashflowBars.weeks.map((w, i) => {
                    const inPct = (cashflowBars.inflow[i] / cashflowBars.max) * 100;
                    const outPct = (cashflowBars.outflow[i] / cashflowBars.max) * 100;

                    return (
                      <div key={w} className="flex flex-col items-center gap-2">
                        <div className="w-full h-28 flex flex-col justify-end gap-1">
                          <div
                            className="w-full rounded-lg bg-slate-400"
                            style={{ height: `${outPct}%` }}
                            title={`Egresos: ${cashflowBars.outflow[i]}M`}
                          />
                          <div
                            className="w-full rounded-lg bg-slate-900/70"
                            style={{ height: `${inPct}%` }}
                            title={`Ingresos: ${cashflowBars.inflow[i]}M`}
                          />
                        </div>
                        <div className="text-[10px] font-extrabold text-slate-500">{w}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 text-[12px] text-slate-600">
                  ✅ Lectura rápida: si los egresos se comen los ingresos varias semanas seguidas, se viene tensión de caja.
                </div>
              </div>
            </div>

            {/* CONCILIACIÓN */}
            <div className="xl:col-span-5 rounded-[26px] bg-white p-5 ring-1 ring-slate-200">
              <SectionTitle
                title="Conciliación bancaria"
                subtitle="Qué tan “cuadrado” está lo bancario vs lo contable."
              />

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <Donut pct={reconciliation.conciliated} label="Conciliado" />
                  <div className="mt-3 text-[12px] text-slate-600">
                    Movimientos bancarios con match y asiento.
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <Donut pct={reconciliation.pending} label="Pendiente" />
                  <div className="mt-3 text-[12px] text-slate-600">
                    Falta revisar/confirmar (posibles duplicados, fechas, glosa).
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <Donut pct={reconciliation.unmatched} label="Sin match" />
                  <div className="mt-3 text-[12px] text-slate-600">
                    No existe documento o regla automática todavía.
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <div className="text-[12px] font-extrabold text-slate-900">Acciones recomendadas</div>
                  <ul className="mt-2 space-y-2 text-[12px] text-slate-600">
                    <li>• Revisar “Sin match” y crear reglas por glosa (SPEI/TEF/DEP).</li>
                    <li>• Validar depósitos sin RUT / sin referencia.</li>
                    <li>• Normalizar beneficiarios frecuentes.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* BANCOS */}
            <div className="xl:col-span-7 rounded-[26px] bg-white p-5 ring-1 ring-slate-200">
              <SectionTitle
                title="Bancos y saldos"
                subtitle="Top cuentas, saldo, último movimiento y % conciliado (simulado)."
              />

              <div className="mt-4 space-y-3">
                {bankRows.map((b) => (
                  <div
                    key={b.bank + b.account}
                    className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13px] font-black text-slate-900">
                          {b.bank} <span className="text-slate-400">•</span>{" "}
                          <span className="font-extrabold text-slate-700">{b.account}</span>
                        </div>
                        <div className="mt-1 text-[12px] text-slate-600">Último movimiento: {b.lastMove}</div>
                      </div>

                      <div className="text-right">
                        <div className="text-[14px] font-black text-slate-900">{fmtMoney(b.balance, b.currency)}</div>
                        <div className="mt-1 text-[12px] font-extrabold text-slate-600">
                          Conciliado: {fmtPct(b.reconciledPct)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <BarMini value={b.reconciledPct} max={100} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AGING */}
            <div className="xl:col-span-5 rounded-[26px] bg-white p-5 ring-1 ring-slate-200">
              <SectionTitle
                title="Aging CxC / CxP"
                subtitle="Riesgo de cobranza vs presión de pagos."
              />

              <div className="mt-5 grid gap-3">
                <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <div className="text-[12px] font-extrabold text-slate-900">Cuentas por cobrar</div>
                  <div className="mt-3 space-y-2">
                    {aging.ar.map((x) => (
                      <div key={"ar" + x.bucket} className="grid grid-cols-12 items-center gap-2">
                        <div className="col-span-2 text-[12px] font-extrabold text-slate-700">{x.bucket}</div>
                        <div className="col-span-7">
                          <BarMini value={x.amount} max={maxAging} />
                        </div>
                        <div className="col-span-3 text-right text-[12px] font-extrabold text-slate-900">
                          {fmtMoney(x.amount, "CLP")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <div className="text-[12px] font-extrabold text-slate-900">Cuentas por pagar</div>
                  <div className="mt-3 space-y-2">
                    {aging.ap.map((x) => (
                      <div key={"ap" + x.bucket} className="grid grid-cols-12 items-center gap-2">
                        <div className="col-span-2 text-[12px] font-extrabold text-slate-700">{x.bucket}</div>
                        <div className="col-span-7">
                          <BarMini value={x.amount} max={maxAging} />
                        </div>
                        <div className="col-span-3 text-right text-[12px] font-extrabold text-slate-900">
                          {fmtMoney(x.amount, "CLP")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <div className="text-[12px] font-extrabold text-slate-900">Alertas</div>
                  <div className="mt-2 space-y-2 text-[12px] text-slate-600">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5">⚠️</span>
                      <span>
                        CxC <b>90+</b> subiendo: revisa facturas vencidas y compromisos de pago.
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5">✅</span>
                      <span>
                        CxP controlado: puedes planificar pagos para optimizar caja sin atraso.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ÚLTIMOS ASIENTOS */}
            <div className="xl:col-span-12 rounded-[26px] bg-white p-5 ring-1 ring-slate-200">
              <SectionTitle
                title="Últimos asientos contables"
                subtitle="Simulación del libro diario: posted vs drafts."
              />

              <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-slate-200">
                <div className="grid grid-cols-12 bg-slate-50 px-4 py-3 text-[11px] font-extrabold uppercase text-slate-600">
                  <div className="col-span-2">Fecha</div>
                  <div className="col-span-2">Referencia</div>
                  <div className="col-span-4">Descripción</div>
                  <div className="col-span-2 text-right">Debe</div>
                  <div className="col-span-2 text-right">Haber</div>
                </div>

                {journal.map((j) => (
                  <div
                    key={j.ref}
                    className="grid grid-cols-12 items-center px-4 py-3 text-[13px] text-slate-700 border-t border-slate-100"
                  >
                    <div className="col-span-2 font-extrabold text-slate-900">{j.date}</div>
                    <div className="col-span-2">
                      <span
                        className={cls(
                          "inline-flex items-center rounded-xl px-3 py-1 text-[11px] font-extrabold ring-1",
                          j.status === "POSTED"
                            ? "bg-emerald-50 text-emerald-900 ring-emerald-200"
                            : "bg-amber-50 text-amber-900 ring-amber-200"
                        )}
                      >
                        {j.ref} • {j.status}
                      </span>
                    </div>
                    <div className="col-span-4 truncate">{j.desc}</div>
                    <div className="col-span-2 text-right font-extrabold text-slate-900">
                      {fmtMoney(j.debit, "CLP")}
                    </div>
                    <div className="col-span-2 text-right font-extrabold text-slate-900">
                      {fmtMoney(j.credit, "CLP")}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[12px] text-slate-600">
                <div>💡 Luego aquí pondremos filtros por fecha, módulo (bancos/ventas/compras) y un botón “Ver libro mayor”.</div>
                <button className="rounded-2xl bg-slate-900 px-4 py-2 text-[12px] font-extrabold text-white hover:opacity-95 transition">
                  Ver detalle (pronto)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FOOT */}
      <div className="mt-6 text-center text-[12px] text-slate-500">
        ConciliaciónPro • Dashboard (simulación)
      </div>
    </div>
  );
}
