-- =========================================================
-- 20260507000002_payments_schema_upgrade.sql
--
-- Refactoriza la tabla payments para el módulo Cobros:
--
--  1. Renombra cobro_type → payment_type y amplía los
--     valores permitidos: COBRO | PAGO | AJUSTE_COBRO | AJUSTE_PAGO
--
--  2. Backfill de todas las columnas reales (branch_id,
--     counterparty_*, journal_entry_id, etc.) desde el
--     campo JSONB extra, ya que el código TypeScript anterior
--     escribía ahí en lugar de en las columnas reales.
--
--  3. Backfill de status desde extra (el código TypeScript
--     escribía el status en extra, no en la columna real).
--
--  4. Agrega reconciliation_status (PENDIENTE | CONCILIADO).
--
--  5. Índices de apoyo.
-- =========================================================

-- ── 1. Renombrar cobro_type → payment_type ───────────────────────────────────

-- Eliminar constraint vieja (referencia al nombre cobro_type)
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS chk_payments_cobro_type;

-- Renombrar columna
ALTER TABLE public.payments
  RENAME COLUMN cobro_type TO payment_type;

-- Nueva constraint con valores extendidos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.payments'::regclass
      AND conname   = 'chk_payments_payment_type'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT chk_payments_payment_type
        CHECK (payment_type IS NULL
            OR payment_type IN ('COBRO','PAGO','AJUSTE_COBRO','AJUSTE_PAGO'));
  END IF;
END $$;

-- DEFAULT actualizado
ALTER TABLE public.payments
  ALTER COLUMN payment_type SET DEFAULT 'COBRO';

-- ── 2. Backfill payment_type ─────────────────────────────────────────────────

-- a) Filas donde method='AJUSTE' (convención antigua) → AJUSTE_COBRO
UPDATE public.payments
  SET payment_type = 'AJUSTE_COBRO',
      method       = NULL
  WHERE method = 'AJUSTE';

-- b) Valor antiguo 'AJUSTE' heredado de la columna renombrada → AJUSTE_COBRO
UPDATE public.payments
  SET payment_type = 'AJUSTE_COBRO'
  WHERE payment_type = 'AJUSTE';

-- c) Filas con payment_type NULL → COBRO por defecto
UPDATE public.payments
  SET payment_type = 'COBRO'
  WHERE payment_type IS NULL;

-- ── 3. Backfill status desde extra JSONB ─────────────────────────────────────
-- El TypeScript anterior escribía status en extra, no en la columna real.
-- La columna real tiene DEFAULT 'VIGENTE', por eso todos quedaron como VIGENTE.
UPDATE public.payments
  SET status = (extra->>'status')
  WHERE extra IS NOT NULL
    AND extra->>'status' IS NOT NULL
    AND extra->>'status' IN ('BORRADOR','VIGENTE','CANCELADO');

-- ── 4. Backfill de columnas reales desde extra ───────────────────────────────
-- El TypeScript almacenaba estos campos en extra en lugar de las columnas reales
-- que ya existen desde la migración cobros_module.sql.
UPDATE public.payments
  SET
    series                         = COALESCE(series,                          extra->>'series'),
    number                         = COALESCE(number,                          extra->>'number'),
    branch_id                      = COALESCE(branch_id,                       (extra->>'branch_id')::uuid),
    counterparty_id                = COALESCE(counterparty_id,                 (extra->>'counterparty_id')::uuid),
    counterparty_identifier_snapshot = COALESCE(counterparty_identifier_snapshot, extra->>'counterparty_identifier_snapshot'),
    counterparty_name_snapshot     = COALESCE(counterparty_name_snapshot,      extra->>'counterparty_name_snapshot'),
    journal_entry_id               = COALESCE(journal_entry_id,                (extra->>'journal_entry_id')::uuid),
    bank_movement_id               = COALESCE(bank_movement_id,                (extra->>'bank_movement_id')::uuid),
    cancelled_at                   = COALESCE(cancelled_at,                    (extra->>'cancelled_at')::date),
    cancel_reason                  = COALESCE(cancel_reason,                   extra->>'cancel_reason')
  WHERE extra IS NOT NULL;

-- ── 5. Agregar reconciliation_status ────────────────────────────────────────
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS reconciliation_status TEXT NOT NULL DEFAULT 'PENDIENTE';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.payments'::regclass
      AND conname   = 'chk_payments_reconciliation_status'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT chk_payments_reconciliation_status
        CHECK (reconciliation_status IN ('PENDIENTE','CONCILIADO'));
  END IF;
END $$;

-- ── 6. Índices ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payments_company_payment_type
  ON public.payments(company_id, payment_type);

CREATE INDEX IF NOT EXISTS idx_payments_company_status
  ON public.payments(company_id, status);

CREATE INDEX IF NOT EXISTS idx_payments_company_reconciliation_status
  ON public.payments(company_id, reconciliation_status);

CREATE INDEX IF NOT EXISTS idx_payments_company_payment_type_status
  ON public.payments(company_id, payment_type, status);
