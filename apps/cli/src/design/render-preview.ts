/**
 * Rendering one preview of the project an agent is authoring (P2.4b).
 *
 * The agent-facing half of the render bridge. `./render-host.ts` owns the queue
 * and knows nothing about files; this module owns the artifact and the
 * filesystem, and knows nothing about the wire:
 *
 *   workdir/design.pptd  --collectAuthoring--> snapshot --intakeAuthoring--> doc
 *     --stage payload JSON--> desktop host --render--> workdir/design-preview/<n>.png
 *
 * Four rules shape it, and each one is a boundary rather than an implementation
 * choice:
 *
 * - **What is rendered is what the agent wrote, not what is on the canvas.** The
 *   preview imports the workdir's PPTD project through the same intake the
 *   post-turn collection uses and stages the result directly; `design.json` is
 *   never read, never compared, and never written. Previewing mid-turn is
 *   therefore free of side effects: a preview cannot commit, cannot overwrite,
 *   and cannot turn into a candidate.
 * - **Validation is storage-layer structure only.** Schema, snapshot integrity,
 *   and asset MIME/digest are re-checked because the desktop that renders this
 *   must never be handed bytes the platform would refuse to commit. Whether the
 *   design looks *good* is the agent's own business and is never re-judged here
 *   (agent-naive; root `AGENTS.md`).
 * - **The PNG lands in the session workdir**, so the agent that asked for it can
 *   open it with its own tools. `design-preview/` is outside the authoring
 *   allowlist (`design.pptd`, `pages/`, `media/`), so a preview can never be
 *   collected into a later commit as if it were an asset.
 * - **A report is not a rendering.** The host's word that it wrote a file is
 *   checked against the bytes before the path reaches the agent, and a failed or
 *   unverifiable render is refused rather than retried.
 */

import { AuthoringSnapshotError, collectAuthoring, intakeAuthoring } from '@folio/design-authoring';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readdir, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { sniffStaticV1ImageMime } from '../../../../packages/design-bento/vendor/packages/contracts/src/static-v1';
import { buildAssetDataUris } from './authoring-assets';
import type { DesignRenderPreviewOutcome } from './render-host';
import type { DesignRenderHostWork } from '@lody/shared';
import { canonicalContentBytes, type DesignPayload } from './store';
import { DESIGN_ARTIFACT_ENTRY } from './turn-outcome';

/** Where rendered previews live, relative to the session workdir. */
export const DESIGN_PREVIEW_DIRNAME = 'design-preview';
/** Where staged payloads wait for the desktop, relative to the daemon data root. */
export const DESIGN_PREVIEW_STAGE_DIRNAME = 'design-preview-stage';
/**
 * How many previews one session keeps. Previews are scratch output the agent
 * reads once, so they are pruned by name (the timestamp prefix orders them)
 * rather than allowed to accumulate per render in the user's workspace.
 */
export const MAX_KEPT_PREVIEWS = 8;
/** Bounded, like every diagnostic that can reach an agent. */
const MAX_DIAGNOSTICS = 5;
const MAX_ERROR_CHARS = 800;
const MAX_STAGED_PAYLOAD_BYTES = 64 * 1024 * 1024;

export interface DesignPreviewContext {
  /**
   * The artwork the preview belongs to — the design store's own key for this
   * canvas, which is what the payload's `association.sessionId` must name. It is
   * intentionally not the asking session id: the session owns the workdir, the
   * artwork owns the canvas, and only the canvas is what gets rendered.
   */
  artworkId: string;
  /** Absolute session workdir (`chats/<asking session>`), where the project lives. */
  workdir: string;
  /** The daemon data root: the root the workdir lives under. */
  dataRoot: string;
  /** The artwork's display name, carried into the staged payload. */
  name: string;
  userId: string;
  machineId: string;
  /** Test seam: defaults to the wall clock. */
  now?: () => Date;
}

export type DesignPreviewResult =
  | { status: 'rendered'; path: string; width: number; height: number; bytes: number }
  | { status: 'refused'; error: string };

