BEGIN;
DROP TRIGGER immutable_investigation_slugs ON investigation_slugs;
DROP TRIGGER append_only_publication_events ON publication_events;
DROP FUNCTION reject_publication_mutation();
DROP TABLE publication_events;
DROP TABLE investigation_slugs;
COMMIT;
