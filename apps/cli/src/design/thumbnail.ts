/**
 * The one small image the result card shows for a design turn (P2.6).
 *
 * Story 20 asks the card to show the candidate's rendering, and the durable
 * `designOutcome` carries a *reference* to it rather than the bytes, because
 * every client that opens the session reads that entry. This module produces
 * that reference: it hands the document the turn just produced to the desktop's
 * render host, scaled down, and records where the file landed.
 *
 * Four boundaries shape it:
 *
 * - **The document is already in hand.** The collection that calls this has just
 *   imported and committed the artifact, so nothing is re-read from the
 *   workspace and no second intake runs: what is rendered is exactly what was
 *   stored.
 * - **A thumbnail is optional and its absence is ordinary.** No desktop polling,
 *   a queue that is full, a render that did not land in time — each is a `return
 *   undefined`, never an error and never a retry. The turn's outcome is already
 *   true without it (`agent-naive`; root `AGENTS.md`).
 * - **The file is named after its content.** `design-thumbnail/<digest>.png`
 *   using the store's own canonical digest, so two turns that produced the same
 *   document share one file, a re-collection overwrites it with identical bytes,
 *   and a reader can check the reference exactly rather than approximately.
 * - **The reference stays inside the session workdir.** The path recorded is
 *   relative to that workdir and is verified after the render, exactly as the
 *   agent's preview path is.
 */

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, rmdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import {
  sanitizeDesignTurnOutcomeThumbnail,
  type DesignRenderHostWork,
  type DesignTurnOutcomeThumbnail,
} from '@lody/shared';
import {
  DESIGN_PREVIEW_STAGE_DIRNAME,
  MAX_STAGED_PAYLOAD_BYTES,
  publishBytesAtomic,
  verifyRenderedPng,
  type DesignRenderQueue,
} from './render-output';
import { DESIGN_THUMBNAIL_TIMEOUT_MS } from './render-host';
import { canonicalContentBytes, type DesignPayload } from './store';

/** Where thumbnails live, relative to the session workdir. Mirrors the shared reference pattern. */
export const DESIGN_THUMBNAIL_DIRNAME = 'design-thumbnail';

/** The longest edge of a recorded thumbnail: small enough to keep one per turn. */
export const MAX_THUMBNAIL_EDGE = 480;

export interface DesignThumbnailContext {
  /** The queue the desktop polls. */
  host: DesignRenderQueue;
  /** The artwork this document belongs to — the payload's `association.sessionId`. */
  artworkId: string;
  /** Absolute session workdir (`chats/<sessionId>`): the payload's home and the reference's base. */
  workdir: string;
  /** The daemon data root, where staged payloads wait. */
  dataRoot: string;
  /** The artwork's display name, carried into the payload's association block. */
  name: string;
  userId: string;
  machineId: string;
  /** Test seam: defaults to the wall clock. */
  now?: () => Date;
}

/** The document the turn produced, in the shape the store and the canvas already use. */
export interface DesignThumbnailSubject {
  doc: Record<string, unknown>;
  assets: Record<string, string>;
}

/**
 * Render one thumbnail of `subject` and return the reference to record.
 *
 * Never throws and never retries: every failure is "no thumbnail", because the
 * verdict it belongs to is already written and true without it.
 */
