BEGIN;
DROP TRIGGER ati_acceptance_is_same_investigation_and_committed ON ati_intake_source_acceptances;
DROP FUNCTION check_ati_acceptance();
DROP TRIGGER immutable_ati_origin ON ati_requests;
DROP FUNCTION reject_ati_origin_change();
COMMIT;
