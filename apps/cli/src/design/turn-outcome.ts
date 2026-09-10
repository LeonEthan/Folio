/**
 * Design turn outcome collection (P2.3).
 *
 * After a design-session turn finishes, the daemon looks at what the agent left
 * in the session workdir and classifies it into one durable verdict:
 *
 *   missing design.pptd            -> no_artifact (canvas untouched)
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
 * - Validation is storage-layer structure only — schema, Bento kernel replay,
 *   asset integrity, and the intake's own fail-closed snapshot rules. Semantic
 *   checks the agent could have run itself (its `finalize.mjs`, preview
 *   rendering, taste) are not re-run here, nothing is repaired, and no paid
 *   call is retried (agent-naive; root `AGENTS.md`).
 * - The design store is the single committer. This module never writes
 *   `design.json` itself: it asks `designOperation` to save against the frozen
 *   baseline, and the store's `DESIGN_CONFLICT` is what turns a lost race into
 *   a candidate.
 * - Idempotent per turn: an outcome already stamped on the turn is the truth,
 *   and a re-run does not re-collect, re-commit, or re-write a candidate.
 */

import { AuthoringSnapshotError, collectAuthoring, intakeAuthoring } from '@folio/design-authoring';
import {
  DESIGN_TURN_OUTCOME_VERSION,
  sanitizeDesignTurnOutcome,
  sanitizeDesignTurnOutcomeDiagnostics,
  type DesignTurnOutcome,
  type DesignTurnOutcomeDiagnostic,
  type SessionHistoryInput,
  type SessionMeta,
} from '@lody/shared';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getLodyDataDir } from '@lody/shared/node/installation-profile';
import {
  sniffStaticV1FontMime,
  sniffStaticV1ImageMime,
} from '../../../../packages/design-bento/vendor/packages/contracts/src/static-v1';
import { designOperation, saveDesignCandidate } from './store';
import {
  DESIGN_TURN_INPUT_DIRNAME,
  DESIGN_TURN_MANIFEST_FILENAME,
  type DesignTurnManifest,
} from './turn-input';

/** The design artifact entry, at the workdir root (P2.1 contract). */
export const DESIGN_ARTIFACT_ENTRY = 'design.pptd';
const SHA256_RE = /^[a-f0-9]{64}$/;
const MAX_ASSET_BYTES = 16 * 1024 * 1024;

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

type ManifestPresent =
  | { kind: 'unreadable'; message: string }
  | { kind: 'ok'; manifest: DesignTurnManifest };
type ManifestRead = { kind: 'missing' } | ManifestPresent;

async function readTurnManifest(workdir: string, turnId: string): Promise<ManifestRead> {
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

/**
 * The store admits exactly these MIME types, sniffed from the bytes themselves
 * (`store.ts` cross-checks the same way) — so a font is never served as an
 * image and a mislabeled asset fails loudly here instead of being repaired.
 */
function buildAssetDataUris(assets: Map<string, Uint8Array>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [hash, bytes] of assets) {
    const mime = sniffStaticV1ImageMime(bytes) ?? sniffStaticV1FontMime(bytes);
    if (mime === null) throw Error(`unsupported asset bytes for ${hash}`);
    if (bytes.byteLength > MAX_ASSET_BYTES) throw Error(`asset exceeds 16 MiB: ${hash}`);
    out[hash] = `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
  }
  return out;
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
 * Decide which verdict this turn gets, then record it.
 *
 * `classify` returns the outcome for a turn that reached collection; the two
 * terminal entry points below supply their own (cancelled / failed) without
 * touching the artifact. Everything before that — the design gate, the manifest
 * anchor, idempotency — is shared so the three paths cannot disagree.
 */
async function recordTurnOutcome(
  ctx: DesignTurnOutcomeContext,
  classify: (args: {
    artworkId: string;
    workdir: string;
    dataRoot: string;
    manifestFile: ManifestPresent;
  }) => Promise<DesignTurnOutcome>
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

  const manifestFile = await readTurnManifest(workdir, ctx.turnId);
  if (manifestFile.kind === 'missing') return { status: 'skipped', reason: 'no_manifest' };

  const outcome = await classify({ artworkId, workdir, dataRoot, manifestFile });
  if (!(await stampOutcome(ctx, outcome))) {
    // The commit (if any) happened, but the turn's entry is gone — report that
    // instead of claiming a card that will never render.
    return { status: 'skipped', reason: 'entry_missing' };
  }
  return { status: 'recorded', outcome };
}

/**
 * Collect this turn's artifact, classify it, and commit, keep, or reject it.
 */
export async function collectDesignTurnOutcome(
  ctx: DesignTurnOutcomeContext
): Promise<DesignTurnAttempt> {
  return await recordTurnOutcome(ctx, async ({ artworkId, workdir, dataRoot, manifestFile }) => {
    const base = outcomeBase(ctx, artworkId);
    const invalid = (entries: readonly DesignTurnOutcomeDiagnostic[]): DesignTurnOutcome => {
      const bounded = diagnostics(entries);
      return {
        ...base,
        status: 'invalid',
        ...(bounded === undefined ? {} : { diagnostics: bounded }),
      };
    };

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
    const entryFile = path.join(workdir, DESIGN_ARTIFACT_ENTRY);
    try {
      await lstat(entryFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { ...base, status: 'no_artifact' };
      }
      return invalid([{ code: 'design_collect_failed', message: errorMessage(error) }]);
    }

    let snapshot: Map<string, Uint8Array>;
    try {
      snapshot = collectAuthoring(workdir);
    } catch (error) {
      // Symlink/hardlink/escape/non-regular entry: the artifact exists but is
      // not a snapshot we are willing to import. Never repaired, never retried.
      return invalid([
        {
          code:
            error instanceof AuthoringSnapshotError
              ? 'design_collect_rejected'
              : 'design_collect_failed',
          message: errorMessage(error),
        },
      ]);
    }

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
    let content: { doc: Record<string, unknown>; assets: Record<string, string> };
    try {
      content = {
        doc: intake.document as unknown as Record<string, unknown>,
        assets: buildAssetDataUris(intake.assets),
      };
    } catch (error) {
      return invalid([{ code: 'design_asset_failed', message: errorMessage(error) }]);
    }

    try {
      const saved = await designOperation(dataRoot, {
        operation: 'save',
        sessionId: artworkId,
        baseRevisionId: manifestFile.manifest.baselineRevisionId,
        content,
      });
      return { ...base, status: 'committed', revisionId: saved.revisionId };
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'DESIGN_CONFLICT') {
        // Observable, never a silent success: the canvas was not written.
        return invalid([{ code: 'design_store_failed', message: errorMessage(error) }]);
      }
    }

    // The user saved while the agent worked. Their canvas stays current; the
    // validated document waits beside it for an explicit adopt or discard.
    try {
      const candidate = await saveDesignCandidate(dataRoot, {
        artworkId,
        turnId: ctx.turnId,
        baselineRevisionId: manifestFile.manifest.baselineRevisionId,
        createdAt: base.timestamp,
        content,
      });
      return { ...base, status: 'candidate', candidateId: candidate.candidateId };
    } catch (error) {
      return invalid([{ code: 'design_candidate_failed', message: errorMessage(error) }]);
    }
  });
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
    if (ctx.status === 'cancelled') return { ...base, status: 'cancelled' };
    const entries = diagnostics([
      { code: 'design_turn_failed', message: ctx.message ?? 'the turn failed' },
    ]);
    return {
      ...base,
      status: 'failed',
      ...(entries === undefined ? {} : { diagnostics: entries }),
    };
  });
}
