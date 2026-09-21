BEGIN;

DROP TRIGGER append_only_execution_run_causes ON execution_run_causes;
DROP FUNCTION reject_execution_cause_mutation();
DROP TABLE execution_run_causes;

ALTER TABLE claim_reevaluation_causes DROP CONSTRAINT reevaluation_cause_names_a_real_response;

ALTER TABLE ati_responses DROP CONSTRAINT ati_responses_identity;
ALTER TABLE ati_responses DROP COLUMN id;

COMMIT;
