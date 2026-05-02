"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

function cls(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

async function getAuthUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user?.id ?? null;
}

async function getMyRoleForCompany(
  companyId: string
): Promise<"OWNER" | "EDITOR" | "LECTOR" | null> {
  const uid = await getAuthUserId();
  if (!uid) return null;

  const { data, error } = await supabase
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", uid)
    .maybeSingle();

  if (error) return null;

  const r = (data?.role ?? null) as any;
  if (r === "OWNER" || r === "EDITOR" || r === "LECTOR") return r;

  return null;
}

function Modal({
  open,
  title,
  subtitle,
  children,
  onClose,
  footer,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-950/45 p-4 backdrop-blur-[2px] sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="mx-auto flex h-full max-w-4xl items-center justify-center">
        <div
          className={cls(
            "w-full overflow-hidden rounded-[28px] bg-white shadow-[0_25px_90px_rgba(2,6,23,0.35)] ring-1 ring-slate-200",
            "max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)]"
          )}
        >
          <div className="relative overflow-hidden bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] px-6 py-5 text-white">
            <div className="pointer-events-none absolute -top-20 -right-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />

            <div className="relative flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/75">
                  Configuración contable
                </div>

                <div className="mt-1 truncate text-xl font-black leading-tight text-white">
                  {title}
                </div>

                <div className="mt-1 text-xs font-semibold text-white/80">
                  {subtitle ?? "Asigna la cuenta por defecto para este proceso"}
                </div>
              </div>

              <button
                onClick={onClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-lg font-bold text-white ring-1 ring-white/15 transition hover:bg-white/15"
                aria-label="Cerrar"
                title="Cerrar"
                type="button"
              >
                ✕
              </button>
            </div>
          </div>

          <div
            className={cls(
              "overflow-y-auto bg-white px-6 py-5",
              footer
                ? "max-h-[calc(100vh-2rem-188px)] sm:max-h-[calc(100vh-3rem-188px)]"
                : "max-h-[calc(100vh-2rem-118px)] sm:max-h-[calc(100vh-3rem-118px)]"
            )}
          >
            {children}
          </div>

          {footer ? (
            <div className="border-t border-slate-200 bg-slate-50/95 px-6 py-4 backdrop-blur">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type ProcModule =
  | "Ventas"
  | "Compras"
  | "Bancos"
  | "Inventario"
  | "Nómina"
  | "Cuentas base"
  | "Contabilidad";

type AccountNature =
  | "ASSET"
  | "LIABILITY"
  | "EQUITY"
  | "INCOME"
  | "CONTRA_INCOME"
  | "EXPENSE"
  | "CONTRA_EXPENSE"
  | "INVENTORY"
  | "FIXED_ASSET"
  | "PREPAID"
  | "BRIDGE"
  | "SETTLEMENT"
  | "CONTROL";

type ProcPriority = "CRITICAL" | "IMPORTANT" | "OPTIONAL";

type ProcGroup =
  | "Venta normal"
  | "Formas de pago"
  | "Notas de crédito de venta"
  | "Notas de débito de venta"
  | "Ajustes y anticipos de venta"
  | "Compra normal"
  | "Formas de pago de compra"
  | "Notas de crédito de compra"
  | "Notas de débito de compra"
  | "Anticipos y retenciones de compra"
  | "Caja y bancos"
  | "Pasarelas"
  | "Gastos e intereses bancarios"
  | "Diferencias y ajustes bancarios"
  | "Inventario y costos"
  | "Remuneraciones"
  | "Activos"
  | "Pasivos"
  | "Patrimonio"
  | "Contabilidad general";

type Proc = {
  key: string;
  name: string;
  shortName: string;
  module: ProcModule;
  group: ProcGroup;
  expectedNature: AccountNature;
  priority: ProcPriority;
  flowOrder: number;
  plainHelp: string;
  hint?: string;
  warningHelp?: string;
  requires?: Array<"tax" | "payment_method" | "currency" | "dimension">;
};

type DefaultRow = {
  id: string;
  company_id: string;
  process_key: string;
  account_node_id: string | null;
  is_active: boolean;
  notes: string | null;
};

type AccountNodeLite = {
  id: string;
  code: string | null;
  name: string | null;
  level?: number | null;
};

type ConfigStatus = "OK" | "PENDING" | "INACTIVE" | "REVIEW";

const PROCESS_CATALOG: Proc[] = [
  {
    key: "SALE_REVENUE_TAXED",
    name: "Ventas afectas (Ingreso)",
    shortName: "Ventas con IVA",
    module: "Ventas",
    group: "Venta normal",
    expectedNature: "INCOME",
    priority: "CRITICAL",
    flowOrder: 10,
    plainHelp: "Ingreso de ventas afectas a IVA.",
    hint: "Cuenta de ingresos para líneas afectas.",
  },
  {
    key: "SALE_REVENUE_EXEMPT",
    name: "Ventas exentas (Ingreso)",
    shortName: "Ventas sin IVA",
    module: "Ventas",
    group: "Venta normal",
    expectedNature: "INCOME",
    priority: "IMPORTANT",
    flowOrder: 20,
    plainHelp: "Ingreso de ventas exentas o no afectas.",
    hint: "Cuenta de ingresos para líneas exentas / 0%.",
  },
  {
    key: "SALE_TAX_OUTPUT",
    name: "Impuesto venta (IVA débito / output)",
    shortName: "IVA débito fiscal",
    module: "Ventas",
    group: "Venta normal",
    expectedNature: "LIABILITY",
    priority: "CRITICAL",
    flowOrder: 30,
    plainHelp: "IVA generado por las ventas.",
    hint: "También sirve para ND y reversa de NC según signo.",
    requires: ["tax"],
  },
  {
    key: "SALE_PAYMENT_CASH",
    name: "Cobro venta en efectivo",
    shortName: "Efectivo",
    module: "Ventas",
    group: "Formas de pago",
    expectedNature: "ASSET",
    priority: "IMPORTANT",
    flowOrder: 40,
    plainHelp: "Cuenta donde entra el efectivo recibido por ventas.",
    hint: "Cuenta contable para la porción cobrada en efectivo.",
  },
  {
    key: "SALE_PAYMENT_TRANSFER",
    name: "Cobro venta por transferencia",
    shortName: "Transferencia",
    module: "Ventas",
    group: "Formas de pago",
    expectedNature: "ASSET",
    priority: "CRITICAL",
    flowOrder: 50,
    plainHelp: "Banco donde entran transferencias recibidas por ventas.",
    hint: "Cuenta contable para la porción cobrada por transferencia.",
  },
  {
    key: "SALE_PAYMENT_CARD_DEBIT",
    name: "Cobro venta por tarjeta débito",
    shortName: "Tarjeta débito",
    module: "Ventas",
    group: "Formas de pago",
    expectedNature: "ASSET",
    priority: "IMPORTANT",
    flowOrder: 60,
    plainHelp: "Banco o cuenta puente para cobros con tarjeta débito.",
    hint: "Cuenta contable para la porción cobrada con tarjeta débito.",
  },
  {
    key: "SALE_PAYMENT_CARD_CREDIT",
    name: "Cobro venta por tarjeta crédito",
    shortName: "Tarjeta crédito",
    module: "Ventas",
    group: "Formas de pago",
    expectedNature: "ASSET",
    priority: "IMPORTANT",
    flowOrder: 70,
    plainHelp: "Banco o cuenta puente para cobros con tarjeta crédito.",
    hint: "Cuenta contable para la porción cobrada con tarjeta crédito.",
  },
  {
    key: "SALE_PAYMENT_CHECK",
    name: "Cobro venta por cheque",
    shortName: "Cheque",
    module: "Ventas",
    group: "Formas de pago",
    expectedNature: "ASSET",
    priority: "OPTIONAL",
    flowOrder: 80,
    plainHelp: "Cuenta para cheques recibidos por ventas.",
    hint: "Cuenta contable para la porción cobrada con cheque.",
  },
  {
    key: "SALE_PAYMENT_OTHER",
    name: "Cobro venta por otro medio",
    shortName: "Otro medio",
    module: "Ventas",
    group: "Formas de pago",
    expectedNature: "ASSET",
    priority: "OPTIONAL",
    flowOrder: 90,
    plainHelp: "Cuenta para otros medios de cobro.",
    hint: "Cuenta contable para la porción cobrada por otros medios.",
  },
  {
    key: "SALE_PAYMENT_CREDIT",
    name: "Cobro venta a crédito / Cuentas por Cobrar clientes",
    shortName: "Venta a crédito",
    module: "Ventas",
    group: "Formas de pago",
    expectedNature: "ASSET",
    priority: "CRITICAL",
    flowOrder: 100,
    plainHelp: "Cuenta usada cuando la venta queda pendiente de pago.",
    hint: "Normalmente debe usar la misma cuenta configurada como Clientes por cobrar.",
  },
  {
    key: "SALE_RETURNS_CREDIT_NOTE",
    name: "Notas de crédito de venta (Contra-ingreso)",
    shortName: "Rebaja por NC",
    module: "Ventas",
    group: "Notas de crédito de venta",
    expectedNature: "CONTRA_INCOME",
    priority: "CRITICAL",
    flowOrder: 110,
    plainHelp: "Cuenta que reduce ingresos por devolución, anulación o ajuste.",
    hint: "La NC normalmente debita rebaja/contra-ingreso e IVA reversado, y acredita clientes por cobrar.",
  },
  {
    key: "SALE_DEBIT_NOTE_REVENUE",
    name: "Notas de débito de venta (Ingreso)",
    shortName: "Ingreso por ND",
    module: "Ventas",
    group: "Notas de débito de venta",
    expectedNature: "INCOME",
    priority: "IMPORTANT",
    flowOrder: 130,
    plainHelp: "Ingreso adicional por recargo, diferencia o ajuste.",
    hint: "Ingreso adicional por recargo, diferencia o ajuste sobre una venta.",
  },
  {
    key: "SALE_DISCOUNTS_GIVEN",
    name: "Descuentos otorgados (Contra-ingreso)",
    shortName: "Descuentos",
    module: "Ventas",
    group: "Ajustes y anticipos de venta",
    expectedNature: "CONTRA_INCOME",
    priority: "IMPORTANT",
    flowOrder: 140,
    plainHelp: "Cuenta que reduce ingresos por descuentos otorgados.",
    warningHelp: "No usar proveedores, bancos ni cuentas por pagar.",
  },
  {
    key: "CUSTOMER_ADVANCES",
    name: "Anticipos de clientes (Pasivo)",
    shortName: "Anticipos clientes",
    module: "Ventas",
    group: "Ajustes y anticipos de venta",
    expectedNature: "LIABILITY",
    priority: "IMPORTANT",
    flowOrder: 150,
    plainHelp: "Dinero recibido del cliente antes de completar la venta.",
    warningHelp: "Debe ser una cuenta específica de anticipos de clientes.",
  },

  {
    key: "PURCHASE_EXPENSE_TAXED",
    name: "Compras/Gastos afectos",
    shortName: "Gasto con IVA",
    module: "Compras",
    group: "Compra normal",
    expectedNature: "EXPENSE",
    priority: "CRITICAL",
    flowOrder: 200,
    plainHelp: "Gasto o compra afecta a IVA cuando no es inventario.",
    hint: "Si compras mercadería para vender, usa cuentas de inventario.",
  },
  {
    key: "PURCHASE_EXPENSE_EXEMPT",
    name: "Compras/Gastos exentos",
    shortName: "Gasto sin IVA",
    module: "Compras",
    group: "Compra normal",
    expectedNature: "EXPENSE",
    priority: "IMPORTANT",
    flowOrder: 210,
    plainHelp: "Gasto o compra exenta o no afecta a IVA.",
  },
  {
    key: "PURCHASE_INVENTORY_TAXED",
    name: "Compra de inventario afecta",
    shortName: "Inventario con IVA",
    module: "Compras",
    group: "Compra normal",
    expectedNature: "INVENTORY",
    priority: "IMPORTANT",
    flowOrder: 220,
    plainHelp: "Compra de mercadería o productos para vender con IVA.",
    hint: "Usar cuando la compra aumenta inventario, no gasto.",
  },
  {
    key: "PURCHASE_INVENTORY_EXEMPT",
    name: "Compra de inventario exenta",
    shortName: "Inventario sin IVA",
    module: "Compras",
    group: "Compra normal",
    expectedNature: "INVENTORY",
    priority: "OPTIONAL",
    flowOrder: 230,
    plainHelp: "Compra de mercadería o productos para vender sin IVA.",
  },
  {
    key: "PURCHASE_FIXED_ASSET",
    name: "Compra de activo fijo",
    shortName: "Activo fijo",
    module: "Compras",
    group: "Compra normal",
    expectedNature: "FIXED_ASSET",
    priority: "OPTIONAL",
    flowOrder: 240,
    plainHelp: "Compra de bienes duraderos como equipos o maquinaria.",
  },
  {
    key: "PURCHASE_PREPAID_EXPENSE",
    name: "Gasto pagado por anticipado",
    shortName: "Gasto anticipado",
    module: "Compras",
    group: "Compra normal",
    expectedNature: "PREPAID",
    priority: "OPTIONAL",
    flowOrder: 250,
    plainHelp: "Pagos anticipados que se consumirán en periodos futuros.",
  },
  {
    key: "PURCHASE_TAX_INPUT",
    name: "Impuesto compra (IVA crédito / input)",
    shortName: "IVA crédito fiscal",
    module: "Compras",
    group: "Compra normal",
    expectedNature: "ASSET",
    priority: "CRITICAL",
    flowOrder: 260,
    plainHelp: "IVA de compras que puede recuperarse o descontarse.",
    hint: "También sirve para ND y reversa de NC según signo.",
    requires: ["tax"],
  },
  {
    key: "PURCHASE_PAYMENT_CASH",
    name: "Pago compra en efectivo",
    shortName: "Pago efectivo",
    module: "Compras",
    group: "Formas de pago de compra",
    expectedNature: "ASSET",
    priority: "IMPORTANT",
    flowOrder: 270,
    plainHelp: "Cuenta desde donde sale efectivo para pagar proveedores.",
  },
  {
    key: "PURCHASE_PAYMENT_TRANSFER",
    name: "Pago compra por transferencia",
    shortName: "Pago transferencia",
    module: "Compras",
    group: "Formas de pago de compra",
    expectedNature: "ASSET",
    priority: "CRITICAL",
    flowOrder: 280,
    plainHelp: "Banco desde donde salen transferencias a proveedores.",
  },
  {
    key: "PURCHASE_PAYMENT_CARD_DEBIT",
    name: "Pago compra tarjeta débito",
    shortName: "Pago débito",
    module: "Compras",
    group: "Formas de pago de compra",
    expectedNature: "ASSET",
    priority: "IMPORTANT",
    flowOrder: 290,
    plainHelp: "Cuenta bancaria asociada al pago con tarjeta débito.",
  },
  {
    key: "PURCHASE_PAYMENT_CARD_CREDIT",
    name: "Pago compra tarjeta crédito",
    shortName: "Pago crédito",
    module: "Compras",
    group: "Formas de pago de compra",
    expectedNature: "LIABILITY",
    priority: "IMPORTANT",
    flowOrder: 300,
    plainHelp: "Cuenta de tarjeta o deuda usada para compras con crédito.",
  },
  {
    key: "PURCHASE_PAYMENT_CHECK",
    name: "Pago compra por cheque",
    shortName: "Pago cheque",
    module: "Compras",
    group: "Formas de pago de compra",
    expectedNature: "ASSET",
    priority: "OPTIONAL",
    flowOrder: 310,
    plainHelp: "Cuenta usada para pagos a proveedor con cheque.",
  },
  {
    key: "PURCHASE_PAYMENT_OTHER",
    name: "Pago compra otro medio",
    shortName: "Pago otro medio",
    module: "Compras",
    group: "Formas de pago de compra",
    expectedNature: "ASSET",
    priority: "OPTIONAL",
    flowOrder: 320,
    plainHelp: "Cuenta usada para otros medios de pago a proveedores.",
  },
  {
    key: "PURCHASE_PAYMENT_CREDIT",
    name: "Compra a crédito / proveedor pendiente",
    shortName: "Compra a crédito",
    module: "Compras",
    group: "Formas de pago de compra",
    expectedNature: "LIABILITY",
    priority: "CRITICAL",
    flowOrder: 330,
    plainHelp: "Cuenta usada cuando la compra queda pendiente de pago.",
    hint: "Normalmente debe usar la misma cuenta configurada como Proveedores por pagar.",
  },
  {
    key: "PURCHASE_CREDIT_NOTE_RECOVERY",
    name: "Notas de crédito de compra (Contra-gasto / recuperación)",
    shortName: "Rebaja por NC",
    module: "Compras",
    group: "Notas de crédito de compra",
    expectedNature: "CONTRA_EXPENSE",
    priority: "IMPORTANT",
    flowOrder: 340,
    plainHelp: "Reduce gasto, compra o inventario por NC del proveedor.",
  },
  {
    key: "PURCHASE_CREDIT_NOTE_SETTLEMENT_BANK",
    name: "Cobro / abono NC compra a banco",
    shortName: "Abono NC banco",
    module: "Compras",
    group: "Notas de crédito de compra",
    expectedNature: "ASSET",
    priority: "OPTIONAL",
    flowOrder: 350,
    plainHelp: "Banco donde se recibe devolución de proveedor por NC.",
  },
  {
    key: "PURCHASE_CREDIT_NOTE_SETTLEMENT_CASH",
    name: "Cobro / abono NC compra en caja",
    shortName: "Abono NC caja",
    module: "Compras",
    group: "Notas de crédito de compra",
    expectedNature: "ASSET",
    priority: "OPTIONAL",
    flowOrder: 360,
    plainHelp: "Caja donde se recibe devolución en efectivo por NC.",
  },
  {
    key: "PURCHASE_DEBIT_NOTE_EXPENSE",
    name: "Notas de débito de compra (Gasto / ajuste adicional)",
    shortName: "Aumento por ND",
    module: "Compras",
    group: "Notas de débito de compra",
    expectedNature: "EXPENSE",
    priority: "IMPORTANT",
    flowOrder: 370,
    plainHelp: "Aumenta gasto, compra o inventario por recargo del proveedor.",
  },
  {
    key: "PURCHASE_DISCOUNTS_RECEIVED",
    name: "Descuentos recibidos (Contra-gasto)",
    shortName: "Descuentos proveedor",
    module: "Compras",
    group: "Anticipos y retenciones de compra",
    expectedNature: "CONTRA_EXPENSE",
    priority: "IMPORTANT",
    flowOrder: 380,
    plainHelp: "Reduce gasto o compra por descuentos recibidos.",
  },
  {
    key: "SUPPLIER_ADVANCES",
    name: "Anticipos a proveedores (Activo)",
    shortName: "Anticipos proveedor",
    module: "Compras",
    group: "Anticipos y retenciones de compra",
    expectedNature: "ASSET",
    priority: "IMPORTANT",
    flowOrder: 390,
    plainHelp: "Dinero pagado al proveedor antes de recibir factura.",
  },
  {
    key: "WITHHOLDINGS_PAYABLE",
    name: "Retenciones por pagar (Pasivo)",
    shortName: "Retenciones",
    module: "Compras",
    group: "Anticipos y retenciones de compra",
    expectedNature: "LIABILITY",
    priority: "IMPORTANT",
    flowOrder: 400,
    plainHelp: "Retenciones u obligaciones pendientes de pago.",
    requires: ["tax"],
  },

  {
    key: "CASH",
    name: "Caja",
    shortName: "Caja",
    module: "Bancos",
    group: "Caja y bancos",
    expectedNature: "ASSET",
    priority: "CRITICAL",
    flowOrder: 500,
    plainHelp: "Cuenta principal para registrar movimientos de efectivo.",
  },
  {
    key: "BANK_DEFAULT",
    name: "Banco por defecto",
    shortName: "Banco principal",
    module: "Bancos",
    group: "Caja y bancos",
    expectedNature: "ASSET",
    priority: "CRITICAL",
    flowOrder: 510,
    plainHelp: "Banco principal usado cuando no hay cuenta más específica.",
  },
  {
    key: "TRANSFER_BRIDGE",
    name: "Cuenta puente transferencias internas",
    shortName: "Puente transferencias",
    module: "Bancos",
    group: "Caja y bancos",
    expectedNature: "BRIDGE",
    priority: "IMPORTANT",
    flowOrder: 520,
    plainHelp: "Cuenta puente para mover dinero entre bancos o caja.",
  },
  {
    key: "PAYMENT_GATEWAY_CLEARING",
    name: "Clearing pasarela (en tránsito)",
    shortName: "Pasarela tránsito",
    module: "Bancos",
    group: "Pasarelas",
    expectedNature: "BRIDGE",
    priority: "IMPORTANT",
    flowOrder: 530,
    plainHelp: "Cuenta puente para cobros por pasarela antes del depósito.",
    hint: "Stripe/WebPay/MercadoPago: cobro vs depósito.",
  },
  {
    key: "PAYMENT_GATEWAY_FEES",
    name: "Comisiones pasarela (Gasto)",
    shortName: "Comisiones pasarela",
    module: "Bancos",
    group: "Pasarelas",
    expectedNature: "EXPENSE",
    priority: "IMPORTANT",
    flowOrder: 540,
    plainHelp: "Gasto por comisiones cobradas por pasarelas.",
  },
  {
    key: "BANK_FEES",
    name: "Comisiones / gastos bancarios",
    shortName: "Gastos bancarios",
    module: "Bancos",
    group: "Gastos e intereses bancarios",
    expectedNature: "EXPENSE",
    priority: "IMPORTANT",
    flowOrder: 550,
    plainHelp: "Comisiones, cargos y costos cobrados por bancos.",
  },
  {
    key: "BANK_INTEREST_INCOME",
    name: "Intereses ganados",
    shortName: "Intereses ganados",
    module: "Bancos",
    group: "Gastos e intereses bancarios",
    expectedNature: "INCOME",
    priority: "OPTIONAL",
    flowOrder: 560,
    plainHelp: "Ingreso por intereses ganados en bancos o inversiones.",
  },
  {
    key: "BANK_INTEREST_EXPENSE",
    name: "Intereses pagados",
    shortName: "Intereses pagados",
    module: "Bancos",
    group: "Gastos e intereses bancarios",
    expectedNature: "EXPENSE",
    priority: "OPTIONAL",
    flowOrder: 570,
    plainHelp: "Gasto por intereses pagados.",
  },
  {
    key: "RECONCILIATION_DIFF",
    name: "Diferencias de conciliación (ajuste)",
    shortName: "Diferencias conciliación",
    module: "Bancos",
    group: "Diferencias y ajustes bancarios",
    expectedNature: "CONTROL",
    priority: "OPTIONAL",
    flowOrder: 580,
    plainHelp: "Diferencias menores detectadas en conciliación bancaria.",
  },
  {
    key: "FX_GAIN",
    name: "Ganancia por tipo de cambio",
    shortName: "Ganancia cambio",
    module: "Bancos",
    group: "Diferencias y ajustes bancarios",
    expectedNature: "INCOME",
    priority: "OPTIONAL",
    flowOrder: 590,
    plainHelp: "Ganancias por diferencias de cambio.",
  },
  {
    key: "FX_LOSS",
    name: "Pérdida por tipo de cambio",
    shortName: "Pérdida cambio",
    module: "Bancos",
    group: "Diferencias y ajustes bancarios",
    expectedNature: "EXPENSE",
    priority: "OPTIONAL",
    flowOrder: 600,
    plainHelp: "Pérdidas por diferencias de cambio.",
  },
  {
    key: "ROUNDING_DIFF",
    name: "Redondeo / diferencias menores",
    shortName: "Redondeos",
    module: "Bancos",
    group: "Diferencias y ajustes bancarios",
    expectedNature: "CONTROL",
    priority: "OPTIONAL",
    flowOrder: 610,
    plainHelp: "Diferencias menores por redondeo.",
  },

  {
    key: "INVENTORY",
    name: "Inventario",
    shortName: "Inventario",
    module: "Inventario",
    group: "Inventario y costos",
    expectedNature: "INVENTORY",
    priority: "CRITICAL",
    flowOrder: 700,
    plainHelp: "Mercadería o productos disponibles para vender.",
  },
  {
    key: "COGS",
    name: "Costo de ventas (COGS)",
    shortName: "Costo de ventas",
    module: "Inventario",
    group: "Inventario y costos",
    expectedNature: "EXPENSE",
    priority: "CRITICAL",
    flowOrder: 710,
    plainHelp: "Costo asociado a los productos vendidos.",
  },
  {
    key: "INVENTORY_ADJUST",
    name: "Ajustes / merma inventario",
    shortName: "Mermas y ajustes",
    module: "Inventario",
    group: "Inventario y costos",
    expectedNature: "EXPENSE",
    priority: "IMPORTANT",
    flowOrder: 720,
    plainHelp: "Pérdidas, mermas, ajustes o diferencias de inventario.",
  },

  {
    key: "PAYROLL_WAGES",
    name: "Sueldos (Gasto)",
    shortName: "Sueldos",
    module: "Nómina",
    group: "Remuneraciones",
    expectedNature: "EXPENSE",
    priority: "IMPORTANT",
    flowOrder: 800,
    plainHelp: "Gasto por sueldos del personal.",
    requires: ["dimension"],
  },
  {
    key: "PAYROLL_SOCIAL_CHARGES",
    name: "Cargas sociales (Gasto)",
    shortName: "Cargas sociales",
    module: "Nómina",
    group: "Remuneraciones",
    expectedNature: "EXPENSE",
    priority: "IMPORTANT",
    flowOrder: 810,
    plainHelp: "Gasto por cargas sociales, aportes o costos laborales.",
    requires: ["dimension"],
  },
  {
    key: "PAYROLL_PAYABLE",
    name: "Sueldos por pagar",
    shortName: "Sueldos por pagar",
    module: "Nómina",
    group: "Remuneraciones",
    expectedNature: "LIABILITY",
    priority: "IMPORTANT",
    flowOrder: 820,
    plainHelp: "Deuda pendiente con trabajadores por remuneraciones.",
  },
  {
    key: "PAYROLL_WITHHOLDINGS_PAYABLE",
    name: "Retenciones nómina por pagar (Pasivo)",
    shortName: "Retenciones nómina",
    module: "Nómina",
    group: "Remuneraciones",
    expectedNature: "LIABILITY",
    priority: "IMPORTANT",
    flowOrder: 830,
    plainHelp: "Retenciones de nómina pendientes de pago.",
  },
  {
    key: "PAYROLL_PROVISIONS",
    name: "Provisiones nómina (Vacaciones, etc.)",
    shortName: "Provisiones nómina",
    module: "Nómina",
    group: "Remuneraciones",
    expectedNature: "LIABILITY",
    priority: "IMPORTANT",
    flowOrder: 840,
    plainHelp: "Obligaciones laborales estimadas, como vacaciones.",
  },

  {
    key: "AR_CUSTOMERS",
    name: "Clientes / Cuentas por cobrar (AR)",
    shortName: "Clientes por cobrar",
    module: "Cuentas base",
    group: "Activos",
    expectedNature: "ASSET",
    priority: "CRITICAL",
    flowOrder: 900,
    plainHelp: "Cuenta base donde se registra lo que los clientes deben.",
    hint: "Suele usarse también para ventas a crédito.",
  },
  {
    key: "AP_SUPPLIERS",
    name: "Proveedores / Cuentas por pagar (AP)",
    shortName: "Proveedores por pagar",
    module: "Cuentas base",
    group: "Pasivos",
    expectedNature: "LIABILITY",
    priority: "CRITICAL",
    flowOrder: 910,
    plainHelp: "Cuenta base donde se registra lo que la empresa debe a proveedores.",
    hint: "Suele usarse también para compras a crédito.",
  },
  {
    key: "RETAINED_EARNINGS",
    name: "Resultados acumulados",
    shortName: "Resultados acumulados",
    module: "Cuentas base",
    group: "Patrimonio",
    expectedNature: "EQUITY",
    priority: "IMPORTANT",
    flowOrder: 920,
    plainHelp: "Cuenta patrimonial para resultados acumulados anteriores.",
  },

  {
    key: "OPENING_BALANCE",
    name: "Apertura de saldos",
    shortName: "Apertura saldos",
    module: "Contabilidad",
    group: "Contabilidad general",
    expectedNature: "CONTROL",
    priority: "IMPORTANT",
    flowOrder: 1000,
    plainHelp: "Cuenta de control para cargar saldos iniciales.",
  },
  {
    key: "YEAR_RESULT",
    name: "Resultado del ejercicio / cierre",
    shortName: "Resultado ejercicio",
    module: "Contabilidad",
    group: "Contabilidad general",
    expectedNature: "EQUITY",
    priority: "IMPORTANT",
    flowOrder: 1010,
    plainHelp: "Cuenta donde se traslada el resultado del ejercicio al cierre.",
  },
  {
    key: "GENERAL_ADJUSTMENTS",
    name: "Ajustes contables (control)",
    shortName: "Ajustes contables",
    module: "Contabilidad",
    group: "Contabilidad general",
    expectedNature: "CONTROL",
    priority: "OPTIONAL",
    flowOrder: 1020,
    plainHelp: "Cuenta de control para ajustes manuales o procesos especiales.",
  },
  {
    key: "SUSPENSE_ACCOUNT",
    name: "Cuenta transitoria / por clasificar",
    shortName: "Por clasificar",
    module: "Contabilidad",
    group: "Contabilidad general",
    expectedNature: "CONTROL",
    priority: "IMPORTANT",
    flowOrder: 1030,
    plainHelp: "Cuenta temporal para movimientos aún no clasificados.",
    warningHelp:
      "Debe revisarse periódicamente. No debe acumular saldos sin explicación.",
  },
];

const DEFAULTS_TABLE_CANDIDATES = ["account_defaults"];
const ACCOUNTS_TABLE_CANDIDATES = ["account_nodes"];

const MODULE_ORDER: ProcModule[] = [
  "Ventas",
  "Compras",
  "Bancos",
  "Inventario",
  "Nómina",
  "Cuentas base",
  "Contabilidad",
];

const GROUP_ORDER: ProcGroup[] = [
  "Venta normal",
  "Formas de pago",
  "Notas de crédito de venta",
  "Notas de débito de venta",
  "Ajustes y anticipos de venta",
  "Compra normal",
  "Formas de pago de compra",
  "Notas de crédito de compra",
  "Notas de débito de compra",
  "Anticipos y retenciones de compra",
  "Caja y bancos",
  "Pasarelas",
  "Gastos e intereses bancarios",
  "Diferencias y ajustes bancarios",
  "Inventario y costos",
  "Remuneraciones",
  "Activos",
  "Pasivos",
  "Patrimonio",
  "Contabilidad general",
];

function moduleBadgeClass(module: ProcModule) {
  switch (module) {
    case "Ventas":
      return "bg-sky-100 text-sky-800 ring-1 ring-sky-200";
    case "Compras":
      return "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200";
    case "Bancos":
      return "bg-amber-100 text-amber-800 ring-1 ring-amber-200";
    case "Inventario":
      return "bg-violet-100 text-violet-800 ring-1 ring-violet-200";
    case "Nómina":
      return "bg-pink-100 text-pink-800 ring-1 ring-pink-200";
    case "Cuentas base":
      return "bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200";
    case "Contabilidad":
      return "bg-slate-200 text-slate-800 ring-1 ring-slate-300";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
  }
}

function moduleAccentClass(module: ProcModule) {
  switch (module) {
    case "Ventas":
      return "border-l-sky-400";
    case "Compras":
      return "border-l-emerald-400";
    case "Bancos":
      return "border-l-amber-400";
    case "Inventario":
      return "border-l-violet-400";
    case "Nómina":
      return "border-l-pink-400";
    case "Cuentas base":
      return "border-l-cyan-400";
    case "Contabilidad":
      return "border-l-slate-400";
    default:
      return "border-l-slate-300";
  }
}

function moduleDescription(module: ProcModule) {
  switch (module) {
    case "Ventas":
      return "Venta normal, medios de cobro, NC, ND, descuentos y anticipos.";
    case "Compras":
      return "Compra normal, pagos, NC, ND, anticipos y retenciones.";
    case "Bancos":
      return "Caja, bancos, pasarelas, gastos, intereses y diferencias.";
    case "Inventario":
      return "Inventario, costo de ventas, mermas y ajustes.";
    case "Nómina":
      return "Sueldos, cargas sociales, retenciones y provisiones.";
    case "Cuentas base":
      return "Cuentas principales usadas por varios procesos.";
    case "Contabilidad":
      return "Apertura, cierre, ajustes y cuentas transitorias.";
    default:
      return "";
  }
}

function natureLabel(n: AccountNature | null) {
  switch (n) {
    case "ASSET":
      return "Activo";
    case "LIABILITY":
      return "Pasivo";
    case "EQUITY":
      return "Patrimonio";
    case "INCOME":
      return "Ingreso";
    case "CONTRA_INCOME":
      return "Contra-ingreso";
    case "EXPENSE":
      return "Gasto";
    case "CONTRA_EXPENSE":
      return "Contra-gasto";
    case "INVENTORY":
      return "Inventario";
    case "FIXED_ASSET":
      return "Activo fijo";
    case "PREPAID":
      return "Anticipado";
    case "BRIDGE":
      return "Cuenta puente";
    case "SETTLEMENT":
      return "Liquidación";
    case "CONTROL":
      return "Control";
    default:
      return "Cuenta";
  }
}

function natureHelp(n: AccountNature) {
  switch (n) {
    case "ASSET":
      return "Normalmente bancos, caja, clientes por cobrar, anticipos entregados o activos.";
    case "LIABILITY":
      return "Normalmente deudas, impuestos por pagar, anticipos recibidos o proveedores.";
    case "EQUITY":
      return "Patrimonio, resultados acumulados o resultado del ejercicio.";
    case "INCOME":
      return "Cuentas de ingresos o ventas.";
    case "CONTRA_INCOME":
      return "Cuentas que reducen ingresos, como descuentos o notas de crédito.";
    case "EXPENSE":
      return "Gastos, costos, comisiones o pérdidas.";
    case "CONTRA_EXPENSE":
      return "Cuentas que reducen gastos o compras.";
    case "INVENTORY":
      return "Mercadería o productos disponibles para vender.";
    case "FIXED_ASSET":
      return "Bienes duraderos como equipos, muebles o maquinaria.";
    case "PREPAID":
      return "Pagos anticipados que se consumirán en periodos futuros.";
    case "BRIDGE":
      return "Cuenta temporal para movimientos en tránsito, pasarelas o transferencias internas.";
    case "SETTLEMENT":
      return "Cuenta usada para cerrar, pagar o aplicar una devolución. Puede ser banco/caja si devuelves dinero, o pasivo si queda saldo a favor del cliente.";
    case "CONTROL":
      return "Cuenta especial para ajustes, diferencias o procesos contables de control.";
    default:
      return "";
  }
}

function natureClass(n: AccountNature) {
  switch (n) {
    case "ASSET":
      return "bg-blue-50 text-blue-700 ring-1 ring-blue-100";
    case "LIABILITY":
      return "bg-orange-50 text-orange-700 ring-1 ring-orange-100";
    case "EQUITY":
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
    case "INCOME":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100";
    case "CONTRA_INCOME":
      return "bg-teal-50 text-teal-700 ring-1 ring-teal-100";
    case "EXPENSE":
      return "bg-rose-50 text-rose-700 ring-1 ring-rose-100";
    case "CONTRA_EXPENSE":
      return "bg-purple-50 text-purple-700 ring-1 ring-purple-100";
    case "INVENTORY":
      return "bg-violet-50 text-violet-700 ring-1 ring-violet-100";
    case "FIXED_ASSET":
      return "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100";
    case "PREPAID":
      return "bg-sky-50 text-sky-700 ring-1 ring-sky-100";
    case "BRIDGE":
      return "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100";
    case "SETTLEMENT":
      return "bg-lime-50 text-lime-700 ring-1 ring-lime-100";
    case "CONTROL":
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
  }
}

function priorityLabel(p: ProcPriority) {
  switch (p) {
    case "CRITICAL":
      return "Crítico";
    case "IMPORTANT":
      return "Importante";
    case "OPTIONAL":
      return "Opcional";
    default:
      return "Proceso";
  }
}

function priorityClass(p: ProcPriority) {
  switch (p) {
    case "CRITICAL":
      return "bg-rose-50 text-rose-700 ring-1 ring-rose-100";
    case "IMPORTANT":
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-100";
    case "OPTIONAL":
      return "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
    default:
      return "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
  }
}

function statusLabel(s: ConfigStatus) {
  switch (s) {
    case "OK":
      return "Configurado";
    case "PENDING":
      return "Pendiente";
    case "INACTIVE":
      return "Inactivo";
    case "REVIEW":
      return "Revisar";
    default:
      return "Estado";
  }
}

function statusClass(s: ConfigStatus) {
  switch (s) {
    case "OK":
      return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200";
    case "PENDING":
      return "bg-amber-100 text-amber-800 ring-1 ring-amber-200";
    case "INACTIVE":
      return "bg-slate-200 text-slate-700 ring-1 ring-slate-300";
    case "REVIEW":
      return "bg-rose-100 text-rose-700 ring-1 ring-rose-200";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
  }
}

function inferNatureFromCode(code?: string | null): AccountNature | null {
  const clean = String(code ?? "").trim();
  if (!clean) return null;

  const first = clean[0];

  if (first === "1") return "ASSET";
  if (first === "2") return "LIABILITY";
  if (first === "3") return "EQUITY";
  if (first === "4") return "INCOME";
  if (first === "5") return "EXPENSE";
  if (first === "6") return "EXPENSE";

  return null;
}

function isCompatibleNature(expected: AccountNature, inferred: AccountNature | null) {
  if (!inferred) return true;
  if (expected === inferred) return true;

  if (expected === "CONTRA_INCOME" && inferred === "INCOME") return true;
  if (expected === "CONTRA_EXPENSE" && inferred === "EXPENSE") return true;
  if (expected === "INVENTORY" && inferred === "ASSET") return true;
  if (expected === "FIXED_ASSET" && inferred === "ASSET") return true;
  if (expected === "PREPAID" && inferred === "ASSET") return true;
  if (expected === "BRIDGE" && inferred === "ASSET") return true;
  if (
    expected === "SETTLEMENT" &&
    (inferred === "ASSET" || inferred === "LIABILITY")
  ) {
    return true;
  }
  if (expected === "CONTROL") return true;

  return false;
}

function getConfigWarning(p: Proc, account: AccountNodeLite | null): string | null {
  if (!account) return null;

  const text = `${account.code ?? ""} ${account.name ?? ""}`.toLowerCase();
  const inferred = inferNatureFromCode(account.code);

  if (p.key === "SALE_DISCOUNTS_GIVEN" && text.includes("proveedor")) {
    return "Parece cuenta de proveedores.";
  }

  if (p.key === "CUSTOMER_ADVANCES" && text.includes("proveedor")) {
    return "Parece cuenta de proveedores.";
  }

  if (p.key === "AR_CUSTOMERS" && text.includes("proveedor")) {
    return "Debe ser clientes por cobrar.";
  }

  if (p.key === "AP_SUPPLIERS" && text.includes("cliente")) {
    return "Debe ser proveedores por pagar.";
  }

  if (p.key === "SALE_RETURNS_CREDIT_NOTE" && text.includes("proveedor")) {
    return "Debe reducir ingresos.";
  }

  if (
    p.key === "SALE_PAYMENT_CREDIT" &&
    account.name &&
    !text.includes("cliente") &&
    !text.includes("cobrar")
  ) {
    return "Normalmente usa clientes por cobrar.";
  }

  if (
    p.key === "PURCHASE_PAYMENT_CREDIT" &&
    account.name &&
    !text.includes("proveedor") &&
    !text.includes("pagar")
  ) {
    return "Normalmente usa proveedores por pagar.";
  }

  if (!isCompatibleNature(p.expectedNature, inferred)) {
    return `Parece ${natureLabel(inferred)}, se espera ${natureLabel(
      p.expectedNature
    )}.`;
  }

  return null;
}

function getConfigStatus(
  p: Proc,
  d: DefaultRow | null,
  account: AccountNodeLite | null
): ConfigStatus {
  if (!d || !d.account_node_id) return "PENDING";
  if (!d.is_active) return "INACTIVE";
  if (getConfigWarning(p, account)) return "REVIEW";
  return "OK";
}

function isMissingTableError(e: any) {
  const msg = String(e?.message ?? "");
  const code = String((e as any)?.code ?? "");

  return (
    code === "42P01" ||
    msg.toLowerCase().includes("does not exist") ||
    msg.toLowerCase().includes("relation")
  );
}

async function detectTable(candidates: string[], probeSelect: string) {
  for (const t of candidates) {
    try {
      const { error } = await supabase.from(t).select(probeSelect).limit(1);
      if (!error) return t;
      if (isMissingTableError(error)) continue;
      return t;
    } catch (e: any) {
      if (isMissingTableError(e)) continue;
      return t;
    }
  }

  return null;
}

export default function CuentasPorDefectoPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    const fromLS =
      localStorage.getItem("active_company_id") ||
      localStorage.getItem("company_id") ||
      localStorage.getItem("activeCompanyId");

    if (fromLS && fromLS.length >= 10) setCompanyId(fromLS);
    else setCompanyId(null);
  }, []);

  const [role, setRole] = useState<"OWNER" | "EDITOR" | "LECTOR" | null>(null);
  const canEdit = role === "OWNER" || role === "EDITOR";

  useEffect(() => {
    if (!companyId) return;
    getMyRoleForCompany(companyId).then(setRole);
  }, [companyId]);

  const [defaultsTable, setDefaultsTable] = useState<string | null>(null);
  const [accountsTable, setAccountsTable] = useState<string | null>(null);

  const [defaults, setDefaults] = useState<DefaultRow[]>([]);
  const [accounts, setAccounts] = useState<AccountNodeLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [qText, setQText] = useState("");
  const [qModule, setQModule] = useState<"" | ProcModule>("");
  const [qStatus, setQStatus] = useState<"" | ConfigStatus>("");
  const [qNature, setQNature] = useState<"" | AccountNature>("");
  const [qPriority, setQPriority] = useState<"" | ProcPriority>("");

  const [openPick, setOpenPick] = useState(false);
  const [pickProc, setPickProc] = useState<Proc | null>(null);
  const [pickAccountNodeId, setPickAccountNodeId] = useState<string | null>(null);
  const [pickNotes, setPickNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  async function loadAccountNodes(at: string, cid: string) {
    const try1 = await supabase
      .from(at)
      .select("id, code, name, level")
      .eq("company_id", cid)
      .eq("level", 4)
      .order("code", { ascending: true });

    if (!try1.error) return (try1.data ?? []) as AccountNodeLite[];

    const try3 = await supabase
      .from(at)
      .select("id, code, name, level")
      .eq("level", 4)
      .order("code", { ascending: true })
      .limit(5000);

    if (!try3.error) return (try3.data ?? []) as AccountNodeLite[];

    const try4 = await supabase
      .from(at)
      .select("id, name")
      .eq("company_id", cid)
      .order("name", { ascending: true });

    if (try4.error) throw try4.error;

    return [];
  }

  async function bootstrap(cid: string) {
    setLoading(true);
    setError(null);

    try {
      const dt = await detectTable(DEFAULTS_TABLE_CANDIDATES, "id");
      const at = await detectTable(ACCOUNTS_TABLE_CANDIDATES, "id");

      setDefaultsTable(dt);
      setAccountsTable(at);

      if (at) {
        const list = await loadAccountNodes(at, cid);
        setAccounts(list);
      } else {
        setAccounts([]);
      }

      if (dt) {
        const { data, error } = await supabase
          .from(dt)
          .select("id, company_id, process_key, account_node_id, is_active, notes")
          .eq("company_id", cid)
          .order("process_key", { ascending: true });

        if (error) throw error;

        setDefaults(((data as any[]) ?? []) as any);
      } else {
        setDefaults([]);
      }
    } catch (e: any) {
      setError(e?.message ?? "Error cargando.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    bootstrap(companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  function findDefault(processKey: string) {
    return defaults.find((d) => d.process_key === processKey) ?? null;
  }

  function findAccount(accountNodeId: string | null | undefined) {
    if (!accountNodeId) return null;
    return accounts.find((x) => x.id === accountNodeId) ?? null;
  }

  function accountLabel(accountNodeId: string | null) {
    if (!accountNodeId) return "—";

    const a = findAccount(accountNodeId);
    if (!a) return `Cuenta: ${accountNodeId.slice(0, 8)}…`;

    const c = a.code ? String(a.code) : "";
    const n = a.name ? String(a.name) : "";

    return c && n ? `${c} • ${n}` : n || c || a.id;
  }

  function procStatus(p: Proc) {
    const d = findDefault(p.key);
    const account = findAccount(d?.account_node_id);
    return getConfigStatus(p, d, account);
  }

  const natures = useMemo(() => {
    const s = new Set<AccountNature>();
    PROCESS_CATALOG.forEach((p) => s.add(p.expectedNature));
    return Array.from(s);
  }, []);

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();

    return PROCESS_CATALOG.filter((p) => {
      if (qModule && p.module !== qModule) return false;
      if (qPriority && p.priority !== qPriority) return false;
      if (qNature && p.expectedNature !== qNature) return false;

      const d = defaults.find((x) => x.process_key === p.key) ?? null;
      const a = d?.account_node_id
        ? accounts.find((x) => x.id === d.account_node_id) ?? null
        : null;
      const s = getConfigStatus(p, d, a);

      if (qStatus && s !== qStatus) return false;

      if (!t) return true;

      const hay = `${p.key} ${p.name} ${p.shortName} ${p.module} ${p.group} ${
        p.hint ?? ""
      } ${p.plainHelp} ${accountLabel(d?.account_node_id ?? null)}`.toLowerCase();

      return hay.includes(t);
    }).sort((a, b) => a.flowOrder - b.flowOrder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qText, qModule, qStatus, qNature, qPriority, defaults, accounts]);

  const grouped = useMemo(() => {
    const byModule = new Map<ProcModule, Map<ProcGroup, Proc[]>>();

    filtered.forEach((p) => {
      if (!byModule.has(p.module)) byModule.set(p.module, new Map());

      const groups = byModule.get(p.module)!;
      if (!groups.has(p.group)) groups.set(p.group, []);

      groups.get(p.group)!.push(p);
    });

    return MODULE_ORDER.map((module) => {
      const groups = byModule.get(module);
      if (!groups) return null;

      const orderedGroups = GROUP_ORDER.map((group) => {
        const items = groups.get(group);
        if (!items?.length) return null;

        return { group, items };
      }).filter(Boolean) as Array<{ group: ProcGroup; items: Proc[] }>;

      if (!orderedGroups.length) return null;

      return { module, groups: orderedGroups };
    }).filter(Boolean) as Array<{
      module: ProcModule;
      groups: Array<{ group: ProcGroup; items: Proc[] }>;
    }>;
  }, [filtered]);

  const summary = useMemo(() => {
    let ok = 0;
    let pending = 0;
    let inactive = 0;
    let review = 0;
    let criticalPending = 0;

    PROCESS_CATALOG.forEach((p) => {
      const d = defaults.find((x) => x.process_key === p.key) ?? null;
      const a = d?.account_node_id
        ? accounts.find((x) => x.id === d.account_node_id) ?? null
        : null;

      const s = getConfigStatus(p, d, a);

      if (s === "OK") ok++;
      if (s === "PENDING") pending++;
      if (s === "INACTIVE") inactive++;
      if (s === "REVIEW") review++;

      if ((s === "PENDING" || s === "REVIEW") && p.priority === "CRITICAL") {
        criticalPending++;
      }
    });

    return {
      total: PROCESS_CATALOG.length,
      ok,
      pending,
      inactive,
      review,
      criticalPending,
    };
  }, [defaults, accounts]);

  function openAssign(p: Proc) {
    const d = findDefault(p.key);

    setPickProc(p);
    setPickAccountNodeId(d?.account_node_id ?? null);
    setPickNotes(d?.notes ?? "");
    setOpenPick(true);
  }

  async function saveAssign() {
    if (!companyId || !pickProc) return;

    if (!defaultsTable) {
      alert("No existe la tabla account_defaults. Debes crearla para poder guardar.");
      return;
    }

    if (!canEdit) {
      alert("No tienes permisos para editar cuentas por defecto.");
      return;
    }

    setSaving(true);

    try {
      const uid = await getAuthUserId();
      const existing = findDefault(pickProc.key);

      if (existing) {
        const { data, error } = await supabase
          .from(defaultsTable)
          .update({
            account_node_id: pickAccountNodeId,
            is_active: true,
            notes: pickNotes.trim() ? pickNotes.trim() : null,
            updated_by: uid,
          } as any)
          .eq("id", existing.id)
          .eq("company_id", companyId)
          .select("id, company_id, process_key, account_node_id, is_active, notes")
          .single();

        if (error) throw error;

        setDefaults((prev) =>
          prev.map((x) => (x.id === existing.id ? ((data as any) as DefaultRow) : x))
        );
      } else {
        const { data, error } = await supabase
          .from(defaultsTable)
          .insert({
            company_id: companyId,
            process_key: pickProc.key,
            account_node_id: pickAccountNodeId,
            is_active: true,
            notes: pickNotes.trim() ? pickNotes.trim() : null,
            created_by: uid,
            updated_by: uid,
          } as any)
          .select("id, company_id, process_key, account_node_id, is_active, notes")
          .single();

        if (error) throw error;

        setDefaults((prev) => [((data as any) as DefaultRow), ...prev]);
      }

      setOpenPick(false);
    } catch (e: any) {
      alert(`Error guardando: ${e?.message ?? "Error"}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: Proc) {
    if (!companyId) return;
    if (!defaultsTable) return;

    if (!canEdit) {
      alert("No tienes permisos para activar/desactivar.");
      return;
    }

    const d = findDefault(p.key);

    if (!d) {
      alert("Primero asigna una cuenta para poder activar/desactivar.");
      return;
    }

    const next = !d.is_active;
    const before = defaults;

    setDefaults((prev) =>
      prev.map((x) => (x.id === d.id ? { ...x, is_active: next } : x))
    );

    try {
      const uid = await getAuthUserId();

      const { error } = await supabase
        .from(defaultsTable)
        .update({ is_active: next, updated_by: uid } as any)
        .eq("id", d.id)
        .eq("company_id", companyId);

      if (error) throw error;
    } catch (e: any) {
      setDefaults(before);
      alert(`Error: ${e?.message ?? "No se pudo actualizar."}`);
    }
  }

  const pickAccount = findAccount(pickAccountNodeId);
  const pickWarning = pickProc ? getConfigWarning(pickProc, pickAccount) : null;

  return (
    <div className="p-6">
      <div className="overflow-hidden rounded-[28px] bg-white shadow-[0_18px_70px_rgba(15,23,42,0.10)] ring-1 ring-slate-200">
        <div className="relative bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] px-7 py-7 text-white">
          <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[12px] font-extrabold uppercase text-white/80">
                Configuración contable
              </div>

              <h1 className="mt-1 text-3xl font-black leading-tight">
                Cuentas automáticas por defecto
              </h1>

              <div className="mt-2 max-w-3xl text-[13px] font-medium leading-6 text-white/85">
                Configura las cuentas que usará el sistema para generar asientos
                automáticos. La tabla está ordenada por flujo operativo para que sea
                fácil de entender.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/configuracion/plan-de-cuentas"
                className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 transition hover:bg-white/15"
              >
                Ir a Plan de cuentas
              </Link>

              <button
                onClick={() => companyId && bootstrap(companyId)}
                className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 transition hover:bg-white/15"
                type="button"
              >
                Refrescar
              </button>
            </div>
          </div>
        </div>

        <div className="border-b border-slate-200 bg-slate-50/70 px-7 py-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <button
              type="button"
              onClick={() => {
                setQStatus("");
                setQPriority("");
              }}
              className="rounded-[22px] bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
            >
              <div className="text-[11px] font-black uppercase text-slate-500">
                Total procesos
              </div>
              <div className="mt-1 text-2xl font-black text-slate-900">
                {summary.total}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setQStatus("OK")}
              className="rounded-[22px] bg-white p-4 text-left shadow-sm ring-1 ring-emerald-100 transition hover:bg-emerald-50"
            >
              <div className="text-[11px] font-black uppercase text-emerald-700">
                Configurados
              </div>
              <div className="mt-1 text-2xl font-black text-emerald-700">
                {summary.ok}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setQStatus("PENDING")}
              className="rounded-[22px] bg-white p-4 text-left shadow-sm ring-1 ring-amber-100 transition hover:bg-amber-50"
            >
              <div className="text-[11px] font-black uppercase text-amber-700">
                Pendientes
              </div>
              <div className="mt-1 text-2xl font-black text-amber-700">
                {summary.pending}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setQStatus("REVIEW")}
              className="rounded-[22px] bg-white p-4 text-left shadow-sm ring-1 ring-rose-100 transition hover:bg-rose-50"
            >
              <div className="text-[11px] font-black uppercase text-rose-700">
                Revisar
              </div>
              <div className="mt-1 text-2xl font-black text-rose-700">
                {summary.review}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setQStatus("INACTIVE")}
              className="rounded-[22px] bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
            >
              <div className="text-[11px] font-black uppercase text-slate-600">
                Inactivos
              </div>
              <div className="mt-1 text-2xl font-black text-slate-700">
                {summary.inactive}
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setQPriority("CRITICAL");
                setQStatus("");
              }}
              className="rounded-[22px] bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
            >
              <div className="text-[11px] font-black uppercase text-slate-600">
                Críticos pendientes
              </div>
              <div className="mt-1 text-2xl font-black text-slate-900">
                {summary.criticalPending}
              </div>
            </button>
          </div>
        </div>

        <div className="p-7">
          <div className="rounded-[26px] bg-white p-5 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[12px] font-extrabold uppercase text-slate-600">
                  Filtros
                </div>

                <div className="mt-1 text-xs font-semibold text-slate-500">
                  Busca procesos y filtra por módulo, estado, prioridad o tipo de
                  cuenta esperada.
                </div>
              </div>

              {(qText || qModule || qStatus || qNature || qPriority) ? (
                <button
                  type="button"
                  onClick={() => {
                    setQText("");
                    setQModule("");
                    setQStatus("");
                    setQNature("");
                    setQPriority("");
                  }}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-700 hover:bg-slate-50"
                >
                  Limpiar filtros
                </button>
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
              <div className="lg:col-span-4">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">
                  Búsqueda
                </div>

                <div className="relative mt-1">
                  <input
                    value={qText}
                    onChange={(e) => setQText(e.target.value)}
                    placeholder="Proceso, key, cuenta o ayuda..."
                    className="w-full rounded-2xl border border-slate-200 bg-white px-11 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                  />
                  <span className="absolute left-4 top-2 text-slate-400">🔎</span>

                  {qText ? (
                    <button
                      type="button"
                      onClick={() => setQText("")}
                      className="absolute right-4 top-2 text-slate-400 hover:text-slate-600"
                      title="Limpiar"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="lg:col-span-2">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">
                  Módulo
                </div>

                <select
                  value={qModule}
                  onChange={(e) => setQModule(e.target.value as any)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">Todos</option>
                  {MODULE_ORDER.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-2">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">
                  Estado
                </div>

                <select
                  value={qStatus}
                  onChange={(e) => setQStatus(e.target.value as any)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">Todos</option>
                  <option value="OK">Configurado</option>
                  <option value="PENDING">Pendiente</option>
                  <option value="REVIEW">Revisar</option>
                  <option value="INACTIVE">Inactivo</option>
                </select>
              </div>

              <div className="lg:col-span-2">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">
                  Prioridad
                </div>

                <select
                  value={qPriority}
                  onChange={(e) => setQPriority(e.target.value as any)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">Todas</option>
                  <option value="CRITICAL">Crítico</option>
                  <option value="IMPORTANT">Importante</option>
                  <option value="OPTIONAL">Opcional</option>
                </select>
              </div>

              <div className="lg:col-span-2">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">
                  Tipo esperado
                </div>

                <select
                  value={qNature}
                  onChange={(e) => setQNature(e.target.value as any)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">Todos</option>
                  {natures.map((n) => (
                    <option key={n} value={n}>
                      {natureLabel(n)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-[24px] border border-sky-100 bg-sky-50 p-4 text-sm text-sky-900">
            <div className="font-black">Guía rápida</div>
            <div className="mt-1 leading-6">
              Ventas y compras están ordenadas según el flujo real: venta normal,
              formas de pago, notas de crédito, notas de débito y ajustes. Las
              cuentas base separan cuentas principales como clientes por cobrar y
              proveedores por pagar.
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-[26px] bg-white ring-1 ring-slate-200">
            <table className="w-full table-fixed border-collapse text-left">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[30%]" />
                <col className="w-[16%]" />
                <col className="w-[22%]" />
                <col className="w-[10%]" />
              </colgroup>

              <thead className="bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] text-white">
                <tr>
                  <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.04em]">
                    Proceso
                  </th>
                  <th className="border-l border-white/15 px-4 py-3 text-[11px] font-black uppercase tracking-[0.04em]">
                    Qué configura
                  </th>
                  <th className="border-l border-white/15 px-4 py-3 text-[11px] font-black uppercase tracking-[0.04em]">
                    Tipo esperado
                  </th>
                  <th className="border-l border-white/15 px-4 py-3 text-[11px] font-black uppercase tracking-[0.04em]">
                    Cuenta / estado
                  </th>
                  <th className="border-l border-white/15 px-3 py-3 text-right text-[11px] font-black uppercase tracking-[0.04em]">
                    Acciones
                  </th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-14 text-center text-[13px] text-slate-600"
                    >
                      Cargando configuración...
                    </td>
                  </tr>
                ) : !companyId ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-14 text-center text-[13px] text-slate-600"
                    >
                      No se detectó <b>company_id</b>. Guarda el id en localStorage como{" "}
                      <code className="rounded bg-slate-100 px-2 py-1">
                        active_company_id
                      </code>
                      .
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-14 text-center text-[13px] text-rose-600"
                    >
                      Error: {error}
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => companyId && bootstrap(companyId)}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-700 hover:bg-slate-50"
                        >
                          Reintentar
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : grouped.length ? (
                  grouped.map(({ module, groups }) => (
                    <React.Fragment key={module}>
                      <tr>
                        <td
                          colSpan={5}
                          className="border-y border-slate-200 bg-slate-100 px-4 py-3"
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={cls(
                                "inline-flex rounded-full px-3 py-1 text-[11px] font-black",
                                moduleBadgeClass(module)
                              )}
                            >
                              {module}
                            </span>

                            <span className="truncate text-[12px] font-bold text-slate-600">
                              {moduleDescription(module)}
                            </span>

                            <span className="ml-auto shrink-0 text-[11px] font-black uppercase text-slate-400">
                              {groups.reduce((sum, g) => sum + g.items.length, 0)} procesos
                            </span>
                          </div>
                        </td>
                      </tr>

                      {groups.map(({ group, items }) => (
                        <React.Fragment key={`${module}-${group}`}>
                          <tr>
                            <td
                              colSpan={5}
                              className="border-b border-slate-200 bg-slate-50 px-4 py-2"
                            >
                              <div className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-600">
                                {group}
                              </div>
                            </td>
                          </tr>

                          {items.map((p) => {
                            const d = findDefault(p.key);
                            const assigned = d?.account_node_id ?? null;
                            const account = findAccount(assigned);
                            const warning = getConfigWarning(p, account);
                            const status = procStatus(p);

                            return (
                              <tr
                                key={p.key}
                                className={cls(
                                  "border-b border-slate-100 bg-white align-top transition hover:bg-slate-50",
                                  status === "REVIEW" ? "bg-rose-50/25" : ""
                                )}
                              >
                                <td
                                  className={cls(
                                    "border-l-[5px] px-4 py-3",
                                    moduleAccentClass(p.module)
                                  )}
                                >
                                  <div className="text-[13px] font-black leading-5 text-slate-900">
                                    {p.shortName}
                                  </div>

                                  <div className="mt-1 truncate text-[10px] font-bold text-slate-400">
                                    {p.key}
                                  </div>
                                </td>

                                <td className="border-l border-slate-100 px-4 py-3">
                                  <div className="text-[12px] font-semibold leading-5 text-slate-600">
                                    {p.plainHelp}
                                  </div>

                                  {warning ? (
                                    <div className="mt-1 text-[11px] font-bold leading-4 text-rose-600">
                                      ⚠ {warning}
                                    </div>
                                  ) : p.warningHelp ? (
                                    <div className="mt-1 text-[11px] font-bold leading-4 text-amber-700">
                                      {p.warningHelp}
                                    </div>
                                  ) : p.hint ? (
                                    <div className="mt-1 text-[11px] font-medium leading-4 text-slate-400">
                                      {p.hint}
                                    </div>
                                  ) : null}
                                </td>

                                <td className="border-l border-slate-100 px-4 py-3">
                                  <div className="flex flex-wrap gap-1.5">
                                    <span
                                      className={cls(
                                        "inline-flex rounded-full px-2 py-1 text-[10px] font-black whitespace-nowrap",
                                        natureClass(p.expectedNature)
                                      )}
                                    >
                                      {natureLabel(p.expectedNature)}
                                    </span>

                                    <span
                                      className={cls(
                                        "inline-flex rounded-full px-2 py-1 text-[10px] font-black whitespace-nowrap",
                                        priorityClass(p.priority)
                                      )}
                                    >
                                      {priorityLabel(p.priority)}
                                    </span>
                                  </div>
                                </td>

                                <td className="border-l border-slate-100 px-4 py-3">
                                  <div
                                    className={cls(
                                      "truncate text-[13px] font-black",
                                      assigned ? "text-slate-900" : "text-amber-700"
                                    )}
                                    title={accountLabel(assigned)}
                                  >
                                    {assigned ? accountLabel(assigned) : "Sin cuenta"}
                                  </div>

                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <span
                                      className={cls(
                                        "inline-flex rounded-full px-2.5 py-1 text-[10px] font-black whitespace-nowrap",
                                        statusClass(status)
                                      )}
                                    >
                                      {statusLabel(status)}
                                    </span>

                                    {!assigned ? (
                                      <span className="text-[11px] font-semibold text-amber-700">
                                        No postea automático.
                                      </span>
                                    ) : null}
                                  </div>

                                  {d?.notes ? (
                                    <div className="mt-1 truncate text-[11px] font-medium text-slate-500">
                                      {d.notes}
                                    </div>
                                  ) : null}
                                </td>

                                <td className="border-l border-slate-100 px-3 py-3">
                                  <div className="flex flex-col items-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => openAssign(p)}
                                      disabled={!canEdit}
                                      className={cls(
                                        "w-[72px] rounded-xl border px-2 py-1.5 text-center text-[11px] font-extrabold whitespace-nowrap",
                                        canEdit
                                          ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                          : "cursor-not-allowed border-slate-200 bg-white text-slate-400 opacity-60"
                                      )}
                                    >
                                      {assigned ? "Editar" : "Asignar"}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => toggleActive(p)}
                                      disabled={!canEdit || !d}
                                      className={cls(
                                        "w-[72px] rounded-xl border px-2 py-1.5 text-center text-[11px] font-extrabold whitespace-nowrap",
                                        canEdit && d
                                          ? d.is_active
                                            ? "border-amber-200 bg-white text-amber-700 hover:bg-amber-50"
                                            : "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                                          : "cursor-not-allowed border-slate-200 bg-white text-slate-400 opacity-60"
                                      )}
                                    >
                                      {d ? (d.is_active ? "Off" : "On") : "On"}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-14 text-center text-[13px] text-slate-600"
                    >
                      No hay procesos para mostrar con los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-[12px] text-slate-600">
              Las alertas son preventivas. No bloquean el guardado, pero ayudan a
              evitar configuraciones contables incorrectas.
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 text-center text-[12px] text-slate-500">
        ConciliaciónPro • Configuración contable
      </div>

      <Modal
        open={openPick}
        title={pickProc ? `Asignar cuenta • ${pickProc.shortName}` : "Asignar cuenta"}
        subtitle={
          pickProc
            ? `Tipo esperado: ${natureLabel(pickProc.expectedNature)}`
            : "Asigna una cuenta por defecto"
        }
        onClose={() => setOpenPick(false)}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setOpenPick(false)}
              className="rounded-full px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              type="button"
              disabled={saving}
            >
              Cancelar
            </button>

            <button
              onClick={saveAssign}
              className="rounded-full bg-[#0b2b4f] px-5 py-2 text-sm font-semibold text-white hover:bg-[#123b63] disabled:opacity-60"
              type="button"
              disabled={saving || !canEdit}
              title={!canEdit ? "Solo OWNER/EDITOR" : "Guardar"}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        }
      >
        {!accountsTable ? (
          <div className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-100">
            No se detectó <b>account_nodes</b> como tabla de plan de cuentas.
          </div>
        ) : null}

        {pickProc ? (
          <div className="space-y-4">
            <div className="rounded-[24px] bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cls(
                    "inline-flex rounded-full px-3 py-1 text-[11px] font-black",
                    moduleBadgeClass(pickProc.module)
                  )}
                >
                  {pickProc.module}
                </span>

                <span
                  className={cls(
                    "inline-flex rounded-full px-3 py-1 text-[11px] font-black",
                    priorityClass(pickProc.priority)
                  )}
                >
                  {priorityLabel(pickProc.priority)}
                </span>

                <span
                  className={cls(
                    "inline-flex rounded-full px-3 py-1 text-[11px] font-black",
                    natureClass(pickProc.expectedNature)
                  )}
                >
                  {natureLabel(pickProc.expectedNature)}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                  <div className="text-[11px] font-black uppercase text-slate-500">
                    Qué estás configurando
                  </div>

                  <div className="mt-1 text-sm font-black text-slate-900">
                    {pickProc.shortName}
                  </div>

                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    {pickProc.key}
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                  <div className="text-[11px] font-black uppercase text-slate-500">
                    Tipo de cuenta recomendado
                  </div>

                  <div className="mt-1 text-sm font-black text-slate-900">
                    {natureLabel(pickProc.expectedNature)}
                  </div>

                  <div className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                    {natureHelp(pickProc.expectedNature)}
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                <div className="text-[11px] font-black uppercase text-slate-500">
                  Para qué sirve
                </div>

                <div className="mt-1 text-sm font-semibold leading-6 text-slate-700">
                  {pickProc.plainHelp}
                </div>

                {pickProc.hint ? (
                  <div className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                    {pickProc.hint}
                  </div>
                ) : null}

                {pickProc.warningHelp ? (
                  <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-800 ring-1 ring-amber-100">
                    {pickProc.warningHelp}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <div className="sm:col-span-12">
                <div className="text-xs font-black uppercase text-slate-600">
                  Cuenta contable
                </div>

                <select
                  value={pickAccountNodeId ?? ""}
                  onChange={(e) =>
                    setPickAccountNodeId(e.target.value ? e.target.value : null)
                  }
                  disabled={!canEdit}
                  className={cls(
                    "mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200",
                    !canEdit ? "cursor-not-allowed opacity-60" : ""
                  )}
                >
                  <option value="">— Sin asignar —</option>

                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {`${a.code ?? ""}${a.code ? " • " : ""}${a.name ?? a.id}`}
                    </option>
                  ))}
                </select>

                <div className="mt-1 text-xs font-semibold text-slate-500">
                  El sistema usará esta cuenta al generar asientos automáticos para
                  este proceso.
                </div>
              </div>

              {pickWarning ? (
                <div className="sm:col-span-12">
                  <div className="rounded-2xl bg-rose-50 p-3 text-sm font-semibold leading-6 text-rose-700 ring-1 ring-rose-100">
                    {pickWarning}
                  </div>
                </div>
              ) : pickAccountNodeId ? (
                <div className="sm:col-span-12">
                  <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-semibold leading-6 text-emerald-700 ring-1 ring-emerald-100">
                    La cuenta seleccionada no presenta alertas básicas para este proceso.
                  </div>
                </div>
              ) : null}

              <div className="sm:col-span-12">
                <div className="text-xs font-black uppercase text-slate-600">
                  Notas internas opcionales
                </div>

                <input
                  value={pickNotes}
                  onChange={(e) => setPickNotes(e.target.value)}
                  placeholder="Ej: banco principal, IVA débito general, cuenta puente WebPay, etc."
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <b>Resumen:</b> {pickProc.key} • Cuenta seleccionada:{" "}
              <b>{accountLabel(pickAccountNodeId)}</b>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}