-- =============================================================
-- 20260506000001_cobros_module.sql
-- Módulo de Cobros: extiende public.payments con columnas
-- necesarias para el flujo BORRADOR → VIGENTE → CANCELADO,
-- tipos COBRO/AJUSTE, y enlaza con payment_allocations.
-- =============================================================

-- ─── 1. Limpiar tablas previas si existieran ──────────────────
DROP TABLE IF EXISTS public.cobro_allocations CASCADE;
DROP TABLE IF EXISTS public.cobros CASCADE;

-- ─── 2. Extender public.payments ─────────────────────────────

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS cobro_type   text DEFAULT 'COBRO',
  ADD COLUMN IF NOT EXISTS status       text DEFAULT 'VIGENTE',
  ADD COLUMN IF NOT EXISTS series       text,
  ADD COLUMN IF NOT EXISTS number       text,
  ADD COLUMN IF NOT EXISTS description  text,
  ADD COLUMN IF NOT EXISTS branch_id    uuid REFERENCES public.branches(id),
  ADD COLUMN IF NOT EXISTS counterparty_id                  uuid REFERENCES public.counterparties(id),
  ADD COLUMN IF NOT EXISTS counterparty_identifier_snapshot text,
  ADD COLUMN IF NOT EXISTS counterparty_name_snapshot       text,
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid REFERENCES public.journal_entries(id),
  ADD COLUMN IF NOT EXISTS bank_movement_id uuid,
  ADD COLUMN IF NOT EXISTS cancelled_at  date,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

-- Restricciones opcionales (sólo si aún no existen)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.payments'::regclass
      AND conname   = 'chk_payments_cobro_type'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT chk_payments_cobro_type
        CHECK (cobro_type IS NULL OR cobro_type IN ('COBRO','AJUSTE'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.payments'::regclass
      AND conname   = 'chk_payments_cobro_status'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT chk_payments_cobro_status
        CHECK (status IS NULL OR status IN ('BORRADOR','VIGENTE','CANCELADO'));
  END IF;
END $$;

-- Índices
CREATE INDEX IF NOT EXISTS idx_payments_company_status_date
  ON public.payments(company_id, status, payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_payments_company_je
  ON public.payments(company_id, journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_counterparty
  ON public.payments(company_id, counterparty_id)
  WHERE counterparty_id IS NOT NULL;

-- ─── 3. Extender payment_allocations si le faltan columnas ────

ALTER TABLE public.payment_allocations
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

-- Índices en payment_allocations
CREATE INDEX IF NOT EXISTS idx_payment_alloc_payment
  ON public.payment_allocations(payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_alloc_trade_doc
  ON public.payment_allocations(trade_doc_id);

CREATE INDEX IF NOT EXISTS idx_payment_alloc_company
  ON public.payment_allocations(company_id)
  WHERE company_id IS NOT NULL;

-- ─── 4. FUNCIÓN: apply_cobro_to_trade_doc_balance ─────────────
CREATE OR REPLACE FUNCTION public.apply_cobro_to_trade_doc_balance(
  p_trade_doc_id uuid,
  p_amount       numeric,
  p_sign         integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.trade_docs
  SET balance = GREATEST(balance - (p_amount * p_sign), 0)
  WHERE id = p_trade_doc_id;
END;
$$;
