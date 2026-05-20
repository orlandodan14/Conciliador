-- ================================================================
-- _audit_orphans.sql  (NO es migración — ejecutar en SQL editor)
-- Muestra todos los registros huérfanos ANTES de limpiar.
-- ================================================================

-- ── 1. Journal Entries DRAFT sin ningún documento ni cobro ───────
-- Estos son los que ves en la pantalla (los rojos del screenshot).
-- Vinieron de imports cuyos trade_docs fueron borrados con la versión
-- bugeada de bulk_delete_other_docs (antes de 20260505000003).
SELECT
  je.id,
  je.status,
  je.entry_number,
  je.description,
  je.created_at::date                          AS fecha,
  je.created_by,
  je.extra->>'source'                          AS fuente,
  (SELECT COUNT(*)
   FROM public.journal_entry_lines jel
   WHERE jel.journal_entry_id = je.id)         AS lineas
FROM public.journal_entries je
WHERE je.status = 'DRAFT'
  AND NOT EXISTS (
    SELECT 1 FROM public.trade_docs td WHERE td.journal_entry_id = je.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.payments p WHERE p.journal_entry_id = je.id
  )
ORDER BY je.created_at DESC;

-- ── 2. Journal Entry Lines sin padre (JE ya no existe) ───────────
SELECT COUNT(*) AS lineas_huerfanas
FROM public.journal_entry_lines jel
WHERE NOT EXISTS (
  SELECT 1 FROM public.journal_entries je WHERE je.id = jel.journal_entry_id
);

-- ── 3. Payment Allocations huérfanas ─────────────────────────────
-- Apuntan a un payment o trade_doc que ya no existe
SELECT COUNT(*) AS allocations_huerfanas
FROM public.payment_allocations pa
WHERE NOT EXISTS (SELECT 1 FROM public.payments p  WHERE p.id  = pa.payment_id)
   OR NOT EXISTS (SELECT 1 FROM public.trade_docs td WHERE td.id = pa.trade_doc_id);

-- ── 4. Payments (BORRADOR) sin journal_entry y sin ninguna allocation ──
-- Solo BORRADOR — los VIGENTE/CANCELADO no se tocan
SELECT
  p.id,
  p.payment_type,
  p.status,
  p.total_amount,
  p.created_at::date AS fecha,
  p.reference,
  p.extra->>'source' AS fuente
FROM public.payments p
WHERE p.status             = 'BORRADOR'
  AND p.journal_entry_id   IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.payment_allocations pa WHERE pa.payment_id = p.id
  )
  AND (p.extra->>'trade_doc_id') IS NULL
ORDER BY p.created_at DESC;

-- ── 5. Trade Docs BORRADOR sin journal_entry ─────────────────────
-- Drafts creados pero sin asiento contable (import fallido a mitad)
SELECT
  td.id,
  td.doc_class,
  td.doc_type,
  td.number,
  td.grand_total,
  td.created_at::date AS fecha,
  td.status
FROM public.trade_docs td
WHERE td.status            = 'BORRADOR'
  AND td.journal_entry_id  IS NULL
ORDER BY td.created_at DESC;

-- ── 6. RESUMEN ────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM public.journal_entries je
   WHERE je.status = 'DRAFT'
     AND NOT EXISTS (SELECT 1 FROM public.trade_docs td WHERE td.journal_entry_id = je.id)
     AND NOT EXISTS (SELECT 1 FROM public.payments  p  WHERE p.journal_entry_id  = je.id)
  ) AS je_draft_huerfanos,

  (SELECT COUNT(*) FROM public.journal_entry_lines jel
   WHERE NOT EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.id = jel.journal_entry_id)
  ) AS lines_sin_padre,

  (SELECT COUNT(*) FROM public.payment_allocations pa
   WHERE NOT EXISTS (SELECT 1 FROM public.payments  p  WHERE p.id  = pa.payment_id)
      OR NOT EXISTS (SELECT 1 FROM public.trade_docs td WHERE td.id = pa.trade_doc_id)
  ) AS allocations_huerfanas,

  (SELECT COUNT(*) FROM public.payments p
   WHERE p.status = 'BORRADOR'
     AND p.journal_entry_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.payment_allocations pa WHERE pa.payment_id = p.id)
     AND (p.extra->>'trade_doc_id') IS NULL
  ) AS payments_borrador_huerfanos,

  (SELECT COUNT(*) FROM public.trade_docs td
   WHERE td.status = 'BORRADOR' AND td.journal_entry_id IS NULL
  ) AS trade_docs_borrador_sin_je;