/**
 * The part of the render host this module drives. Narrow on purpose: staging a
 * payload and verifying the PNG are filesystem concerns, and keeping them apart
 * from the queue is what lets each be tested without the other.
 */
export interface DesignRenderQueue {
  enqueue(work: DesignRenderHostWork): Promise<DesignRenderPreviewOutcome>;
}

export type DesignPreviewPayloadResult =
  | {
      status: 'ok';
      doc: DesignPayload['doc'];
      assets: Record<string, string>;
      width: number;
      height: number;
    }
  | { status: 'refused'; error: string };

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const refused = (error: string): { status: 'refused'; error: string } => ({
  status: 'refused',
  error: error.slice(0, MAX_ERROR_CHARS),
});

/**
 * Import the workdir's PPTD project into the payload the desktop renders.
 *
 * Deliberately the same intake the post-turn collection runs, minus the commit:
 * the same validation, the same asset table, the same `DesignPayload` shape the
 * design worker already serves the canvas. The `revisionId` is the digest of
 * exactly these staged bytes — the store's own content address convention — so
 * the payload is self-describing even though nothing here is ever saved.
 */
export async function buildPreviewPayload(workdir: string): Promise<DesignPreviewPayloadResult> {
  const root = path.resolve(workdir);
  const entry = path.join(root, DESIGN_ARTIFACT_ENTRY);
  try {
    const stat = await lstat(entry);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      return refused(`${DESIGN_ARTIFACT_ENTRY} is not a regular file`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return refused(
        `this session workspace has no ${DESIGN_ARTIFACT_ENTRY} yet, so there is nothing to preview. Write the project first.`
      );
    }
    return refused(errorMessage(error));
  }

  let snapshot: Map<string, Uint8Array>;
  try {
    snapshot = collectAuthoring(root);
  } catch (error) {
    return refused(
      `${error instanceof AuthoringSnapshotError ? 'the project was rejected' : 'collecting the project failed'}: ${errorMessage(error)}`
    );
  }

  const intake = intakeAuthoring(DESIGN_ARTIFACT_ENTRY, snapshot);
  if (intake.status === 'invalid') {
    return refused(
      describeDiagnostics(intake.diagnostics.map(({ code, message }) => ({ code, message })))
    );
  }
  if (intake.status === 'unsupported') {
    return refused(
      describeDiagnostics(intake.issues.map(({ code, message }) => ({ code, message })))
    );
  }

  try {
    // The desktop re-parses `doc` with the design schema, so this cast asserts
    // nothing: it only bridges the imported BentoDoc type to the payload shape
    // the canvas is already served, exactly as the intake → store integration
    // does when it commits the same document.
    const { width, height } = intake.document.canvas;
    return {
      status: 'ok',
      doc: intake.document as unknown as DesignPayload['doc'],
      assets: buildAssetDataUris(intake.assets),
      width,
      height,
    };
  } catch (error) {
    return refused(errorMessage(error));
  }
}

function describeDiagnostics(entries: readonly { code: string; message: string }[]): string {
  const shown = entries
    .slice(0, MAX_DIAGNOSTICS)
    .map(({ code, message }) => `[${code}] ${message}`);
  const hidden = entries.length - shown.length;
  const suffix = hidden > 0 ? ` (+${hidden} more)` : '';
  return `the project did not pass the design intake: ${shown.join('; ')}${suffix}`;
}

