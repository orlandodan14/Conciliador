-- Ver los valores válidos del enum journal_entry_status
SELECT enumlabel
FROM pg_enum
WHERE enumtypid = (
  SELECT oid FROM pg_type WHERE typname = 'journal_entry_status'
)
ORDER BY enumsortorder;
