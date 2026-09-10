/**
 * P2.3 classification matrix: a synthetic PPTD project left in a session
 * workdir is collected, classified, and committed through the single committer.
 * Every fixture is synthetic; no agent runs and no network is touched.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  DesignRenderHostWork,
  SessionHistoryInput,
  SessionId,
  SessionMeta,
} from '@lody/shared';
import { sanitizeDesignTurnOutcome, type DesignTurnOutcome } from '@lody/shared';
import type { DesignRenderQueue } from './render-output';
import { DESIGN_ARTIFACT_ENTRY } from './artifact';
import { designOperation, listDesignCandidates, readDesignCandidate } from './store';
import { MAX_THUMBNAIL_EDGE, DESIGN_THUMBNAIL_DIRNAME } from './thumbnail';
import {
  collectDesignTurnOutcome,
  recordDesignTurnTerminalOutcome,
  type DesignTurnOutcomeSession,
} from './turn-outcome';
import {
  DESIGN_TURN_INPUT_DIRNAME,
  DESIGN_TURN_MANIFEST_FILENAME,
  materializeDesignTurnInput,
} from './turn-input';

function syntheticPng(width: number, height: number, rgb: [number, number, number]): Uint8Array {
  const crcTable = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c;
  }
  const crc32 = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const d = y * (stride + 1) + 1 + x * 3;
      raw[d] = rgb[0];
      raw[d + 1] = rgb[1];
      raw[d + 2] = rgb[2];
    }
  }
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ])
  );
}

const enc = new TextEncoder();

const MANIFEST = `version: v2
title: Turn outcome test
size: [320, 200]
pages:
  - pages/main.page
`;

const PAGE = `background:
  type: solid
  color: "#FFFFFF"
elements:
  - elementId: title
    elementType: text
    bounds: [10, 10, 200, 40]
    content:
      text: "Hello"
      fontSize: 24
  - elementId: band
    elementType: shape
    bounds: [10, 60, 100, 100]
    shapeName: rect
    fill:
      type: solid
      color: "#1F6B8A"
  - elementId: photo
    elementType: image
    bounds: [120, 60, 64, 64]
    src: media/pic.png
    fit:
      mode: cover
`;

/** The page above, but pointing at a media file that was never written. */
const BROKEN_PAGE = PAGE.replace('media/pic.png', 'media/missing.png');

/** The page above, restyled: one real edit an agent could have made. */
const RESTYLED_PAGE = PAGE.replace('#1F6B8A', '#7B6B8A');

const files = (page: string): Map<string, Uint8Array> =>
  new Map<string, Uint8Array>([
    [DESIGN_ARTIFACT_ENTRY, enc.encode(MANIFEST)],
    ['pages/main.page', enc.encode(page)],
    ['media/pic.png', syntheticPng(8, 8, [31, 107, 138])],
  ]);

const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

type Harness = {
  root: string;
  sessionId: string;
  turnId: string;
  workdir: string;
  history: SessionHistoryInput[];
  sessionDoc: DesignTurnOutcomeSession;
  /** Drop the recorded outcome so a second collection is not short-circuited. */
  forgetOutcome: () => void;
};

function createHarness(
  options: {
    /** Absent means "not a design session". */
    design?: boolean;
    page?: string | null;
    /** Write the P2.2 manifest (default true). */
    manifest?: boolean;
    /** Use this baseline instead of the live revision. */
    baselineRevisionId?: string;
    /** Omit the user turn entry, as a rewound turn would. */
    history?: boolean;
    metaThrows?: boolean;
  } = {}
): Harness {
  const root = mkdtempSync(path.join(tmpdir(), 'folio-turn-outcome-'));
  roots.push(root);
  const sessionId = crypto.randomUUID();
  const turnId = 'turn-outcome-1';
  const workdir = path.join(root, 'chats', sessionId);
  mkdirSync(workdir, { recursive: true });

  const entry: SessionHistoryInput = {
    id: turnId,
    role: 'user',
    items: [{ type: 'text', text: 'design a poster' }],
    timestamp: '2026-09-10T00:00:00.000Z',
    status: 'handled',
    fileDiff: [],
  };
  const history = options.history === false ? [] : [entry];
  const meta = {
    id: sessionId as SessionId,
    machineId: 'test-machine',
    userId: 'local:test',
    createdAt: '2026-09-10T00:00:00.000Z',
    ...(options.design === false
      ? {}
      : { design: { artworkId: sessionId, path: 'design.json' as const } }),
  } as SessionMeta;

  const sessionDoc: DesignTurnOutcomeSession = {
    getMetaState: async () => {
      if (options.metaThrows) throw Error('session doc unavailable');
      return meta;
    },
    getHistory: async () => structuredClone(history),
    updateHistory: async (update) => {
      const next = update(structuredClone(history));
      history.splice(0, history.length, ...next);
    },
  };

  return {
    root,
    sessionId,
    turnId,
    workdir,
    history,
    sessionDoc,
    forgetOutcome: () => {
      for (const item of history) delete item.designOutcome;
    },
  };
}

