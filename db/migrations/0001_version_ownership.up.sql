BEGIN;

-- Canonical date/time strings are retained verbatim. A date-only value never
-- becomes a timestamp, and fractional seconds/offset spelling are not rounded.
CREATE DOMAIN xray_date AS text CHECK (VALUE ~ '^\d{4}-\d{2}-\d{2}$');
CREATE DOMAIN xray_datetime AS text CHECK (VALUE ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$');
CREATE DOMAIN xray_date_or_datetime AS text CHECK (VALUE ~ '^\d{4}-\d{2}-\d{2}($|T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$)');
CREATE DOMAIN xray_json_object AS jsonb CHECK (jsonb_typeof(VALUE) = 'object');
CREATE DOMAIN xray_json_string_array AS jsonb CHECK (jsonb_typeof(VALUE) = 'array' AND NOT jsonb_path_exists(VALUE, '$[*] ? (@.type() != "string")'));

CREATE TABLE investigations (
  id text PRIMARY KEY,
  latest_committed_version integer CHECK (latest_committed_version > 0)
);

CREATE TABLE investigation_versions (
  investigation_id text NOT NULL REFERENCES investigations(id),
  version_number integer NOT NULL CHECK (version_number > 0),
  created_at xray_datetime NOT NULL,
  trigger text NOT NULL CHECK (trigger IN ('INITIAL_RESEARCH','NEW_SOURCE_RECEIVED','ATI_RESPONSE_RECEIVED','RE_EVALUATION','CORRECTION')),
  supersedes_version integer,
  protocol_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('CREATED','RUNNING','RESEARCH_COMPLETE','SYNTHESIZED','PUBLISHED','FAILED')),
  surface_source_id text NOT NULL,
  focus text,
  investigation_created_at xray_datetime NOT NULL,
  research_cutoff_at xray_date,
  completed_at xray_datetime,
  research_stop_reason text CHECK (research_stop_reason IN ('SATURATION','TIME_BUDGET','SOURCE_EXHAUSTION','COST_BUDGET','MANUAL_STOP','ERROR')),
  research_stop_leads xray_json_string_array,
  investigation_research_stop_reason text CHECK (investigation_research_stop_reason IN ('SATURATION','TIME_BUDGET','SOURCE_EXHAUSTION','COST_BUDGET','MANUAL_STOP','ERROR')),
  investigation_research_stop_leads xray_json_string_array,
  PRIMARY KEY (investigation_id, version_number),
  FOREIGN KEY (investigation_id, supersedes_version) REFERENCES investigation_versions(investigation_id, version_number) DEFERRABLE INITIALLY DEFERRED,
  CHECK ((version_number = 1 AND supersedes_version IS NULL AND trigger = 'INITIAL_RESEARCH') OR
         (version_number > 1 AND supersedes_version = version_number - 1 AND trigger <> 'INITIAL_RESEARCH')),
  CHECK ((research_stop_reason IS NULL) = (research_stop_leads IS NULL)),
  CHECK ((investigation_research_stop_reason IS NULL) = (investigation_research_stop_leads IS NULL))
);
ALTER TABLE investigations ADD CONSTRAINT latest_committed_fk
  FOREIGN KEY (id, latest_committed_version) REFERENCES investigation_versions(investigation_id, version_number)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE claims (
  investigation_id text NOT NULL, version_number integer NOT NULL, id text NOT NULL,
  text text NOT NULL, source_passage text,
  origin text NOT NULL CHECK (origin IN ('SURFACE','DISCOVERED')),
  layer text NOT NULL CHECK (layer IN ('OBSERVATION','INTERPRETATION','MEANING')),
  type text NOT NULL CHECK (type IN ('QUANTITATIVE','FINANCIAL','GEOGRAPHIC','DELIVERY','TIMELINE','ATTRIBUTION','LEGAL','OTHER')),
  priority text NOT NULL CHECK (priority IN ('HIGH','MEDIUM','LOW')),
  measurement xray_json_object, time_scope xray_json_object,
  entities xray_json_string_array NOT NULL, ambiguities xray_json_string_array NOT NULL,
  PRIMARY KEY (investigation_id, version_number, id),
  FOREIGN KEY (investigation_id, version_number) REFERENCES investigation_versions(investigation_id, version_number) DEFERRABLE INITIALLY DEFERRED,
  CHECK ((origin = 'SURFACE' AND id ~ '^C[0-9]+$') OR (origin = 'DISCOVERED' AND id ~ '^DC[0-9]+$')),
  CHECK (origin <> 'DISCOVERED' OR source_passage IS NULL)
);
CREATE TABLE sources (
  investigation_id text NOT NULL, version_number integer NOT NULL, id text NOT NULL,
  title text NOT NULL, publisher text, institution text, author text, url text,
  published_at xray_date_or_datetime, retrieved_at xray_datetime NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('LEGISLATION','GAZETTE','PROCUREMENT_RECORD','CONTRACT','BUDGET','AUDIT','PARLIAMENTARY_RECORD','COURT_RECORD','OFFICIAL_REPORT','OFFICIAL_STATEMENT','DATASET','NEWS','CONTRACTOR_RECORD','OTHER')),
  evidence_class text NOT NULL CHECK (evidence_class IN ('PRIMARY','PRIMARY_ADJACENT','ATTRIBUTED_ORIGIN_NOT_RETRIEVED','SECONDARY','TERTIARY')),
  origin_status text NOT NULL CHECK (origin_status IN ('ORIGINATING','REPEATING','UNKNOWN')),
  accessibility text NOT NULL CHECK (accessibility IN ('RETRIEVED','PARTIAL','NOT_LOCATED','NOT_RETRIEVED','DEAD_LINK')),
  content_hash text,
  PRIMARY KEY (investigation_id, version_number, id),
  FOREIGN KEY (investigation_id, version_number) REFERENCES investigation_versions(investigation_id, version_number) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE investigation_versions ADD CONSTRAINT surface_source_fk FOREIGN KEY (investigation_id, version_number, surface_source_id) REFERENCES sources(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE evidence (
  investigation_id text NOT NULL, version_number integer NOT NULL, id text NOT NULL,
  source_id text NOT NULL, proposition text NOT NULL,
  relationship text NOT NULL CHECK (relationship IN ('SUPPORTS','CHALLENGES','CONTRADICTS','CONTEXTUALIZES')),
  strength text NOT NULL CHECK (strength IN ('DIRECT','STRONG_INDIRECT','CONTEXTUAL','WEAK')),
  measurement xray_json_object, time_scope xray_json_object,
  quoted_passage text, location_in_source text,
  PRIMARY KEY (investigation_id, version_number, id),
  FOREIGN KEY (investigation_id, version_number, source_id) REFERENCES sources(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE source_dependencies (
  investigation_id text NOT NULL, version_number integer NOT NULL, id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  source_id text NOT NULL, depends_on_source_id text, origin_description text,
  relationship text NOT NULL CHECK (relationship IN ('REPRODUCES','QUOTES','ATTRIBUTES_TO','DERIVED_FROM','SAME_EVENT','PROBABLE_COMMON_ORIGIN','UNKNOWN')),
  confidence text NOT NULL CHECK (confidence IN ('HIGH','MEDIUM','LOW')),
  PRIMARY KEY (investigation_id, version_number, id),
  UNIQUE (investigation_id, version_number, ordinal),
  FOREIGN KEY (investigation_id, version_number, source_id) REFERENCES sources(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, depends_on_source_id) REFERENCES sources(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE evidence_provenance (
  investigation_id text NOT NULL, version_number integer NOT NULL, id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  evidence_id text NOT NULL, origin_kind text NOT NULL CHECK (origin_kind IN ('SOURCE','UNIDENTIFIED')),
  origin_source_id text, origin_description text,
  relationship text NOT NULL CHECK (relationship IN ('REPRODUCES','QUOTES','ATTRIBUTES_TO','DERIVED_FROM')),
  confidence text NOT NULL CHECK (confidence IN ('HIGH','MEDIUM','LOW')),
  PRIMARY KEY (investigation_id, version_number, id),
  UNIQUE (investigation_id, version_number, ordinal),
  FOREIGN KEY (investigation_id, version_number, evidence_id) REFERENCES evidence(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, origin_source_id) REFERENCES sources(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED,
  CHECK ((origin_kind = 'SOURCE' AND origin_source_id IS NOT NULL AND origin_description IS NULL) OR
         (origin_kind = 'UNIDENTIFIED' AND origin_source_id IS NULL AND origin_description IS NOT NULL))
);
CREATE TABLE discrepancies (
  investigation_id text NOT NULL, version_number integer NOT NULL, id text NOT NULL,
  description text NOT NULL,
  classification text NOT NULL CHECK (classification IN ('DIFFERENT_DATE','DIFFERENT_SCOPE','DIFFERENT_DEFINITION','DIFFERENT_PHASE','DIFFERENT_UNIT','REVISED_VALUE','GENUINE_CONTRADICTION','PROBABLE_SOURCE_ERROR','UNRESOLVED')),
  reconciliation text, resolved boolean NOT NULL,
  PRIMARY KEY (investigation_id, version_number, id),
  FOREIGN KEY (investigation_id, version_number) REFERENCES investigation_versions(investigation_id, version_number) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE disconfirmations (
  investigation_id text NOT NULL, version_number integer NOT NULL, id text NOT NULL,
  claim_id text NOT NULL, preliminary_hypothesis text NOT NULL, counter_hypothesis text NOT NULL,
  result text NOT NULL CHECK (result IN ('SURVIVED','SURVIVED_WEAKENED','CHANGED','FAILED','UNRESOLVED')),
  effect_on_finding text NOT NULL,
  search_strategy xray_json_string_array NOT NULL,
  PRIMARY KEY (investigation_id, version_number, id),
  FOREIGN KEY (investigation_id, version_number, claim_id) REFERENCES claims(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE gaps (
  investigation_id text NOT NULL, version_number integer NOT NULL, id text NOT NULL,
  missing_evidence text NOT NULL, why_it_matters text NOT NULL,
  likely_holder xray_json_object,
  resolving_evidence xray_json_string_array NOT NULL,
  search_already_attempted xray_json_string_array NOT NULL,
  identifiers xray_json_string_array,
  status text NOT NULL CHECK (status IN ('OPEN','REQUESTED','RECEIVED','RESOLVED','UNRESOLVABLE')),
  effect_on_finding text NOT NULL,
  resolution_path text NOT NULL CHECK (resolution_path IN ('PUBLIC_RECORD_REQUEST','WAIT_FOR_RECORD','FIELD_VERIFICATION','SOURCE_CLARIFICATION','DATASET_QUERY','EXPERT_INTERPRETATION','OTHER')),
  ati_eligible boolean NOT NULL,
  PRIMARY KEY (investigation_id, version_number, id),
  UNIQUE (investigation_id, version_number, id, ati_eligible),
  FOREIGN KEY (investigation_id, version_number) REFERENCES investigation_versions(investigation_id, version_number) DEFERRABLE INITIALLY DEFERRED,
  CHECK (ati_eligible = (resolution_path = 'PUBLIC_RECORD_REQUEST'))
);
CREATE TABLE findings (
  investigation_id text NOT NULL, version_number integer NOT NULL, id text NOT NULL,
  claim_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('ESTABLISHED','SUPPORTED','PARTIALLY_SUPPORTED','CONTESTED','CONTRADICTED','UNRESOLVED','INSUFFICIENT_EVIDENCE')),
  confidence text NOT NULL CHECK (confidence IN ('HIGH','MEDIUM','LOW')),
  rationale text NOT NULL, graded_at xray_datetime NOT NULL,
  would_change_finding xray_json_string_array NOT NULL,
  PRIMARY KEY (investigation_id, version_number, id),
  FOREIGN KEY (investigation_id, version_number, claim_id) REFERENCES claims(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE version_stage_runs (
  investigation_id text NOT NULL, version_number integer NOT NULL, ordinal integer NOT NULL CHECK (ordinal >= 0), id text NOT NULL,
  stage text NOT NULL CHECK (stage IN ('INGEST','DECOMPOSE','CLASSIFY','PLAN','TRACE','PROVENANCE','DISCONFIRM','RECONCILE','GRADE','GAPS','VALIDATE','SYNTHESIZE','RESOLVE')),
  status text NOT NULL CHECK (status IN ('PENDING','RUNNING','SUCCEEDED','FAILED')),
  input_artifact_version integer NOT NULL CHECK (input_artifact_version >= 0),
  output_artifact_version integer CHECK (output_artifact_version >= 0),
  model text, started_at xray_datetime, completed_at xray_datetime, error text,
  PRIMARY KEY (investigation_id, version_number, ordinal),
  UNIQUE (investigation_id, version_number, id),
  FOREIGN KEY (investigation_id, version_number) REFERENCES investigation_versions(investigation_id, version_number) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE execution_runs (
  id text PRIMARY KEY, investigation_id text NOT NULL REFERENCES investigations(id),
  started_at xray_datetime NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING','RUNNING','COMPLETED','CAPABILITY_BLOCKED','STAGE_FAILED','GATE_BLOCKED')),
  committed_version integer,
  UNIQUE (investigation_id, committed_version),
  FOREIGN KEY (investigation_id, committed_version) REFERENCES investigation_versions(investigation_id, version_number) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE candidate_workspaces (
  execution_run_id text PRIMARY KEY REFERENCES execution_runs(id),
  state xray_json_object NOT NULL DEFAULT '{}'::jsonb,
  updated_at xray_datetime NOT NULL
);
CREATE TABLE ati_requests (
  id text PRIMARY KEY,
  investigation_id text NOT NULL, origin_version integer NOT NULL, gap_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  origin_ati_eligible boolean NOT NULL DEFAULT true CHECK (origin_ati_eligible),
  jurisdiction text NOT NULL CHECK (jurisdiction = 'KE'),
  holding_institution text NOT NULL,
  requested_records xray_json_string_array NOT NULL,
  public_interest_context text NOT NULL,
  investigation_url text,
  status text NOT NULL CHECK (status IN ('DRAFT','EXPORTED','SUBMITTED','ACKNOWLEDGED','RESPONDED','CLOSED')),
  drafted_at xray_datetime NOT NULL, submitted_at xray_datetime, responded_at xray_datetime,
  received_source_ids xray_json_string_array NOT NULL,
  UNIQUE (investigation_id, ordinal),
  FOREIGN KEY (investigation_id, origin_version, gap_id, origin_ati_eligible)
    REFERENCES gaps(investigation_id, version_number, id, ati_eligible) DEFERRABLE INITIALLY DEFERRED
);

-- One ordinal row per ordered canonical ID-list element; composite FKs forbid cross-version edges.
CREATE TABLE investigation_claims (
  investigation_id text NOT NULL, version_number integer NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0), claim_id text NOT NULL,
  PRIMARY KEY (investigation_id, version_number, ordinal),
  UNIQUE (investigation_id, version_number, claim_id),
  FOREIGN KEY (investigation_id, version_number) REFERENCES investigation_versions(investigation_id, version_number) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, claim_id) REFERENCES claims(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE investigation_sources (
  investigation_id text NOT NULL, version_number integer NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0), source_id text NOT NULL,
  PRIMARY KEY (investigation_id, version_number, ordinal),
  UNIQUE (investigation_id, version_number, source_id),
  FOREIGN KEY (investigation_id, version_number) REFERENCES investigation_versions(investigation_id, version_number) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, source_id) REFERENCES sources(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE investigation_evidence (
  investigation_id text NOT NULL, version_number integer NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0), evidence_id text NOT NULL,
  PRIMARY KEY (investigation_id, version_number, ordinal),
  UNIQUE (investigation_id, version_number, evidence_id),
  FOREIGN KEY (investigation_id, version_number) REFERENCES investigation_versions(investigation_id, version_number) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, evidence_id) REFERENCES evidence(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE investigation_discrepancies (
  investigation_id text NOT NULL, version_number integer NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0), discrepancy_id text NOT NULL,
  PRIMARY KEY (investigation_id, version_number, ordinal),
  UNIQUE (investigation_id, version_number, discrepancy_id),
  FOREIGN KEY (investigation_id, version_number) REFERENCES investigation_versions(investigation_id, version_number) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, discrepancy_id) REFERENCES discrepancies(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE investigation_disconfirmations (
  investigation_id text NOT NULL, version_number integer NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0), disconfirmation_id text NOT NULL,
  PRIMARY KEY (investigation_id, version_number, ordinal),
  UNIQUE (investigation_id, version_number, disconfirmation_id),
  FOREIGN KEY (investigation_id, version_number) REFERENCES investigation_versions(investigation_id, version_number) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, disconfirmation_id) REFERENCES disconfirmations(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE investigation_findings (
  investigation_id text NOT NULL, version_number integer NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0), finding_id text NOT NULL,
  PRIMARY KEY (investigation_id, version_number, ordinal),
  UNIQUE (investigation_id, version_number, finding_id),
  FOREIGN KEY (investigation_id, version_number) REFERENCES investigation_versions(investigation_id, version_number) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, finding_id) REFERENCES findings(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE investigation_gaps (
  investigation_id text NOT NULL, version_number integer NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0), gap_id text NOT NULL,
  PRIMARY KEY (investigation_id, version_number, ordinal),
  UNIQUE (investigation_id, version_number, gap_id),
  FOREIGN KEY (investigation_id, version_number) REFERENCES investigation_versions(investigation_id, version_number) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, gap_id) REFERENCES gaps(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE version_added_sources (
  investigation_id text NOT NULL, version_number integer NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0), source_id text NOT NULL,
  PRIMARY KEY (investigation_id, version_number, ordinal),
  UNIQUE (investigation_id, version_number, source_id),
  FOREIGN KEY (investigation_id, version_number) REFERENCES investigation_versions(investigation_id, version_number) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, source_id) REFERENCES sources(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE version_added_evidence (
  investigation_id text NOT NULL, version_number integer NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0), evidence_id text NOT NULL,
  PRIMARY KEY (investigation_id, version_number, ordinal),
  UNIQUE (investigation_id, version_number, evidence_id),
  FOREIGN KEY (investigation_id, version_number) REFERENCES investigation_versions(investigation_id, version_number) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, evidence_id) REFERENCES evidence(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE version_reevaluated_claims (
  investigation_id text NOT NULL, version_number integer NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0), claim_id text NOT NULL,
  PRIMARY KEY (investigation_id, version_number, ordinal),
  UNIQUE (investigation_id, version_number, claim_id),
  FOREIGN KEY (investigation_id, version_number) REFERENCES investigation_versions(investigation_id, version_number) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, claim_id) REFERENCES claims(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE version_findings (
  investigation_id text NOT NULL, version_number integer NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0), finding_id text NOT NULL,
  PRIMARY KEY (investigation_id, version_number, ordinal),
  UNIQUE (investigation_id, version_number, finding_id),
  FOREIGN KEY (investigation_id, version_number) REFERENCES investigation_versions(investigation_id, version_number) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, finding_id) REFERENCES findings(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE version_gaps (
  investigation_id text NOT NULL, version_number integer NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0), gap_id text NOT NULL,
  PRIMARY KEY (investigation_id, version_number, ordinal),
  UNIQUE (investigation_id, version_number, gap_id),
  FOREIGN KEY (investigation_id, version_number) REFERENCES investigation_versions(investigation_id, version_number) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, gap_id) REFERENCES gaps(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE evidence_claims (
  investigation_id text NOT NULL, version_number integer NOT NULL, owner_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0), claim_id text NOT NULL,
  PRIMARY KEY (investigation_id, version_number, owner_id, ordinal),
  UNIQUE (investigation_id, version_number, owner_id, claim_id),
  FOREIGN KEY (investigation_id, version_number, owner_id) REFERENCES evidence(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, claim_id) REFERENCES claims(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE discrepancy_claims (
  investigation_id text NOT NULL, version_number integer NOT NULL, owner_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0), claim_id text NOT NULL,
  PRIMARY KEY (investigation_id, version_number, owner_id, ordinal),
  UNIQUE (investigation_id, version_number, owner_id, claim_id),
  FOREIGN KEY (investigation_id, version_number, owner_id) REFERENCES discrepancies(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, claim_id) REFERENCES claims(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE discrepancy_evidence (
  investigation_id text NOT NULL, version_number integer NOT NULL, owner_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0), evidence_id text NOT NULL,
  PRIMARY KEY (investigation_id, version_number, owner_id, ordinal),
  UNIQUE (investigation_id, version_number, owner_id, evidence_id),
  FOREIGN KEY (investigation_id, version_number, owner_id) REFERENCES discrepancies(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, evidence_id) REFERENCES evidence(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE disconfirmation_supporting_evidence (
  investigation_id text NOT NULL, version_number integer NOT NULL, owner_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0), evidence_id text NOT NULL,
  PRIMARY KEY (investigation_id, version_number, owner_id, ordinal),
  UNIQUE (investigation_id, version_number, owner_id, evidence_id),
  FOREIGN KEY (investigation_id, version_number, owner_id) REFERENCES disconfirmations(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, evidence_id) REFERENCES evidence(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE disconfirmation_opposing_evidence (
  investigation_id text NOT NULL, version_number integer NOT NULL, owner_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0), evidence_id text NOT NULL,
  PRIMARY KEY (investigation_id, version_number, owner_id, ordinal),
  UNIQUE (investigation_id, version_number, owner_id, evidence_id),
  FOREIGN KEY (investigation_id, version_number, owner_id) REFERENCES disconfirmations(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, evidence_id) REFERENCES evidence(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE finding_supporting_evidence (
  investigation_id text NOT NULL, version_number integer NOT NULL, owner_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0), evidence_id text NOT NULL,
  PRIMARY KEY (investigation_id, version_number, owner_id, ordinal),
  UNIQUE (investigation_id, version_number, owner_id, evidence_id),
  FOREIGN KEY (investigation_id, version_number, owner_id) REFERENCES findings(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, evidence_id) REFERENCES evidence(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE finding_challenging_evidence (
  investigation_id text NOT NULL, version_number integer NOT NULL, owner_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0), evidence_id text NOT NULL,
  PRIMARY KEY (investigation_id, version_number, owner_id, ordinal),
  UNIQUE (investigation_id, version_number, owner_id, evidence_id),
  FOREIGN KEY (investigation_id, version_number, owner_id) REFERENCES findings(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, evidence_id) REFERENCES evidence(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE finding_contextual_evidence (
  investigation_id text NOT NULL, version_number integer NOT NULL, owner_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0), evidence_id text NOT NULL,
  PRIMARY KEY (investigation_id, version_number, owner_id, ordinal),
  UNIQUE (investigation_id, version_number, owner_id, evidence_id),
  FOREIGN KEY (investigation_id, version_number, owner_id) REFERENCES findings(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, evidence_id) REFERENCES evidence(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE finding_discrepancies (
  investigation_id text NOT NULL, version_number integer NOT NULL, owner_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0), discrepancy_id text NOT NULL,
  PRIMARY KEY (investigation_id, version_number, owner_id, ordinal),
  UNIQUE (investigation_id, version_number, owner_id, discrepancy_id),
  FOREIGN KEY (investigation_id, version_number, owner_id) REFERENCES findings(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, discrepancy_id) REFERENCES discrepancies(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE finding_gaps (
  investigation_id text NOT NULL, version_number integer NOT NULL, owner_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0), gap_id text NOT NULL,
  PRIMARY KEY (investigation_id, version_number, owner_id, ordinal),
  UNIQUE (investigation_id, version_number, owner_id, gap_id),
  FOREIGN KEY (investigation_id, version_number, owner_id) REFERENCES findings(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, gap_id) REFERENCES gaps(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE gap_claims (
  investigation_id text NOT NULL, version_number integer NOT NULL, owner_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0), claim_id text NOT NULL,
  PRIMARY KEY (investigation_id, version_number, owner_id, ordinal),
  UNIQUE (investigation_id, version_number, owner_id, claim_id),
  FOREIGN KEY (investigation_id, version_number, owner_id) REFERENCES gaps(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, claim_id) REFERENCES claims(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);

-- Version rows and all their artifact/ordered child rows are insert-only.
CREATE FUNCTION advance_latest_committed_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.latest_committed_version IS DISTINCT FROM OLD.latest_committed_version
     AND (NEW.latest_committed_version IS NULL OR
          NEW.latest_committed_version <> COALESCE(OLD.latest_committed_version, 0) + 1) THEN
    RAISE EXCEPTION 'latest committed version must advance exactly once' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER advance_latest_committed_version BEFORE UPDATE ON investigations
  FOR EACH ROW EXECUTE FUNCTION advance_latest_committed_version();

CREATE FUNCTION reject_insert_into_committed_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE latest integer;
BEGIN
  SELECT latest_committed_version INTO latest FROM investigations WHERE id = NEW.investigation_id;
  IF latest IS NOT NULL AND NEW.version_number <= latest THEN
    RAISE EXCEPTION 'cannot add data to committed version %', NEW.version_number USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION require_version_pointer_at_commit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM investigations WHERE id = NEW.investigation_id
                 AND latest_committed_version >= NEW.version_number) THEN
    RAISE EXCEPTION 'version % must be published to latest committed pointer in the same transaction', NEW.version_number
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER version_pointer_at_commit AFTER INSERT ON investigation_versions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_version_pointer_at_commit();

CREATE FUNCTION reject_version_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'committed version data is immutable: %', TG_TABLE_NAME USING ERRCODE = 'integrity_constraint_violation';
END $$;
DO $$ DECLARE relation_name text; BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'investigation_versions','claims','sources','evidence','source_dependencies',
    'evidence_provenance','discrepancies','disconfirmations','findings','gaps','version_stage_runs',
    'investigation_claims','investigation_sources','investigation_evidence','investigation_discrepancies','investigation_disconfirmations','investigation_findings','investigation_gaps','version_added_sources','version_added_evidence','version_reevaluated_claims','version_findings','version_gaps','evidence_claims','discrepancy_claims','discrepancy_evidence','disconfirmation_supporting_evidence','disconfirmation_opposing_evidence','finding_supporting_evidence','finding_challenging_evidence','finding_contextual_evidence','finding_discrepancies','finding_gaps','gap_claims'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_version_mutation()', 'immutable_' || relation_name, relation_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION reject_insert_into_committed_version()', 'uncommitted_' || relation_name, relation_name);
  END LOOP;
END $$;
COMMIT;
