-- =========================================================
-- 20260511000002_drop_payments_series.sql
--
-- La columna payments.series fue agregada en cobros_module.sql
-- pero nunca se usa en la aplicación. Se elimina para alinear
-- esquema DB con el código TypeScript.
-- =========================================================

ALTER TABLE public.payments DROP COLUMN IF EXISTS series;
