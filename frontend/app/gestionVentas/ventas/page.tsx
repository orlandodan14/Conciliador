// ============================================================================
// FILE: app/gestionBancaria/conciliacion/page.tsx
// ============================================================================

"use client"; // ✅ Next.js: esta página usa estado, memo y eventos (client-side)

import React, { useCallback, useMemo, useState } from "react"; // ✅ hooks principales

// ✅ Tipos del dominio (movimientos, bancos, estados de conciliación)
import type { Movimiento, BankKey } from "@/app/lib/types";

// ✅ Constantes (bancos, listas, etc.)
import { banks } from "@/app/lib/constants";

// ✅ Utilidades (filtrado numérico, texto, rangos de fecha, etc.)
import { inDateRange, inRange, safeIncludes, toNumberOrUndef } from "@/app/lib/utils";

// ✅ Formateo CLP
import { formatCLP } from "@/app/lib/format";

// ✅ UI components
import ActionBtn from "@/app/components/ui/ActionBtn";
import TinyStat from "@/app/gestionBancaria/conciliacion/components/TinyStat";
import ConciliacionTable, {
  type Filters,
} from "@/app/gestionBancaria/conciliacion/components/ConciliacionTable";

// =========================
// CONSTANTES / DEFAULTS
// =========================

// ✅ filtros por defecto (estado único de filtros)
const DEFAULT_FILTERS: Filters = {
  fechaFrom: "",
  fechaTo: "",
  banco: "ALL",
  tipo: "ALL",
  rut: "",
  nombre: "",
  referencia: "",
  descripcion: "",
  debMin: "",
  debMax: "",
  credMin: "",
  credMax: "",
  netoMin: "",
  netoMax: "",
  mensaje: "ALL",
  conciliacion: "ALL",
  contabilizado: "ALL",
};

// ✅ MOCK corregido con reglas básicas de conciliación (según tus reglas):
// 1) Ventas e Ingresos concilian con DÉBITOS (entrada de dinero)
//    -> Movimiento: debito > 0, credito = 0, neto = +debito
//    -> Documentos (Factura de venta / Ingreso): debito > 0, credito = 0, neto = +debito
//
// 2) Compras y Egresos concilian con CRÉDITOS (salida de dinero)
//    -> Movimiento: credito > 0, debito = 0, neto = -credito
//    -> Documentos (Factura de compra / Gasto): credito > 0, debito = 0, neto = -credito
//
// 3) Nunca se puede superar el monto del movimiento bancario:
//    -> Suma de documentos asociados SIEMPRE <= monto del movimiento (del lado correspondiente).
//    -> Si la factura real era mayor, aquí representamos SOLO el “monto aplicado” (pago parcial).

