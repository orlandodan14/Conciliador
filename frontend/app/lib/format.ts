// app\lib\format.ts

export const formatCLP = (n: number) =>
  n.toLocaleString("es-CL", { style: "currency", currency: "CLP" });
