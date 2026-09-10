/**
 * What one design turn produced, recorded durably on the turn it belongs to.
 *
 * A design session's turn is collected and classified after the agent finishes
 * (P2.3, `apps/cli/src/design/turn-outcome.ts`): the PPTD project the agent left
 * in the workspace either committed, was kept as a candidate, or never became an
 * editable design. That verdict is stamped as
 * this payload on the history entry whose `id` is the turn-input manifest's
 * turnId, so a client reopening the session renders the same result card
 * without re-reading the workspace, and `status` survives even if the artifact
 * is later edited or deleted.
 *
 * ## Vocabulary
 *
 * - `no_artifact` — the agent finished without producing `design.pptd`; the
 *   existing canvas is untouched.
 * - `invalid` — the artifact exists but the storage-layer structure check
 *   failed (schema, kernel replay, asset integrity, secure collection). The
 *   `diagnostics` say why; nothing was repaired.
 * - `committed` — the imported document was saved through the single committer;
 *   `revisionId` is the revision that landed.
 * - `candidate` — the validated document was kept beside the design
 *   (`candidateId`) instead of being written to the current canvas. That is the
 *   verdict when the turn cannot be shown to own the canvas: the user saved while
 *   the agent worked, or the workspace project is not this turn's own output. The
 *   card offers it for an explicit apply or discard.
 * - `failed` — the turn failed before an artifact could be collected.
 * - `cancelled` — the user stopped the turn; nothing was collected or written.
 *
 * ## The thumbnail reference
 *
 * `committed` and `candidate` also carry a `thumbnail`: a reference to one small
 * PNG of the document the turn produced, captured once at collection time by the
 * desktop's render host (`apps/cli/src/design/thumbnail.ts`). It is a *reference*
 * and not bytes because the durable entry is read by every client that opens the
 * session; the card resolves the path through the design channel and shows the
 * image the same way after a reopen as it did the first time.
 *
 * The field is optional, so a `version: 1` payload written before it existed
 * still reads, and a turn that produced nothing to render — the desktop was not
 * running, the render did not land inside its deadline — honestly carries none.
 * The path is a session-workdir-relative location under `design-thumbnail/`,
 * named after the document's own content digest, so nothing here is a guess and
 * nothing needs provisioning.
 *
 * ## Trust
 *
 * The payload rides an untyped `schema.Any` field on the session history entry,
 * which performs no validation, so it arrives unvalidated from whatever wrote
 * it — including a future or a buggy client. `sanitizeDesignTurnOutcome` is the
 * only supported way to read it, and every boundary that renders a design
 * result runs it. Writers bound their own diagnostics through
 * `sanitizeDesignTurnOutcomeDiagnostics` and their own thumbnail through
 * `sanitizeDesignTurnOutcomeThumbnail`, so one rule produces both the persisted
 * and the read-back shape.
 */

export const DESIGN_TURN_OUTCOME_VERSION = 1;

/**
 * `status` values. Mirrors the durable set the spec requires be presented
 * separately (失败、取消、缺失产物、校验失败及候选待处理).
 */
export const DESIGN_TURN_OUTCOME_STATUSES = [
  'committed',
  'candidate',
  'invalid',
  'no_artifact',
  'failed',
  'cancelled',
] as const;

export type DesignTurnOutcomeStatus = (typeof DESIGN_TURN_OUTCOME_STATUSES)[number];

/** One storage-layer diagnostic: a validator code plus its human-readable message. */
export type DesignTurnOutcomeDiagnostic = {
  /** PPTD validator codes (`PPTD-Exxx`) pass through; app-side failures use `design_*`. */
  code: string;
  message: string;
};

/**
 * A reference to the one small PNG rendered for this turn's document, not the
 * image itself. `path` is relative to the session workdir and is resolved by the
 * owning machine; `width`/`height` are the real pixel dimensions of the rendered
 * file (read back from its header), never the canvas's.
 */
export type DesignTurnOutcomeThumbnail = {
  path: string;
  width: number;
  height: number;
};