const MOCK_MOVIMIENTOS: Movimiento[] = [
  // 1) ✅ DÉBITO (entrada) CONCILIADO: 2 facturas de venta = movimiento (total)
  {
    id: "m1",
    fecha: "2024-04-01",
    banco: "BBVA",
    tipo: "Transferencia",
    rut: "12.345.678-9",
    nombre: "Inversiones ABC SpA",
    referencia: "TRF-12545",
    descripcion: "Transferencia recibida por servicios abril",
    comentario: "Pago completo (2 facturas)",
    debito: 5000000,
    credito: 0,
    neto: 5000000,
    tieneMensaje: true,
    conciliacion: "CONCILIADO",
    contabilizado: true,
    facturas: [
      {
        id: "d1",
        fecha: "2024-03-31",
        tipo: "Factura de venta",
        rut: "12.345.678-9",
        nombre: "Inversiones ABC SpA",
        referencia: "FV-12545",
        debito: 3000000,
        credito: 0,
        neto: 3000000,
      },
      {
        id: "d2",
        fecha: "2024-03-31",
        tipo: "Factura de venta",
        rut: "12.345.678-9",
        nombre: "Inversiones ABC SpA",
        referencia: "FV-12546",
        debito: 2000000,
        credito: 0,
        neto: 2000000,
      },
    ],
  },

  // 2) ✅ CRÉDITO (salida) NO CONCILIADO: egreso sin documentos
  {
    id: "m2",
    fecha: "2024-04-02",
    banco: "CHILE",
    tipo: "Pago",
    rut: "98.765.432-1",
    nombre: "Servicios XYZ Ltda",
    referencia: "PAGO-1234",
    descripcion: "Pago proveedor - mantenimiento",
    comentario: "Falta documento de respaldo",
    debito: 0,
    credito: 8000000,
    neto: -8000000,
    tieneMensaje: false,
    conciliacion: "NO_CONCILIADO",
    contabilizado: false,
    facturas: [],
  },

  // 3) ✅ DÉBITO PARCIAL: NO se aplicó todo el movimiento (queda pendiente en banco)
  {
    id: "m3",
    fecha: "2024-04-03",
    banco: "ITAU",
    tipo: "Abono",
    rut: "76.543.210-0",
    nombre: "Cliente Pérez",
    referencia: "ABN-7654",
    descripcion: "Abono por cuotas comunidad",
    comentario: "Aplicado parcial: queda pendiente por conciliar en banco",
    debito: 6500000,
    credito: 0,
    neto: 6500000,
    tieneMensaje: true,
    conciliacion: "PARCIAL",
    contabilizado: false,
    facturas: [
      {
        id: "ing-1-aplicado",
        fecha: "2024-04-01",
        tipo: "Ingreso",
        rut: "76.543.210-0",
        nombre: "Cliente Pérez",
        referencia: "REC-12345",
        debito: 6000000, // ✅ aplicado < movimiento => pendiente 500.000
        credito: 0,
        neto: 6000000,
      },
    ],
  },

  // 4) ✅ CRÉDITO CONCILIADO: comisión bancaria (gasto) = movimiento
  {
    id: "m4",
    fecha: "2024-04-05",
    banco: "BCI",
    tipo: "Cargo",
    rut: "65.432.109-8",
    nombre: "Banco BCI",
    referencia: "COM-0987",
    descripcion: "Comisión mantención cuenta",
    comentario: "Comisión bancaria",
    debito: 0,
    credito: 45000,
    neto: -45000,
    tieneMensaje: false,
    conciliacion: "CONCILIADO",
    contabilizado: true,
    facturas: [
      {
        id: "g-1",
        fecha: "2024-04-05",
        tipo: "Gasto",
        rut: "65.432.109-8",
        nombre: "Banco BCI",
        referencia: "G-23245",
        debito: 0,
        credito: 45000,
        neto: -45000,
      },
    ],
  },

  // 5) ✅ DÉBITO CONCILIADO: 1 factura de venta = movimiento
  {
    id: "m5",
    fecha: "2024-04-06",
    banco: "SANTANDER",
    tipo: "Abono",
    rut: "77.111.222-3",
    nombre: "Comercial La Vega Ltda",
    referencia: "ABN-22014",
    descripcion: "Pago factura abril",
    comentario: "Pago completo 1 FV",
    debito: 2150000,
    credito: 0,
    neto: 2150000,
    tieneMensaje: false,
    conciliacion: "CONCILIADO",
    contabilizado: true,
    facturas: [
      {
        id: "fv-1",
        fecha: "2024-04-02",
        tipo: "Factura de venta",
        rut: "77.111.222-3",
        nombre: "Comercial La Vega Ltda",
        referencia: "FV-22014",
        debito: 2150000,
        credito: 0,
        neto: 2150000,
      },
    ],
  },

  // 6) ✅ CRÉDITO CONCILIADO: 2 facturas de compra (split) = movimiento
  {
    id: "m6",
    fecha: "2024-04-08",
    banco: "BBVA",
    tipo: "Pago",
    rut: "96.222.333-4",
    nombre: "Proveedora Técnica Sur SpA",
    referencia: "TRF-88412",
    descripcion: "Pago proveedor (2 FC)",
    comentario: "Pago consolidado 2 FC",
    debito: 0,
    credito: 3200000,
    neto: -3200000,
    tieneMensaje: true,
    conciliacion: "CONCILIADO",
    contabilizado: true,
    facturas: [
      {
        id: "fc-1",
        fecha: "2024-04-05",
        tipo: "Factura de compra",
        rut: "96.222.333-4",
        nombre: "Proveedora Técnica Sur SpA",
        referencia: "FC-88410",
        debito: 0,
        credito: 1800000,
        neto: -1800000,
      },
      {
        id: "fc-2",
        fecha: "2024-04-06",
        tipo: "Factura de compra",
        rut: "96.222.333-4",
        nombre: "Proveedora Técnica Sur SpA",
        referencia: "FC-88411",
        debito: 0,
        credito: 1400000,
        neto: -1400000,
      },
    ],
  },

  // 7) ✅ CRÉDITO PARCIAL: NO se aplicó todo el movimiento (queda pendiente en banco)
  {
    id: "m7",
    fecha: "2024-04-09",
    banco: "CHILE",
    tipo: "Pago",
    rut: "89.333.444-5",
    nombre: "Aseo Total SpA",
    referencia: "PAG-00122",
    descripcion: "Pago parcial contrato aseo",
    comentario: "Aplicado parcial: queda pendiente por conciliar en banco",
    debito: 0,
    credito: 900000,
    neto: -900000,
    tieneMensaje: false,
    conciliacion: "PARCIAL",
    contabilizado: false,
    facturas: [
      {
        id: "fc-3-aplicado",
        fecha: "2024-04-07",
        tipo: "Factura de compra",
        rut: "89.333.444-5",
        nombre: "Aseo Total SpA",
        referencia: "FC-55120",
        debito: 0,
        credito: 700000, // ✅ aplicado < movimiento => pendiente 200.000
        neto: -700000,
      },
    ],
  },

  // 8) ✅ DÉBITO NO CONCILIADO: depósito/abono sin doc
  {
    id: "m8",
    fecha: "2024-04-10",
    banco: "BCI",
    tipo: "Depósito",
    rut: "11.111.111-1",
    nombre: "Depósito en efectivo",
    referencia: "DEP-0001",
    descripcion: "Depósito efectivo caja",
    comentario: "Revisar origen / doc",
    debito: 300000,
    credito: 0,
    neto: 300000,
    tieneMensaje: true,
    conciliacion: "NO_CONCILIADO",
    contabilizado: false,
    facturas: [],
  },

  // 9) ✅ DÉBITO CONCILIADO: 3 ingresos (lote) suman exacto
  {
    id: "m9",
    fecha: "2024-04-11",
    banco: "ITAU",
    tipo: "Abono",
    rut: "70.123.456-7",
    nombre: "Comunidad Torre Catedral",
    referencia: "ABN-CC-0411",
    descripcion: "Abonos cuotas comunidad (lote)",
    comentario: "Lote 3 ingresos",
    debito: 1870000,
    credito: 0,
    neto: 1870000,
    tieneMensaje: false,
    conciliacion: "CONCILIADO",
    contabilizado: true,
    facturas: [
      { id: "rec-1", fecha: "2024-04-11", tipo: "Ingreso", rut: "70.123.456-7", nombre: "Comunidad Torre Catedral", referencia: "REC-9001", debito: 620000, credito: 0, neto: 620000 },
      { id: "rec-2", fecha: "2024-04-11", tipo: "Ingreso", rut: "70.123.456-7", nombre: "Comunidad Torre Catedral", referencia: "REC-9002", debito: 750000, credito: 0, neto: 750000 },
      { id: "rec-3", fecha: "2024-04-11", tipo: "Ingreso", rut: "70.123.456-7", nombre: "Comunidad Torre Catedral", referencia: "REC-9003", debito: 500000, credito: 0, neto: 500000 },
    ],
  },

  // 10) ✅ CRÉDITO CONCILIADO: honorarios como Gasto
  {
    id: "m10",
    fecha: "2024-04-12",
    banco: "SANTANDER",
    tipo: "Transferencia",
    rut: "15.555.666-7",
    nombre: "Juan Rodríguez",
    referencia: "TRF-HONO-889",
    descripcion: "Pago honorarios abril",
    comentario: "Gasto honorarios",
    debito: 0,
    credito: 650000,
    neto: -650000,
    tieneMensaje: false,
    conciliacion: "CONCILIADO",
    contabilizado: true,
    facturas: [
      { id: "g-hono-1", fecha: "2024-04-10", tipo: "Gasto", rut: "15.555.666-7", nombre: "Juan Rodríguez", referencia: "HON-889", debito: 0, credito: 650000, neto: -650000 },
    ],
  },

  // 11) ✅ DÉBITO PARCIAL: NO se aplicó todo el movimiento (queda pendiente en banco)
  {
    id: "m11",
    fecha: "2024-04-13",
    banco: "BBVA",
    tipo: "Abono",
    rut: "99.888.777-6",
    nombre: "Cliente Omega SpA",
    referencia: "ABN-OMEGA-01",
    descripcion: "Pago parcial de 2 FV",
    comentario: "Aplicado parcial: queda pendiente por conciliar en banco",
    debito: 4100000,
    credito: 0,
    neto: 4100000,
    tieneMensaje: true,
    conciliacion: "PARCIAL",
    contabilizado: false,
    facturas: [
      { id: "fv-omega-1", fecha: "2024-04-01", tipo: "Factura de venta", rut: "99.888.777-6", nombre: "Cliente Omega SpA", referencia: "FV-77801", debito: 2500000, credito: 0, neto: 2500000 },
      { id: "fv-omega-2-aplicado", fecha: "2024-04-02", tipo: "Factura de venta", rut: "99.888.777-6", nombre: "Cliente Omega SpA", referencia: "FV-77802", debito: 1200000, credito: 0, neto: 1200000 }, // ✅ aplicado < movimiento
      // total aplicado = 3.700.000 => pendiente = 400.000
    ],
  },

  // 12) ✅ CRÉDITO CONCILIADO: 1 factura de compra (total)
  {
    id: "m12",
    fecha: "2024-04-14",
    banco: "ITAU",
    tipo: "Pago",
    rut: "76.000.111-2",
    nombre: "Seguridad 24/7 Ltda",
    referencia: "PAG-SEG-741",
    descripcion: "Pago servicio seguridad",
    comentario: "FC completa",
    debito: 0,
    credito: 2800000,
    neto: -2800000,
    tieneMensaje: false,
    conciliacion: "CONCILIADO",
    contabilizado: true,
    facturas: [
      { id: "fc-4", fecha: "2024-04-05", tipo: "Factura de compra", rut: "76.000.111-2", nombre: "Seguridad 24/7 Ltda", referencia: "FC-741", debito: 0, credito: 2800000, neto: -2800000 },
    ],
  },

  // 13) ✅ CRÉDITO NO CONCILIADO: traspaso/transferencia interna sin documentos
  {
    id: "m13",
    fecha: "2024-04-15",
    banco: "CHILE",
    tipo: "Transferencia",
    rut: "00.000.000-0",
    nombre: "Traspaso entre cuentas",
    referencia: "TRASP-CH-ITA-01",
    descripcion: "Traspaso a cuenta ITAU",
    comentario: "Movimiento interno (sin doc)",
    debito: 0,
    credito: 1200000,
    neto: -1200000,
    tieneMensaje: false,
    conciliacion: "NO_CONCILIADO",
    contabilizado: false,
    facturas: [],
  },

  // 14) ✅ DÉBITO CONCILIADO: ingreso tipo “recaudación” (Webpay)
  {
    id: "m14",
    fecha: "2024-04-16",
    banco: "BCI",
    tipo: "Abono",
    rut: "60.555.444-3",
    nombre: "Webpay Transbank",
    referencia: "WP-884421",
    descripcion: "Abono Webpay - lote diario",
    comentario: "Ingreso recaudación",
    debito: 934500,
    credito: 0,
    neto: 934500,
    tieneMensaje: false,
    conciliacion: "CONCILIADO",
    contabilizado: true,
    facturas: [
      { id: "ing-wp-1", fecha: "2024-04-16", tipo: "Ingreso", rut: "60.555.444-3", nombre: "Webpay Transbank", referencia: "WP-884421", debito: 934500, credito: 0, neto: 934500 },
    ],
  },

  // 15) ✅ CRÉDITO CONCILIADO: gasto comisión Webpay
  {
    id: "m15",
    fecha: "2024-04-16",
    banco: "BCI",
    tipo: "Cargo",
    rut: "60.555.444-3",
    nombre: "Transbank",
    referencia: "WP-COM-884421",
    descripcion: "Comisión Webpay del día",
    comentario: "Gasto fee",
    debito: 0,
    credito: 28500,
    neto: -28500,
    tieneMensaje: false,
    conciliacion: "CONCILIADO",
    contabilizado: true,
    facturas: [
      { id: "g-wp-1", fecha: "2024-04-16", tipo: "Gasto", rut: "60.555.444-3", nombre: "Transbank", referencia: "G-WP-884421", debito: 0, credito: 28500, neto: -28500 },
    ],
  },

  // 16) ✅ CRÉDITO PARCIAL: NO se aplicó todo el movimiento (queda pendiente en banco)
  {
    id: "m16",
    fecha: "2024-04-17",
    banco: "SANTANDER",
    tipo: "Pago",
    rut: "77.333.222-1",
    nombre: "Electricidad Central SpA",
    referencia: "TRF-EL-771",
    descripcion: "Pago parcial de 3 FC (electricidad)",
    comentario: "Aplicado parcial: queda pendiente por conciliar en banco",
    debito: 0,
    credito: 4200000,
    neto: -4200000,
    tieneMensaje: true,
    conciliacion: "PARCIAL",
    contabilizado: false,
    facturas: [
      { id: "fc-el-1-aplicado", fecha: "2024-04-01", tipo: "Factura de compra", rut: "77.333.222-1", nombre: "Electricidad Central SpA", referencia: "FC-EL-1201", debito: 0, credito: 1800000, neto: -1800000 },
      { id: "fc-el-2-aplicado", fecha: "2024-04-03", tipo: "Factura de compra", rut: "77.333.222-1", nombre: "Electricidad Central SpA", referencia: "FC-EL-1202", debito: 0, credito: 1900000, neto: -1900000 },
      { id: "fc-el-3-aplicado", fecha: "2024-04-05", tipo: "Factura de compra", rut: "77.333.222-1", nombre: "Electricidad Central SpA", referencia: "FC-EL-1203", debito: 0, credito: 300000, neto: -300000 }, // ✅ total aplicado = 4.000.000 => pendiente = 200.000
    ],
  },

  // 17) ✅ DÉBITO CONCILIADO: 1 FV + 1 ingreso ajuste (suma exacta)
  {
    id: "m17",
    fecha: "2024-04-18",
    banco: "ITAU",
    tipo: "Abono",
    rut: "88.101.202-3",
    nombre: "Empresa Beta SpA",
    referencia: "ABN-BETA-118",
    descripcion: "Pago mixto (FV + ajuste)",
    comentario: "Conciliación total",
    debito: 3050000,
    credito: 0,
    neto: 3050000,
    tieneMensaje: false,
    conciliacion: "CONCILIADO",
    contabilizado: true,
    facturas: [
      { id: "fv-beta-1", fecha: "2024-04-10", tipo: "Factura de venta", rut: "88.101.202-3", nombre: "Empresa Beta SpA", referencia: "FV-BETA-118", debito: 3000000, credito: 0, neto: 3000000 },
      { id: "ing-aj-1", fecha: "2024-04-18", tipo: "Ingreso", rut: "88.101.202-3", nombre: "Empresa Beta SpA", referencia: "AJ-50K", debito: 50000, credito: 0, neto: 50000 },
    ],
  },

  // 18) ✅ CRÉDITO CONCILIADO: gasto arriendo (total)
  {
    id: "m18",
    fecha: "2024-04-19",
    banco: "BBVA",
    tipo: "Pago",
    rut: "66.777.888-9",
    nombre: "Inmobiliaria Las Condes",
    referencia: "ARR-042024",
    descripcion: "Pago arriendo oficina",
    comentario: "Gasto arriendo",
    debito: 0,
    credito: 1850000,
    neto: -1850000,
    tieneMensaje: false,
    conciliacion: "CONCILIADO",
    contabilizado: true,
    facturas: [
      { id: "g-arr-1", fecha: "2024-04-01", tipo: "Gasto", rut: "66.777.888-9", nombre: "Inmobiliaria Las Condes", referencia: "ARR-042024", debito: 0, credito: 1850000, neto: -1850000 },
    ],
  },

  // 19) ✅ DÉBITO NO CONCILIADO: abono sin match
  {
    id: "m19",
    fecha: "2024-04-20",
    banco: "CHILE",
    tipo: "Transferencia",
    rut: "55.666.777-8",
    nombre: "Cliente sin referencia",
    referencia: "TRF-0000",
    descripcion: "Transferencia recibida",
    comentario: "Falta documento asociado",
    debito: 990000,
    credito: 0,
    neto: 990000,
    tieneMensaje: true,
    conciliacion: "NO_CONCILIADO",
    contabilizado: false,
    facturas: [],
  },

  // 20) ✅ CRÉDITO CONCILIADO: factura compra + gasto (multa) suma exacta
  {
    id: "m20",
    fecha: "2024-04-21",
    banco: "BCI",
    tipo: "Pago",
    rut: "61.222.333-0",
    nombre: "Municipalidad de Santiago",
    referencia: "MUN-77821",
    descripcion: "Pago patente + multa",
    comentario: "FC + gasto multa",
    debito: 0,
    credito: 420000,
    neto: -420000,
    tieneMensaje: false,
    conciliacion: "CONCILIADO",
    contabilizado: true,
    facturas: [
      { id: "fc-mun-1", fecha: "2024-04-20", tipo: "Factura de compra", rut: "61.222.333-0", nombre: "Municipalidad de Santiago", referencia: "FC-MUN-77821", debito: 0, credito: 350000, neto: -350000 },
      { id: "g-multa-1", fecha: "2024-04-21", tipo: "Gasto", rut: "61.222.333-0", nombre: "Municipalidad de Santiago", referencia: "MULTA-70K", debito: 0, credito: 70000, neto: -70000 },
    ],
  },
];


