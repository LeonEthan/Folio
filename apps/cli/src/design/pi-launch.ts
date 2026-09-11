import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLocalControlSocketPath } from '@lody/shared/node/local-ipc';

/** pi-acp 0.0.33 accepts an executable, but does not forward extra Pi argv. */
export async function preparePiDesignLaunch(
  env: NodeJS.ProcessEnv,
  identity: { machineId: string; workspaceId: string }
): Promise<{ env: NodeJS.ProcessEnv; cleanup: () => Promise<void> }> {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const launcher = path.join(directory, 'pi-design-launcher.js');
  const extension = path.join(directory, 'pi-design-extension.js');
  if (!existsSync(launcher) || !existsSync(extension))
    throw Error('Folio Pi design extension is missing from the CLI bundle');
  const temporary = await mkdtemp(path.join(tmpdir(), 'folio-pi-launch-'));
  const command = path.join(temporary, process.platform === 'win32' ? 'pi.cmd' : 'pi');
  await writeFile(
    command,
    process.platform === 'win32'
      ? '@echo off\r\n"%FOLIO_DESIGN_NODE%" "%FOLIO_DESIGN_LAUNCHER%" %*\r\n'
      : '#!/bin/sh\nexec "$FOLIO_DESIGN_NODE" "$FOLIO_DESIGN_LAUNCHER" "$@"\n',
    { mode: 0o700, flag: 'wx' }
  );
  return {
    env: {
      ...env,
      PI_ACP_PI_COMMAND: command,
      FOLIO_DESIGN_PI_COMMAND: env.PI_ACP_PI_COMMAND || 'pi',
      FOLIO_DESIGN_NODE: process.execPath,
      FOLIO_DESIGN_LAUNCHER: launcher,
      FOLIO_DESIGN_EXTENSION: extension,
      FOLIO_DESIGN_MACHINE_ID: identity.machineId,
      FOLIO_DESIGN_WORKSPACE_ID: identity.workspaceId,
      FOLIO_DESIGN_CONTROL_SOCKET: getLocalControlSocketPath(),
    },
    cleanup: () => rm(temporary, { recursive: true, force: true }),
  };
}
