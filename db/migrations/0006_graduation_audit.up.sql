BEGIN;

ALTER TABLE execution_runs ADD CONSTRAINT execution_run_identity_pair UNIQUE (id, investigation_id);

CREATE TABLE run_graduations (
  execution_run_id text NOT NULL,
  assessment_index integer NOT NULL CHECK (assessment_index >= 0),
  investigation_id text NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('PASS','BLOCKED','REVISE','FAIL')),
  graph_fingerprint text NOT NULL,
  candidate_digest text NOT NULL CHECK (candidate_digest ~ '^[0-9a-f]{64}$'),
  assessed_at xray_datetime NOT NULL,
  result xray_json_object NOT NULL,
  PRIMARY KEY (execution_run_id, assessment_index),
  FOREIGN KEY (execution_run_id, investigation_id)
    REFERENCES execution_runs(id, investigation_id) DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE execution_runs ADD COLUMN committed_graduation_index integer CHECK (committed_graduation_index >= 0);
ALTER TABLE execution_runs ADD CONSTRAINT committed_graduation_fk
  FOREIGN KEY (id, committed_graduation_index)
  REFERENCES run_graduations(execution_run_id, assessment_index) DEFERRABLE INITIALLY DEFERRED;

CREATE TRIGGER append_only_run_graduations BEFORE UPDATE OR DELETE ON run_graduations
  FOR EACH ROW EXECUTE FUNCTION reject_version_mutation();

COMMIT;
