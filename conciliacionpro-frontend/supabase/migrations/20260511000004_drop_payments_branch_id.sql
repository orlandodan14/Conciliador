-- =========================================================
-- 20260511000004_drop_payments_branch_id.sql
--
-- La columna payments.branch_id fue agregada en cobros_module.sql
-- pero no existe en la DB real. La sucursal del cobro se usa
-- solo para generar líneas del asiento contable (journal_entry_lines)
-- y no necesita persistirse en payments.
-- =========================================================

ALTER TABLE public.payments DROP COLUMN IF EXISTS branch_id;
