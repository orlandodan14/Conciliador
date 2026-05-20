-- Columnas reales de las tablas clave
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('payments','counterparties','trade_docs','trade_doc_import_jobs','journal_number_log')
ORDER BY table_name, ordinal_position;
