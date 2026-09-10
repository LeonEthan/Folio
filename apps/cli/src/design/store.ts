/**
 * The single design committer.
 *
 * Everything that writes `<data root>/chats/<artworkId>/` goes through this
 * module: the canonical `design.json` (via `designOperation`) and the validated
 * conflict candidates kept beside it (via `saveDesignCandidate`).
 *
 * Two callers, one writer: the Electron-owned CLI worker (`cli/design.js`)
 * forwards UI save/read/create requests over stdin, and the daemon calls
 * `designOperation` in-process for post-turn collection (P2.3,
 * `./turn-outcome.ts`). They are coordinated by content-addressed state only —
 * sha256 revision ids compared against the caller's baseline — so no lock,
 * port, or process ownership is shared between them. A caller that loses the
 * baseline race gets `DESIGN_CONFLICT` and never sees its bytes land; the
 * daemon turns that into a candidate instead of an overwrite (P2.3).
 *
 * `design.json` holds embedded base64 assets so a confirmed save has no
 * partially committed asset table; the per-file digest of exactly those bytes
 * is the revisionId. A lost reply is safely retryable when the requested bytes
 * already landed.
 */

import {
  sniffStaticV1ImageMime,
  sniffStaticV1FontMime,
  staticV1UnregisteredFontFamilies,
} from '../../../../packages/design-bento/vendor/packages/contracts/src/static-v1';
import { createVisualDocumentKernel } from '../../../../packages/design-bento/vendor/packages/kernel/src/kernel';
import type {
  BentoDocV4,
  VisualCommandV4,
} from '../../../../packages/design-bento/vendor/packages/contracts/src/index';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, rename, unlink, lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

export const designId = z.string().uuid();
export const designSize = z.number().int().min(1).max(4096);
const bounds = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().positive(),
  z.number().positive(),
]);
const documentSchema = z
  .object({
    schemaVersion: z.literal(4),
    canvas: z.object({ width: designSize, height: designSize }).strict(),
    diagnostics: z.array(z.unknown()).max(1000).default([]),
    background: z.record(z.string(), z.unknown()),
    fonts: z
      .array(
        z
          .object({ family: z.string().min(1), src: z.string().regex(/^asset:[a-f0-9]{64}$/) })
          .passthrough()
      )
      .max(100)
      .optional(),
    elements: z
      .array(
        z
          .object({
            id: z.string().min(1).max(200),
            kind: z.enum(['text', 'shape', 'line', 'image', 'icon', 'table', 'chart']),
            bounds,
            zIndex: z.number().int().nonnegative(),
          })
          .passthrough()
      )
      .max(2000),
  })
  .strict();
export const designInput = z
  .object({
    doc: z
      .union([z.string().max(32 * 1024 * 1024), documentSchema])
      .transform((value) =>
        documentSchema.parse(typeof value === 'string' ? JSON.parse(value) : value)
      ),
    assets: z.record(z.string().regex(/^[a-f0-9]{64}$/), z.string().max(32 * 1024 * 1024)),
  })
  .strict();
export const designAssociation = z
  .object({
    sessionId: designId,
    name: z.string().trim().min(1).max(200),
    userId: z.string().min(1).max(200),
    machineId: z.string().min(1).max(200),
    createdAt: z.string().datetime(),
  })
  .strict();
const savedSchema = designInput.extend({ association: designAssociation });
export const designRequest = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('create'),
      association: designAssociation,
      width: designSize.default(800),
      height: designSize.default(600),
      copy: designInput.optional(),
    })
    .strict(),
  z.object({ operation: z.literal('read'), sessionId: designId }).strict(),
  z
    .object({
      operation: z.literal('save'),
      sessionId: designId,
      baseRevisionId: z.string().regex(/^[a-f0-9]{64}$/),
      content: designInput,
      name: z.string().trim().min(1).max(200).optional(),
    })
    .strict(),
]);
export type DesignRequest = z.input<typeof designRequest>;
export type DesignPayload = z.output<typeof savedSchema> & { revisionId: string };
const digest = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export const DESIGN_CANDIDATES_DIRNAME = 'candidates';
const candidateFileRe = /^([a-f0-9]{64})\.json$/;

