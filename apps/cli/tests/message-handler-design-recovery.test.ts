import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  LocalMachineRpcRequestSchema,
  getSessionRoomId,
  type SessionId,
  type SessionMeta,
  type WorkspaceId,
} from '@lody/shared';

import { MessageHandler } from '../src/lib/message-handler';
import type { LoroDocumentManager } from '../src/lib/loro/doc';
import type { SessionManager } from '../src/session/session-manager';
import type { Logger } from '../src/utils/logger';
import { createTestCloudPort } from './test-cloud-port';

const DESIGN_SESSION_ID = '11111111-2222-4333-8444-555555555555' as SessionId;
const workspaceId = 'workspace-1' as WorkspaceId;

const createSilentLogger = (): Logger => ({
  info: () => {},
  warn: () => {},
  error: () => {},
  success: () => {},
  debug: () => {},
  setLevel: () => {},
  child: () => createSilentLogger(),
  close: async () => {},
});

const sessionMeta = (sessionId: SessionId, design: boolean): Partial<SessionMeta> => ({
  id: sessionId,
  machineId: 'machine-1' as SessionMeta['machineId'],
  createdAt: new Date().toISOString(),
  userId: 'user-1',
  title: 'A poster',
  ...(design ? { design: { artworkId: sessionId, path: 'design.json' } } : {}),
});

let client = {};
let launchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let runtime: 'pi' | 'claude' = 'pi';
const live = {
  get agentClient() {
    return client;
  },
  getDesignHookRuntime: () => runtime,
  getDesignHookLaunchId: () => launchId,
  getHostWorkdir: () => path.join(dataRoot, 'chats', DESIGN_SESSION_ID),
  getWorkdir: () => path.join(dataRoot, 'chats', DESIGN_SESSION_ID),
};
const createHandler = (
  sessions: Record<string, Partial<SessionMeta> | undefined> = {},
  _workspaceRoot?: string
): MessageHandler => {
  const sessionManager = {
    getSession: vi.fn(() => live),
    on: vi.fn(),
    setRequestPermissionHandler: vi.fn(),
    cleanUp: vi.fn(async () => {}),
  } as unknown as SessionManager;
  const workspaceDocument = {
    isTransportConnected: vi.fn(() => true),
    markMachineFlockDocDirty: vi.fn(),
    repo: {
      getDocMeta: vi.fn(async (roomId: string) => {
        for (const [sessionId, meta] of Object.entries(sessions)) {
          if (getSessionRoomId(sessionId as SessionId) === roomId && meta)
            return { meta: { ...meta } };
        }
        return undefined;
      }),
      upsertDocMeta: vi.fn(async () => {}),
      watch: vi.fn(() => ({ unsubscribe: vi.fn() })),
      openFlockDoc: vi.fn(async () => ({
        flock: { scan: () => [], set: vi.fn(), delete: vi.fn(), commit: vi.fn() },
        syncOnce: vi.fn(async () => {}),
      })),
    },
    getOrCreateSessionDoc: vi.fn(async () => ({ getMetaState: vi.fn(async () => undefined) })),
    sendMachineHeartbeat: vi.fn(async () => {}),
  } as unknown as LoroDocumentManager;
  return new MessageHandler(sessionManager, workspaceDocument, createSilentLogger(), {
    token: 'token',
    workspaceId,
    userId: 'user-1',
    machineId: 'machine-1',
    machineName: 'machine',
    cliVersion: '0.0.0',
    cloudPort: createTestCloudPort(),
  });
};

const send = async (handler: MessageHandler, request: Record<string, unknown>) => {
  const response = await handler.handleLocalMachineRpc(
    LocalMachineRpcRequestSchema.parse({
      machineId: 'machine-1',
      workspaceId,
      ...request,
    })
  );
  if (!response.ok) throw new Error(`rpc failed: ${response.error}`);
  return response.result;
};

