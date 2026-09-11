/**
 * Design turn outcome collection (P2.3).
 *
 * After a design-session turn finishes, the daemon looks at what the agent left
 * in the session workdir and classifies it into one durable verdict:
 *
 *   missing design.pptd            -> no_artifact (canvas untouched)
 *   unchanged since send          -> no_artifact (nothing this turn produced)
 *   structure/collection failure   -> invalid (+ bounded diagnostics)
 *   imported and saved             -> committed (revisionId)
 *   baseline moved under us        -> candidate  (kept beside the canvas)
 *   cancelled / turn failed        -> cancelled / failed (nothing collected)
 *
 * The verdict is stamped as a `DesignTurnOutcome` on the history entry whose id
 * is the turn-input manifest's turnId, so it survives reopen and P2.5 can render
 * a result card without touching the workspace again.
 *
 * Boundaries this module deliberately keeps:
 *
 * - The manifest `design-input/<turnId>/manifest.json` written by P2.2
 *   (`./turn-input.ts`) is the integrity anchor. No manifest means no design
 *   turn input was frozen (pre-P2.2 session, internal turn, or the meta-read
 *   branch), so there is nothing to report and nothing is written.
 * - A turn that produced nothing is not a turn that found something. The
 *   workspace project is compared against the manifest's `artifactAtSend`
 *   (`./artifact.ts`): a byte-identical project was not written by this turn, so
 *   it is never committed and never credited to this turn. Without that check a
 *   turn whose agent wrote nothing would re-import the previous turn's project
 *   and report it as its own.
 * - Proven unchanged projects return before import or canvas comparison. Their
 *   files, existing candidates, and historical receipts remain untouched. A
 *   missing dispatch digest is not proof of no change: legacy manifests keep
 *   their existing validation and atomic save path. An explicit resubmission
 *   needs separate attempt evidence; identical rewrites do not establish it.
 * - Validation is storage-layer structure only — schema, Bento kernel replay,
 *   asset integrity, and the intake's own fail-closed snapshot rules. Semantic
 *   checks the agent could have run itself (its `finalize.mjs`, preview
 *   rendering, taste) are not re-run here, nothing is repaired, and no paid
 *   call is retried (agent-naive; root `AGENTS.md`).
 * - The design store is the single committer. This module never writes
 *   `design.json` itself: it asks `designOperation` to save against the frozen
 *   baseline, and the store's `DESIGN_CONFLICT` is what turns a lost race into
 *   a candidate. `DESIGN_BUSY` — the store's lock held past its deadline — is
 *   read the same way, because it means a writer was in there, so this turn's
 *   document may be behind the canvas.
 * - Idempotent per turn: an outcome already stamped on the turn is the truth,
 *   and a re-run does not re-collect, re-commit, or re-write a candidate.
 * - A verdict survives losing its stamp, up to the reach of a later collection.
 *   The verdict is written to the turn's own directory first
 *   (`design-input/<turnId>/receipt.json`, P2.2's `writeDesignTurnReceipt`) and
 *   stamped on the history entry second, so of the two durable effects of one
 *   turn — the store write and the history write — it is the second that can be
 *   lost without losing the verdict: a collection that finds a receipt stamps
 *   what it says instead of deciding again, and nothing is rendered twice.
 *   Two limits come with that, and both are stated rather than papered over. The
 *   stretch *before* the receipt is written has nothing to recover from: a daemon
 *   that dies between the store write and the receipt (or before either) meets no
 *   receipt when it finalizes that turn again, so the turn is decided again — safe,
 *   because the store's CAS means a canvas that moved is never overwritten, but not
 *   identical, since a document this turn already committed comes back as a
 *   candidate if the user saved in between. And a stamp that fails on a *live*
 *   daemon is not recovered at all: it is logged, the turn finalizes, and nothing
 *   re-runs this stage for a turn that already ended (the canvas holds the truth;
 *   the card is missing).
 * - A receipt is app bookkeeping that sits in the agent's own workspace, which is
 *   a boundary rather than a guarantee. `design-input/<turnId>/` is the session
 *   workdir, so an agent can write the file — the same standing as the manifest
 *   beside it (`./turn-input.ts`), and the same reason this module validates every
 *   byte it reads instead of trusting the directory. What a forged receipt buys is
 *   bounded, and worth stating exactly: this module never writes `design.json`
 *   from it, the payload is only ever read through `sanitizeDesignTurnOutcome`,
 *   and both ids have to match the collection in hand (the same turn of the same
 *   artwork), so the most it can do is mislabel that turn's own card and hide that
 *   turn's artifact. It cannot touch the canvas, another turn, or another artwork.
 * - A thumbnail is an addition, not a verdict. The verdict is stamped *before*
 *   the render, and the captured reference is added to that same stamped verdict
 *   afterwards (`./thumbnail.ts`); when there is none — no desktop, a refused or
 *   unverifiable render — the outcome is exactly as true as it was before. No
 *   failure here can change a status, and nothing is ever retried.
 */

