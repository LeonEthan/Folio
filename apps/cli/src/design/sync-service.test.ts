import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DesignSyncService } from './sync-service';
import { designOperation } from './store';
import { resolveDesignWorkspace } from './workspace';
import { readDesignArtifact } from './artifact';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), 'design-sync-test-'));
  roots.push(root);
  const sessionId = randomUUID();
  const workspace = resolveDesignWorkspace({
    workspaceRoot: root,
    sessionId,
    artworkId: sessionId,
    legacyWorkdir: path.join(root, 'chats', sessionId),
  });
  const payload = await designOperation(root, {
    operation: 'create',
    association: {
      sessionId,
      name: 'Synthetic',
      userId: 'test',
      machineId: 'test',
      createdAt: '2026-09-11T00:00:00Z',
    },
  });
  const service = new DesignSyncService({
    artworkId: sessionId,
    workspace,
    dataRoot: root,
    assertActive: () => {},
  });
  return { root, workspace, payload, service, sessionId };
}
it('projects saved edits without touching the draft and binds only successful controlled output', async () => {
  const { root, workspace, payload, service, sessionId } = await setup();
  const updated = await designOperation(root, {
    operation: 'save',
    sessionId,
    baseRevisionId: payload.revisionId,
    content: {
      doc: { ...payload.doc, background: { type: 'solid', color: '#123456' } },
      assets: {},
    },
  });
  await mkdir(workspace.artifactWorkdir, { recursive: true });
  const draft = path.join(workspace.artifactWorkdir, 'design.pptd');
  await writeFile(draft, 'preserved draft');
  await service.handle({ phase: 'generation', generation: 'g1', runtimeVersion: '0.85.1' });
  for (const [i, file] of ['design.pptd', 'pages/design.page'].entries()) {
    const target = path.join(workspace.projectionWorkdir, file);
    await service.handle({
      phase: 'call',
      generation: 'g1',
      callId: `r${i}`,
      tool: 'read',
      path: target,
    });
    await service.handle({
      phase: 'result',
      callId: `r${i}`,
      isError: false,
      text: await readFile(target, 'utf8'),
    });
  }
  expect(await readFile(draft, 'utf8')).toBe('preserved draft');
  expect(
    await readFile(path.join(workspace.projectionWorkdir, 'pages/design.page'), 'utf8')
  ).toContain('#123456');
  await expect(
    service.handle({ phase: 'call', generation: 'g1', callId: 'early', tool: 'write', path: draft })
  ).rejects.toThrow('DESIGN_READ_REQUIRED');
  await service.handle({ phase: 'generation', generation: 'g2', runtimeVersion: '0.85.1' });
  await service.handle({
    phase: 'call',
    generation: 'g2',
    callId: 'failed',
    tool: 'write',
    path: draft,
  });
  await service.handle({ phase: 'result', callId: 'failed', isError: true });
  expect(service.getAttempt()).toBeUndefined();
  for (const [i, file] of ['design.pptd', 'pages/design.page'].entries()) {
    const target = path.join(workspace.artifactWorkdir, file);
    await service.handle({
      phase: 'call',
      generation: 'g2',
      callId: `w${i}`,
      tool: 'write',
      path: target,
    });
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, await readFile(path.join(workspace.projectionWorkdir, file)));
    await service.handle({ phase: 'result', callId: `w${i}`, isError: false });
  }
  const artifact = await readDesignArtifact(workspace.artifactWorkdir);
  expect(artifact.status).toBe('present');
  expect(service.getAttempt()).toMatchObject({
    revisionId: updated.revisionId,
    artifactDigest: artifact.status === 'present' ? artifact.digest : '',
  });
});
it('leaves ordinary files outside design guards and refuses projection writes', async () => {
  const { service, workspace } = await setup();
  await service.handle({
    phase: 'call',
    generation: 'unknown',
    callId: 'ordinary',
    tool: 'write',
    path: 'notes.txt',
  });
  await service.handle({
    phase: 'call',
    generation: 'unknown',
    callId: 'ordinary-read',
    tool: 'read',
    path: 'notes.txt',
    offset: 0,
  });
  await expect(
    service.handle({
      phase: 'call',
      generation: 'unknown',
      callId: 'invalid-range',
      tool: 'read',
      path: path.join(workspace.projectionWorkdir, 'design.pptd'),
      offset: 0,
    })
  ).rejects.toThrow('Invalid read range');
  await expect(
    service.handle({
      phase: 'call',
      generation: 'unknown',
      callId: 'input',
      tool: 'write',
      path: path.join(workspace.projectionWorkdir, 'design.pptd'),
    })
  ).rejects.toThrow('DESIGN_INPUT_READ_ONLY');
  expect(await readDesignArtifact(workspace.artifactWorkdir)).toEqual({ status: 'absent' });
});