/** Temp file + fsync + rename, so a half-written payload is never observable. */
async function publishBytesAtomic(directory: string, target: string, bytes: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `.${randomUUID()}.tmp`);
  try {
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(bytes, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, target);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

/**
 * Render one preview of this session's project through the desktop host.
 *
 * Resolves with a refusal — never throws — for every failure that has an honest
 * description: no artifact, an invalid project, no desktop running, a host that
 * went away, or bytes that are not the PNG it claimed to write.
 */
export async function renderDesignPreview(
  ctx: DesignPreviewContext,
  host: DesignRenderQueue
): Promise<DesignPreviewResult> {
  const now = ctx.now ?? (() => new Date());
  const workdir = path.resolve(ctx.workdir);

  const built = await buildPreviewPayload(workdir);
  if (built.status === 'refused') return built;

  const requestId = randomUUID();
  const stageDirectory = path.join(path.resolve(ctx.dataRoot), DESIGN_PREVIEW_STAGE_DIRNAME);
  const stagePath = path.join(stageDirectory, `${requestId}.json`);
  const previewDirectory = path.join(workdir, DESIGN_PREVIEW_DIRNAME);
  const outputPath = path.join(previewDirectory, `${now().getTime()}-${requestId.slice(0, 8)}.png`);

  const association = {
    sessionId: ctx.artworkId,
    name: ctx.name,
    userId: ctx.userId,
    machineId: ctx.machineId,
    createdAt: now().toISOString(),
  };
  const payload: DesignPayload = {
    doc: built.doc,
    assets: built.assets,
    association,
    revisionId: createHash('sha256').update(canonicalContentBytes(built)).digest('hex'),
  };
  const staged = JSON.stringify(payload);
  if (Buffer.byteLength(staged, 'utf8') > MAX_STAGED_PAYLOAD_BYTES) {
    return refused('the project is too large to stage for rendering');
  }

  try {
    await publishBytesAtomic(stageDirectory, stagePath, staged);
    await mkdir(previewDirectory, { recursive: true });
  } catch (error) {
    await unlink(stagePath).catch(() => undefined);
    return refused(errorMessage(error));
  }

  let outcome;
  try {
    outcome = await host.enqueue({
      requestId,
      payloadPath: stagePath,
      outputPath,
      width: built.width,
      height: built.height,
    });
  } finally {
    // The payload is scratch: the host has either read it or will never read it.
    await unlink(stagePath).catch(() => undefined);
  }
  if (outcome.status === 'refused') return outcome;

  const verified = await verifyRenderedPreview(
    outcome.absolutePath,
    workdir,
    built.width,
    built.height
  );
  if (verified.status === 'rendered') await prunePreviews(previewDirectory);
  return verified;
}

/**
 * Confirm the host wrote a PNG before its path reaches the agent.
 *
 * Header sniff plus size, not a decode: this is the same storage-level check the
 * store applies to an imported asset, and the pixel dimensions the desktop
 * asserts during rendering are not re-derived here.
 */
async function verifyRenderedPreview(
  absolutePath: string,
  workdir: string,
  width: number,
  height: number
): Promise<DesignPreviewResult> {
  let bytes: Buffer;
  try {
    const stat = await lstat(absolutePath);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size === 0) {
      return refused('the desktop reported a rendering but wrote no readable PNG');
    }
    const handle = await open(absolutePath, 'r');
    try {
      const header = Buffer.alloc(16);
      const { bytesRead } = await handle.read(header, 0, 16, 0);
      if (sniffStaticV1ImageMime(header.subarray(0, bytesRead)) !== 'image/png') {
        return refused('the desktop reported a rendering but the file is not a PNG');
      }
    } finally {
      await handle.close();
    }
    bytes = await readFile(absolutePath);
  } catch (error) {
    return refused(`the rendered preview could not be read: ${errorMessage(error)}`);
  }

  const relative = path.relative(path.resolve(workdir), absolutePath);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return refused('the rendered preview landed outside the session workspace');
  }
  return {
    status: 'rendered',
    path: relative.split(path.sep).join('/'),
    width,
    height,
    bytes: bytes.byteLength,
  };
}

/** Keep the newest `MAX_KEPT_PREVIEWS` files; names are timestamp-prefixed, so order is lexical. */
async function prunePreviews(directory: string): Promise<void> {
  let names: string[];
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith('.png')).sort();
  } catch {
    return;
  }
  const stale = names.slice(0, Math.max(0, names.length - MAX_KEPT_PREVIEWS));
  for (const name of stale) {
    await unlink(path.join(directory, name)).catch(() => undefined);
  }
}