const candidateEnvelope = z
  .object({
    version: z.literal(1),
    /** sha256 of the canonical content bytes — addresses the design, not the envelope. */
    candidateId: z.string().regex(/^[a-f0-9]{64}$/),
    artworkId: designId,
    turnId: z.string().min(1).max(200),
    /** The revision the agent started from; adopting re-checks against the live one. */
    baselineRevisionId: z.string().regex(/^[a-f0-9]{64}$/),
    createdAt: z.string().datetime(),
    content: designInput,
  })
  .strict();
const saveCandidateRequest = candidateEnvelope.omit({ version: true, candidateId: true });
export type SaveDesignCandidateRequest = z.input<typeof saveCandidateRequest>;
export type DesignCandidate = z.output<typeof candidateEnvelope>;

/** Everything a candidate list needs without carrying a second copy of the document. */
export type DesignCandidateSummary = {
  candidateId: string;
  artworkId: string;
  turnId: string;
  baselineRevisionId: string;
  createdAt: string;
};

const candidateSummary = (candidate: DesignCandidate): DesignCandidateSummary => ({
  candidateId: candidate.candidateId,
  artworkId: candidate.artworkId,
  turnId: candidate.turnId,
  baselineRevisionId: candidate.baselineRevisionId,
  createdAt: candidate.createdAt,
});

/**
 * Content-addressed without depending on key insertion order: the id must be
 * stable across processes and reloads for the same produced design.
 */
const canonicalContentBytes = (content: z.output<typeof designInput>): Uint8Array => {
  const assets: Record<string, string> = {};
  for (const key of Object.keys(content.assets).sort()) {
    assets[key] = content.assets[key] as string;
  }
  return Buffer.from(JSON.stringify({ doc: content.doc, assets }), 'utf8');
};