async function createDesign(harness: Harness, options: { width?: number; height?: number } = {}) {
  const created = await designOperation(harness.root, {
    operation: 'create',
    association: {
      sessionId: harness.sessionId,
      name: 'Turn outcome',
      userId: 'local:test',
      machineId: 'test-machine',
      createdAt: '2026-09-10T00:00:00.000Z',
    },
    width: options.width ?? 800,
    height: options.height ?? 600,
  });
  return created;
}

async function writeArtifact(harness: Harness, page: string | null): Promise<void> {
  if (page === null) return;
  for (const [rel, bytes] of files(page)) {
    const file = path.join(harness.workdir, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, bytes);
  }
}

/**
 * The manifest of a turn that was dispatched *before* `artifactAtSend` existed:
 * the same anchor, collected without the stale-project comparison. The
 * multi-turn tests below freeze the real manifest instead (P2.2 writes it).
 */
async function writeManifest(harness: Harness, baselineRevisionId: string): Promise<void> {
  const dir = path.join(harness.workdir, DESIGN_TURN_INPUT_DIRNAME, harness.turnId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, DESIGN_TURN_MANIFEST_FILENAME),
    JSON.stringify(
      {
        version: 1,
        turnId: harness.turnId,
        prompt: 'design a poster',
        canvas: { width: 800, height: 600 },
        baselineRevisionId,
        skillSourceIdentity: 'test',
        skillDrift: [],
        references: [],
      },
      null,
      2
    )
  );
}

/** Freeze this turn's input the way dispatch does, with the workspace as it is now. */
async function freezeTurnInput(harness: Harness): Promise<void> {
  await materializeDesignTurnInput({
    workdir: harness.workdir,
    turnId: harness.turnId,
    artworkId: harness.sessionId,
    prompt: 'design a poster',
    skillSourceIdentity: 'test',
    dataRoot: harness.root,
  });
}

const contextFor = (harness: Harness, now = new Date('2026-09-10T01:00:00.000Z')) => ({
  sessionId: harness.sessionId,
  sessionDoc: harness.sessionDoc,
  turnId: harness.turnId,
  workdir: harness.workdir,
  dataRoot: harness.root,
  now: () => now,
});

/** A stand-in desktop: it writes a real, small PNG wherever it was asked to. */
const renderingHost = (
  size: { width: number; height: number } = { width: 160, height: 100 },
  onWork?: (work: DesignRenderHostWork) => void
): DesignRenderQueue => ({
  isConnected: () => true,
  enqueue: async (work) => {
    onWork?.(work);
    writeFileSync(work.outputPath, syntheticPng(size.width, size.height, [31, 107, 138]));
    return { status: 'rendered', absolutePath: work.outputPath };
  },
});

const withHost = (harness: Harness, host: DesignRenderQueue) => ({
  ...contextFor(harness),
  thumbnail: { host, machineId: 'test-machine' },
});

const recordedOutcome = (harness: Harness): DesignTurnOutcome | undefined => {
  const entry = harness.history.find((item) => item.id === harness.turnId);
  return sanitizeDesignTurnOutcome(entry?.designOutcome);
};

/** Release the canvas, as a user save between manifest and collection would. */
async function moveBaseline(harness: Harness, revisionId: string): Promise<void> {
  const current = await designOperation(harness.root, {
    operation: 'read',
    sessionId: harness.sessionId,
  });
  await designOperation(harness.root, {
    operation: 'save',
    sessionId: harness.sessionId,
    baseRevisionId: revisionId,
    content: { doc: current.doc, assets: current.assets },
    name: 'Saved while the agent worked',
  });
}

