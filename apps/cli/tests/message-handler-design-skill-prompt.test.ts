/**
 * Design-turn prompt wiring (P2.1): a session whose meta carries a design
 * association gets the bundled skills materialized into its workdir and a
 * pointer line appended to the prompt; non-design sessions are unchanged.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionId, SessionMeta, WorkspaceId } from '@lody/shared';

import { MessageHandler } from '../src/lib/message-handler';
import type { LoroDocumentManager } from '../src/lib/loro/doc';
import type { SessionManager } from '../src/session/session-manager';
import type { Logger } from '../src/utils/logger';
import { createTestCloudPort } from './test-cloud-port';

const mocks = vi.hoisted(() => ({ sourceDir: '' }));

vi.mock('@/design/skills', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/design/skills')>();
  return {
    ...actual,
    // The materializer's bundle-resolution seam is covered by its own tests;
    // here the staged bundle is replaced with a synthetic source dir.
    materializeDesignSkills: (opts: Parameters<typeof actual.materializeDesignSkills>[0]) =>
      actual.materializeDesignSkills({ ...opts, sourceDir: mocks.sourceDir }),
  };
});

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

const createHandler = (meta: Partial<SessionMeta> | undefined): MessageHandler => {
  const sessionManager = {
    getSession: vi.fn(() => null),
    on: vi.fn(),
    setRequestPermissionHandler: vi.fn(),
    cleanUp: vi.fn(async () => {}),
  } as unknown as SessionManager;
  const workspaceDocument = {
    isTransportConnected: vi.fn(() => true),
    markMachineFlockDocDirty: vi.fn(),
    repo: {
      getDocMeta: vi.fn(async () => ({ meta: {} })),
      watch: vi.fn(() => ({ unsubscribe: vi.fn() })),
    },
    getOrCreateSessionDoc: vi.fn(async () => ({
      getMetaState: vi.fn(async () => meta),
    })),
    sendMachineHeartbeat: vi.fn(async () => {}),
  } as unknown as LoroDocumentManager;
  return new MessageHandler(sessionManager, workspaceDocument, createSilentLogger(), {
    token: 'token',
    workspaceId: 'workspace-1' as WorkspaceId,
    userId: 'user-1',
    machineId: 'machine-1',
    machineName: 'machine',
    cliVersion: '0.0.0',
    cloudPort: createTestCloudPort(),
  });
};

type PromptBlockBuilder = {
  buildAcpPromptBlocks: (args: {
    workspaceId: WorkspaceId;
    sessionId: SessionId;
    inputBlocks: { type: 'text'; text: string }[];
  }) => Promise<{ type: string; text?: string }[]>;
};

describe('MessageHandler design skill prompt wiring', () => {
  let tmpDir: string;
  let dataDir: string;
  let previousDataDir: string | undefined;
  const sessionId = '11111111-2222-3333-4444-555555555555' as SessionId;
  const workspaceId = 'workspace-1' as WorkspaceId;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lody-design-prompt-'));
    dataDir = path.join(tmpDir, 'data');
    previousDataDir = process.env.LODY_DATA_DIR;
    process.env.LODY_DATA_DIR = dataDir;

    mocks.sourceDir = path.join(tmpDir, 'bundle');
    const skillSrc = path.join(mocks.sourceDir, 'graphic-design');
    fs.mkdirSync(path.join(skillSrc, 'references'), { recursive: true });
    fs.writeFileSync(path.join(skillSrc, 'SKILL.md'), '# synthetic skill\n');
    fs.writeFileSync(path.join(skillSrc, 'references', 'guide.md'), 'guide\n');
  });

  afterEach(() => {
    if (previousDataDir === undefined) delete process.env.LODY_DATA_DIR;
    else process.env.LODY_DATA_DIR = previousDataDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const buildText = async (handler: MessageHandler, text: string): Promise<string> => {
    const blocks = await (handler as MessageHandler & PromptBlockBuilder).buildAcpPromptBlocks({
      workspaceId,
      sessionId,
      inputBlocks: [{ type: 'text', text }],
    });
    const textBlock = blocks.find((block) => block.type === 'text');
    return textBlock?.text ?? '';
  };

  it('materializes skills into the session workdir and appends the pointer for design sessions', async () => {
    const handler = createHandler({
      id: sessionId,
      machineId: 'machine-1' as SessionMeta['machineId'],
      createdAt: new Date().toISOString(),
      design: { artworkId: sessionId, path: 'design.json' },
    });

    try {
      const workdir = path.join(dataDir, 'chats', sessionId);
      const text = await buildText(handler, 'make a poster');
      expect(text).toBe(
        `make a poster\n\nUse the skill at ${workdir}/.claude/skills/graphic-design; read its SKILL.md first.`
      );
      for (const base of ['.claude/skills', '.agents/skills']) {
        const dir = path.join(workdir, base, 'graphic-design');
        expect(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8')).toBe('# synthetic skill\n');
        expect(fs.existsSync(path.join(dir, '.folio-managed-files.json'))).toBe(true);
      }
    } finally {
      await handler.cleanup();
    }
  });

  it('leaves non-design sessions byte-identical and writes nothing', async () => {
    const handler = createHandler({
      id: sessionId,
      machineId: 'machine-1' as SessionMeta['machineId'],
      createdAt: new Date().toISOString(),
    });

    try {
      const text = await buildText(handler, 'fix the flaky test');
      expect(text).toBe('fix the flaky test');
      const workdir = path.join(dataDir, 'chats', sessionId);
      expect(fs.existsSync(path.join(workdir, '.claude'))).toBe(false);
      expect(fs.existsSync(path.join(workdir, '.agents'))).toBe(false);
    } finally {
      await handler.cleanup();
    }
  });

  it('omits the pointer without blocking the turn when the bundle is missing', async () => {
    mocks.sourceDir = path.join(tmpDir, 'missing-bundle');
    const handler = createHandler({
      id: sessionId,
      machineId: 'machine-1' as SessionMeta['machineId'],
      createdAt: new Date().toISOString(),
      design: { artworkId: sessionId, path: 'design.json' },
    });

    try {
      const text = await buildText(handler, 'make a poster');
      expect(text).toBe('make a poster');
    } finally {
      await handler.cleanup();
    }
  });
});
