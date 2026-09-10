/**
 * Reading a recorded result-card thumbnail (P2.6).
 *
 * The reference arrives from a durable, unvalidated history field, so these
 * tests are mostly about what the reader *refuses*: a path-shaped reference, a
 * symlinked workspace level, a file that is not a PNG, one that is not a
 * bounded regular file. Every refusal is an ordinary absence — the card shows
 * no image — and none of them may create, repair, or re-render anything.
 *
 * The fixture bytes are a real PNG signature followed by filler: the reader
 * sniffs the header, and nothing here decodes an image.
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_THUMBNAIL_BYTES,
  readDesignThumbnail,
  type DesignThumbnailRead,
} from './thumbnail-read';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
/**
 * Signature plus a well-formed IHDR: the reader checks the header the write
 * side's own verification checks, so a fixture has to carry a real one. Nothing
 * here needs decodable pixels — the card lays the image out from the recorded
 * dimensions, not from the file.
 */
const pngBytes = (width = 320, height = 200): Buffer => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const length = Buffer.alloc(4);
  length.writeUInt32BE(13, 0);
  return Buffer.concat([PNG_SIGNATURE, length, Buffer.from('IHDR'), ihdr]);
};
/** A shape-valid reference for `digest`, which is what the writer records. */
const referenceFor = (digest: string) => `design-thumbnail/${digest}.png`;
const DIGEST = 'a'.repeat(64);

const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

type Harness = {
  dataRoot: string;
  sessionId: string;
  workspace: string;
  thumbnailDirectory: string;
  /** Write `bytes` at the reference's real location and return the reference. */
  record: (bytes: Buffer, digest?: string) => Promise<string>;
};

function createHarness(): Harness {
  const dataRoot = mkdtempSync(path.join(tmpdir(), 'folio-thumbnail-read-'));
  roots.push(dataRoot);
  const sessionId = randomUUID();
  const workspace = path.join(dataRoot, 'chats', sessionId);
  const thumbnailDirectory = path.join(workspace, 'design-thumbnail');
  return {
    dataRoot,
    sessionId,
    workspace,
    thumbnailDirectory,
    record: async (bytes, digest = DIGEST) => {
      await mkdir(thumbnailDirectory, { recursive: true });
      const reference = referenceFor(digest);
      await writeFile(path.join(workspace, reference), bytes);
      return reference;
    },
  };
}

const read = (harness: Harness, reference: unknown): Promise<DesignThumbnailRead> =>
  readDesignThumbnail(harness.dataRoot, harness.sessionId, reference);

const unavailable = (reason: 'missing' | 'unreadable') => ({ status: 'unavailable', reason });