import { intakeAuthoring } from '@folio/design-authoring';
import {
  DESIGN_TURN_OUTCOME_VERSION,
  sanitizeDesignTurnOutcome,
  sanitizeDesignTurnOutcomeDiagnostics,
  type DesignTurnOutcome,
  type DesignTurnOutcomeDiagnostic,
  type DesignTurnOutcomeThumbnail,
  type SessionHistoryInput,
  type SessionMeta,
} from '@lody/shared';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getLodyDataDir } from '@lody/shared/node/installation-profile';
import { DESIGN_ARTIFACT_ENTRY, readDesignArtifact } from './artifact';
import { buildAssetDataUris } from './authoring-assets';
import { DESIGN_BUSY, type DesignLockTiming } from './lock';
import type { DesignRenderQueue } from './render-output';
import { designOperation, saveDesignCandidate } from './store';
import { captureDesignThumbnail, type DesignThumbnailSubject } from './thumbnail';
import {
  DESIGN_TURN_INPUT_DIRNAME,
  DESIGN_TURN_MANIFEST_FILENAME,
  isDesignTurnId,
  readDesignTurnReceipt,
  writeDesignTurnReceipt,
  type DesignTurnManifest,
} from './turn-input';

const SHA256_RE = /^[a-f0-9]{64}$/;

/**
 * The part of `SessionDocument` this module needs. Structural, so the real
 * document satisfies it and a test can hand over the smallest possible stand-in.
 */
export interface DesignTurnOutcomeSession {
  getMetaState(): Promise<SessionMeta | undefined>;
  getHistory(): Promise<SessionHistoryInput[]>;
  updateHistory(update: (history: SessionHistoryInput[]) => SessionHistoryInput[]): Promise<void>;
}

export interface DesignTurnOutcomeContext {
  sessionId: string;
  sessionDoc: DesignTurnOutcomeSession;
  /**
   * The turn-input manifest's turnId — the user turn, and the id of the history
   * entry the outcome is stamped on. Internal turns have none and never reach
   * this module.
   */
  turnId: string;
  /** Absolute session workdir (`chats/<sessionId>`); defaults to the data-root layout. */
  workdir?: string;
  /** Test seam: defaults to the daemon data root (the root the workdir lives under). */
  dataRoot?: string;
  /**
   * Where to get the thumbnail the result card shows, when this daemon has a
   * desktop that can render one. Absent means no thumbnail is captured — the
   * same ordinary absence as a machine with no desktop polling, never an error.
   */
  thumbnail?: { host: DesignRenderQueue; machineId: string };
  /**
   * Test seam: timing for the store's write lock, so a collection that loses to
   * a held lock can be exercised without waiting out the real deadline
   * (`./store.ts`, `./lock.ts`). Production passes nothing.
   */
  lock?: DesignLockTiming;
  /** Test seam: defaults to the wall clock. */
  now?: () => Date;
}

export type DesignTurnSkipReason =
  | 'not_design'
  | 'session_doc_unreadable'
  | 'no_manifest'
  | 'already_recorded'
  | 'entry_missing';

export type DesignTurnAttempt =
  | { status: 'recorded'; outcome: DesignTurnOutcome }
  | { status: 'skipped'; reason: DesignTurnSkipReason };

