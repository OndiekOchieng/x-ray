BEGIN;

-- Historical rows remain absent: NULL is not the canonical UNKNOWN value.
ALTER TABLE evidence ADD COLUMN knowledge_basis text CHECK (knowledge_basis IN (
  'DIRECT_OBSERVATION','SELF_REPORT','PARTICIPANT_ACCOUNT','MEASUREMENT',
  'ADMINISTRATIVE_RECORD','INSTITUTIONAL_CHARACTERIZATION','ATTRIBUTED_SOURCE',
  'EXPERT_INTERPRETATION','SECONDARY_SYNTHESIS','INFERENCE','UNKNOWN'
));

-- Optional Investigation.sourcePositionIds needs an absence marker even when
-- the present list is empty. Existing committed versions stay absent.
ALTER TABLE investigation_versions
  ADD COLUMN source_position_membership_present boolean NOT NULL DEFAULT false;

CREATE TABLE source_positions (
  investigation_id text NOT NULL,
  version_number integer NOT NULL,
  id text NOT NULL,
  source_id text NOT NULL,
  relationship text NOT NULL CHECK (relationship IN (
    'SUBJECT','PARTICIPANT','WITNESS','GOVERNING_AUTHORITY','REGULATOR',
    'AUDITOR','INVESTIGATOR','DETENTION_OR_ENFORCEMENT_AUTHORITY',
    'EMPLOYER_OR_PRINCIPAL','EMPLOYEE_OR_AGENT','CONTRACTUAL_COUNTERPARTY',
    'BENEFICIARY','ADVERSARY','INTERMEDIARY','OTHER'
  )),
  relationship_description text,
  power_or_dependency xray_json_string_array NOT NULL,
  production_purpose text,
  time_scope xray_json_object,
  basis text NOT NULL CHECK (basis IN ('DOCUMENTED','INFERRED')),
  confidence text NOT NULL CHECK (confidence IN ('HIGH','MEDIUM','LOW')),
  basis_description text,
  PRIMARY KEY (investigation_id, version_number, id),
  CONSTRAINT source_position_source_fk FOREIGN KEY (investigation_id, version_number, source_id)
    REFERENCES sources(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE source_position_claims (
  investigation_id text NOT NULL, version_number integer NOT NULL,
  owner_id text NOT NULL, ordinal integer NOT NULL CHECK (ordinal >= 0), claim_id text NOT NULL,
  PRIMARY KEY (investigation_id, version_number, owner_id, ordinal),
  UNIQUE (investigation_id, version_number, owner_id, claim_id),
  FOREIGN KEY (investigation_id, version_number, owner_id)
    REFERENCES source_positions(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT source_position_claim_target_fk FOREIGN KEY (investigation_id, version_number, claim_id)
    REFERENCES claims(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE source_position_supporting_evidence (
  investigation_id text NOT NULL, version_number integer NOT NULL,
  owner_id text NOT NULL, ordinal integer NOT NULL CHECK (ordinal >= 0), evidence_id text NOT NULL,
  PRIMARY KEY (investigation_id, version_number, owner_id, ordinal),
  UNIQUE (investigation_id, version_number, owner_id, evidence_id),
  FOREIGN KEY (investigation_id, version_number, owner_id)
    REFERENCES source_positions(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT source_position_evidence_target_fk FOREIGN KEY (investigation_id, version_number, evidence_id)
    REFERENCES evidence(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE investigation_source_positions (
  investigation_id text NOT NULL, version_number integer NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0), source_position_id text NOT NULL,
  PRIMARY KEY (investigation_id, version_number, ordinal),
  UNIQUE (investigation_id, version_number, source_position_id),
  FOREIGN KEY (investigation_id, version_number)
    REFERENCES investigation_versions(investigation_id, version_number) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT investigation_source_position_target_fk FOREIGN KEY (investigation_id, version_number, source_position_id)
    REFERENCES source_positions(investigation_id, version_number, id) DEFERRABLE INITIALLY DEFERRED
);

-- Reuse 7a's insert-only committed-version protection for each new relation.
DO $$ DECLARE relation_name text; BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'source_positions','source_position_claims',
    'source_position_supporting_evidence','investigation_source_positions'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_version_mutation()', 'immutable_' || relation_name, relation_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION reject_insert_into_committed_version()', 'uncommitted_' || relation_name, relation_name);
  END LOOP;
END $$;

COMMIT;
