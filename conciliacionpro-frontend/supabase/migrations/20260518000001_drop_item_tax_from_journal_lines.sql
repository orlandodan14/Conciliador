-- Eliminar columnas item_code, item_id, tax_code, tax_id, tax_rate de journal_entry_lines
-- Estas columnas no aplican para asientos contables manuales

ALTER TABLE journal_entry_lines
  DROP COLUMN IF EXISTS item_code,
  DROP COLUMN IF EXISTS item_id,
  DROP COLUMN IF EXISTS tax_code,
  DROP COLUMN IF EXISTS tax_id,
  DROP COLUMN IF EXISTS tax_rate;