describe('readDesignThumbnail', () => {
  it('serves the recorded PNG as a data URI', async () => {
    const harness = createHarness();
    const bytes = pngBytes(320, 200);
    const reference = await harness.record(bytes);

    expect(await read(harness, reference)).toEqual({
      status: 'ok',
      dataUri: `data:image/png;base64,${bytes.toString('base64')}`,
    });
    // A read creates nothing: the directory holds exactly what was written.
    expect(readdirSync(harness.thumbnailDirectory)).toEqual([`${DIGEST}.png`]);
  });

  it('is an ordinary absence when the file is gone', async () => {
    const harness = createHarness();
    const reference = await harness.record(pngBytes());
    rmSync(path.join(harness.workspace, reference));

    expect(await read(harness, reference)).toEqual(unavailable('missing'));
  });

  it('is an ordinary absence when the session has no design workspace at all', async () => {
    const harness = createHarness();

    expect(await read(harness, referenceFor(DIGEST))).toEqual(unavailable('missing'));
    // Nothing was created to answer the question.
    expect(existsSync(path.join(harness.dataRoot, 'chats'))).toBe(false);
  });

  it('refuses every reference that is not exactly one digest-named PNG in its directory', async () => {
    const harness = createHarness();
    // A real file at the one path the pattern allows, so each case below fails
    // for its own reason rather than because there was nothing to read.
    await harness.record(pngBytes());
    const refusals: unknown[] = [
      // Traversal and absolute paths, in the shapes that usually slip through.
      `../../../etc/passwd`,
      `design-thumbnail/../../${DIGEST}.png`,
      `/etc/passwd`,
      `/tmp/${DIGEST}.png`,
      // Right directory, wrong name.
      `design-thumbnail/${DIGEST}.jpg`,
      `design-thumbnail/${DIGEST}.png/../${DIGEST}.png`,
      `design-thumbnail/${'a'.repeat(63)}.png`,
      `design-thumbnail/${'A'.repeat(64)}.png`,
      `design-thumbnail/${DIGEST}.png?x=1`,
      `design-thumbnail//${DIGEST}.png`,
      `${DIGEST}.png`,
      // A real sibling directory the reader has no business in.
      `candidates/${DIGEST}.png`,
      // A Windows path, which the pattern cannot match either.
      `C:\\design-thumbnail\\${DIGEST}.png`,
      // Not a string at all.
      undefined,
      null,
      42,
      { path: referenceFor(DIGEST) },
    ];

    for (const reference of refusals) {
      expect(await read(harness, reference), String(reference)).toEqual(unavailable('missing'));
    }
    // Every refusal left the one real thumbnail untouched.
    expect(readdirSync(harness.thumbnailDirectory)).toEqual([`${DIGEST}.png`]);
  });

  it('refuses a workspace or thumbnail directory that is a symlink', async () => {
    const harness = createHarness();
    const outside = mkdtempSync(path.join(tmpdir(), 'folio-thumbnail-outside-'));
    roots.push(outside);
    await writeFile(path.join(outside, `${DIGEST}.png`), pngBytes());

    // The session directory itself is a link out of the data root.
    await mkdir(path.join(harness.dataRoot, 'chats'), { recursive: true });
    symlinkSync(outside, path.join(harness.dataRoot, 'chats', harness.sessionId));
    expect(await read(harness, referenceFor(DIGEST))).toEqual(unavailable('missing'));

    // The session directory is real, but the thumbnail directory inside it is
    // the link — the level the writer would have created.
    rmSync(path.join(harness.dataRoot, 'chats', harness.sessionId));
    await mkdir(harness.workspace, { recursive: true });
    symlinkSync(outside, harness.thumbnailDirectory);
    expect(await read(harness, referenceFor(DIGEST))).toEqual(unavailable('missing'));
  });

  it('refuses a symlink in place of the PNG itself', async () => {
    const harness = createHarness();
    const outside = mkdtempSync(path.join(tmpdir(), 'folio-thumbnail-outside-'));
    roots.push(outside);
    const realFile = path.join(outside, `${DIGEST}.png`);
    await writeFile(realFile, pngBytes());
    await mkdir(harness.thumbnailDirectory, { recursive: true });
    symlinkSync(realFile, path.join(harness.thumbnailDirectory, `${DIGEST}.png`));

    expect(await read(harness, referenceFor(DIGEST))).toEqual(unavailable('missing'));
  });

  it('refuses bytes that are not a PNG, a file that is not regular, and an empty file', async () => {
    const harness = createHarness();
    const notImages = [
      Buffer.from('<html>not an image</html>'),
      pngBytes().subarray(0, 4),
      pngBytes().subarray(0, 8),
      Buffer.alloc(0),
      Buffer.from([0xff, 0xd8, 0xff]),
    ];

    for (const bytes of notImages) {
      await harness.record(bytes);
      expect(await read(harness, referenceFor(DIGEST))).toEqual(unavailable('unreadable'));
    }

    // A directory where the PNG should be is not a file to read.
    rmSync(path.join(harness.thumbnailDirectory, `${DIGEST}.png`));
    await mkdir(path.join(harness.thumbnailDirectory, `${DIGEST}.png`));
    expect(await read(harness, referenceFor(DIGEST))).toEqual(unavailable('unreadable'));
  });

  it('refuses a file larger than the channel will carry', async () => {
    const harness = createHarness();
    await harness.record(Buffer.concat([pngBytes(), Buffer.alloc(MAX_THUMBNAIL_BYTES)]));

    expect(await read(harness, referenceFor(DIGEST))).toEqual(unavailable('unreadable'));
  });

  it('treats a malformed session id as the caller bug every design read treats it as', async () => {
    const harness = createHarness();
    await harness.record(pngBytes());

    await expect(
      readDesignThumbnail(harness.dataRoot, 'not-a-session', referenceFor(DIGEST))
    ).rejects.toThrow();
  });
});
