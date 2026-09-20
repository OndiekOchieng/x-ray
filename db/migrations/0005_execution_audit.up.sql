BEGIN;

-- Result bodies remain whole value records; journal entries and review rounds
-- are independently ordered rows, never one mutable audit array.
CREATE TABLE run_validation_results (
  execution_run_id text NOT NULL REFERENCES execution_runs(id),
  gate_run_id text NOT NULL,
  result xray_json_object NOT NULL,
  PRIMARY KEY (execution_run_id, gate_run_id)
);

CREATE TABLE run_review_rounds (
  execution_run_id text NOT NULL REFERENCES execution_runs(id),
  round_index integer NOT NULL CHECK (round_index >= 0),
  result xray_json_object NOT NULL,
  PRIMARY KEY (execution_run_id, round_index)
);

CREATE TABLE run_journal_entries (
  execution_run_id text NOT NULL REFERENCES execution_runs(id),
  sequence integer NOT NULL CHECK (sequence >= 0),
  kind text NOT NULL CHECK (kind IN ('STAGE','GATE','CAPABILITY','STOP','INVALIDATION')),
  run_id text NOT NULL,
  run_payload xray_json_object NOT NULL,
  validation_gate_run_id text,
  review_round_index integer,
  PRIMARY KEY (execution_run_id, sequence),
  UNIQUE (execution_run_id, run_id),
  CHECK (validation_gate_run_id IS NULL OR kind = 'GATE'),
  CHECK (review_round_index IS NULL OR kind = 'GATE'),
  CHECK (validation_gate_run_id IS NULL OR review_round_index IS NULL),
  FOREIGN KEY (execution_run_id, validation_gate_run_id)
    REFERENCES run_validation_results(execution_run_id, gate_run_id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (execution_run_id, review_round_index)
    REFERENCES run_review_rounds(execution_run_id, round_index) DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE run_validation_results ADD CONSTRAINT validation_gate_entry_fk
  FOREIGN KEY (execution_run_id, gate_run_id)
  REFERENCES run_journal_entries(execution_run_id, run_id) DEFERRABLE INITIALLY DEFERRED;

DO $$ DECLARE relation_name text; BEGIN
  FOREACH relation_name IN ARRAY ARRAY['run_validation_results','run_review_rounds','run_journal_entries'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_version_mutation()',
      'append_only_' || relation_name, relation_name);
  END LOOP;
END $$;

COMMIT;
