-- Eliminar columnas redundantes de journal_entry_lines.
-- Los valores se resuelven en runtime desde account_node_id y counterparty_id.

ALTER TABLE journal_entry_lines
  DROP COLUMN IF EXISTS line_reference,
  DROP COLUMN IF EXISTS tax_rate_id,
  DROP COLUMN IF EXISTS account_code_snapshot,
  DROP COLUMN IF EXISTS account_name_snapshot,
  DROP COLUMN IF EXISTS counterparty_identifier_snapshot,
  DROP COLUMN IF EXISTS counterparty_name_snapshot;
