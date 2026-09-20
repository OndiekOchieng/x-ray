BEGIN;
DROP TABLE gap_claims, finding_gaps, finding_discrepancies, finding_contextual_evidence, finding_challenging_evidence, finding_supporting_evidence, disconfirmation_opposing_evidence, disconfirmation_supporting_evidence, discrepancy_evidence, discrepancy_claims, evidence_claims, version_gaps, version_findings, version_reevaluated_claims, version_added_evidence, version_added_sources, investigation_gaps, investigation_findings, investigation_disconfirmations, investigation_discrepancies, investigation_evidence, investigation_sources, investigation_claims, ati_requests, candidate_workspaces, execution_runs, version_stage_runs, findings, gaps, disconfirmations, discrepancies, evidence_provenance, source_dependencies, evidence, sources, claims, investigation_versions, investigations;
DROP FUNCTION reject_version_mutation();
DROP FUNCTION reject_insert_into_committed_version();
DROP FUNCTION require_version_pointer_at_commit();
DROP FUNCTION advance_latest_committed_version();
DROP DOMAIN xray_json_string_array, xray_json_object, xray_date_or_datetime, xray_datetime, xray_date;
COMMIT;
