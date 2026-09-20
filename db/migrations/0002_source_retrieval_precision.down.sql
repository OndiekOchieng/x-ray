BEGIN;
-- Valid only while no date-only retrieval rows exist.
ALTER TABLE sources ALTER COLUMN published_at TYPE xray_date_or_datetime;
ALTER TABLE sources ALTER COLUMN retrieved_at TYPE xray_datetime;
DROP DOMAIN xray_source_published_at;
COMMIT;
