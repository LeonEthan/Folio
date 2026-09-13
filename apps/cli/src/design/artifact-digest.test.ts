import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, truncate, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { readDesignArtifact, readDesignArtifactDigest } from './artifact';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function createRoot() {
  const directory = await mkdtemp(path.join(tmpdir(), 'geon-digest-'));
  roots.push(directory);
  await mkdir(path.join(directory, 'pages'));
  await mkdir(path.join(directory, 'media'));
  return directory;
}

it('streaming digest matches existing snapshot encoding despite file creation order and binary bytes', async () => {
  const directory = await createRoot();
  for (const [file, text] of [
    ['pages/z.page', 'last'],
    ['media/β.bin', '\0binary\xff'],
    ['design.pptd', 'entry'],
    ['pages/a.page', 'first'],
    ['media/a.bin', 'asset'],
  ])
    await writeFile(path.join(directory, file), text);
  const snapshot = await readDesignArtifact(directory);
  if (snapshot.status !== 'present') throw Error('Synthetic snapshot missing');
  expect(await readDesignArtifactDigest(directory)).toEqual({
    status: 'present',
    digest: snapshot.digest,
  });
  await writeFile(path.join(directory, 'media/a.bin'), 'different');
  expect(await readDesignArtifactDigest(directory)).not.toEqual({
    status: 'present',
    digest: snapshot.digest,
  });
});

it('hashes retained media beyond the canonical 64 MiB storage bound using fixed-size buffers', async () => {
  const directory = await createRoot();
  await writeFile(path.join(directory, 'design.pptd'), 'entry');
  const media = path.join(directory, 'media/retained.bin');
  await writeFile(media, '');
  const length = 64 * 1024 * 1024 + 1;
  await truncate(media, length); // sparse fixture, no full-sized allocation
  const expected = createHash('sha256');
  expected.update('design.pptd\u00005\u0000entry');
  expected.update('media/retained.bin\0' + String(length) + '\0');
  const chunk = new Uint8Array(64 * 1024);
  for (let remaining = length; remaining > 0; remaining -= chunk.length)
    expected.update(chunk.subarray(0, Math.min(chunk.length, remaining)));
  expect(await readDesignArtifactDigest(directory)).toEqual({
    status: 'present',
    digest: expected.digest('hex'),
  });
});

it('streaming observation preserves absence and the shared redirected-file refusal', async () => {
  const directory = await createRoot();
  expect(await readDesignArtifactDigest(directory)).toEqual({ status: 'absent' });
  await writeFile(path.join(directory, 'design.pptd'), 'entry');
  await writeFile(path.join(directory, 'outside'), 'outside');
  await symlink(path.join(directory, 'outside'), path.join(directory, 'media/redirected'));
  expect(await readDesignArtifactDigest(directory)).toMatchObject({
    status: 'rejected',
    rejectedBy: 'snapshot',
    message: expect.stringContaining('symlink'),
  });
});
