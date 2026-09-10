/**
 * Design-turn input materialization (P2.2).
 *
 * Before a design-session turn is dispatched, the daemon freezes the turn's
 * input into the design workspace:
 *
 *   <workdir>/design-input/<turnId>/manifest.json
 *   <workdir>/design-input/<turnId>/references/<sha256>.<ext>
 *
 * The manifest records the prompt text, canvas size, the design's baseline
 * revisionId as saved at send time (read through the design store — the single
 * committer), the delivered skill content identity (and any drifted files the
 * materializer refused to overwrite), and one entry per reference image with
 * its real sha256. P2.3's post-turn collection compares the post-turn design
 * against `baselineRevisionId` to decide commit-vs-candidate, so this manifest
 * is the integrity anchor: failures here must block the dispatch, never warn
 * and continue.
 *
 * Discipline (same as store.ts): every write is temp-file + fsync + rename in
 * the same directory, with a parent-directory fsync on POSIX. Everything is
 * keyed by turnId and content-named, so a retry of the same turn rewrites
 * byte-identical content and never duplicates.
 */

import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { getLodyDataDir } from '@lody/shared/node/installation-profile';
import { designOperation } from './store';

export const DESIGN_TURN_INPUT_DIRNAME = 'design-input';
export const DESIGN_TURN_MANIFEST_FILENAME = 'manifest.json';

export class DesignTurnInputError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DesignTurnInputError';
  }
}

export interface DesignTurnReferenceInput {
  bytes: Buffer;
  mimeType: string;
}

export interface DesignTurnManifestReference {
  /** Path relative to the turn directory: references/<sha256>.<ext> */
  file: string;
  sha256: string;
  bytes: number;
  mimeType: string;
}

export interface DesignTurnManifest {
  version: 1;
  turnId: string;
  prompt: string;
  canvas: { width: number; height: number };
  /** Design store revisionId (sha256 of the saved design.json) at send time. */
  baselineRevisionId: string;
  /** Content identity of the delivered skill material (P2.1 materializer). */
  skillSourceIdentity: string;
  /**
   * Workdir-relative skill files the user modified since we delivered them;
   * the materializer left them untouched, so the agent may not see the bundled
   * content for these paths.
   */
  skillDrift: string[];
  references: DesignTurnManifestReference[];
}

export interface MaterializeDesignTurnInputOptions {
  /** Absolute session workdir (chats/<sessionId>). */
  workdir: string;
  /** The dispatch's userTurnId — the idempotency key for this turn's input. */
  turnId: string;
  /** SessionMeta.design.artworkId (the design store session key). */
  artworkId: string;
  /** The turn's assembled text prompt (without app-internal scaffolding). */
  prompt: string;
  skillSourceIdentity: string;
  skillDrift?: string[];
  references?: DesignTurnReferenceInput[];
  /** Test seam: defaults to the daemon data root (same root the workdir lives under). */
  dataRoot?: string;
}

const TURN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

const sha256Hex = (bytes: Buffer | Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

const REFERENCE_EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

export function designTurnInputDir(workdir: string, turnId: string): string {
  if (!TURN_ID_RE.test(turnId)) {
    throw new DesignTurnInputError(
      `refusing to materialize design turn input for unsafe turnId: ${JSON.stringify(turnId)}`
    );
  }
  const dir = path.join(path.resolve(workdir), DESIGN_TURN_INPUT_DIRNAME, turnId);
  if (!isWithin(path.resolve(workdir), dir)) {
    throw new DesignTurnInputError(`design turn input dir escapes the workdir: ${dir}`);
  }
  return dir;
}

function isWithin(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** Temp + fsync + rename in the target directory (store.ts discipline). */
async function writeFileAtomic(dir: string, filename: string, bytes: Buffer): Promise<void> {
  const temporary = path.join(dir, `.${randomUUID()}.tmp`);
  try {
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path.join(dir, filename));
    if (process.platform !== 'win32') {
      const parent = await open(dir, constants.O_RDONLY);
      try {
        await parent.sync();
      } finally {
        await parent.close();
      }
    }
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

/**
 * Write one reference image content-named and verify the landed bytes. An
 * existing file with the same hash is kept as-is (idempotent retry); a
 * corrupted one is atomically replaced.
 */
async function materializeReference(
  referencesDir: string,
  input: DesignTurnReferenceInput
): Promise<DesignTurnManifestReference> {
  const sha256 = sha256Hex(input.bytes);
  const ext = REFERENCE_EXTENSION_BY_MIME[input.mimeType.trim().toLowerCase()] ?? 'img';
  const filename = `${sha256}.${ext}`;
  let existing: Buffer | null = null;
  try {
    existing = await readFile(path.join(referencesDir, filename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (existing === null || sha256Hex(existing) !== sha256) {
    await writeFileAtomic(referencesDir, filename, input.bytes);
    const landed = await readFile(path.join(referencesDir, filename));
    if (sha256Hex(landed) !== sha256) {
      throw new DesignTurnInputError(`reference copy failed verification: ${filename}`);
    }
  }
  return {
    file: `references/${filename}`,
    sha256,
    bytes: input.bytes.byteLength,
    mimeType: input.mimeType,
  };
}

export async function materializeDesignTurnInput(
  opts: MaterializeDesignTurnInputOptions
): Promise<DesignTurnManifest> {
  const workdir = path.resolve(opts.workdir);
  const dataRoot = opts.dataRoot ?? getLodyDataDir();
  const turnDir = designTurnInputDir(workdir, opts.turnId);

  // The baseline is read through the single design committer: a missing or
  // corrupt canvas fails the dispatch here rather than anchoring the turn to
  // an unreadable baseline.
  let baseline: Awaited<ReturnType<typeof designOperation>>;
  try {
    baseline = await designOperation(dataRoot, { operation: 'read', sessionId: opts.artworkId });
  } catch (error) {
    throw new DesignTurnInputError(
      `design baseline unreadable for artwork ${opts.artworkId}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }

  const referencesDir = path.join(turnDir, 'references');
  await mkdir(referencesDir, { recursive: true });

  // Dedupe by content name: the same image attached twice lands once.
  const references: DesignTurnManifestReference[] = [];
  const seenFiles = new Set<string>();
  for (const input of opts.references ?? []) {
    const reference = await materializeReference(referencesDir, input);
    if (seenFiles.has(reference.file)) continue;
    seenFiles.add(reference.file);
    references.push(reference);
  }

  const manifest: DesignTurnManifest = {
    version: 1,
    turnId: opts.turnId,
    prompt: opts.prompt,
    canvas: { width: baseline.doc.canvas.width, height: baseline.doc.canvas.height },
    baselineRevisionId: baseline.revisionId,
    skillSourceIdentity: opts.skillSourceIdentity,
    skillDrift: [...(opts.skillDrift ?? [])].sort(),
    references,
  };
  await writeFileAtomic(
    turnDir,
    DESIGN_TURN_MANIFEST_FILENAME,
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  );
  return manifest;
}
