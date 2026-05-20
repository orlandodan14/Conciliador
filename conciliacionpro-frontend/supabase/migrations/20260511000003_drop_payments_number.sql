-- =========================================================
-- 20260511000003_drop_payments_number.sql
--
-- La columna payments.number fue agregada en cobros_module.sql
-- pero no existe en la DB real. El N° del cobro se almacena
-- en la columna payments.reference (columna original).
-- Se elimina para mantener esquema alineado con el código.
-- =========================================================

ALTER TABLE public.payments DROP COLUMN IF EXISTS number;
