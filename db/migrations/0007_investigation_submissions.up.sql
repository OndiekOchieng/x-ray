BEGIN;

-- Command input before INGEST; never a canonical Source or version snapshot.
CREATE TABLE investigation_submissions (
  investigation_id text PRIMARY KEY REFERENCES investigations(id),
  submitted_source_url text NOT NULL CHECK (length(submitted_source_url) > 0),
  requested_focus text,
  created_at xray_datetime NOT NULL
);
CREATE TRIGGER immutable_investigation_submissions
  BEFORE UPDATE OR DELETE ON investigation_submissions
  FOR EACH ROW EXECUTE FUNCTION reject_version_mutation();

COMMIT;
