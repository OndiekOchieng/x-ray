BEGIN;
DROP TABLE investigation_source_positions, source_position_supporting_evidence,
  source_position_claims, source_positions;
ALTER TABLE evidence DROP COLUMN knowledge_basis;
ALTER TABLE investigation_versions DROP COLUMN source_position_membership_present;
COMMIT;