// =========================
// HELPERS (puros y testeables)
// =========================

// ✅ arma un map para lookup O(1) de bancos por key (sin re-calcular por render)
function buildBankMap() {
  const map: Record<BankKey, { key: BankKey; name: string; logo: string }> = {} as any;
  for (const b of banks) map[b.key] = b;
  return map;
}

// ✅ parsea todos los rangos numéricos una vez (evita repetir toNumberOrUndef)
function parseNumericRanges(f: Filters) {
  return {
    debMin: toNumberOrUndef(f.debMin),
    debMax: toNumberOrUndef(f.debMax),
    credMin: toNumberOrUndef(f.credMin),
    credMax: toNumberOrUndef(f.credMax),
    netoMin: toNumberOrUndef(f.netoMin),
    netoMax: toNumberOrUndef(f.netoMax),
  };
}

// ✅ aplica filtros a un movimiento (función pura)
function matchesFilters(m: Movimiento, f: Filters, ranges: ReturnType<typeof parseNumericRanges>) {
  // ✅ fecha
  if (!inDateRange(m.fecha, f.fechaFrom || undefined, f.fechaTo || undefined)) return false;

  // ✅ selects
  if (f.banco !== "ALL" && m.banco !== f.banco) return false;
  if (f.tipo !== "ALL" && m.tipo !== f.tipo) return false;

  // ✅ texto (case-insensitive / safe)
  if (f.rut.trim() && !safeIncludes(m.rut, f.rut)) return false;
  if (f.nombre.trim() && !safeIncludes(m.nombre, f.nombre)) return false;
  if (f.referencia.trim() && !safeIncludes(m.referencia, f.referencia)) return false;
  if (f.descripcion.trim() && !safeIncludes(m.descripcion, f.descripcion)) return false;

  // ✅ rangos numéricos
  if (!inRange(m.debito, ranges.debMin, ranges.debMax)) return false;
  if (!inRange(m.credito, ranges.credMin, ranges.credMax)) return false;
  if (!inRange(m.neto, ranges.netoMin, ranges.netoMax)) return false;

  // ✅ tiene mensaje
  if (f.mensaje !== "ALL") {
    if (f.mensaje === "SI" && !m.tieneMensaje) return false;
    if (f.mensaje === "NO" && m.tieneMensaje) return false;
  }

  // ✅ conciliación
  if (f.conciliacion !== "ALL" && m.conciliacion !== f.conciliacion) return false;

  // ✅ contabilizado
  if (f.contabilizado !== "ALL") {
    if (f.contabilizado === "SI" && !m.contabilizado) return false;
    if (f.contabilizado === "NO" && m.contabilizado) return false;
  }

  return true; // ✅ si pasa todo, aplica
}

