/**
 * Which in-flight attaches `leaveDesign` must wait for.
 *
 * A record exists from `records.set` onward while `window.folio` only appears
 * after the page commits, so reading a loading record's state misreports a
 * clean canvas as unsaved edits. The drain below spans the whole load, which
 * strictly contains that misread window. Maps are injected so the selection
 * and re-check semantics stay testable under `node --test` without Electron.
 *
 * Two load outcomes, both safe to continue past:
 *
 * - The load rejects after `loadURL` failed: `attachDesign` destroys the
 *   record, so the later per-record pass finds nothing to preserve.
 * - The load rejects later (register/readonly): the record stays behind as a
 *   half-initialized zombie, and the later per-record pass still protects it
 *   through the usual dirty/undefined dialog. The drain swallows the rejection
 *   because preservation is decided there, not here.
 *
 * Over-waiting is safe but imprecise by construction: `hosts` records
 * visibility intent, not load ownership, so a hidden mid-load attach whose
 * artwork is not yet knowable is awaited even when leaving another artwork.
 * That only delays leave, never discards.
 */

export async function drainRelevantLoads(
  loading: ReadonlyMap<string, PromiseLike<unknown>>,
  hosts: ReadonlyMap<string, string>,
  id: string,
  hostId?: string
): Promise<void> {
  for (;;) {
    const pending: string[] = []
    for (const key of loading.keys()) {
      if (hostId !== undefined ? key === hostId : hosts.get(key) === id || !hosts.has(key))
        pending.push(key)
    }
    if (pending.length === 0) return
    await Promise.all(
      pending.map((key) =>
        Promise.resolve(loading.get(key)).then(
          () => undefined,
          () => undefined
        )
      )
    )
  }
}
