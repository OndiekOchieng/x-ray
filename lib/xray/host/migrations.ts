/**
 * The ordered migration set a deployed X-Ray requires (#11 slice 11b).
 *
 * Production, not test support. The gates under `lib/xray/persistence` keep
 * their own lists on purpose — several of them exercise a deliberate subset to
 * prove a slice against the schema it shipped with — but a *host* needs the
 * whole chain, in order, from one place.
 */
export const XRAY_MIGRATIONS = [
  '0001_version_ownership',
  '0002_source_retrieval_precision',
  '0003_reevaluation_audit',
  '0004_source_position_knowledge_basis',
  '0005_execution_audit',
  '0006_graduation_audit',
  '0007_investigation_submissions',
  '0008_publication_events',
  '0009_ati_lifecycle',
  '0010_ati_origin_and_acceptance',
  '0011_ati_acceptance_requires_added_source',
  '0012_ati_intake_digest_provenance',
  '0013_ati_response_identity_and_execution_cause',
] as const