export async function captureDesignThumbnail(
  ctx: DesignThumbnailContext,
  subject: DesignThumbnailSubject
): Promise<DesignTurnOutcomeThumbnail | undefined> {
  const now = ctx.now ?? (() => new Date());
  const workdir = path.resolve(ctx.workdir);
  const thumbnailDirectory = path.join(workdir, DESIGN_THUMBNAIL_DIRNAME);
  try {
    // Asked first because staging writes the whole document — assets included —
    // to disk, and there is no reason to pay that for a machine whose daemon has
    // no desktop polling it. `enqueue` would refuse anyway; this is the same
    // answer before the cost.
    if (!ctx.host.isConnected()) return undefined;
    const canvas = canvasSize(subject.doc);
    if (!canvas) return undefined;

    const digest = createHash('sha256')
      .update(canonicalContentBytes(subject as Parameters<typeof canonicalContentBytes>[0]))
      .digest('hex');

    const requestId = randomUUID();
    const stageDirectory = path.join(path.resolve(ctx.dataRoot), DESIGN_PREVIEW_STAGE_DIRNAME);
    const stagePath = path.join(stageDirectory, `${requestId}.json`);
    // The host writes a per-request name, and only a verified file is renamed to
    // the content address the outcome records. That is what keeps a render that
    // failed from overwriting the thumbnail an earlier turn already recorded for
    // the same document — and what makes cleanup below touch only a path the
    // daemon itself invented.
    const outputPath = path.join(thumbnailDirectory, `${digest}.${requestId}.png`);
    const recordedPath = path.join(thumbnailDirectory, `${digest}.png`);

    const payload: DesignPayload = {
      doc: subject.doc as DesignPayload['doc'],
      assets: subject.assets,
      association: {
        sessionId: ctx.artworkId,
        name: ctx.name,
        userId: ctx.userId,
        machineId: ctx.machineId,
        createdAt: now().toISOString(),
      },
      revisionId: digest,
    };
    const staged = JSON.stringify(payload);
    if (Buffer.byteLength(staged, 'utf8') > MAX_STAGED_PAYLOAD_BYTES) return undefined;

    await publishBytesAtomic(stageDirectory, stagePath, staged);
    await mkdir(thumbnailDirectory, { recursive: true });
    const work: DesignRenderHostWork = {
      requestId,
      payloadPath: stagePath,
      outputPath,
      width: canvas.width,
      height: canvas.height,
      maxEdge: MAX_THUMBNAIL_EDGE,
    };

    // Everything after the directory exists is covered by one cleanup, so no
    // path out of here — refused, unverifiable, or thrown — can leave the
    // request's scratch behind.
    try {
      let outcome;
      try {
        outcome = await ctx.host.enqueue(work, { timeoutMs: DESIGN_THUMBNAIL_TIMEOUT_MS });
      } finally {
        // Scratch: the host has either read the payload or will never read it.
        await unlink(stagePath).catch(() => undefined);
      }
      if (outcome.status === 'refused') return undefined;

      const verified = await verifyRenderedPng(outcome.absolutePath, workdir);
      if (verified.status === 'refused') return undefined;
      await rename(outputPath, recordedPath);
      // The reader's own rule, so a reference this build would refuse can never
      // be one it wrote.
      return sanitizeDesignTurnOutcomeThumbnail({
        path: `${DESIGN_THUMBNAIL_DIRNAME}/${digest}.png`,
        width: verified.width,
        height: verified.height,
      });
    } finally {
      // Withdraw this request's own scratch, and the directory only if this
      // request left it empty. On success both are no-ops: the file was renamed
      // out of the per-request name, and the directory now holds the record.
      // `rmdir` refusing a non-empty directory is what keeps a thumbnail an
      // earlier turn recorded for the same document out of harm's way.
      await unlink(outputPath).catch(() => undefined);
      await rmdir(thumbnailDirectory).catch(() => undefined);
    }
  } catch {
    // A thumbnail is an addition to a verdict that is already recorded. Any
    // unexpected failure here is "no thumbnail" and nothing more.
    return undefined;
  }
}

/**
 * The canvas the render host must assert, taken from the document itself.
 *
 * `undefined` when the document does not carry one. The caller's collection has
 * already validated the document, so this is unreachable in practice — but a
 * guessed size would make the host's own dimension check fail, and a missing
 * thumbnail is the honest outcome for a document this daemon cannot size.
 */
function canvasSize(doc: Record<string, unknown>): { width: number; height: number } | undefined {
  const canvas = doc.canvas;
  if (typeof canvas !== 'object' || canvas === null) return undefined;
  const { width, height } = canvas as Record<string, unknown>;
  const edge = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 4096
      ? value
      : undefined;
  const sizedWidth = edge(width);
  const sizedHeight = edge(height);
  if (sizedWidth === undefined || sizedHeight === undefined) return undefined;
  return { width: sizedWidth, height: sizedHeight };
}
