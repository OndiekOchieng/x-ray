/**
 * The seam the cross-realm error check reads (#20, 20k).
 *
 * `instrumentation.ts` publishes one of these on `globalThis` when
 * `XRAY_REALM_CHECK=1`, so a route handler can hold an object built in the
 * host bundle and ask what its own bundle makes of it. Without the variable
 * nothing is published and nothing reads it.
 *
 * `Symbol.for`, for the same reason the provider seam uses one: a registered
 * symbol is shared by every copy of this module in the process, which is
 * exactly the property under test.
 *
 * PURITY: a type and a symbol. No I/O, no provider, no secret.
 */

import type { AdapterFailure } from '@/lib/xray/capability'

export const REALM_PROBE = Symbol.for('xray.host.realm-probe')

export interface RealmProbe {
  /** The host bundle's own `AdapterFailure` class object. */
  readonly adapterFailureClass: typeof AdapterFailure
  /** A `PERMANENT` failure constructed where the provider adapters construct theirs. */
  readonly permanentFailure: () => AdapterFailure
}