import type { DesignToolEvent } from '../src/design/sync-service';
import type { SessionExecutionService } from '../src/session/session-execution-service';
import { DesignCanvasHost } from '../src/design/canvas-host';
import { designOperation } from '../src/design/store';
let dataRoot: string;
let handler: MessageHandler;
let draft: string;
beforeEach(async () => {
  dataRoot = mkdtempSync(path.join(tmpdir(), 'folio-t21-rpc-'));
  vi.stubEnv('LODY_DATA_DIR', dataRoot);
  client = {};
  launchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  runtime = 'pi';
  const meta = sessionMeta(DESIGN_SESSION_ID, true);
  handler = createHandler({ [DESIGN_SESSION_ID]: meta });
  const internal = handler as unknown as {
    executionService: SessionExecutionService;
    designCanvasHost: DesignCanvasHost;
  };
  vi.spyOn(internal.executionService, 'getActiveInvocationContext').mockReturnValue({
    sourceTurnId: 'turn-one',
  } as ReturnType<SessionExecutionService['getActiveInvocationContext']>);
  vi.spyOn(internal.executionService, 'getActiveDesignCanvasTurnId').mockReturnValue('canvas-one');
  const preparation = internal.designCanvasHost.prepare(
    DESIGN_SESSION_ID,
    DESIGN_SESSION_ID,
    'canvas-one',
    new AbortController().signal
  );
  internal.designCanvasHost.exchange([
    { artworkId: DESIGN_SESSION_ID, turnId: 'canvas-one', ok: true },
  ]);
  await preparation;
  await designOperation(dataRoot, {
    operation: 'create',
    association: {
      sessionId: DESIGN_SESSION_ID,
      name: 'Synthetic',
      userId: 'test',
      machineId: 'machine-1',
      createdAt: '2026-09-11T00:00:00Z',
    },
  });
  draft = path.join(dataRoot, 'chats', DESIGN_SESSION_ID);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(dataRoot, { recursive: true, force: true });
});
async function hook(event: DesignToolEvent, producer = launchId) {
  return send(handler, {
    method: 'design/tool-hook',
    ownerSessionId: DESIGN_SESSION_ID,
    params: { version: 1, launchId: producer, event },
  });
}
async function readCurrent() {
  expect(
    await hook({ phase: 'generation', generation: 'g1', runtimeVersion: '0.85.1' })
  ).toMatchObject({ ok: true });
  for (const [i, file] of ['design.pptd', 'pages/design.page'].entries()) {
    const target = path.join(draft, 'design-current', file);
    expect(
      await hook({ phase: 'call', generation: 'g1', callId: `r${i}`, tool: 'read', path: target })
    ).toMatchObject({ ok: true });
    expect(
      await hook({
        phase: 'result',
        callId: `r${i}`,
        isError: false,
        text: readFileSync(target, 'utf8'),
      })
    ).toMatchObject({ ok: true });
  }
}
it('replacement cannot borrow earlier reads or accept a late producer result', async () => {
  await readCurrent();
  const oldLaunch = launchId;
  client = {};
  launchId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  expect(
    await hook({ phase: 'result', callId: 'r0', isError: false, text: 'late' }, oldLaunch)
  ).toMatchObject({ ok: false, error: expect.stringContaining('launch has ended or changed') });
  expect(
    await hook({ phase: 'generation', generation: 'g2', runtimeVersion: '0.85.1' })
  ).toMatchObject({ ok: true });
  expect(await hook({ phase: 'terminal', generation: 'g1', status: 'end_turn' }, oldLaunch)).toMatchObject({ ok: false });
  expect(await send(handler, { method: 'design/tool-hook', ownerSessionId: DESIGN_SESSION_ID, params: { version: 1, launchId: oldLaunch, event: { phase: 'claude-resubmit' } } })).toMatchObject({ ok: false });
  expect(
    await hook({
      phase: 'call',
      generation: 'g2',
      callId: 'w',
      tool: 'write',
      path: path.join(draft, 'design.pptd'),
    })
  ).toMatchObject({ ok: false, error: expect.stringContaining('DESIGN_READ_REQUIRED') });
  await readCurrent();
  expect(
    await hook({ phase: 'generation', generation: 'g3', runtimeVersion: '0.85.1' })
  ).toMatchObject({ ok: true });
  expect(
    await hook({
      phase: 'call',
      generation: 'g3',
      callId: 'w2',
      tool: 'write',
      path: path.join(draft, 'design.pptd'),
    })
  ).toMatchObject({ ok: true });
});
it('a supported runtime switch rejects old Pi events and starts Claude without borrowed reads', async () => {
  await readCurrent();
  const oldLaunch = launchId;
  client = {};
  launchId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  runtime = 'claude';
  expect(
    await hook({ phase: 'generation', generation: 'late', runtimeVersion: '0.85.1' }, oldLaunch)
  ).toMatchObject({ ok: false });
  const claude = async (event: Record<string, unknown>) =>
    send(handler, {
      method: 'design/tool-hook',
      ownerSessionId: DESIGN_SESSION_ID,
      params: {
        version: 1,
        launchId,
        event: { phase: 'claude', runtimeVersion: '2.1.258', ...event },
      },
    });
  expect(await claude({ event: 'UserPromptSubmit' })).toMatchObject({ ok: true });
  expect(
    await claude({
      event: 'PreToolUse',
      callId: 'write',
      tool: 'Write',
      path: path.join(draft, 'design.pptd'),
    })
  ).toMatchObject({ ok: false, error: expect.stringContaining('DESIGN_READ_REQUIRED') });
});

it('an in-flight old launch cannot replace the fresh service after resolving its workspace', async () => {
  const internal = handler as unknown as {
    resolveActiveDesignContext: (...args: unknown[]) => Promise<unknown>;
  };
  const original = internal.resolveActiveDesignContext.bind(handler);
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  vi.spyOn(internal, 'resolveActiveDesignContext').mockImplementationOnce(async (...args) => {
    entered.resolve();
    await release.promise;
    return original(...args);
  });
  const old = hook({ phase: 'generation', generation: 'old', runtimeVersion: '0.85.1' });
  await entered.promise;
  client = {};
  launchId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  await readCurrent();
  release.resolve();
  expect(await old).toMatchObject({ ok: false, error: expect.stringContaining('runtime has ended or changed') });
  expect(await hook({ phase: 'generation', generation: 'latest', runtimeVersion: '0.85.1' })).toMatchObject({ ok: true });
  expect(await hook({ phase: 'call', generation: 'latest', callId: 'fresh-write', tool: 'write', path: path.join(draft, 'design.pptd') })).toMatchObject({ ok: true });
});
