BEGIN;

-- Restore the three-condition form from 0010, without the added-source check.
CREATE OR REPLACE FUNCTION check_ati_acceptance() RETURNS trigger LANGUAGE plpgsql AS $$
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

COMMIT;
