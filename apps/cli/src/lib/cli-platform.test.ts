import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Effect } from 'effect';
import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  LOCAL_WORKSPACE_NAME,
  ensureImplicitLocalWorkspace,
  migrateLegacyLocalDataDir,
} from '@/lib/cli-platform';
import { makeLocalWorkspaceCatalog } from '@/lib/local-workspace-catalog';
import type { Logger } from '@/utils/logger';

function createTestLogger(): Logger {
  let logger: Logger;
  logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
    setLevel: vi.fn(),
    setDebug: vi.fn(),
    child: vi.fn(() => logger),
    close: vi.fn(async () => {}),
  };
  return logger;
}

describe('migrateLegacyLocalDataDir', () => {
  let homeDir: string | undefined;

  beforeEach(async () => {
    homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'geon-data-dir-migration-'));
  });

  afterEach(async () => {
    if (homeDir) {
      await fs.rm(homeDir, { recursive: true, force: true });
      homeDir = undefined;
    }
  });

  it('renames ~/.folio to ~/.geon when the new dir is absent', async () => {
    const logger = createTestLogger();
    await fs.mkdir(path.join(homeDir!, '.folio', 'chats'), { recursive: true });
    await migrateLegacyLocalDataDir(logger, { homeDir: homeDir! });
    await expect(fs.access(path.join(homeDir!, '.geon', 'chats'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(homeDir!, '.folio'))).rejects.toThrow();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('.folio'));
  });

  it('keeps an existing ~/.geon untouched', async () => {
    const logger = createTestLogger();
    await fs.mkdir(path.join(homeDir!, '.folio'), { recursive: true });
    await fs.mkdir(path.join(homeDir!, '.geon'), { recursive: true });
    await migrateLegacyLocalDataDir(logger, { homeDir: homeDir! });
    await expect(fs.access(path.join(homeDir!, '.folio'))).resolves.toBeUndefined();
  });

  it('does nothing on a fresh install', async () => {
    const logger = createTestLogger();
    await migrateLegacyLocalDataDir(logger, { homeDir: homeDir! });
    await expect(fs.access(path.join(homeDir!, '.geon'))).rejects.toThrow();
  });

  it('still migrates when LODY_DATA_DIR pins the default location', async () => {
    const logger = createTestLogger();
    await fs.mkdir(path.join(homeDir!, '.folio', 'chats'), { recursive: true });
    vi.stubEnv('LODY_DATA_DIR', path.join(homeDir!, '.geon'));
    try {
      await migrateLegacyLocalDataDir(logger, { homeDir: homeDir! });
    } finally {
      vi.unstubAllEnvs();
    }
    await expect(fs.access(path.join(homeDir!, '.geon', 'chats'))).resolves.toBeUndefined();
  });

  it('leaves the legacy dir alone when LODY_DATA_DIR pins a custom location', async () => {
    const logger = createTestLogger();
    await fs.mkdir(path.join(homeDir!, '.folio'), { recursive: true });
    vi.stubEnv('LODY_DATA_DIR', path.join(homeDir!, 'custom-data'));
    try {
      await migrateLegacyLocalDataDir(logger, { homeDir: homeDir! });
    } finally {
      vi.unstubAllEnvs();
    }
    await expect(fs.access(path.join(homeDir!, '.folio'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(homeDir!, 'custom-data'))).rejects.toThrow();
  });
});

describe('ensureImplicitLocalWorkspace legacy rename', () => {
  let tempDir: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'geon-workspace-rename-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('renames a legacy-named active workspace to the current product name', async () => {
    const logger = createTestLogger();
    const catalog = makeLocalWorkspaceCatalog({
      filePath: path.join(tempDir!, 'workspace-catalog.json'),
      lockName: `geon-workspace-rename-${path.basename(tempDir!)}`,
    });
    const identity = {
      userId: `local:${crypto.randomUUID().replaceAll('-', '')}`,
      createdAt: new Date(0).toISOString(),
    };
    await Effect.runPromise(
      catalog.cacheRemoteWorkspaces({
        identity: { userId: identity.userId },
        machine: { machineId: 'm-1', machineName: 'machine' },
        workspaces: [
          {
            id: `lw_${crypto.randomUUID().replaceAll('-', '')}`,
            name: 'Folio',
            slug: 'local',
            role: 'owner',
          },
        ],
      })
    );

    const result = await ensureImplicitLocalWorkspace({
      catalog,
      identity,
      machineId: 'm-1',
      machineName: 'machine',
      logger,
    });

    expect(result.name).toBe(LOCAL_WORKSPACE_NAME);
    const persisted = await Effect.runPromise(catalog.read());
    expect(persisted.workspaces[0]?.name).toBe(LOCAL_WORKSPACE_NAME);
  });
});
