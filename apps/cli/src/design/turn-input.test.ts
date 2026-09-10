/**
 * Design turn-input manifest tests (P2.2). Synthetic designs and synthetic
 * image bytes only; the manifest is the integrity anchor for P2.3, so these
 * cover content correctness, atomic/idempotent writes and blocking failures.
 */

import { createHash, randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { designOperation, acknowledgeDesign } from './store';
import {
  DESIGN_TURN_INPUT_DIRNAME,
  DesignTurnInputError,
  materializeDesignTurnInput,
} from './turn-input';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const sha256Hex = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

/** Minimal byte-correct PNG container (header + IHDR); the manifest records
 *  bytes, not decodability, so a real encoder is not needed. */
const pngBytes = (seed: number): Buffer => {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4, 'ascii');
  ihdr.writeUInt32BE(8, 8);
  ihdr.writeUInt32BE(4, 12);
  return Buffer.concat([header, ihdr, Buffer.from([seed, seed >>> 8])]);
};

async function setupDesign(options: { width?: number; height?: number } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'folio-turn-input-'));
  roots.push(root);
  const sessionId = randomUUID();
  await designOperation(root, {
    operation: 'create',
    association: {
      sessionId,
      name: 'Synthetic',
      userId: 'local:test',
      machineId: 'test-machine',
      createdAt: '2026-09-10T00:00:00.000Z',
    },
    width: options.width ?? 800,
    height: options.height ?? 600,
  });
  await acknowledgeDesign(root, sessionId);
  const workdir = path.join(root, 'chats', sessionId);
  await mkdir(workdir, { recursive: true });
  return { root, sessionId, workdir };
}

describe('materializeDesignTurnInput', () => {
  it('freezes prompt, canvas, baseline revision, skill identity and verified reference copies', async () => {
    const { root, sessionId, workdir } = await setupDesign({ width: 1200, height: 628 });
    const image = pngBytes(7);
    const turnId = 'turn-user-1';

    const manifest = await materializeDesignTurnInput({
      workdir,
      turnId,
      artworkId: sessionId,
      prompt: 'make a poster\n\nUse the skill at /x',
      skillSourceIdentity: 'a'.repeat(64),
      skillDrift: ['references/guide.md'],
      references: [{ bytes: image, mimeType: 'image/png' }],
      dataRoot: root,
    });

    const baseline = await designOperation(root, { operation: 'read', sessionId });
    expect(manifest).toEqual({
      version: 1,
      turnId,
      prompt: 'make a poster\n\nUse the skill at /x',
      canvas: { width: 1200, height: 628 },
      baselineRevisionId: baseline.revisionId,
      skillSourceIdentity: 'a'.repeat(64),
      skillDrift: ['references/guide.md'],
      references: [
        {
          file: `references/${sha256Hex(image)}.png`,
          sha256: sha256Hex(image),
          bytes: image.byteLength,
          mimeType: 'image/png',
        },
      ],
    });

    const turnDir = path.join(workdir, DESIGN_TURN_INPUT_DIRNAME, turnId);
    expect(JSON.parse(await readFile(path.join(turnDir, 'manifest.json'), 'utf8'))).toEqual(
      manifest
    );
    const landed = await readFile(path.join(turnDir, 'references', `${sha256Hex(image)}.png`));
    expect(sha256Hex(landed)).toBe(sha256Hex(image));
  });

  it('rewrites identical content on retry and leaves no temporary files behind', async () => {
    const { root, sessionId, workdir } = await setupDesign();
    const turnId = 'turn-user-retry';
    const request = {
      workdir,
      turnId,
      artworkId: sessionId,
      prompt: 'poster please',
      skillSourceIdentity: 'b'.repeat(64),
      references: [
        { bytes: pngBytes(1), mimeType: 'image/png' },
        { bytes: pngBytes(2), mimeType: 'image/png' },
      ],
      dataRoot: root,
    };

    const first = await materializeDesignTurnInput(request);
    const firstBytes = await readFile(
      path.join(workdir, DESIGN_TURN_INPUT_DIRNAME, turnId, 'manifest.json')
    );
    const second = await materializeDesignTurnInput(request);
    const secondBytes = await readFile(
      path.join(workdir, DESIGN_TURN_INPUT_DIRNAME, turnId, 'manifest.json')
    );

    expect(second).toEqual(first);
    expect(secondBytes.equals(firstBytes)).toBe(true);
    const turnDir = path.join(workdir, DESIGN_TURN_INPUT_DIRNAME, turnId);
    const referenceFiles = readdirSync(path.join(turnDir, 'references')).sort();
    expect(referenceFiles).toEqual(
      [pngBytes(1), pngBytes(2)].map((bytes) => `${sha256Hex(bytes)}.png`).sort()
    );
    // Atomic writes leave no `.tmp` siblings anywhere under the turn directory.
    expect(readdirSync(turnDir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('replaces a corrupted reference copy instead of trusting the file name', async () => {
    const { root, sessionId, workdir } = await setupDesign();
    const turnId = 'turn-user-corrupt';
    const image = pngBytes(3);
    const turnDir = path.join(workdir, DESIGN_TURN_INPUT_DIRNAME, turnId);
    await mkdir(path.join(turnDir, 'references'), { recursive: true });
    await writeFile(path.join(turnDir, 'references', `${sha256Hex(image)}.png`), 'corrupt');

    await materializeDesignTurnInput({
      workdir,
      turnId,
      artworkId: sessionId,
      prompt: 'p',
      skillSourceIdentity: 'c'.repeat(64),
      references: [{ bytes: image, mimeType: 'image/png' }],
      dataRoot: root,
    });

    const landed = await readFile(path.join(turnDir, 'references', `${sha256Hex(image)}.png`));
    expect(sha256Hex(landed)).toBe(sha256Hex(image));
  });

  it('fails closed when the design baseline cannot be read', async () => {
    const { root, workdir } = await setupDesign();
    await expect(
      materializeDesignTurnInput({
        workdir,
        turnId: 'turn-user-missing',
        artworkId: randomUUID(),
        prompt: 'p',
        skillSourceIdentity: 'd'.repeat(64),
        dataRoot: root,
      })
    ).rejects.toThrow(DesignTurnInputError);
    expect(readdirSync(workdir)).not.toContain(DESIGN_TURN_INPUT_DIRNAME);
  });

  it('refuses a turnId that would escape the design-input directory', async () => {
    const { root, sessionId, workdir } = await setupDesign();
    await expect(
      materializeDesignTurnInput({
        workdir,
        turnId: '../escape',
        artworkId: sessionId,
        prompt: 'p',
        skillSourceIdentity: 'e'.repeat(64),
        dataRoot: root,
      })
    ).rejects.toThrow(DesignTurnInputError);
  });
});
