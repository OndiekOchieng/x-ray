BEGIN;
ALTER TABLE execution_runs DROP CONSTRAINT committed_graduation_fk;
ALTER TABLE execution_runs DROP COLUMN committed_graduation_index;
DROP TABLE run_graduations;
ALTER TABLE execution_runs DROP CONSTRAINT execution_run_identity_pair;
COMMIT;
