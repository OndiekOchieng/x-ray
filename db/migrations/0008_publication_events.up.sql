BEGIN;

-- Publication state lives beside canonical research state and never inside it.
-- A principal is an administrative identity, not an epistemic Actor, so nothing
-- here is reachable from the evidence graph (ADR-0013).

-- One permanent public slug per investigation lineage. Lineage identity, not
-- history: minted at first publication, immutable, never freed by withdrawal
-- and never inherited by another investigation.
CREATE TABLE investigation_slugs (
  investigation_id text PRIMARY KEY REFERENCES investigations(id),
  slug text NOT NULL UNIQUE
    CHECK (length(slug) BETWEEN 3 AND 96 AND slug !~ '^-' AND slug !~ '-$'),
  allocated_at xray_datetime NOT NULL
);

-- Append-only publication history against an exact committed version.
--
-- `sequence` orders the history independently of any clock: the presentation
-- head is replayed from it, never taken from MAX(version_number).
CREATE TABLE publication_events (
  investigation_id text NOT NULL REFERENCES investigations(id),
  sequence integer NOT NULL CHECK (sequence >= 1),
  version_number integer NOT NULL CHECK (version_number > 0),
  act text NOT NULL CHECK (act IN ('PUBLISH','WITHDRAW')),
  -- Supplied by the trusted host boundary. There is no default and no
  -- anonymous principal: an unattributed act is invalid (ADR-0013).
  principal_id text NOT NULL CHECK (btrim(principal_id) <> ''),
  occurred_at xray_datetime NOT NULL,
  withdrawal_reason text
    CHECK (withdrawal_reason IN ('ERRONEOUS','COMPELLED','PRIVACY_HARM','OUT_OF_SCOPE')),
  note text,
  -- Which recorded eligibility authorized this publication. The blockers of an
  -- eligible BLOCKED stay reachable through it for 9d to disclose; they are not
  -- copied here, so they cannot drift from the assessment that produced them.
  authorizing_execution_run_id text,
  authorizing_graduation_index integer CHECK (authorizing_graduation_index >= 0),

  PRIMARY KEY (investigation_id, sequence),

  -- A candidate or workspace can never be published: the version must be a
  -- committed one.
  FOREIGN KEY (investigation_id, version_number)
    REFERENCES investigation_versions(investigation_id, version_number),
  FOREIGN KEY (authorizing_execution_run_id, authorizing_graduation_index)
    REFERENCES run_graduations(execution_run_id, assessment_index),

  -- PUBLISH carries no withdrawal reason; WITHDRAW carries exactly one.
  CONSTRAINT publication_act_reason CHECK (
    (act = 'PUBLISH' AND withdrawal_reason IS NULL) OR
    (act = 'WITHDRAW' AND withdrawal_reason IS NOT NULL)),

  -- A retraction for error must say what was wrong. COMPELLED and
  -- PRIVACY_HARM deliberately require no confession of evidentiary error.
  CONSTRAINT erroneous_requires_note CHECK (
    withdrawal_reason IS DISTINCT FROM 'ERRONEOUS' OR
    (note IS NOT NULL AND btrim(note) <> '')),

  -- Every publication names the eligibility record that authorized it.
  CONSTRAINT publish_requires_authorization CHECK (
    (act = 'PUBLISH') = (authorizing_execution_run_id IS NOT NULL
                         AND authorizing_graduation_index IS NOT NULL))
);

CREATE INDEX publication_events_version ON publication_events (investigation_id, version_number, sequence);

-- Append-only is a database invariant, not a TypeScript convention.
CREATE FUNCTION reject_publication_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'publication state is append-only: %', TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END $$;

CREATE TRIGGER append_only_publication_events BEFORE UPDATE OR DELETE ON publication_events
  FOR EACH ROW EXECUTE FUNCTION reject_publication_mutation();

-- A slug is never renamed, reassigned or released.
CREATE TRIGGER immutable_investigation_slugs BEFORE UPDATE OR DELETE ON investigation_slugs
  FOR EACH ROW EXECUTE FUNCTION reject_publication_mutation();

COMMIT;