/** Temp file + fsync + rename + parent fsync: the only way bytes become visible. */
async function publishBytesAtomic(directory: string, target: string, bytes: string): Promise<void> {
  const temporary = path.join(directory, '.' + randomUUID() + '.tmp');
  try {
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, target);
    if (process.platform !== 'win32') {
      const parent = await open(directory, constants.O_RDONLY);
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

/** The candidate itself cannot be a symlink, and a missing file is not an error. */
async function readCandidateFile(file: string): Promise<DesignCandidate | null> {
  let handle;
  try {
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 64 * 1024 * 1024) throw Error('Invalid design candidate');
    const parsed = candidateEnvelope.parse(JSON.parse((await handle.readFile()).toString('utf8')));
    if (digest(canonicalContentBytes(parsed.content)) !== parsed.candidateId)
      throw Error('Design candidate checksum mismatch');
    return parsed;
  } finally {
    await handle.close();
  }
}

async function designChatDirectory(dataRoot: string, artworkId: string): Promise<string> {
  const directory = path.join(dataRoot, 'chats', artworkId);
  await mkdir(directory, { recursive: true });
  if ((await lstat(directory)).isSymbolicLink())
    throw Error('Design workspace cannot be a symlink');
  return directory;
}

async function candidatesDirectory(dataRoot: string, artworkId: string): Promise<string> {
  const directory = path.join(
    await designChatDirectory(dataRoot, artworkId),
    DESIGN_CANDIDATES_DIRNAME
  );
  await mkdir(directory, { recursive: true });
  if ((await lstat(directory)).isSymbolicLink())
    throw Error('Design candidates directory cannot be a symlink');
  return directory;
}

/**
 * Keep a validated design beside the current canvas instead of overwriting it.
 *
 * Written when a post-turn commit loses its baseline (`DESIGN_CONFLICT`, P2.3):
 * the user saved while the agent worked, so their canvas stays current and the
 * imported document waits here for an explicit adopt/discard. Idempotent by
 * content — the id is the digest of the canonical content, and an existing
 * candidate with that id is left byte-for-byte alone — so re-collecting a turn
 * cannot accumulate duplicates.
 */
export async function saveDesignCandidate(
  dataRoot: string,
  raw: unknown
): Promise<DesignCandidateSummary> {
  const request = saveCandidateRequest.parse(raw);
  const candidateId = digest(canonicalContentBytes(request.content));
  const directory = await candidatesDirectory(dataRoot, request.artworkId);
  const file = path.join(directory, `${candidateId}.json`);
  const existing = await readCandidateFile(file);
  if (existing) return candidateSummary(existing);
  const envelope: DesignCandidate = candidateEnvelope.parse({
    version: 1,
    candidateId,
    artworkId: request.artworkId,
    turnId: request.turnId,
    baselineRevisionId: request.baselineRevisionId,
    createdAt: request.createdAt,
    content: request.content,
  });
  const bytes = JSON.stringify(envelope);
  if (bytes.length > 64 * 1024 * 1024) throw Error('Design candidate exceeds 64 MiB');
  await publishBytesAtomic(directory, file, bytes);
  return candidateSummary(envelope);
}

/** Read one candidate, verifying that its content still hashes to its id. */
export async function readDesignCandidate(
  dataRoot: string,
  artworkId: unknown,
  candidateId: unknown
): Promise<{ candidate: DesignCandidate; file: string }> {
  const id = designId.parse(artworkId);
  const candidate = z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(candidateId);
  const file = path.join(await candidatesDirectory(dataRoot, id), `${candidate}.json`);
  const parsed = await readCandidateFile(file);
  if (!parsed) throw Error('Design candidate not found');
  return { candidate: parsed, file };
}

/** Candidates newest-last, skipping anything that is not a candidate file. */
export async function listDesignCandidates(
  dataRoot: string,
  artworkId: unknown
): Promise<DesignCandidateSummary[]> {
  const id = designId.parse(artworkId);
  const directory = await candidatesDirectory(dataRoot, id);
  const summaries: DesignCandidateSummary[] = [];
  for (const name of await readdir(directory)) {
    const match = candidateFileRe.exec(name);
    if (!match) continue;
    const parsed = await readCandidateFile(path.join(directory, name));
    if (!parsed || parsed.candidateId !== match[1]) continue;
    summaries.push(candidateSummary(parsed));
  }
  return summaries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function validateAssets(content: z.output<typeof designInput>) {
  if (new Set(content.doc.elements.map((e) => e.id)).size !== content.doc.elements.length)
    throw Error('Duplicate element IDs');
  const kernel = createVisualDocumentKernel({
    schemaVersion: 4,
    canvas: content.doc.canvas,
    background: { type: 'solid', color: '#ffffff' },
    diagnostics: [],
    elements: [],
  });
  const commands: VisualCommandV4[] = [
    {
      type: 'setBackground',
      background: content.doc.background as unknown as BentoDocV4['background'],
    },
    ...(content.doc.fonts ?? []).map((font) => ({
      type: 'addFontRegistration' as const,
      font: font as unknown as NonNullable<BentoDocV4['fonts']>[number],
    })),
    ...content.doc.elements.map((element) => ({
      type: 'createElement' as const,
      element: element as unknown as BentoDocV4['elements'][number],
    })),
  ];
  const checked = kernel.apply({
    batchId: 'validate',
    actor: 'design-service',
    baseRevision: 0,
    commands,
  });
  if (!checked.ok) throw Error(checked.error.message);
  const missingFonts = staticV1UnregisteredFontFamilies(
    content.doc.elements,
    (content.doc.fonts ?? []).map((font) => font.family)
  );
  if (missingFonts.length) throw Error('Register required fonts: ' + missingFonts.join(', '));
  const required = new Set<string>();
  const walk = (value: unknown, depth = 0): void => {
    if (depth > 40) throw Error('Document nesting exceeds limit');
    if (typeof value === 'string' && value.startsWith('asset:')) required.add(value.slice(6));
    if (Array.isArray(value)) value.forEach((v) => walk(v, depth + 1));
    else if (value && typeof value === 'object')
      for (const [key, v] of Object.entries(value)) {
        if (
          ['src', 'href', 'url'].includes(key) &&
          typeof v === 'string' &&
          !/^asset:[a-f0-9]{64}$/.test(v)
        )
          throw Error('External document resources are unsupported');
        walk(v, depth + 1);
      }
  };
  walk(content.doc);
  const assets: Record<string, string> = {};
  for (const key of required) {
    const uri = content.assets[key];
    const match = uri?.match(
      /^data:(image\/(?:png|jpeg|gif)|font\/(?:ttf|otf|woff|woff2));base64,([A-Za-z0-9+/]+={0,2})$/
    );
    if (!match?.[2]) throw Error('Missing or unsupported asset: ' + key);
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > 16 * 1024 * 1024) throw Error('Asset exceeds 16 MiB');
    if ((sniffStaticV1ImageMime(bytes) ?? sniffStaticV1FontMime(bytes)) !== match[1])
      throw Error('Asset MIME does not match its bytes');
    if (digest(bytes) !== key) throw Error('Asset checksum mismatch: ' + key);
    assets[key] = uri as string;
  }
  return assets;
}

/**
 * Read/create/save the current canvas. Callers pass the revisionId they believe
 * is current as `baseRevisionId`; a save whose baseline moved is rejected with
 * `DESIGN_CONFLICT` rather than overwriting someone else's work.
 */
export async function designOperation(dataRoot: string, raw: unknown): Promise<DesignPayload> {
  const request = designRequest.parse(raw);
  const id = request.operation === 'create' ? request.association.sessionId : request.sessionId;
  const directory = path.join(dataRoot, 'chats', id);
  await mkdir(directory, { recursive: true });
  if ((await lstat(directory)).isSymbolicLink())
    throw Error('Design workspace cannot be a symlink');
  const current = path.join(directory, 'design.json');
  const read = async (): Promise<DesignPayload> => {
    const file = await open(current, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 64 * 1024 * 1024) throw Error('Invalid design file');
      const bytes = await file.readFile();
      const saved = savedSchema.parse(JSON.parse(bytes.toString('utf8')));
      if (saved.association.sessionId !== id) throw Error('Design association mismatch');
      validateAssets(saved);
      return { ...saved, revisionId: digest(bytes) };
    } finally {
      await file.close();
    }
  };
  if (request.operation === 'read') return read();
  let previous: DesignPayload | undefined;
  try {
    previous = await read();
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  if (request.operation === 'create' && previous) {
    if (JSON.stringify(previous.association) !== JSON.stringify(request.association))
      throw Error('Design already exists');
    return previous;
  }
  const content =
    request.operation === 'create'
      ? (request.copy ?? {
          doc: {
            schemaVersion: 4 as const,
            canvas: { width: request.width, height: request.height },
            background: { type: 'solid', color: '#ffffff' },
            diagnostics: [],
            elements: [],
          },
          assets: {},
        })
      : request.content;
  const saved = savedSchema.parse({
    ...content,
    assets: validateAssets(content),
    association:
      request.operation === 'create'
        ? request.association
        : { ...previous?.association, ...(request.name ? { name: request.name } : {}) },
  });
  const bytes = JSON.stringify(saved);
  if (bytes.length > 64 * 1024 * 1024) throw Error('Design exceeds 64 MiB');
  if (request.operation === 'save' && previous?.revisionId !== request.baseRevisionId) {
    // Lost acknowledgement is safely retryable when the requested bytes already landed.
    if (previous?.revisionId === digest(bytes)) return previous;
    throw Error('DESIGN_CONFLICT');
  }
  if (request.operation === 'create') {
    const pending = path.join(dataRoot, 'design-pending');
    await mkdir(pending, { recursive: true });
    const marker = await open(path.join(pending, id), 'a', 0o600);
    try {
      await marker.sync();
    } finally {
      await marker.close();
    }
    if (process.platform !== 'win32') {
      const parent = await open(pending, constants.O_RDONLY);
      try {
        await parent.sync();
      } finally {
        await parent.close();
      }
    }
  }
  await publishBytesAtomic(directory, current, bytes);
  return { ...saved, revisionId: digest(bytes) };
}

/** Only unfinished associations are repaired; acknowledged/deleted sessions are never rediscovered. */
export async function pendingDesigns(dataRoot: string): Promise<DesignPayload[]> {
  const directory = path.join(dataRoot, 'design-pending');
  await mkdir(directory, { recursive: true });
  const results: DesignPayload[] = [];
  for (const id of await readdir(directory)) {
    if (!designId.safeParse(id).success) continue;
    try {
      results.push(await designOperation(dataRoot, { operation: 'read', sessionId: id }));
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
  return results;
}
export async function acknowledgeDesign(dataRoot: string, raw: unknown): Promise<void> {
  await unlink(path.join(dataRoot, 'design-pending', designId.parse(raw))).catch((error) => {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  });
}
