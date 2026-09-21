BEGIN;

-- ATI action state is append-only and lives outside immutable research state
-- (ADR-0017). `ati_requests` keeps stable identity and exact origin; everything
-- that happens to a request is recorded in the tables below.
--
-- Deliberately NOT added: a unique constraint on (investigation, origin
-- version, gap). One missing record may be sought from two institutions with
-- plausible custody, and forcing one request per gap would make the second
-- unrepresentable (#10 C3). The request id is the identity; `ordinal` orders.

-- The mutable columns are superseded by the event tables. They are relaxed
-- rather than dropped so existing rows and the #7 ATI boundary gate remain
-- valid, and new runtime does not use them as history.
ALTER TABLE ati_requests ALTER COLUMN status DROP NOT NULL;
ALTER TABLE ati_requests ALTER COLUMN drafted_at DROP NOT NULL;
ALTER TABLE ati_requests ALTER COLUMN holding_institution DROP NOT NULL;
ALTER TABLE ati_requests ALTER COLUMN requested_records DROP NOT NULL;
ALTER TABLE ati_requests ALTER COLUMN public_interest_context DROP NOT NULL;
ALTER TABLE ati_requests ALTER COLUMN received_source_ids DROP NOT NULL;

-- Immutable draft revisions. A human edit creates a revision; it never
-- rewrites one that was already exported or filed.
--
-- Holder context is copied in rather than referenced, so an exported request
-- can always answer what addressee and custody basis it presented at the time.
-- A later version changing likely custody must not mutate an old export (C5).
CREATE TABLE ati_request_revisions (
  request_id text NOT NULL REFERENCES ati_requests(id),
  revision integer NOT NULL CHECK (revision >= 1),
  created_at xray_datetime NOT NULL,

  holding_institution text NOT NULL CHECK (btrim(holding_institution) <> ''),
  holding_office text,
  custody_basis text NOT NULL CHECK (custody_basis IN ('CONFIRMED','INFERRED')),
  -- Where this holder context came from. An inferred holder must stay visibly
  -- inferred, and a human must not silently upgrade it.
  holder_context_origin text NOT NULL
    CHECK (holder_context_origin IN ('ORIGIN_GAP','HUMAN_SUPPLIED')),
  custody_basis_rationale text,

  requested_records xray_json_string_array NOT NULL,
  public_interest_context text NOT NULL CHECK (btrim(public_interest_context) <> ''),
  investigation_url text,
  rendered_body text,

  PRIMARY KEY (request_id, revision),

  -- Confirmed custody that a human asserted must say on what basis. Confirmed
  -- custody carried over from the origin gap is already accounted for there.
  CONSTRAINT confirmed_custody_needs_stated_basis CHECK (
    custody_basis <> 'CONFIRMED'
    OR holder_context_origin = 'ORIGIN_GAP'
    OR (custody_basis_rationale IS NOT NULL AND btrim(custody_basis_rationale) <> ''))
);

-- Append-only lifecycle acts. X-Ray does not file requests, so nothing past
-- EXPORT happens without a human act (ADR-0008).
CREATE TABLE ati_request_events (
  request_id text NOT NULL REFERENCES ati_requests(id),
  sequence integer NOT NULL CHECK (sequence >= 1),
  act text NOT NULL CHECK (act IN ('EXPORT','SUBMIT','ACKNOWLEDGE','CLOSE')),
  occurred_at xray_datetime NOT NULL,

  -- EXPORT freezes one exact revision.
  revision integer,
  -- SUBMIT is a human assertion about one exact export.
  submitted_export_sequence integer,

  -- Only facts a human supplied. Nothing here is defaulted or invented.
  submission_method text,
  external_reference text,
  destination text,
  note text,

  PRIMARY KEY (request_id, sequence),
  FOREIGN KEY (request_id, revision)
    REFERENCES ati_request_revisions(request_id, revision),
  FOREIGN KEY (request_id, submitted_export_sequence)
    REFERENCES ati_request_events(request_id, sequence),

  CONSTRAINT export_names_a_revision CHECK ((act = 'EXPORT') = (revision IS NOT NULL)),
  CONSTRAINT submit_names_an_export CHECK (
    (act = 'SUBMIT') = (submitted_export_sequence IS NOT NULL)),
  -- Filing metadata belongs to the act of filing and to nothing else.
  CONSTRAINT filing_metadata_only_on_submit CHECK (
    act = 'SUBMIT'
    OR (submission_method IS NULL AND external_reference IS NULL AND destination IS NULL))
);

-- Append-only response events. A request may receive none, one, or several,
-- including partial ones before a final one (ADR-0018).
CREATE TABLE ati_responses (
  request_id text NOT NULL REFERENCES ati_requests(id),
  sequence integer NOT NULL CHECK (sequence >= 1),
  received_at xray_datetime NOT NULL,
  -- What the institution said about completeness. Recorded, never inferred:
  -- silence is UNSTATED, not FINAL.
  completeness text NOT NULL CHECK (completeness IN ('PARTIAL','FINAL','UNSTATED')),
  summary text,
  PRIMARY KEY (request_id, sequence)
);

-- Records that arrived. NOT canonical Sources.
--
-- Note the absent column: there is no source id here at all, so an intake
-- cannot name a Source — imaginary or otherwise. Acceptance is a separate,
-- later fact.
CREATE TABLE ati_response_intakes (
  intake_id text PRIMARY KEY,
  request_id text NOT NULL,
  response_sequence integer NOT NULL,
  received_at xray_datetime NOT NULL,
  -- What arrived, as described on arrival. Not a claim about what it shows.
  described_as text NOT NULL CHECK (btrim(described_as) <> ''),
  media_type text,
  content_hash text,
  FOREIGN KEY (request_id, response_sequence)
    REFERENCES ati_responses(request_id, sequence)
);

-- The only bridge from action state to canonical research.
--
-- The foreign key is NOT deferrable, so a bare invented source id has nothing
-- to point at.
--
-- CORRECTED: an earlier version of this comment claimed the non-deferrable key
-- meant the commit had already happened. It does not — it requires only that
-- the row be visible at statement time, and #7 inserts version-scoped rows
-- before advancing the committed pointer. Migration 0010 adds the commitment
-- check and 0011 the added-source check. Comment only; the SQL below is
-- unchanged from what was applied.
CREATE TABLE ati_intake_source_acceptances (
  intake_id text NOT NULL REFERENCES ati_response_intakes(intake_id),
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  investigation_id text NOT NULL,
  committed_version integer NOT NULL CHECK (committed_version > 0),
  source_id text NOT NULL,
  accepted_at xray_datetime NOT NULL,
  PRIMARY KEY (intake_id, ordinal),
  UNIQUE (intake_id, investigation_id, committed_version, source_id),
  FOREIGN KEY (investigation_id, committed_version, source_id)
    REFERENCES sources(investigation_id, version_number, id)
);

CREATE INDEX ati_request_events_request ON ati_request_events (request_id, sequence);
CREATE INDEX ati_responses_request ON ati_responses (request_id, sequence);
CREATE INDEX ati_response_intakes_response ON ati_response_intakes (request_id, response_sequence);

-- Append-only is a database invariant, not a convention.
CREATE FUNCTION reject_ati_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ATI action history is append-only: %', TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END $$;

DO $$ DECLARE relation_name text; BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'ati_request_revisions','ati_request_events','ati_responses',
    'ati_response_intakes','ati_intake_source_acceptances'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER append_only_%1$s BEFORE UPDATE OR DELETE ON %1$s
         FOR EACH ROW EXECUTE FUNCTION reject_ati_mutation()', relation_name);
  END LOOP;
END $$;

-- A submission must name an act that was actually an export. The foreign key
-- alone cannot say which kind of event was referenced.
CREATE FUNCTION submit_must_reference_export() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE referenced text;
BEGIN
  IF NEW.act <> 'SUBMIT' THEN RETURN NEW; END IF;
  SELECT act INTO referenced FROM ati_request_events
    WHERE request_id = NEW.request_id AND sequence = NEW.submitted_export_sequence;
  IF referenced IS DISTINCT FROM 'EXPORT' THEN
    RAISE EXCEPTION 'a submission must reference an export, not %', COALESCE(referenced, 'nothing')
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER submit_references_export BEFORE INSERT ON ati_request_events
  FOR EACH ROW EXECUTE FUNCTION submit_must_reference_export();

COMMIT;
