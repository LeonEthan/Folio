/**
 * The post-turn thumbnail (P2.6): the document a turn collected is handed to
 * the desktop's render host scaled down, and the reference to the file it wrote
 * is what the result card records.
 *
 * The rule under test is that a thumbnail is an *addition* — every failure is
 * `undefined` and nothing is ever retried — and that what it records is the
 * file's own content digest, so identical documents share one file.
 *
 * Every fixture is synthetic and every "desktop" is a function: nothing here
 * renders, and nothing touches the network.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import type { DesignRenderHostWork } from '@lody/shared';
import type { DesignRenderPreviewOutcome } from './render-host';
import { canonicalContentBytes } from './store';
import type { DesignRenderQueue } from './render-output';
import {
  DESIGN_THUMBNAIL_DIRNAME,
  MAX_THUMBNAIL_EDGE,
  captureDesignThumbnail,
  type DesignThumbnailContext,
  type DesignThumbnailSubject,
} from './thumbnail';

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

/** The document a turn collected, in the shape the canvas and the store use. */
const DOC: Record<string, unknown> = {
  canvas: { width: 800, height: 600 },
  elements: [{ elementId: 'title', elementType: 'text', bounds: [0, 0, 100, 40] }],
};
const SUBJECT: DesignThumbnailSubject = { doc: DOC, assets: {} };

const digestOf = (subject: DesignThumbnailSubject): string =>
  createHash('sha256')
    .update(canonicalContentBytes(subject as Parameters<typeof canonicalContentBytes>[0]))
    .digest('hex');

const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

type Harness = {
  dataRoot: string;
  workdir: string;
  stageDirectory: string;
  thumbnailDirectory: string;
  ctx: (host: DesignRenderQueue) => DesignThumbnailContext;
};

function createHarness(): Harness {
  const dataRoot = mkdtempSync(path.join(tmpdir(), 'folio-thumbnail-'));
  roots.push(dataRoot);
  const workdir = path.join(dataRoot, 'chats', 'artwork-1');
  return {
    dataRoot,
    workdir,
    stageDirectory: path.join(dataRoot, 'design-preview-stage'),
    thumbnailDirectory: path.join(workdir, DESIGN_THUMBNAIL_DIRNAME),
    ctx: (host) => ({
      host,
      artworkId: 'artwork-1',
      workdir,
      dataRoot,
      name: 'Thumbnail test',
      userId: 'user-1',
      machineId: 'machine-1',
      now: () => new Date('2026-09-10T12:00:00.000Z'),
    }),
  };
}

type RecordingQueue = DesignRenderQueue & { seen: DesignRenderHostWork[] };

const queueThat = (
  handle: (work: DesignRenderHostWork) => Promise<DesignRenderPreviewOutcome>,
  connected = true
): RecordingQueue => {
  const seen: DesignRenderHostWork[] = [];
  return {
    seen,
    isConnected: () => connected,
    enqueue: async (work) => {
      seen.push(work);
      return await handle(work);
    },
  };
};

/** A desktop that renders correctly, but scaled: it writes a 240x180 thumbnail. */
const renderingQueue = (
  size: { width: number; height: number } = { width: 240, height: 180 },
  onPayload?: (payload: Record<string, unknown>) => void
): RecordingQueue =>
  queueThat(async (work) => {
    if (onPayload) {
      onPayload(JSON.parse(await readFile(work.payloadPath, 'utf8')) as Record<string, unknown>);
    }
    await writeFile(work.outputPath, syntheticPng(size.width, size.height, [10, 20, 30]));
    return { status: 'rendered', absolutePath: work.outputPath };
  });