const outcomeBase = (
  ctx: DesignTurnOutcomeContext,
  artworkId: string
): Omit<DesignTurnOutcome, 'status'> => ({
  version: DESIGN_TURN_OUTCOME_VERSION,
  turnId: ctx.turnId,
  artworkId,
  timestamp: (ctx.now ?? (() => new Date()))().toISOString(),
});

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const diagnostics = (
  entries: readonly DesignTurnOutcomeDiagnostic[]
): DesignTurnOutcomeDiagnostic[] | undefined => sanitizeDesignTurnOutcomeDiagnostics(entries);

/**
 * Render the collected document for the result card.
 *
 * A function rather than a context object because the document only exists once
 * the collector has imported it. Resolves `undefined` for every reason there is
 * no thumbnail — no desktop, a refused or unverifiable render, a document with
 * no canvas — and never rejects.
 */
type ThumbnailCapture = (
  subject: DesignThumbnailSubject
) => Promise<DesignTurnOutcomeThumbnail | undefined>;

type ManifestPresent =
  | { kind: 'unreadable'; message: string }
  | { kind: 'ok'; manifest: DesignTurnManifest };
type ManifestRead = { kind: 'missing' } | ManifestPresent;

async function readTurnManifest(workdir: string, turnId: string): Promise<ManifestRead> {
  // A turn whose id cannot name a turn directory never had a frozen manifest
  // (P2.2 refuses to materialize one), so there is nothing to read and no path
  // to build out of it.
  if (!isDesignTurnId(turnId)) return { kind: 'missing' };
  const file = path.join(workdir, DESIGN_TURN_INPUT_DIRNAME, turnId, DESIGN_TURN_MANIFEST_FILENAME);
  let bytes: string;
  try {
    bytes = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'missing' };
    return { kind: 'unreadable', message: errorMessage(error) };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes);
  } catch (error) {
    return { kind: 'unreadable', message: `manifest is not valid JSON: ${errorMessage(error)}` };
  }
  const manifest = parsed as Partial<DesignTurnManifest> | null;
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    typeof manifest.baselineRevisionId !== 'string' ||
    !SHA256_RE.test(manifest.baselineRevisionId)
  ) {
    return { kind: 'unreadable', message: 'manifest does not carry a usable baselineRevisionId' };
  }
  return { kind: 'ok', manifest: manifest as DesignTurnManifest };
}

/** The outcome already stamped on this turn, if any. */
const recordedOutcome = (history: readonly SessionHistoryInput[], turnId: string) => {
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (!entry || entry.id !== turnId) continue;
    return sanitizeDesignTurnOutcome(entry.designOutcome);
  }
  return undefined;
};

/**
 * Write the verdict onto this turn's history entry, keeping the first one.
 *
 * Returns false when the turn's entry is gone (the user rewound or resent the
 * turn before finalization landed) — the caller reports that instead of
 * claiming a card it could not write.
 */
async function stampOutcome(
  ctx: DesignTurnOutcomeContext,
  outcome: DesignTurnOutcome
): Promise<boolean> {
  let stamped = false;
  await ctx.sessionDoc.updateHistory((history) => {
    for (let i = history.length - 1; i >= 0; i--) {
      const entry = history[i];
      if (!entry || entry.id !== ctx.turnId) continue;
      // A recorded outcome is the truth; a re-run must not repaint it.
      if (entry.designOutcome !== undefined && entry.designOutcome !== null) return history;
      const next = [...history];
      next[i] = { ...entry, designOutcome: outcome };
      stamped = true;
      return next;
    }
    return history;
  });
  return stamped;
}

/**
 * Add a captured thumbnail to the verdict this collection just stamped.
 *
 * Only that verdict may be amended: the entry's payload must still be exactly
 * the one this collection wrote — no repaint, no re-derivation — and only its
 * `thumbnail` is set. An entry that changed meanwhile (a rewind, a resend, a
 * different finalizer) and an entry that is gone are both left alone, because
 * the image is an addition to a verdict that is already recorded and true.
 */
