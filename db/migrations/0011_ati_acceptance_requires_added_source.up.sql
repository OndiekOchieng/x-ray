BEGIN;

-- A fourth acceptance condition: the source must be one that version ADDED.
--
-- Every committed version's `sources` table carries its inherited rows as well
-- as its new ones, so proving a source exists at `(investigation, version, id)`
-- says nothing about whether that version introduced it. Before this migration
-- an ATI response could be accepted against the original surface source — a
-- record predating the request entirely — manufacturing a causal link between
-- a response and evidence it had nothing to do with.
--
-- This also makes ADR-0018's duplicate case precise. If a response contains a
-- document research already held, the version adds no source, there is nothing
-- to point at, and no acceptance row is written. Zero new sources stays zero
-- rather than acquiring a borrowed one.
--
-- Supersedes the comment in 0009 claiming the non-deferrable foreign key proved
-- the commit had already happened. It did not: a non-deferrable key requires
-- only that the row be visible at statement time, and #7 inserts version-scoped
-- rows before advancing the committed pointer. 0010 added the commitment check;
-- this adds the provenance one.
CREATE OR REPLACE FUNCTION check_ati_acceptance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_investigation text; latest integer;
BEGIN
  -- 1 · the intake belongs to this investigation
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

  -- 2 · the named version is already committed
  SELECT latest_committed_version INTO latest
    FROM investigations WHERE id = NEW.investigation_id;

  IF latest IS NULL OR latest < NEW.committed_version THEN
    RAISE EXCEPTION 'version % of % is not committed yet; acceptance requires a committed version',
      NEW.committed_version, NEW.investigation_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- 3 · the exact version-scoped Source exists — the table's foreign key.

  -- 4 · that version actually added it, rather than inheriting it
  IF NOT EXISTS (
    SELECT 1 FROM version_added_sources
     WHERE investigation_id = NEW.investigation_id
       AND version_number = NEW.committed_version
       AND source_id = NEW.source_id
  ) THEN
    RAISE EXCEPTION
      'source % was not added by version % of %; an ATI response may only be accepted against a source that version introduced',
      NEW.source_id, NEW.committed_version, NEW.investigation_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END $$;

COMMIT;
