// src/app/lib/types.ts

export type MatchStatus = "CONCILIADO" | "PARCIAL" | "NO_CONCILIADO";

export type BankKey = "BBVA" | "BCI" | "SANTANDER" | "CHILE" | "ITAU";
export type BankInfo = { key: BankKey; name: string; logo: string };

export type DocTipo = "Factura de venta" | "Factura de compra" | "Ingreso" | "Gasto";

export type DocumentoConciliado = {
  id: string;
  fecha: string; // YYYY-MM-DD
  tipo: DocTipo;
  rut: string;
  nombre: string;
  referencia: string; // referencia/match si aplica
  debito: number; // si es FV/Ingreso
  credito: number; // si es FC/Gasto
  neto: number; // debito - credito
};

export type Movimiento = {
  id: string;
  fecha: string; // YYYY-MM-DD
  banco: BankKey;
  tipo: string;
  rut: string;
  nombre: string;
  referencia: string;
  descripcion: string;
  debito: number;
  credito: number;
  neto: number;
  tieneMensaje: boolean;
  conciliacion: MatchStatus;
  contabilizado: boolean;
  comentario?: string; // comentario del cliente si existe
  facturas: DocumentoConciliado[];
};

/**
 * ✅ TYPE DE VENTAS (para Gestión de Ventas)
 * - "Ventas" es una colección de Documentos (FV + Ingresos) que puedes listar/filtrar
 * - y opcionalmente linkearlos a movimientos.
 */
export type VentaTipo = "Factura" | "Pago" | "Nota"; // simple y útil para UI

export type VentaEstado = "PENDIENTE" | "PAGADA" | "PARCIAL" | "ANULADA";

export type Venta = {
  id: string;
  fecha: string; // YYYY-MM-DD
  rut: string;
  cliente: string;

  // documento comercial
  tipo: VentaTipo; // Factura/Pago/Nota
  numero?: string; // folio o número
  moneda: "CLP" | "USD";

  // montos
  total: number; // total venta
  pagado: number; // pagado acumulado
  saldo: number; // total - pagado

  estado: VentaEstado;

  // “matching” con banco / conciliación (si aplica)
  referencia?: string;
  movimientoId?: string;

  // para UX
  tieneMensaje?: boolean;
  comentario?: string;
};

