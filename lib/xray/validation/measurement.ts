/**
 * Measurement compatibility — the mechanism behind XR-INV-005.
 *
 * A finding must not be graded `CONTRADICTED` from evidence measuring a
 * materially different quantity, scope, denominator, definition or time
 * period. Deciding that requires comparing two `Measurement` records, and this
 * module is the only place that comparison happens.
 *
 * FOUR OUTCOMES, and the distinction between the last two is the whole point:
 *
 *   COMPATIBLE       same metric and same denominator — comparable
 *   INCOMPATIBLE     metric, denominator or unit demonstrably differ
 *   UNDETERMINED     one side is measured and the other is not
 *   NOT_APPLICABLE   neither side measures anything
 *
 * `INCOMPATIBLE` is an illegality: asserting contradiction over it is the
 * error XR-INV-005 exists to stop.
 *
 * `UNDETERMINED` is NOT an illegality. A measured claim can be legitimately
 * contradicted by unmeasured testimony — a site engineer saying no section is
 * surfaced contradicts "most sections are surfaced" without carrying a number.
 * So it is reported as a warning for the Reviewer, never as a rejection. That
 * boundary is deliberate: the validator refuses illegal state and declines to
 * judge whether legal-but-ambiguous state is wise.
 *
 * `NOT_APPLICABLE` means the invariant does not engage. Contradiction between
 * two unmeasured propositions is an ordinary factual conflict.
 */

import type { Measurement } from '@/lib/xray/domain'

export type MeasurementCompatibility =
  | 'COMPATIBLE'
  | 'INCOMPATIBLE'
  | 'UNDETERMINED'
  | 'NOT_APPLICABLE'

export interface CompatibilityAssessment {
  compatibility: MeasurementCompatibility
  /** Fields that differ, when incompatible. */
  differingFields: readonly ('metric' | 'denominator' | 'unit' | 'scope' | 'definition')[]
  /** Plain-language reason, suitable for a violation message. */
  reason: string
}

const isMeasured = (m?: Measurement): m is Measurement =>
  m !== undefined &&
  (m.metric !== undefined ||
    m.value !== undefined ||
    m.unit !== undefined ||
    m.denominator !== undefined)

const differs = (a?: string, b?: string): boolean =>
  a !== undefined && b !== undefined && a !== b

/**
 * Compare a claim's measurement with a piece of evidence's.
 *
 * Only `metric`, `denominator` and `unit` can make a comparison *illegal*.
 * Differing `scope` or `definition` are reported in `differingFields` for the
 * reviewer but do not on their own make two measurements incomparable — a
 * scope difference is frequently the reconciliation rather than the conflict
 * (CAL-002).
 */
export function assessMeasurementCompatibility(
  claimMeasurement?: Measurement,
  evidenceMeasurement?: Measurement,
): CompatibilityAssessment {
  const claimMeasured = isMeasured(claimMeasurement)
  const evidenceMeasured = isMeasured(evidenceMeasurement)

  if (!claimMeasured && !evidenceMeasured) {
    return {
      compatibility: 'NOT_APPLICABLE',
      differingFields: [],
      reason: 'Neither the claim nor the evidence measures a quantity.',
    }
  }

  if (!claimMeasured || !evidenceMeasured) {
    return {
      compatibility: 'UNDETERMINED',
      differingFields: [],
      reason: claimMeasured
        ? 'The claim measures a quantity but the evidence carries no measurement, so compatibility cannot be established.'
        : 'The evidence measures a quantity but the claim carries no measurement, so compatibility cannot be established.',
    }
  }

  const a = claimMeasurement as Measurement
  const b = evidenceMeasurement as Measurement

  const blocking: ('metric' | 'denominator' | 'unit')[] = []
  if (differs(a.metric, b.metric)) blocking.push('metric')
  if (differs(a.denominator, b.denominator)) blocking.push('denominator')
  if (differs(a.unit, b.unit)) blocking.push('unit')

  const advisory: ('scope' | 'definition')[] = []
  if (differs(a.scope, b.scope)) advisory.push('scope')
  if (differs(a.definition, b.definition)) advisory.push('definition')

  if (blocking.length > 0) {
    const pairs = blocking
      .map((f) => `${f} "${a[f] ?? '—'}" vs "${b[f] ?? '—'}"`)
      .join('; ')
    return {
      compatibility: 'INCOMPATIBLE',
      differingFields: [...blocking, ...advisory],
      reason: `The claim and the evidence measure different quantities: ${pairs}.`,
    }
  }

  // Metric and denominator agree where both are stated. If neither states
  // enough to compare, compatibility is not established.
  const comparable =
    (a.metric !== undefined && b.metric !== undefined) ||
    (a.denominator !== undefined && b.denominator !== undefined)

  if (!comparable) {
    return {
      compatibility: 'UNDETERMINED',
      differingFields: advisory,
      reason:
        'Both sides carry a measurement but neither states a metric or denominator the other can be compared against.',
    }
  }

  return {
    compatibility: 'COMPATIBLE',
    differingFields: advisory,
    reason:
      advisory.length > 0
        ? `Metric and denominator agree; ${advisory.join(' and ')} differ, which may still need reconciliation.`
        : 'Metric and denominator agree.',
  }
}