export type DesignTurnOutcome = {
  version: typeof DESIGN_TURN_OUTCOME_VERSION;
  status: DesignTurnOutcomeStatus;
  /**
   * The turn-input manifest's turnId (the user turn) — the same key the frozen
   * `design-input/<turnId>/manifest.json` was written under, and the id of the
   * history entry this payload is stamped on.
   */
  turnId: string;
  /** `SessionMeta.design.artworkId`, the design store's session key. */
  artworkId: string;
  /** Present only for `candidate`: the content-addressed candidate id. */
  candidateId?: string;
  /** Present only for `committed`: the design revision that landed. */
  revisionId?: string;
  /**
   * Present when the turn produced a document (`committed`/`candidate`) *and* a
   * desktop was there to render it. Absent is the ordinary honest state, not a
   * failure: the card simply shows no image.
   */
  thumbnail?: DesignTurnOutcomeThumbnail;
  /**
   * Why the artifact was rejected, deduplicated and bounded. Absent when there
   * is nothing to explain (`committed`/`no_artifact`/`cancelled`).
   */
  diagnostics?: DesignTurnOutcomeDiagnostic[];
  /** ISO 8601, written when the outcome was classified. */
  timestamp: string;
};

export const MAX_DESIGN_TURN_OUTCOME_DIAGNOSTICS = 20;
export const MAX_DESIGN_TURN_OUTCOME_DIAGNOSTIC_CODE_LENGTH = 64;
export const MAX_DESIGN_TURN_OUTCOME_DIAGNOSTIC_MESSAGE_LENGTH = 500;
export const MAX_DESIGN_TURN_OUTCOME_ID_LENGTH = 200;
export const MAX_DESIGN_TURN_OUTCOME_TIMESTAMP_LENGTH = 64;
/**
 * The largest pixel edge a recorded thumbnail may claim. Higher than the
 * renderer's own canvas bound on purpose: a reader refuses an impossible claim
 * rather than trusting it, and the card has no reason to scale anything up.
 */
export const MAX_DESIGN_TURN_OUTCOME_THUMBNAIL_EDGE = 4096;

const STATUS_SET: ReadonlySet<string> = new Set<string>(DESIGN_TURN_OUTCOME_STATUSES);
const SHA256_RE = /^[a-f0-9]{64}$/;
/**
 * A thumbnail reference is a location this build may hand to the design channel
 * and nothing else, so it is matched exactly rather than sanitized into shape:
 * one directory, one content digest, one `.png`. That rejects an absolute path,
 * a `..` segment, a Windows drive, a UNC share and a query string without
 * needing to enumerate them — none of them can match this pattern.
 */
export const DESIGN_TURN_OUTCOME_THUMBNAIL_RE = /^design-thumbnail\/[a-f0-9]{64}\.png$/;

/**
 * The longest reference every boundary will carry. The pattern above is 82
 * characters; this is the outer bound a caller's string is held to *before* the
 * pattern is applied, so no layer ever builds a path from an unbounded string —
 * and it is one number rather than one per boundary, so the worker's request
 * schema and the desktop's IPC guard cannot drift apart.
 */
export const MAX_DESIGN_TURN_OUTCOME_THUMBNAIL_REFERENCE_LENGTH = 256;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const boundedString = (value: unknown, maxLength: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
};

/**
 * Deduplicate, bound, and truncate a diagnostic list.
 *
 * Returns `undefined` rather than `[]` when nothing survives, so callers omit
 * the field entirely instead of persisting an empty array. Two entries with the
 * same code but different messages are both kept: a validator can report one
 * code at several paths, and the message is what distinguishes them.
 */
