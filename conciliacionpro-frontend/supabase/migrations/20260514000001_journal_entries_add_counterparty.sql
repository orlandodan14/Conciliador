-- ============================================================
-- Agrega counterparty_id a journal_entries
-- Permite resolver la contraparte de cualquier asiento en un
-- solo JOIN, sin depender de claves JSONB en extra.
-- ============================================================

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS counterparty_id UUID
    REFERENCES counterparties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_journal_entries_counterparty_id
  ON journal_entries(counterparty_id)
  WHERE counterparty_id IS NOT NULL;

-- ── Backfill desde cobros ────────────────────────────────────
-- extra->>'cobro_id' apunta a payments.id que tiene counterparty_id
UPDATE journal_entries je
SET    counterparty_id = p.counterparty_id
FROM   payments p
WHERE  je.extra->>'cobro_id' IS NOT NULL
  AND  (je.extra->>'cobro_id')::uuid = p.id
  AND  p.counterparty_id IS NOT NULL
  AND  je.counterparty_id IS NULL;

-- ── Backfill desde trade_docs (fiscal + no fiscal) ──────────
-- extra->>'trade_doc_id' o extra->>'other_doc_id' → trade_docs.id
UPDATE journal_entries je
SET    counterparty_id = td.counterparty_id
FROM   trade_docs td
WHERE  (
         (je.extra->>'trade_doc_id' IS NOT NULL  AND (je.extra->>'trade_doc_id')::uuid  = td.id)
      OR (je.extra->>'other_doc_id' IS NOT NULL  AND (je.extra->>'other_doc_id')::uuid  = td.id)
       )
  AND  td.counterparty_id IS NOT NULL
  AND  je.counterparty_id IS NULL;