describe('collectDesignTurnOutcome', () => {
  it('commits a valid artifact and records the revision that landed', async () => {
    const harness = createHarness();
    const created = await createDesign(harness);
    await writeArtifact(harness, PAGE);
    await writeManifest(harness, created.revisionId);

    const attempt = await collectDesignTurnOutcome(contextFor(harness));
    expect(attempt.status).toBe('recorded');
    if (attempt.status !== 'recorded') return;
    expect(attempt.outcome).toMatchObject({
      status: 'committed',
      turnId: harness.turnId,
      artworkId: harness.sessionId,
      timestamp: '2026-09-10T01:00:00.000Z',
    });

    const stored = await designOperation(harness.root, {
      operation: 'read',
      sessionId: harness.sessionId,
    });
    // The canvas is the imported document, not the empty canvas it started as.
    expect(stored.revisionId).toBe(attempt.outcome.revisionId);
    expect(stored.revisionId).not.toBe(created.revisionId);
    expect(stored.doc.canvas).toEqual({ width: 320, height: 200 });
    expect(stored.doc.elements).toHaveLength(3);
    expect(recordedOutcome(harness)).toEqual(attempt.outcome);
  });

  it('records a reference to the thumbnail the desktop rendered for the commit', async () => {
    const harness = createHarness();
    const created = await createDesign(harness);
    await writeArtifact(harness, PAGE);
    await writeManifest(harness, created.revisionId);
    let asked: DesignRenderHostWork | undefined;

    const attempt = await collectDesignTurnOutcome(
      withHost(
        harness,
        renderingHost({ width: 160, height: 100 }, (work) => {
          asked = work;
        })
      )
    );
    expect(attempt.status).toBe('recorded');
    if (attempt.status !== 'recorded' || attempt.outcome.status !== 'committed') return;

    const thumbnail = attempt.outcome.thumbnail;
    expect(thumbnail).toMatchObject({ width: 160, height: 100 });
    expect(thumbnail?.path).toMatch(new RegExp(`^${DESIGN_THUMBNAIL_DIRNAME}/[a-f0-9]{64}\\.png$`));
    // The canvas's own size is what the host lays out; the card gets a small copy.
    expect(asked).toMatchObject({ width: 320, height: 200, maxEdge: MAX_THUMBNAIL_EDGE });
    // The reference names a file that is really there, and it survives the
    // write onto the history entry the renderer reopens.
    expect(existsSync(path.join(harness.workdir, thumbnail!.path))).toBe(true);
    expect(recordedOutcome(harness)?.thumbnail).toEqual(thumbnail);
    // Staging is scratch; the staged payload is gone.
    expect(readdirSync(path.join(harness.root, 'design-preview-stage'))).toEqual([]);
  });

  it('records a thumbnail for the candidate it kept, not just for a commit', async () => {
    const harness = createHarness();
    const created = await createDesign(harness);
    await writeArtifact(harness, PAGE);
    await writeManifest(harness, created.revisionId);
    await moveBaseline(harness, created.revisionId);

    const attempt = await collectDesignTurnOutcome(withHost(harness, renderingHost()));
    expect(attempt.status).toBe('recorded');
    if (attempt.status !== 'recorded' || attempt.outcome.status !== 'candidate') return;
    expect(attempt.outcome.thumbnail?.path).toMatch(
      new RegExp(`^${DESIGN_THUMBNAIL_DIRNAME}/[a-f0-9]{64}\\.png$`)
    );
    expect(recordedOutcome(harness)?.thumbnail).toEqual(attempt.outcome.thumbnail);
  });

  it('records the verdict exactly as before when there is no desktop to render it', async () => {
    const harness = createHarness();
    const created = await createDesign(harness);
    await writeArtifact(harness, PAGE);
    await writeManifest(harness, created.revisionId);

    // No `thumbnail` in the context at all: a machine whose daemon has no render
    // host. The outcome is complete without an image, and nothing is written.
    const attempt = await collectDesignTurnOutcome(contextFor(harness));
    expect(attempt.status).toBe('recorded');
    if (attempt.status !== 'recorded') return;
    expect(attempt.outcome).not.toHaveProperty('thumbnail');
    expect(existsSync(path.join(harness.workdir, DESIGN_THUMBNAIL_DIRNAME))).toBe(false);
  });

  it('reports no_artifact and leaves an existing canvas untouched', async () => {
    const harness = createHarness();
    const created = await createDesign(harness, { width: 640, height: 480 });
    await writeManifest(harness, created.revisionId);

    const attempt = await collectDesignTurnOutcome(contextFor(harness));
    expect(attempt).toEqual({
      status: 'recorded',
      outcome: expect.objectContaining({ status: 'no_artifact' }),
    });
    const stored = await designOperation(harness.root, {
      operation: 'read',
      sessionId: harness.sessionId,
    });
    expect(stored.revisionId).toBe(created.revisionId);
    expect(stored.doc.elements).toHaveLength(0);
  });

  it('reports no_artifact, not a re-import, when the turn left the project exactly as dispatched', async () => {
    const harness = createHarness();
    const created = await createDesign(harness);
    // A project an earlier turn produced, still sitting in the workspace.
    await writeArtifact(harness, PAGE);
    await freezeTurnInput(harness);

    const attempt = await collectDesignTurnOutcome(contextFor(harness));
    expect(attempt).toEqual({
      status: 'recorded',
      outcome: expect.objectContaining({ status: 'no_artifact' }),
    });
    const stored = await designOperation(harness.root, {
      operation: 'read',
      sessionId: harness.sessionId,
    });
    expect(stored.revisionId).toBe(created.revisionId);
    expect(stored.doc.elements).toHaveLength(0);
  });

  it('collects the project once the turn actually changed it', async () => {
    const harness = createHarness();
    const created = await createDesign(harness);
    await writeArtifact(harness, PAGE);
    await freezeTurnInput(harness);
    // The agent edited one page — the project is no longer the one it started
    // from, so this turn did produce something.
    await writeArtifact(harness, RESTYLED_PAGE);

    const attempt = await collectDesignTurnOutcome(contextFor(harness));
    expect(attempt.status).toBe('recorded');
    if (attempt.status !== 'recorded') return;
    expect(attempt.outcome.status).toBe('committed');
    const stored = await designOperation(harness.root, {
      operation: 'read',
      sessionId: harness.sessionId,
    });
    expect(stored.revisionId).toBe(attempt.outcome.revisionId);
    expect(stored.revisionId).not.toBe(created.revisionId);
    expect(stored.doc.elements).toHaveLength(3);
  });

  it('never keeps an earlier turn’s project as a candidate for this turn', async () => {
    const harness = createHarness();
    const created = await createDesign(harness);
    await writeArtifact(harness, PAGE);
    await freezeTurnInput(harness);
    // The user saved while this turn ran. Re-importing the project now would
    // either re-commit a document they moved past, or keep a candidate whose
    // content is the older document — an invitation to undo their own save.
    await moveBaseline(harness, created.revisionId);
    const userSaved = await designOperation(harness.root, {
      operation: 'read',
      sessionId: harness.sessionId,
    });

    const attempt = await collectDesignTurnOutcome(contextFor(harness));
    expect(attempt).toEqual({
      status: 'recorded',
      outcome: expect.objectContaining({ status: 'no_artifact' }),
    });
    expect(await listDesignCandidates(harness.root, harness.sessionId)).toEqual([]);
    const stored = await designOperation(harness.root, {
      operation: 'read',
      sessionId: harness.sessionId,
    });
    expect(stored.revisionId).toBe(userSaved.revisionId);
    expect(stored.doc.elements).toHaveLength(0);
  });

  it('reports invalid with the validator diagnostics for a broken artifact', async () => {
    const harness = createHarness();
    const created = await createDesign(harness);
    await writeArtifact(harness, BROKEN_PAGE);
    await writeManifest(harness, created.revisionId);

    const attempt = await collectDesignTurnOutcome(contextFor(harness));
    expect(attempt.status).toBe('recorded');
    if (attempt.status !== 'recorded') return;
    expect(attempt.outcome.status).toBe('invalid');
    expect(attempt.outcome.diagnostics?.some(({ code }) => code === 'PPTD-E005')).toBe(true);
    const stored = await designOperation(harness.root, {
      operation: 'read',
      sessionId: harness.sessionId,
    });
    expect(stored.revisionId).toBe(created.revisionId);
  });

  it('rejects a symlinked entry artifact instead of following it', async () => {
    const harness = createHarness();
    const created = await createDesign(harness);
    writeFileSync(path.join(harness.workdir, 'outside.pptd'), MANIFEST);
    symlinkSync(
      path.join(harness.workdir, 'outside.pptd'),
      path.join(harness.workdir, DESIGN_ARTIFACT_ENTRY)
    );
    await writeManifest(harness, created.revisionId);

    const attempt = await collectDesignTurnOutcome(contextFor(harness));
    expect(attempt.status).toBe('recorded');
    if (attempt.status !== 'recorded') return;
    expect(attempt.outcome.status).toBe('invalid');
    expect(attempt.outcome.diagnostics?.[0]?.code).toBe('design_collect_rejected');
  });

  it('keeps the artifact as a candidate when the user saved meanwhile', async () => {
    const harness = createHarness();
    const created = await createDesign(harness);
    await writeArtifact(harness, PAGE);
    await writeManifest(harness, created.revisionId);
    await moveBaseline(harness, created.revisionId);
    const userSaved = await designOperation(harness.root, {
      operation: 'read',
      sessionId: harness.sessionId,
    });

    const attempt = await collectDesignTurnOutcome(contextFor(harness));
    expect(attempt.status).toBe('recorded');
    if (attempt.status !== 'recorded') return;
    expect(attempt.outcome.status).toBe('candidate');
    const candidateId = attempt.outcome.candidateId;
    expect(candidateId).toMatch(/^[a-f0-9]{64}$/);

    // The user's canvas is still what they saved; the candidate waits beside it.
    const stored = await designOperation(harness.root, {
      operation: 'read',
      sessionId: harness.sessionId,
    });
    expect(stored.revisionId).toBe(userSaved.revisionId);
    expect(stored.doc.elements).toHaveLength(0);
    const { candidate } = await readDesignCandidate(harness.root, harness.sessionId, candidateId);
    expect(candidate.turnId).toBe(harness.turnId);
    expect(candidate.baselineRevisionId).toBe(created.revisionId);
    expect(candidate.content.doc.canvas).toEqual({ width: 320, height: 200 });
    expect(candidate.content.doc.elements).toHaveLength(3);
  });

  it('writes the same candidate id when the same turn is collected again', async () => {
    const harness = createHarness();
    const created = await createDesign(harness);
    await writeArtifact(harness, PAGE);
    await writeManifest(harness, created.revisionId);
    await moveBaseline(harness, created.revisionId);

    const first = await collectDesignTurnOutcome(contextFor(harness));
    expect(first.status).toBe('recorded');
    if (first.status !== 'recorded') return;

    harness.forgetOutcome();
    const second = await collectDesignTurnOutcome(contextFor(harness));
    expect(second).toEqual(first);
    const candidates = await listDesignCandidates(harness.root, harness.sessionId);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.candidateId).toBe(first.outcome.candidateId);
  });

  it('applies once when a finalized turn is collected twice', async () => {
    const harness = createHarness();
    const created = await createDesign(harness);
    await writeArtifact(harness, PAGE);
    await writeManifest(harness, created.revisionId);

    const first = await collectDesignTurnOutcome(contextFor(harness));
    expect(first.status).toBe('recorded');
    if (first.status !== 'recorded') return;
    const stored = await designOperation(harness.root, {
      operation: 'read',
      sessionId: harness.sessionId,
    });

    // The artifact is gone, so a second run could only be a re-commit.
    rmSync(path.join(harness.workdir, DESIGN_ARTIFACT_ENTRY));
    const second = await collectDesignTurnOutcome(contextFor(harness));
    expect(second).toEqual({ status: 'skipped', reason: 'already_recorded' });
    expect(harness.history[0]?.designOutcome).toEqual(first.outcome);
    const after = await designOperation(harness.root, {
      operation: 'read',
      sessionId: harness.sessionId,
    });
    expect(after.revisionId).toBe(stored.revisionId);
  });

  it('reports invalid when the manifest cannot anchor the baseline', async () => {
    const harness = createHarness();
    await createDesign(harness);
    await writeArtifact(harness, PAGE);
    const dir = path.join(harness.workdir, DESIGN_TURN_INPUT_DIRNAME, harness.turnId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, DESIGN_TURN_MANIFEST_FILENAME), '{ not json');

    const attempt = await collectDesignTurnOutcome(contextFor(harness));
    expect(attempt.status).toBe('recorded');
    if (attempt.status !== 'recorded') return;
    expect(attempt.outcome.status).toBe('invalid');
    expect(attempt.outcome.diagnostics?.[0]?.code).toBe('design_manifest_unreadable');
  });

  it('reports invalid when the manifest belongs to another turn', async () => {
    const harness = createHarness();
    const created = await createDesign(harness);
    await writeArtifact(harness, PAGE);
    await writeManifest(harness, created.revisionId);
    const manifestFile = path.join(
      harness.workdir,
      DESIGN_TURN_INPUT_DIRNAME,
      harness.turnId,
      DESIGN_TURN_MANIFEST_FILENAME
    );
    const manifest = JSON.parse(
      await import('node:fs/promises').then((fs) => fs.readFile(manifestFile, 'utf8'))
    ) as Record<string, unknown>;
    writeFileSync(manifestFile, JSON.stringify({ ...manifest, turnId: 'someone-else' }));

    const attempt = await collectDesignTurnOutcome(contextFor(harness));
    expect(attempt.status).toBe('recorded');
    if (attempt.status !== 'recorded') return;
    expect(attempt.outcome.diagnostics?.[0]?.code).toBe('design_manifest_mismatch');
  });

  it('does nothing without a frozen manifest (pre-P2.2 session)', async () => {
    const harness = createHarness();
    const created = await createDesign(harness);
    await writeArtifact(harness, PAGE);

    expect(await collectDesignTurnOutcome(contextFor(harness))).toEqual({
      status: 'skipped',
      reason: 'no_manifest',
    });
    expect(harness.history[0]?.designOutcome).toBeUndefined();
    const stored = await designOperation(harness.root, {
      operation: 'read',
      sessionId: harness.sessionId,
    });
    expect(stored.revisionId).toBe(created.revisionId);
  });

  it('is a no-op for a session that is not a design session', async () => {
    const harness = createHarness({ design: false });
    await writeArtifact(harness, PAGE);
    await writeManifest(harness, 'b'.repeat(64));

    expect(await collectDesignTurnOutcome(contextFor(harness))).toEqual({
      status: 'skipped',
      reason: 'not_design',
    });
    expect(harness.history[0]?.designOutcome).toBeUndefined();
  });

  it('skips silently when the session document is unreadable', async () => {
    const harness = createHarness({ metaThrows: true });
    expect(await collectDesignTurnOutcome(contextFor(harness))).toEqual({
      status: 'skipped',
      reason: 'session_doc_unreadable',
    });
  });

  it('does not claim a card when the turn entry is gone', async () => {
    const harness = createHarness({ history: false });
    const created = await createDesign(harness);
    await writeManifest(harness, created.revisionId);

    expect(await collectDesignTurnOutcome(contextFor(harness))).toEqual({
      status: 'skipped',
      reason: 'entry_missing',
    });
    expect(harness.history).toEqual([]);
  });
});