async function amendOutcomeThumbnail(
  ctx: DesignTurnOutcomeContext,
  outcome: DesignTurnOutcome,
  thumbnail: DesignTurnOutcomeThumbnail
): Promise<void> {
  const stamped = sanitizeDesignTurnOutcome(outcome);
  if (stamped === undefined) return;
  const expected = JSON.stringify(stamped);
  await ctx.sessionDoc.updateHistory((history) => {
    for (let i = history.length - 1; i >= 0; i--) {
      const entry = history[i];
      if (!entry || entry.id !== ctx.turnId) continue;
      const recorded = sanitizeDesignTurnOutcome(entry.designOutcome);
      if (recorded === undefined || JSON.stringify(recorded) !== expected) return history;
      const next = [...history];
      next[i] = { ...entry, designOutcome: { ...recorded, thumbnail } };
      return next;
    }
    return history;
  });
}

/**
 * What one collection decided, and what is left to do about it.
 *
 * `outcome` is the verdict, final as soon as it is returned. `capture` renders
 * the document the verdict is about, and is only called once that verdict is
 * durable; it is absent for every verdict with no document to render
 * (`no_artifact`, `invalid`, `cancelled`, `failed`).
 */
interface DesignTurnCollection {
  outcome: DesignTurnOutcome;
  capture?: () => Promise<DesignTurnOutcomeThumbnail | undefined>;
}

/**
 * Decide which verdict this turn gets, then record it.
 *
 * `classify` returns the verdict for a turn that reached collection; the two
 * terminal entry points below supply their own (cancelled / failed) without
 * touching the artifact. Everything around that — the design gate, the manifest
 * anchor, idempotency, the receipt, the stamp, the render — is shared so the
 * three paths cannot disagree.
 */
async function recordTurnOutcome(
  ctx: DesignTurnOutcomeContext,
  classify: (args: {
    artworkId: string;
    workdir: string;
    dataRoot: string;
    manifestFile: ManifestPresent;
    /** Render the document just collected; `undefined` whenever none could be. */
    thumbnails: ThumbnailCapture;
  }) => Promise<DesignTurnCollection>
): Promise<DesignTurnAttempt> {
  const dataRoot = ctx.dataRoot ?? getLodyDataDir();
  const workdir = ctx.workdir ?? path.join(dataRoot, 'chats', ctx.sessionId);

  let meta: SessionMeta | undefined;
  let history: SessionHistoryInput[];
  try {
    meta = await ctx.sessionDoc.getMetaState();
    if (!meta?.design) return { status: 'skipped', reason: 'not_design' };
    // Read after the gate: a non-design session pays nothing for this stage.
    history = await ctx.sessionDoc.getHistory();
  } catch {
    // Nothing durable can be said about a session doc we cannot read, and a
    // half-written card is worse than none.
    return { status: 'skipped', reason: 'session_doc_unreadable' };
  }
  const artworkId = meta.design.artworkId;
  if (recordedOutcome(history, ctx.turnId)) {
    return { status: 'skipped', reason: 'already_recorded' };
  }

  // A receipt means this turn's verdict was already reached and written down,
  // and only the history stamp was lost — the daemon died between the two writes,
  // and this is it finalizing that turn again. Stamping what it says is the whole
  // recovery: nothing is collected, committed, or rendered a second time — so a
  // turn can never commit twice, and a revision it already committed can never
  // come back as a candidate. Both ids are checked because the file is in the
  // agent's workspace (see the module doc): it may only speak for the turn it
  // names, and for this artwork.
  const receipt = await readDesignTurnReceipt(workdir, ctx.turnId);
  if (receipt !== undefined && receipt.turnId === ctx.turnId && receipt.artworkId === artworkId) {
    if (!(await stampOutcome(ctx, receipt))) return { status: 'skipped', reason: 'entry_missing' };
    return { status: 'recorded', outcome: receipt };
  }

  const manifestFile = await readTurnManifest(workdir, ctx.turnId);
  if (manifestFile.kind === 'missing') return { status: 'skipped', reason: 'no_manifest' };

  // Bound here because both the identity (`meta`, already gated on `design`
  // above) and the resolved paths are in scope; `captureDesignThumbnail` is
  // handed only the document, which only the collector has.
  const capture = ctx.thumbnail;
  const thumbnails: ThumbnailCapture = async (subject) =>
    capture === undefined
      ? undefined
      : await captureDesignThumbnail(
          {
            host: capture.host,
            machineId: capture.machineId,
            artworkId,
            workdir,
            dataRoot,
            name: meta.title?.trim() || artworkId,
            userId: meta.userId,
            now: ctx.now,
          },
          subject
        );

  const collected = await classify({ artworkId, workdir, dataRoot, manifestFile, thumbnails });

  try {
    // Written before the stamp, so the two durable effects of this turn — the
    // store write that is already done, and the history write that follows —
    // are recoverable as a pair.
    await writeDesignTurnReceipt(workdir, ctx.turnId, collected.outcome);
  } catch {
    // A receipt that cannot be written is a recovery aid that was not stored,
    // not a verdict that was not reached. The stamp still happens; if *it* is
    // then lost, this turn is simply decided again, exactly as it was before
    // the receipt existed. Losing a reached verdict — or a commit — to a
    // bookkeeping file would be the worse failure.
  }

  if (!(await stampOutcome(ctx, collected.outcome))) {
    // The commit (if any) happened, but the turn's entry is gone — report that
    // instead of claiming a card that will never render.
    return { status: 'skipped', reason: 'entry_missing' };
  }

  // Rendered only now, against a verdict that is already durable. A thumbnail
  // is an addition to that verdict, not a condition for it: whatever happens
  // here, and whatever happens to the image afterwards, the entry already says
  // what this turn did.
  const thumbnail = collected.capture === undefined ? undefined : await collected.capture();
  if (thumbnail !== undefined) {
    await amendOutcomeThumbnail(ctx, collected.outcome, thumbnail).catch(() => undefined);
  }
  return {
    status: 'recorded',
    outcome: thumbnail === undefined ? collected.outcome : { ...collected.outcome, thumbnail },
  };
}

