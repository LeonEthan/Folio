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

it('rereads after a conflict and explicitly resubmits identical bytes while fencing old calls and results', async () => {
  const { root, workspace, payload, service, sessionId } = await setup();
  const generate = (generation: string) =>
    service.handle({ phase: 'generation', generation, runtimeVersion: '0.85.1' });
  const readCurrent = async (generation: string) => {
    for (const file of ['design.pptd', 'pages/design.page']) {
      const target = path.join(workspace.projectionWorkdir, file);
      const callId = `${generation}-${file}`;
      await service.handle({ phase: 'call', generation, callId, tool: 'read', path: target });
      await service.handle({
        phase: 'result',
        callId,
        isError: false,
        text: await readFile(target, 'utf8'),
      });
    }
  };
  await generate('read1');
  await readCurrent('read1');
  await generate('write1');
  for (const file of ['design.pptd', 'pages/design.page']) {
    const target = path.join(workspace.artifactWorkdir, file);
    await service.handle({
      phase: 'call',
      generation: 'write1',
      callId: file,
      tool: 'write',
      path: target,
    });
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, await readFile(path.join(workspace.projectionWorkdir, file)));
    await service.handle({ phase: 'result', callId: file, isError: false });
  }
  // An authorized write is still in flight when an abnormal external writer wins.
  const draft = path.join(workspace.artifactWorkdir, 'design.pptd');
  await service.handle({
    phase: 'call',
    generation: 'write1',
    callId: 'late',
    tool: 'write',
    path: draft,
  });
  const newer = await designOperation(root, {
    operation: 'save',
    sessionId,
    baseRevisionId: payload.revisionId,
    content: {
      doc: { ...payload.doc, background: { type: 'solid', color: '#123456' } },
      assets: {},
    },
  });
  await expect(
    service.handle({
      phase: 'call',
      generation: 'write1',
      callId: 'stale',
      tool: 'write',
      path: draft,
    })
  ).rejects.toThrow(workspace.projectionWorkdir);
  const preserved = await readDesignArtifact(workspace.artifactWorkdir);
  await generate('read2');
  await readCurrent('read2');
  expect(service.getAttempt()).toBeUndefined(); // unfinished write does not attest output
  await expect(
    service.handle({ phase: 'resubmit', generation: 'read2', callId: 'same-batch' })
  ).rejects.toThrow('DESIGN_READ_STALE');
  await generate('resubmit');
  await service.handle({ phase: 'resubmit', generation: 'resubmit', callId: 'intent' });
  expect(service.getAttempt()).toMatchObject({
    revisionId: newer.revisionId,
    explicitResubmission: true,
    artifactDigest: preserved.status === 'present' ? preserved.digest : '',
  });
  expect(await readDesignArtifact(workspace.artifactWorkdir)).toEqual(preserved);
  await expect(
    service.handle({ phase: 'resubmit', generation: 'resubmit', callId: 'duplicate-intent' })
  ).rejects.toThrow('DESIGN_ATTEMPT_STALE');
  await expect(
    service.handle({
      phase: 'call',
      generation: 'resubmit',
      callId: 'parallel',
      tool: 'write',
      path: draft,
    })
  ).rejects.toThrow('DESIGN_ATTEMPT_STALE');
  const accepted = service.getAttempt();
  await writeFile(draft, 'late obsolete write');
  await service.handle({ phase: 'result', callId: 'late', isError: false });
  expect(service.getAttempt()).toEqual(accepted); // cannot attest bytes from a retired operation
  const changed = await readDesignArtifact(workspace.artifactWorkdir);
  expect(changed.status === 'present' ? changed.digest : '').not.toBe(accepted?.artifactDigest);
});

it('rejects a draft changed after generation without changing the active attempt', async () => {
  const { workspace, service } = await setup();
  await mkdir(workspace.artifactWorkdir, { recursive: true });
  const draft = path.join(workspace.artifactWorkdir, 'design.pptd');
  await writeFile(draft, 'original');
  await service.handle({ phase: 'generation', generation: 'g', runtimeVersion: '0.85.1' });
  await writeFile(draft, 'new bytes');
  await expect(
    service.handle({ phase: 'resubmit', generation: 'g', callId: 'intent' })
  ).rejects.toThrow('DESIGN_DRAFT_CHANGED');
  expect(service.getAttempt()).toBeUndefined();
  expect(await readFile(draft, 'utf8')).toBe('new bytes');
});

it('native terminal proof belongs only to the latest generation and resets before arguments', async () => {
  const { service } = await setup();
  await service.handle({ phase: 'generation', generation: 'old', runtimeVersion: '0.85.1' });
  await service.handle({ phase: 'terminal', generation: 'old', status: 'end_turn' });
  expect(service.getTerminalOutcome()).toBe('end_turn');
  await service.handle({ phase: 'generation', generation: 'new', runtimeVersion: '0.85.1' });
  expect(service.getTerminalOutcome()).toBeUndefined();
  await service.handle({ phase: 'terminal', generation: 'new', status: 'failed' });
  await expect(
    service.handle({ phase: 'terminal', generation: 'old', status: 'end_turn' })
  ).rejects.toThrow('Unknown native terminal generation');
  expect(service.getTerminalOutcome()).toBe('failed');
});