describe('recordDesignTurnTerminalOutcome', () => {
  it('records a cancelled turn without touching the canvas or the candidate list', async () => {
    const harness = createHarness();
    const created = await createDesign(harness);
    await writeArtifact(harness, PAGE);
    await writeManifest(harness, created.revisionId);

    const attempt = await recordDesignTurnTerminalOutcome({
      ...contextFor(harness),
      status: 'cancelled',
    });
    expect(attempt.status).toBe('recorded');
    if (attempt.status !== 'recorded') return;
    expect(attempt.outcome.status).toBe('cancelled');
    expect(attempt.outcome.diagnostics).toBeUndefined();
    const stored = await designOperation(harness.root, {
      operation: 'read',
      sessionId: harness.sessionId,
    });
    expect(stored.revisionId).toBe(created.revisionId);
    expect(await listDesignCandidates(harness.root, harness.sessionId)).toEqual([]);
  });

  it('records a failed turn with its bounded message', async () => {
    const harness = createHarness();
    const created = await createDesign(harness);
    await writeManifest(harness, created.revisionId);

    const attempt = await recordDesignTurnTerminalOutcome({
      ...contextFor(harness),
      status: 'failed',
      message: 'The agent process disconnected unexpectedly.',
    });
    expect(attempt.status).toBe('recorded');
    if (attempt.status !== 'recorded') return;
    expect(attempt.outcome).toMatchObject({
      status: 'failed',
      diagnostics: [
        { code: 'design_turn_failed', message: 'The agent process disconnected unexpectedly.' },
      ],
    });
  });

  it('keeps the first verdict when a failure follows a collection', async () => {
    const harness = createHarness();
    const created = await createDesign(harness);
    await writeArtifact(harness, PAGE);
    await writeManifest(harness, created.revisionId);
    await collectDesignTurnOutcome(contextFor(harness));

    expect(
      await recordDesignTurnTerminalOutcome({ ...contextFor(harness), status: 'cancelled' })
    ).toEqual({ status: 'skipped', reason: 'already_recorded' });
    expect(recordedOutcome(harness)?.status).toBe('committed');
  });

  it('does not record a failure for a turn whose input was never frozen', async () => {
    const harness = createHarness();
    await createDesign(harness);
    expect(
      await recordDesignTurnTerminalOutcome({ ...contextFor(harness), status: 'failed' })
    ).toEqual({ status: 'skipped', reason: 'no_manifest' });
    expect(harness.history[0]?.designOutcome).toBeUndefined();
  });
});
