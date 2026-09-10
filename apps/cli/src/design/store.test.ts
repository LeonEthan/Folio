import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, test } from 'vitest';
import {
  designOperation,
  pendingDesigns,
  acknowledgeDesign,
  listDesignCandidates,
  readDesignCandidate,
  saveDesignCandidate,
} from './store';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
test('durable save, stale writer, retry, independent copy and malformed input preserve the current drawing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'folio-design-'));
  roots.push(root);
  const association = {
    sessionId: randomUUID(),
    name: 'Synthetic',
    userId: 'local:test',
    machineId: 'test-machine',
    createdAt: '2026-09-09T00:00:00.000Z',
  };
  const created = await designOperation(root, {
    operation: 'create',
    association,
  });
  expect(created.doc.canvas).toEqual({ width: 800, height: 600 });
  expect((await pendingDesigns(root)).map((value) => value.association.sessionId)).toEqual([
    association.sessionId,
  ]);
  await acknowledgeDesign(root, association.sessionId);
  expect(await pendingDesigns(root)).toEqual([]);
  const content = {
    doc: { ...created.doc, background: { type: 'solid', color: '#ff0000' } },
    assets: {},
  };
  const request = {
    operation: 'save',
    sessionId: association.sessionId,
    baseRevisionId: created.revisionId,
    content,
  };
  const saved = await designOperation(root, request);
  expect(saved.revisionId).not.toBe(created.revisionId);
  expect(await designOperation(root, request)).toEqual(saved);
  await expect(
    designOperation(root, {
      ...request,
      content: {
        ...content,
        doc: { ...content.doc, background: { type: 'solid', color: '#00ff00' } },
      },
    })
  ).rejects.toThrow('DESIGN_CONFLICT');
  const copied = await designOperation(root, {
    operation: 'create',
    association: { ...association, sessionId: randomUUID(), name: 'Copy' },
    width: 800,
    height: 600,
    copy: content,
  });
  expect(copied.doc).toEqual(saved.doc);
  const invalid = {
    ...request,
    baseRevisionId: saved.revisionId,
    content: {
      ...content,
      doc: {
        ...content.doc,
        elements: [
          {
            id: 'bad',
            kind: 'text',
            bounds: [0, 0, 100, 100],
            zIndex: 0,
            content: 'not structured text',
          },
        ],
      },
    },
  };
  await expect(designOperation(root, invalid)).rejects.toThrow();
  expect(
    await designOperation(root, { operation: 'read', sessionId: association.sessionId })
  ).toEqual(saved);
  await expect(
    designOperation(root, { operation: 'read', sessionId: '../outside' })
  ).rejects.toThrow();
  const fixture = JSON.parse(
    await readFile(
      new URL('../../../../packages/design-bento/sample.json', import.meta.url),
      'utf8'
    )
  );
  const withAssets = await designOperation(root, {
    operation: 'create',
    association: { ...association, sessionId: randomUUID(), name: 'With assets' },
    width: 800,
    height: 600,
    copy: fixture,
  });
  const independent = await designOperation(root, {
    operation: 'create',
    association: { ...association, sessionId: randomUUID(), name: 'Independent assets' },
    width: 800,
    height: 600,
    copy: { doc: withAssets.doc, assets: withAssets.assets },
  });
  await rm(path.join(root, 'chats', withAssets.association.sessionId), { recursive: true });
  expect(
    (
      await designOperation(root, {
        operation: 'read',
        sessionId: independent.association.sessionId,
      })
    ).assets
  ).toEqual(withAssets.assets);
  const file = path.join(root, 'chats', copied.association.sessionId, 'design.json');
  await rm(file);
  await symlink(path.join(root, 'chats', association.sessionId, 'design.json'), file);
  await expect(
    designOperation(root, { operation: 'read', sessionId: copied.association.sessionId })
  ).rejects.toThrow();
  const bytes = await readFile(
    path.join(root, 'chats', association.sessionId, 'design.json'),
    'utf8'
  );
  expect(JSON.parse(bytes).doc).toEqual(saved.doc);
  await writeFile(path.join(root, 'chats', association.sessionId, 'design.json'), '{}');
  await expect(
    designOperation(root, { operation: 'create', association, width: 800, height: 600 })
  ).rejects.toThrow();
});

test('a candidate is written beside the canvas, addressed by content and never twice', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'folio-design-'));
  roots.push(root);
  const association = {
    sessionId: randomUUID(),
    name: 'Synthetic',
    userId: 'local:test',
    machineId: 'test-machine',
    createdAt: '2026-09-09T00:00:00.000Z',
  };
  const created = await designOperation(root, { operation: 'create', association });
  const candidate = {
    artworkId: association.sessionId,
    turnId: 'turn-1',
    baselineRevisionId: created.revisionId,
    createdAt: '2026-09-10T01:00:00.000Z',
    content: {
      doc: { ...created.doc, background: { type: 'solid', color: '#123456' } },
      assets: {},
    },
  };
  const first = await saveDesignCandidate(root, candidate);
  expect(first.candidateId).toMatch(/^[a-f0-9]{64}$/);

  // Same content, later turn: still one candidate, still the first one's bytes.
  const again = await saveDesignCandidate(root, {
    ...candidate,
    turnId: 'turn-2',
    createdAt: '2026-09-11T09:00:00.000Z',
  });
  expect(again).toEqual(first);
  const { candidate: stored, file } = await readDesignCandidate(
    root,
    association.sessionId,
    first.candidateId
  );
  expect(stored.turnId).toBe('turn-1');
  expect(stored.content.doc).toEqual(candidate.content.doc);
  expect(await listDesignCandidates(root, association.sessionId)).toEqual([first]);

  // The candidate is an addition, not a write: the canvas is untouched.
  expect(
    await designOperation(root, { operation: 'read', sessionId: association.sessionId })
  ).toEqual(created);

  // A different design is a different candidate id, and an unreadable one is
  // reported instead of being adopted on trust.
  const other = await saveDesignCandidate(root, {
    ...candidate,
    content: { doc: created.doc, assets: {} },
  });
  expect(other.candidateId).not.toBe(first.candidateId);
  expect(await listDesignCandidates(root, association.sessionId)).toHaveLength(2);
  await writeFile(file, '{}');
  await expect(
    readDesignCandidate(root, association.sessionId, first.candidateId)
  ).rejects.toThrow();
  await rm(path.join(root, 'chats', association.sessionId, 'candidates'), { recursive: true });
  await expect(readDesignCandidate(root, association.sessionId, first.candidateId)).rejects.toThrow(
    'not found'
  );
  expect(await listDesignCandidates(root, association.sessionId)).toEqual([]);
  await expect(readDesignCandidate(root, '../outside', first.candidateId)).rejects.toThrow();
  await expect(
    readDesignCandidate(root, association.sessionId, '../design.json')
  ).rejects.toThrow();
  await expect(
    saveDesignCandidate(root, { ...candidate, artworkId: '../outside' })
  ).rejects.toThrow();
});