export const sanitizeDesignTurnOutcomeDiagnostics = (
  diagnostics: unknown
): DesignTurnOutcomeDiagnostic[] | undefined => {
  if (!Array.isArray(diagnostics)) return undefined;
  const kept: DesignTurnOutcomeDiagnostic[] = [];
  const seen = new Set<string>();
  for (const entry of diagnostics) {
    if (!isRecord(entry)) continue;
    const code = boundedString(entry.code, MAX_DESIGN_TURN_OUTCOME_DIAGNOSTIC_CODE_LENGTH);
    const message = boundedString(entry.message, MAX_DESIGN_TURN_OUTCOME_DIAGNOSTIC_MESSAGE_LENGTH);
    if (code === undefined || message === undefined) continue;
    // A NUL cannot occur in either part, so the join is unambiguous. It is
    // written as an escape because a literal NUL makes git and grep treat this
    // file as binary, which hides every future diff of it.
    const key = `${code}\u0000${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push({ code, message });
    if (kept.length >= MAX_DESIGN_TURN_OUTCOME_DIAGNOSTICS) break;
  }
  return kept.length > 0 ? kept : undefined;
};

/**
 * Keep a thumbnail reference only when every part of it is usable, and drop the
 * whole thing otherwise.
 *
 * All-or-nothing rather than partially repaired: a reference with a plausible
 * path but an impossible size is not a thumbnail this build can show, and half
 * of one is not worth carrying into a card. Both facts are checked here so a
 * writer can use the same rule to decide what it may record.
 */
export const sanitizeDesignTurnOutcomeThumbnail = (
  value: unknown
): DesignTurnOutcomeThumbnail | undefined => {
  if (!isRecord(value)) return undefined;
  const path = typeof value.path === 'string' ? value.path : undefined;
  if (path === undefined || !DESIGN_TURN_OUTCOME_THUMBNAIL_RE.test(path)) return undefined;
  const edge = (candidate: unknown): number | undefined =>
    typeof candidate === 'number' &&
    Number.isInteger(candidate) &&
    candidate >= 1 &&
    candidate <= MAX_DESIGN_TURN_OUTCOME_THUMBNAIL_EDGE
      ? candidate
      : undefined;
  const width = edge(value.width);
  const height = edge(value.height);
  if (width === undefined || height === undefined) return undefined;
  return { path, width, height };
};

/**
 * Drop everything that does not describe a real design turn outcome, and
 * return the survivor. A payload this build cannot render reads as absent
 * rather than as a broken card.
 */
export const sanitizeDesignTurnOutcome = (value: unknown): DesignTurnOutcome | undefined => {
  if (!isRecord(value)) return undefined;
  if (value.version !== DESIGN_TURN_OUTCOME_VERSION) return undefined;
  if (typeof value.status !== 'string' || !STATUS_SET.has(value.status)) return undefined;
  const turnId = boundedString(value.turnId, MAX_DESIGN_TURN_OUTCOME_ID_LENGTH);
  const artworkId = boundedString(value.artworkId, MAX_DESIGN_TURN_OUTCOME_ID_LENGTH);
  const timestamp = boundedString(value.timestamp, MAX_DESIGN_TURN_OUTCOME_TIMESTAMP_LENGTH);
  if (turnId === undefined || artworkId === undefined || timestamp === undefined) return undefined;

  const candidateId =
    typeof value.candidateId === 'string' && SHA256_RE.test(value.candidateId)
      ? value.candidateId
      : undefined;
  const revisionId =
    typeof value.revisionId === 'string' && SHA256_RE.test(value.revisionId)
      ? value.revisionId
      : undefined;
  const diagnostics = sanitizeDesignTurnOutcomeDiagnostics(value.diagnostics);
  const thumbnail = sanitizeDesignTurnOutcomeThumbnail(value.thumbnail);

  return {
    version: DESIGN_TURN_OUTCOME_VERSION,
    status: value.status as DesignTurnOutcomeStatus,
    turnId,
    artworkId,
    ...(candidateId === undefined ? {} : { candidateId }),
    ...(revisionId === undefined ? {} : { revisionId }),
    ...(thumbnail === undefined ? {} : { thumbnail }),
    ...(diagnostics === undefined ? {} : { diagnostics }),
    timestamp,
  };
};
