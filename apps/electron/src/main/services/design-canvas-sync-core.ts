/**
 * Whether an already-open design editor must be torn down and re-created from
 * the store (P2-A2).
 *
 * The editor loads its document once and remembers the revision it may save
 * against. A turn that commits through the daemon writes a new revision
 * without going through that instance, so the open view keeps showing — and
 * would later try to save — the superseded document. Adopt already reloads on
 * success; a committed turn needs the same decision.
 *
 * A canvas that is not open is not stale: the next attach reads the store, and
 * inventing a reload would create a native view over whatever the user is
 * actually looking at.
 */
export function openDesignCanvasNeedsReload(
  loadedRevisionId: string | undefined,
  storeRevisionId: string
): boolean {
  return loadedRevisionId !== undefined && loadedRevisionId !== storeRevisionId
}