describe('captureDesignThumbnail', () => {
  it('renders the document scaled, and records a reference to the file it wrote', async () => {
    const harness = createHarness();
    let staged: Record<string, unknown> | undefined;
    let asked: DesignRenderHostWork | undefined;
    const queue = renderingQueue({ width: 240, height: 180 }, (payload) => {
      staged = payload;
    });

    const thumbnail = await captureDesignThumbnail(
      harness.ctx({
        ...queue,
        enqueue: async (work, options) => {
          asked = work;
          expect(options).toEqual({ timeoutMs: 8_000 });
          return await queue.enqueue(work);
        },
      }),
      SUBJECT
    );

    expect(thumbnail).toEqual({
      path: `${DESIGN_THUMBNAIL_DIRNAME}/${digestOf(SUBJECT)}.png`,
      width: 240,
      height: 180,
    });
    // The canvas's own size is what the host is asked to lay out; `maxEdge` is
    // how the card gets something small enough to keep one per turn.
    expect(asked).toMatchObject({ width: 800, height: 600, maxEdge: MAX_THUMBNAIL_EDGE });
    // The staged payload is self-describing: the store's content address, and
    // the association the canvas needs to attach the render to its artwork.
    expect(staged?.['revisionId']).toBe(digestOf(SUBJECT));
    expect(staged?.['association']).toEqual({
      sessionId: 'artwork-1',
      name: 'Thumbnail test',
      userId: 'user-1',
      machineId: 'machine-1',
      createdAt: '2026-09-10T12:00:00.000Z',
    });
    // Staging is scratch; the thumbnail is not.
    expect(readdirSync(harness.stageDirectory)).toEqual([]);
    expect(readdirSync(harness.thumbnailDirectory)).toEqual([`${digestOf(SUBJECT)}.png`]);
  });

  it('stages nothing at all when no desktop is polling', async () => {
    const harness = createHarness();
    let asked = false;
    const queue = queueThat(async (work) => {
      asked = true;
      await writeFile(work.outputPath, syntheticPng(240, 180, [10, 20, 30]));
      return { status: 'rendered', absolutePath: work.outputPath };
    }, false);

    // Asked before any bytes are written: a machine with no desktop pays no
    // disk cost for a thumbnail it could not have rendered anyway.
    expect(await captureDesignThumbnail(harness.ctx(queue), SUBJECT)).toBeUndefined();
    expect(asked).toBe(false);
    expect(existsSync(harness.stageDirectory)).toBe(false);
    expect(existsSync(harness.thumbnailDirectory)).toBe(false);
  });

  it('shares one file between two turns that produced the same document', async () => {
    const harness = createHarness();
    const queue = renderingQueue();

    const first = await captureDesignThumbnail(harness.ctx(queue), SUBJECT);
    // The same document, built again: equal content is the same address.
    const second = await captureDesignThumbnail(harness.ctx(queue), {
      doc: { ...DOC },
      assets: {},
    });

    expect(second).toEqual(first);
    expect(readdirSync(harness.thumbnailDirectory)).toEqual([`${digestOf(SUBJECT)}.png`]);
  });

  it('leaves an earlier turn’s thumbnail alone when a later render of it fails', async () => {
    const harness = createHarness();
    const good = await captureDesignThumbnail(harness.ctx(renderingQueue()), SUBJECT);
    expect(good).toBeDefined();

    // The same document, but this time the host writes bytes that are not a
    // PNG. The reference the earlier turn recorded must still resolve.
    const bytes = readFileSync(path.join(harness.thumbnailDirectory, `${digestOf(SUBJECT)}.png`));
    const broken = queueThat(async (work) => {
      await writeFile(work.outputPath, Buffer.from('<html>not an image</html>'));
      return { status: 'rendered', absolutePath: work.outputPath };
    });
    expect(await captureDesignThumbnail(harness.ctx(broken), SUBJECT)).toBeUndefined();

    expect(readdirSync(harness.thumbnailDirectory)).toEqual([`${digestOf(SUBJECT)}.png`]);
    expect(readFileSync(path.join(harness.thumbnailDirectory, `${digestOf(SUBJECT)}.png`))).toEqual(
      bytes
    );
  });

  it('is an ordinary absence when the render is refused, unverifiable, or unavailable', async () => {
    const harness = createHarness();
    const refusals: DesignRenderQueue[] = [
      queueThat(async () => ({ status: 'refused', error: 'the desktop restarted' })),
      // A "rendering" whose bytes are not an image.
      queueThat(async (work) => {
        await writeFile(work.outputPath, Buffer.from('<html>not an image</html>'));
        return { status: 'rendered', absolutePath: work.outputPath };
      }),
      // A rendering that landed outside the session workdir.
      queueThat(async () => {
        const escaped = path.join(harness.dataRoot, 'escaped.png');
        await writeFile(escaped, syntheticPng(4, 4, [0, 0, 0]));
        return { status: 'rendered', absolutePath: escaped };
      }),
      // A host that never answers before the turn gives up on it.
      queueThat(async () => {
        throw Error('the desktop did not render the image within 8s');
      }),
    ];

    for (const queue of refusals) {
      expect(await captureDesignThumbnail(harness.ctx(queue), SUBJECT)).toBeUndefined();
    }
    expect(existsSync(harness.thumbnailDirectory)).toBe(false);
  });

  it('records nothing for a document that does not carry a canvas', async () => {
    const harness = createHarness();
    const queue = renderingQueue();

    for (const doc of [{}, { canvas: { width: 0, height: 600 } }, { canvas: 'big' }]) {
      expect(await captureDesignThumbnail(harness.ctx(queue), { doc, assets: {} })).toBeUndefined();
    }
    expect(queue.seen).toEqual([]);
    expect(existsSync(harness.stageDirectory)).toBe(false);
  });
});
