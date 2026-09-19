BEGIN;
CREATE TABLE claim_reevaluation_audit (
  investigation_id text NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 1),
  claim_id text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('NEW_EVIDENCE','CORRECTION','REVIEW_REVISION','EXTERNAL_RECORD_RESPONSE','OTHER')),
  detail text,
  causes_present boolean NOT NULL,
  PRIMARY KEY (investigation_id, version_number, claim_id),
  FOREIGN KEY (investigation_id, version_number, claim_id)
    REFERENCES version_reevaluated_claims(investigation_id, version_number, claim_id)
    DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE claim_reevaluation_causes (
  investigation_id text NOT NULL,
  version_number integer NOT NULL,
  claim_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  source_id text,
  evidence_id text,
  review_ref text,
  ati_response_ref text,
  PRIMARY KEY (investigation_id, version_number, claim_id, ordinal),
  FOREIGN KEY (investigation_id, version_number, claim_id)
    REFERENCES claim_reevaluation_audit(investigation_id, version_number, claim_id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, source_id)
    REFERENCES sources(investigation_id, version_number, id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (investigation_id, version_number, evidence_id)
    REFERENCES evidence(investigation_id, version_number, id)
    DEFERRABLE INITIALLY DEFERRED,
  CHECK (num_nonnulls(source_id, evidence_id, review_ref, ati_response_ref) = 1)
);
CREATE TRIGGER immutable_claim_reevaluation_audit BEFORE UPDATE OR DELETE ON claim_reevaluation_audit
  FOR EACH ROW EXECUTE FUNCTION reject_version_mutation();
CREATE TRIGGER immutable_claim_reevaluation_causes BEFORE UPDATE OR DELETE ON claim_reevaluation_causes
  FOR EACH ROW EXECUTE FUNCTION reject_version_mutation();
CREATE TRIGGER uncommitted_claim_reevaluation_audit BEFORE INSERT ON claim_reevaluation_audit
  FOR EACH ROW EXECUTE FUNCTION reject_insert_into_committed_version();
CREATE TRIGGER uncommitted_claim_reevaluation_causes BEFORE INSERT ON claim_reevaluation_causes
  FOR EACH ROW EXECUTE FUNCTION reject_insert_into_committed_version();
COMMIT;
