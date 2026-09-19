BEGIN;
-- Frozen XRAY-KE-001 records retrieval at day precision. Preserve the source
-- string exactly instead of inventing a midnight timestamp.
ALTER TABLE sources ALTER COLUMN retrieved_at TYPE xray_date_or_datetime;
CREATE DOMAIN xray_source_published_at AS text CHECK (
  VALUE ~ '^[0-9]{4}-[0-9]{2}$' OR
  VALUE ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}($|T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$)'
);
ALTER TABLE sources ALTER COLUMN published_at TYPE xray_source_published_at;
COMMIT;
