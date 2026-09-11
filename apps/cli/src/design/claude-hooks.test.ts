import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ClaudeDesignHooks, type ClaudeDesignHook } from './claude-hooks';
import { DesignSyncService } from './sync-service';
import { resolveDesignWorkspace } from './workspace';
import { designOperation } from './store';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), 'claude-hooks-test-'));
  roots.push(root);
  const id = randomUUID();
  const workspace = resolveDesignWorkspace({
    workspaceRoot: root,
    sessionId: id,
    artworkId: id,
    legacyWorkdir: path.join(root, 'chats', id),
  });
  await designOperation(root, {
    operation: 'create',
    association: {
      sessionId: id,
      name: 'Synthetic',
      userId: 'test',
      machineId: 'test',
      createdAt: '2026-09-11T00:00:00Z',
    },
  });
  const service = new DesignSyncService({
    artworkId: id,
    workspace,
    dataRoot: root,
    assertActive: () => {},
    runtimeVersion: '2.1.258',
  });
  const adapter = new ClaudeDesignHooks(service);
  const event = (input: Omit<ClaudeDesignHook, 'phase' | 'runtimeVersion'>) =>
    adapter.handle({ phase: 'claude', runtimeVersion: '2.1.258', ...input });
  await event({ event: 'UserPromptSubmit' });
  const write = () =>
    event({
      event: 'PreToolUse',
      tool: 'Write',
      callId: 'write',
      path: path.join(workspace.artifactWorkdir, 'design.pptd'),
    });
  return { event, write, adapter, workspace, service };
}

it.each(['failure', 'cancel', 'missing success', 'partial', 'rewritten'] as const)(
  '%s Read never authorizes writing',
  async (mode) => {
    const { event, write, workspace } = await setup();
    const calls = [];
    for (const [i, file] of ['design.pptd', 'pages/design.page'].entries()) {
      const target = path.join(workspace.projectionWorkdir, file),
        id = `r${i}`;
      await event({ event: 'PreToolUse', tool: 'Read', callId: id, path: target });
      if (mode === 'failure' || mode === 'cancel')
        await event({ event: 'PostToolUseFailure', callId: id });
      else if (mode !== 'missing success') await event({ event: 'PostToolUse', callId: id });
      let lines = (await readFile(target, 'utf8')).split('\n');
      if (mode === 'partial') lines = lines.slice(0, 1);
      if (mode === 'rewritten') lines[0] = 'redacted';
      calls.push({ id, response: lines.map((line, n) => `${n + 1}\t${line}`).join('\n') });
    }
    await event({ event: 'PostToolBatch', calls });
    await expect(write()).rejects.toThrow('DESIGN_READ_REQUIRED');
  }
);

it('only final successful complete batch delivery advances eligibility', async () => {
  const { event, write, workspace, adapter } = await setup();
  const calls = [];
  for (const [i, file] of ['design.pptd', 'pages/design.page'].entries()) {
    const target = path.join(workspace.projectionWorkdir, file),
      id = `r${i}`;
    await event({ event: 'PreToolUse', tool: 'Read', callId: id, path: target });
    await event({ event: 'PostToolUse', callId: id });
    calls.push({
      id,
      response: (await readFile(target, 'utf8'))
        .split('\n')
        .map((line, n) => `${n + 1}\t${line}`)
        .join('\n'),
    });
  }
  await expect(write()).rejects.toThrow('DESIGN_READ_REQUIRED');
  await event({ event: 'PostToolBatch', calls });
  await expect(write()).resolves.toBeUndefined();
  await expect(adapter.resubmit()).rejects.toThrow('missing unambiguous native call');
});

it('rejects unverified runtime and subagent evidence', async () => {
  const { event, adapter } = await setup();
  await expect(
    adapter.handle({ phase: 'claude', event: 'UserPromptSubmit', runtimeVersion: 'unknown' })
  ).rejects.toThrow('verified runtime');
  await expect(
    event({ event: 'PreToolUse', tool: 'Read', callId: 'child', path: 'file', agentId: 'subagent' })
  ).rejects.toThrow('main Claude session');
});
