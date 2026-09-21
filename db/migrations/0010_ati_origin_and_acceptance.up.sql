BEGIN;

-- Three storage invariants 0009 stated in comments but did not enforce.

-- 1 · Identity and origin are immutable once the row exists.
--
-- 0009 protected the history tables and left `ati_requests` freely updatable.
-- The composite gap foreign key blocks a move to another investigation, but
-- `ordinal`, `origin_version` and `gap_id` all moved without complaint — so a
-- single UPDATE could re-point a request at a different version's gap and
-- silently rewrite what all of its history claims to have originated from.
--
-- The superseded lifecycle columns stay writable on purpose: #7's accepted ATI
-- boundary gate writes `status`, `submitted_at`, `responded_at` and
-- `received_source_ids`, and 10a is not the slice that removes them.
CREATE FUNCTION reject_ati_origin_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.investigation_id IS DISTINCT FROM OLD.investigation_id
     OR NEW.origin_version IS DISTINCT FROM OLD.origin_version
     OR NEW.gap_id IS DISTINCT FROM OLD.gap_id
     OR NEW.ordinal IS DISTINCT FROM OLD.ordinal
     OR NEW.origin_ati_eligible IS DISTINCT FROM OLD.origin_ati_eligible
     OR NEW.jurisdiction IS DISTINCT FROM OLD.jurisdiction THEN
    RAISE EXCEPTION 'ATI request identity and origin are immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER immutable_ati_origin BEFORE UPDATE ON ati_requests
  FOR EACH ROW EXECUTE FUNCTION reject_ati_origin_change();

-- 2 · An acceptance stays inside the investigation that received the response.
-- 3 · The named version must already be committed, not merely present.
--
-- The non-deferrable foreign key proves only that a `sources` row is visible at
-- statement time. #7 inserts version-scoped artifact rows before advancing
-- `investigations.latest_committed_version`, so a row inside the still-open
-- commit transaction satisfies that key while its version is not yet committed.
-- The column is named `committed_version`; this is what makes the name true.
CREATE FUNCTION check_ati_acceptance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_investigation text; latest integer;
BEGIN
  SELECT r.investigation_id INTO owner_investigation
    FROM ati_response_intakes i
    JOIN ati_requests r ON r.id = i.request_id
   WHERE i.intake_id = NEW.intake_id;

  IF owner_investigation IS DISTINCT FROM NEW.investigation_id THEN
    RAISE EXCEPTION
      'an ATI response may only be accepted into the same investigation (% owns this intake, not %)',
      COALESCE(owner_investigation, 'no investigation'), NEW.investigation_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  SELECT latest_committed_version INTO latest
    FROM investigations WHERE id = NEW.investigation_id;

  IF latest IS NULL OR latest < NEW.committed_version THEN
    RAISE EXCEPTION 'version % of % is not committed yet; acceptance requires a committed version',
      NEW.committed_version, NEW.investigation_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER ati_acceptance_is_same_investigation_and_committed
  BEFORE INSERT ON ati_intake_source_acceptances
  FOR EACH ROW EXECUTE FUNCTION check_ati_acceptance();

COMMIT;
