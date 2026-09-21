BEGIN;

-- Two things 10d needs before an ATI response can cause a version.

-- 1 · A response gets a stable identity, so a causal reference can be a real key.
--
-- `claim_reevaluation_causes.ati_response_ref` has existed since 0003 as
-- free-form text with nothing behind it. A composite key encoded into an
-- unchecked string is not referential integrity, so the response side gets an
-- identity column and the cause side gets a foreign key to it.
--
-- Identity is the column; position stays `(request_id, sequence)`. The two are
-- deliberately separate: the application mints `ATI_RESPONSE:{request}:{seq}`
-- for v0, which is deterministic and reconstructable, and no CHECK pins that
-- form — an opaque id later needs no migration, only a different minting rule.
ALTER TABLE ati_responses ADD COLUMN id text;

-- The append-only trigger rejects every UPDATE on this table, which is exactly
-- what makes the id immutable once written. So the one DDL-time backfill has to
-- disable it and put it straight back.
ALTER TABLE ati_responses DISABLE TRIGGER append_only_ati_responses;
UPDATE ati_responses SET id = 'ATI_RESPONSE:' || request_id || ':' || sequence;
ALTER TABLE ati_responses ENABLE TRIGGER append_only_ati_responses;

ALTER TABLE ati_responses ALTER COLUMN id SET NOT NULL;
ALTER TABLE ati_responses ADD CONSTRAINT ati_responses_identity UNIQUE (id);

ALTER TABLE claim_reevaluation_causes
  ADD CONSTRAINT reevaluation_cause_names_a_real_response
  FOREIGN KEY (ati_response_ref) REFERENCES ati_responses(id)
  DEFERRABLE INITIALLY DEFERRED;

-- 2 · Why an execution run exists, durably.
--
-- `execution_runs` records that a run happened and which version it committed.
-- It cannot say what the run was *for*, so the chain
--
--   response → intake → run → committed version → added sources
--
-- was only reconstructable from the acceptance mapping — which does not exist
-- when a run produces no new source, and does not exist yet while the run is
-- still going. This table carries the cause itself.
--
-- Generic on purpose: `kind` covers the other re-evaluation triggers, and ATI
-- is the first caller rather than the only one. Durable execution audit, never
-- canonical evidence state.
CREATE TABLE execution_run_causes (
  execution_run_id text PRIMARY KEY REFERENCES execution_runs(id),
  kind text NOT NULL CHECK (kind IN ('ATI_INTAKE','NEW_SOURCE','RE_EVALUATION','CORRECTION')),
  /** Human-readable reference to whatever occasioned the run. */
  reference text NOT NULL CHECK (btrim(reference) <> ''),
  /** The version this run was seeded from, recorded before it ran. */
  expected_predecessor_version integer NOT NULL CHECK (expected_predecessor_version > 0),
  intended_trigger text NOT NULL CHECK (intended_trigger IN
    ('INITIAL_RESEARCH','NEW_SOURCE_RECEIVED','ATI_RESPONSE_RECEIVED','RE_EVALUATION','CORRECTION')),
  recorded_at xray_datetime NOT NULL,

  -- The exact ATI links, as keys rather than as strings inside `reference`.
  ati_intake_id text REFERENCES ati_response_intakes(intake_id),
  ati_response_ref text REFERENCES ati_responses(id),

  CONSTRAINT ati_cause_names_its_intake_and_response CHECK (
    (kind = 'ATI_INTAKE') = (ati_intake_id IS NOT NULL AND ati_response_ref IS NOT NULL))
);

-- A run's cause is stated once, before it runs, and never edited afterwards.
CREATE FUNCTION reject_execution_cause_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'execution run causes are append-only: %', TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END $$;

CREATE TRIGGER append_only_execution_run_causes
  BEFORE UPDATE OR DELETE ON execution_run_causes
  FOR EACH ROW EXECUTE FUNCTION reject_execution_cause_mutation();

CREATE INDEX execution_run_causes_intake ON execution_run_causes (ati_intake_id);

COMMIT;
