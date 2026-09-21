BEGIN;

ALTER TABLE ati_response_intakes DROP CONSTRAINT digest_is_normalized;
ALTER TABLE ati_response_intakes DROP CONSTRAINT digest_states_its_provenance;
ALTER TABLE ati_response_intakes DROP COLUMN content_hash_origin;

COMMIT;
