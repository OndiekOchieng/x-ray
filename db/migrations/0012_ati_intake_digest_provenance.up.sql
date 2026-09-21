BEGIN;

-- Who computed an intake's digest, and what shape a digest has.
--
-- 0009 gave `ati_response_intakes` a bare `content_hash text`. That is not
-- enough for the 10d bridge, which must refuse to research material that
-- cannot be tied to its intake: "the digest matches" means something different
-- when X-Ray computed it from bytes it held than when an institution stated it
-- in a covering letter. Without this column the two are indistinguishable, and
-- a stated digest would be silently readable as a verified one (ADR-0018,
-- release 10c §H).
--
-- COMPUTED — X-Ray hashed content it actually had at receipt time.
-- SUPPLIED — someone else stated the digest. Recorded as their claim.
ALTER TABLE ati_response_intakes ADD COLUMN content_hash_origin text
  CHECK (content_hash_origin IN ('COMPUTED','SUPPLIED'));

-- A digest with no stated provenance is the failure above; provenance with no
-- digest describes nothing.
ALTER TABLE ati_response_intakes ADD CONSTRAINT digest_states_its_provenance
  CHECK ((content_hash IS NULL) = (content_hash_origin IS NULL));

-- One normalized representation, self-describing, so 10d compares like with
-- like and never has to guess an algorithm. v0 is sha256 only: adding another
-- is deliberately a migration rather than an inference at read time.
ALTER TABLE ati_response_intakes ADD CONSTRAINT digest_is_normalized
  CHECK (content_hash IS NULL OR content_hash ~ '^sha256:[0-9a-f]{64}$');

COMMIT;
