// ============================================================================
// FILE: app/lib/constants.ts
// ----------------------------------------------------------------------------
// Aquí defines listas y estilos reutilizables (constantes) para la app.
// - banks: catálogo de bancos (para selects, badges, logos, etc.)
// - tiposMovimiento: catálogo de tipos de movimiento bancario (filtros/tabla)
// - ventas: catálogos para Gestión de Ventas (ubicaciones, tipos, estados)
// - mini: clases Tailwind mini (inputs/selects compactos)
// ============================================================================

import type { BankKey } from "./types";

// ----------------------------------------------------------------------------
// BANCOS
// ----------------------------------------------------------------------------
// - key: identificador interno (type-safe con BankKey)
// - name: nombre visible en UI
// - logo: emoji/ícono simple para el mock (luego puede ser url o componente)
export const banks: { key: BankKey; name: string; logo: string }[] = [
  { key: "BBVA", name: "Banco BBVA", logo: "🟦" },
  { key: "BCI", name: "BCI", logo: "🟥" },
  { key: "SANTANDER", name: "Santander", logo: "🟥" },
  { key: "CHILE", name: "Banco de Chile", logo: "🔵" },
  { key: "ITAU", name: "Itaú", logo: "🟠" },
];

// ----------------------------------------------------------------------------
// TIPOS DE MOVIMIENTO (BANCARIO)
// ----------------------------------------------------------------------------
// Lista “cerrada” (as const) => Typescript puede inferir el union type
// ("Abono" | "Cargo" | "Transferencia" | ...)
// Útil para filtros y selects de conciliación.
export const tiposMovimiento = [
  "Abono",
  "Cargo",
  "Transferencia",
  "Pago",
  "Factura",
  "Retiros",
  "Cargos misceláneas",
] as const;

// ----------------------------------------------------------------------------
// VENTAS (CATÁLOGOS PARA FILTROS / SELECTS)
// ----------------------------------------------------------------------------
// Esto es lo que te estaba faltando en tu SalesTable: arrays como ubicaciones y tipos.
// Así evitas “undefined.map(...)”.
// Puedes ajustar los valores a tu negocio (Edificio/Comunidad/Sucursal/etc).

// Ubicaciones típicas (para filtro "Ubicación")
export const ventasUbicaciones = [
  "Casa Matriz",
  "Las Condes",
  "Providencia",
  "Santiago Centro",
  "Vitacura",
] as const;

// Tipos de documento/venta (debe calzar con lo que uses en Venta.tipo)
// En tu mock usas: "Factura" | "Pago" | "Nota"
export const ventasTipos = ["Factura", "Pago", "Nota"] as const;

// Estados típicos (debe calzar con lo que uses en Venta.estado)
export const ventasEstados = ["PENDIENTE", "PARCIAL", "PAGADA", "ANULADA"] as const;

// ----------------------------------------------------------------------------
// MINI UI (CLASES REUTILIZABLES PARA INPUTS/SELECTS CHICOS)
// ----------------------------------------------------------------------------
// Estas clases se usan mucho en filtros/poppers para mantener tamaño compacto
// y look consistente.
export const mini = {
  // label: estilo de etiqueta sobre inputs
  label: "text-[10px] font-semibold text-slate-500",

  // input: estilo base para input chico
  input:
    "h-7 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] outline-none " +
    "focus:border-[#123b63]/40 focus:ring-2 focus:ring-[#123b63]/10",

  // select: estilo base para select chico
  select:
    "h-7 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] outline-none " +
    "focus:border-[#123b63]/40 focus:ring-2 focus:ring-[#123b63]/10",

  // grid2: grilla 2 columnas (muy usada en rangos min/max)
  grid2: "grid grid-cols-2 gap-2",
};