// =========================
// COMPONENTE PRINCIPAL
// =========================

export default function ConciliacionPage() {
  // =========================
  // DATA (mock)
  // =========================

  // ✅ data como state (aunque no cambia) para que siga tu patrón actual
  const [data] = useState<Movimiento[]>(() => MOCK_MOVIMIENTOS);

  // =========================
  // SELECT (checkbox)
  // =========================

  // ✅ set de seleccionados (ids)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  // ✅ toggle de un id (memoizado)
  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev); // ✅ clon para inmutabilidad
      next.has(id) ? next.delete(id) : next.add(id); // ✅ toggle
      return next; // ✅ React ve un nuevo Set => re-render
    });
  }, []);

  // =========================
  // FILTERS
  // =========================

  // ✅ cuál popover está abierto (solo uno a la vez)
  const [filtersOpen, setFiltersOpen] = useState<string | null>(null);

  // ✅ estado único de filtros
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  // ✅ setter tipado para actualizar un campo específico del filtro
  const setFilter = useCallback(
    <K extends keyof Filters>(key: K, value: Filters[K]) => {
      setFilters((p) => ({ ...p, [key]: value })); // ✅ update inmutable
    },
    []
  );

  // ✅ limpiar todo
  const clearAllFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS); // ✅ vuelve a defaults
  }, []);

  // =========================
  // BANK MAP (lookup rápido)
  // =========================

  // ✅ map de bancos (se construye una vez)
  const bankMap = useMemo(() => buildBankMap(), []);

  // =========================
  // FILTERED + STATS (1 pass)
  // =========================

  const { filtered, stats } = useMemo(() => {
    // ✅ parseamos rangos una vez por cálculo
    const ranges = parseNumericRanges(filters);

    // ✅ salida filtrada
    const out: Movimiento[] = [];

    // ✅ stats acumuladas
    let sumDebe = 0;
    let sumHaber = 0;

    // ✅ 1 sola pasada por data
    for (const m of data) {
      if (!matchesFilters(m, filters, ranges)) continue; // ✅ filtra por función pura

      out.push(m); // ✅ agrega al resultado
      sumDebe += m.debito || 0; // ✅ acumula débitos
      sumHaber += m.credito || 0; // ✅ acumula créditos
    }

    return {
      filtered: out,
      stats: { total: out.length, sumDebe, sumHaber },
    };
  }, [data, filters]);

  // =========================
  // EXPAND (fila detalle)
  // =========================

  // ✅ id de fila expandida (solo una a la vez)
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ✅ toggle expand/collapse (memoizado)
  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // =========================
  // SELECT ALL (solo sobre filtrados)
  // =========================

  // ✅ ids visibles (filtrados)
  const allFilteredIds = useMemo(() => filtered.map((m) => m.id), [filtered]);

  // ✅ true si todos los visibles están seleccionados
  const isAllSelected = useMemo(() => {
    return allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedIds.has(id));
  }, [allFilteredIds, selectedIds]);

  // ✅ toggle select all (memoizado)
  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev); // ✅ clon

      if (isAllSelected) {
        // ✅ si ya están todos, los deselecciona
        for (const id of allFilteredIds) next.delete(id);
      } else {
        // ✅ si falta alguno, selecciona todos
        for (const id of allFilteredIds) next.add(id);
      }

      return next; // ✅ nuevo Set
    });
  }, [allFilteredIds, isAllSelected]);

  // =========================
  // ACTIONS (mock)
  // =========================

  // ✅ contador de seleccionados (derivado)
  const selectedCount = selectedIds.size;

  // ✅ handlers mock (memoizados para no re-renderizar hijos por props nuevas)
  const doMatchAuto = useCallback(() => alert("Match automático (mock)."), []);
  const doDescargar = useCallback(() => alert("Descargar (mock)."), []);
  const doContabilizar = useCallback(
    () => alert(`Contabilizar ${selectedCount} seleccionados (mock).`),
    [selectedCount]
  );
  const doEliminarMatch = useCallback(
    () => alert(`Eliminar match ${selectedCount} seleccionados (mock).`),
    [selectedCount]
  );
  const doConciliarManual = useCallback(
    (movId: string) => alert(`Buscar documento para conciliar movimiento ${movId} (mock).`),
    []
  );

  // =========================
  // UI
  // =========================

  return (
    <div className="min-h-screen bg-slate-100">
      {/* ✅ wrapper con padding */}
      <div className="w-full px-2 py-4 space-y-3">
        {/* =========================
            HEADER (título + stats + acciones)
           ========================= */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          {/* ✅ título + stats */}
          <div className="min-w-[240px]">
            <h1 className="text-[24px] font-semibold text-[#2b3340]">
              Conciliación Bancaria
            </h1>

            {/* ✅ stats rápidas */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <TinyStat tone="blue" label="Movimientos" value={`${stats.total}`} />
              <TinyStat tone="amber" label="Débitos" value={formatCLP(stats.sumDebe)} />
              <TinyStat tone="emerald" label="Créditos" value={formatCLP(stats.sumHaber)} />
            </div>
          </div>

          {/* ✅ acciones */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ActionBtn onClick={doDescargar} icon="⬇️" label="Descargar" />
            <ActionBtn onClick={doMatchAuto} icon="🤖" label="Match Auto" />
            <ActionBtn
              onClick={doContabilizar}
              icon="🧾"
              label="Contabilizar"
              disabled={selectedCount === 0}
              title={selectedCount === 0 ? "Selecciona movimientos" : ""}
              primary
            />
            <ActionBtn
              onClick={doEliminarMatch}
              icon="🧹"
              label="Eliminar Match"
              disabled={selectedCount === 0}
              title={selectedCount === 0 ? "Selecciona movimientos" : ""}
            />
            <ActionBtn onClick={clearAllFilters} icon="🧽" label="Limpiar" />
          </div>
        </div>

        {/* =========================
            TABLE
           ========================= */}
        <ConciliacionTable
          filtered={filtered} // ✅ rows visibles
          banks={banks} // ✅ lista de bancos
          bankMap={bankMap} // ✅ lookup O(1)
          filters={filters} // ✅ estado de filtros
          setFilter={setFilter} // ✅ updater tipado
          filtersOpen={filtersOpen} // ✅ id popover abierto
          setFiltersOpen={setFiltersOpen} // ✅ setter popover
          selectedIds={selectedIds} // ✅ seleccionados
          toggleSelected={toggleSelected} // ✅ toggle fila
          isAllSelected={isAllSelected} // ✅ select-all state
          toggleSelectAll={toggleSelectAll} // ✅ select-all action
          expandedId={expandedId} // ✅ fila expandida
          toggleExpand={toggleExpand} // ✅ toggle expand
          doConciliarManual={doConciliarManual} // ✅ acción manual
        />

        {/* =========================
            FOOTER (resumen)
           ========================= */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-b-2xl bg-white px-3 py-2 border-t -mt-[1px]">
          <div className="text-[11px] text-slate-500">
            Seleccionados:{" "}
            <span className="font-semibold text-slate-900">{selectedCount}</span>
          </div>

          <div className="text-[11px] text-slate-500">
            Mostrando{" "}
            <span className="font-semibold text-slate-900">{filtered.length}</span>{" "}
            movimientos
          </div>
        </div>
      </div>
    </div>
  );
}