/** The imported half of a design store write: the document and its assets. */
type DesignTurnContent = { doc: Record<string, unknown>; assets: Record<string, string> };

/**
 * Collect this turn's artifact, classify it, and commit, keep, or reject it.
 */
export async function collectDesignTurnOutcome(
  ctx: DesignTurnOutcomeContext
): Promise<DesignTurnAttempt> {
  return await recordTurnOutcome(
    ctx,
    async ({ artworkId, workdir, dataRoot, manifestFile, thumbnails }) => {
      const base = outcomeBase(ctx, artworkId);
      const invalid = (entries: readonly DesignTurnOutcomeDiagnostic[]): DesignTurnCollection => {
        const bounded = diagnostics(entries);
        return {
          outcome: {
            ...base,
            status: 'invalid',
            ...(bounded === undefined ? {} : { diagnostics: bounded }),
          },
        };
      };
      /** A verdict plus the document it is about, which is rendered after the stamp. */
      const withCapture = (
        outcome: DesignTurnOutcome,
        content: DesignTurnContent
      ): DesignTurnCollection => ({ outcome, capture: async () => await thumbnails(content) });

      if (manifestFile.kind === 'unreadable') {
        return invalid([{ code: 'design_manifest_unreadable', message: manifestFile.message }]);
      }
      if (manifestFile.manifest.turnId !== ctx.turnId) {
        return invalid([
          {
            code: 'design_manifest_mismatch',
            message: `manifest turnId ${JSON.stringify(manifestFile.manifest.turnId)} does not match this turn`,
          },
        ]);
      }

      // Missing entry artifact: the agent finished without producing an editable
      // design. The current canvas is left exactly as it was.
      const artifact = await readDesignArtifact(workdir);
      if (artifact.status === 'absent') return { outcome: { ...base, status: 'no_artifact' } };
      if (artifact.status === 'rejected') {
        // Symlink/hardlink/escape/non-regular entry: the artifact exists but is
        // not a snapshot we are willing to import. Never repaired, never retried.
        return invalid([
          {
            code:
              artifact.rejectedBy === 'snapshot'
                ? 'design_collect_rejected'
                : 'design_collect_failed',
            message: artifact.message,
          },
        ]);
      }

      // Only a matching dispatch digest proves that this turn produced nothing.
      // Do not import or offer an earlier project's contents just because the
      // current canvas differs. Legacy manifests without this evidence continue
      // through the existing validation and atomic version check below.
      const unchangedSinceSend =
        manifestFile.manifest.artifactAtSend?.status === 'present' &&
        manifestFile.manifest.artifactAtSend.digest === artifact.digest;
      if (unchangedSinceSend) return { outcome: { ...base, status: 'no_artifact' } };

      /**
       * Keep a validated document beside the canvas for an explicit adopt or
       * discard. Never a commit: this turn's evidence that the canvas is its to
       * write has not held up.
       */
      const keepCandidate = async (content: DesignTurnContent): Promise<DesignTurnCollection> => {
        try {
          const candidate = await saveDesignCandidate(dataRoot, {
            artworkId,
            turnId: ctx.turnId,
            baselineRevisionId: manifestFile.manifest.baselineRevisionId,
            createdAt: base.timestamp,
            content,
          });
          // A candidate is on disk and adoptable, so it renders exactly as a
          // commit would: the card shows what adopting it would put on the canvas.
          return withCapture(
            { ...base, status: 'candidate', candidateId: candidate.candidateId },
            content
          );
        } catch (error) {
          return invalid([{ code: 'design_candidate_failed', message: errorMessage(error) }]);
        }
      };

      const snapshot = artifact.snapshot;
      const intake = intakeAuthoring(DESIGN_ARTIFACT_ENTRY, snapshot);
      if (intake.status === 'invalid') {
        return invalid(intake.diagnostics.map(({ code, message }) => ({ code, message })));
      }
      if (intake.status === 'unsupported') {
        return invalid(intake.issues.map(({ code, message }) => ({ code, message })));
      }

      // The store re-parses `doc` with its own schema, so this cast asserts
      // nothing: it only bridges the imported BentoDoc type to the request input
      // type, exactly as the intake → store integration test does.
      let content: DesignTurnContent;
      try {
        content = {
          doc: intake.document as unknown as Record<string, unknown>,
          assets: buildAssetDataUris(intake.assets),
        };
      } catch (error) {
        return invalid([{ code: 'design_asset_failed', message: errorMessage(error) }]);
      }

      try {
        const saved = await designOperation(
          dataRoot,
          {
            operation: 'save',
            sessionId: artworkId,
            baseRevisionId: manifestFile.manifest.baselineRevisionId,
            content,
          },
          { lock: ctx.lock }
        );
        // The document is offered for rendering only together with a committed
        // verdict: a thumbnail of a document that was not written would describe
        // a canvas that does not exist.
        return withCapture({ ...base, status: 'committed', revisionId: saved.revisionId }, content);
      } catch (error) {
        if (
          !(error instanceof Error) ||
          (error.message !== 'DESIGN_CONFLICT' && error.message !== DESIGN_BUSY)
        ) {
          // Observable, never a silent success: the canvas was not written.
          return invalid([{ code: 'design_store_failed', message: errorMessage(error) }]);
        }
      }

      // The user saved while the agent worked — or another writer held the
      // artwork's lock past its deadline, which means the canvas may be moving
      // under us right now. Either way their canvas stays current; the validated
      // document waits beside it for an explicit adopt or discard.
      return await keepCandidate(content);
    }
  );
}

/**
 * Record a turn that never reached collection: the user stopped it, or
 * generation failed. Nothing is collected, committed, or kept as a candidate —
 * a cancelled turn must not change the canvas behind the user's back.
 */
export async function recordDesignTurnTerminalOutcome(
  ctx: DesignTurnOutcomeContext & { status: 'cancelled' | 'failed'; message?: string }
): Promise<DesignTurnAttempt> {
  return await recordTurnOutcome(ctx, async ({ artworkId }) => {
    const base = outcomeBase(ctx, artworkId);
    if (ctx.status === 'cancelled') return { outcome: { ...base, status: 'cancelled' } };
    const entries = diagnostics([
      { code: 'design_turn_failed', message: ctx.message ?? 'the turn failed' },
    ]);
    return {
      outcome: {
        ...base,
        status: 'failed',
        ...(entries === undefined ? {} : { diagnostics: entries }),
      },
    };
  });
}
