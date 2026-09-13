// Native dependency diagnostic: run only on an isolated Windows CI host.
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') process.exit(0);
const cliRequire = createRequire(new URL('../../apps/cli/package.json', import.meta.url));
const electronRequire = createRequire(new URL('../../apps/electron/package.json', import.meta.url));
if (process.argv.includes('--child')) {
  const terminalEnv = { ...process.env };
  delete terminalEnv.ELECTRON_RUN_AS_NODE;
  const terminal = cliRequire('@lydell/node-pty').spawn('powershell.exe', [], {
    cols: 80, rows: 24, cwd: process.cwd(), env: terminalEnv,
  });
  let sent = false;
  let closed = false;
  terminal.onData((data) => {
    if (!sent) { sent = true; terminal.write("Write-Output 'geon-pty-probe-ready'\r"); }
    if (!closed && data.includes('geon-pty-probe-ready')) {
      closed = true;
      process.send({ phase: 'kill', hostPid: process.pid, terminalPid: terminal.pid });
      terminal.kill();
    }
  });
  terminal.onExit((event) => {
    process.send({ phase: 'terminal-exit', event });
    process.disconnect();
  });
} else {
  for (const [name, executable] of [['node', process.execPath], ['electron', electronRequire('electron')]]) {
    const events = [];
    const child = fork(fileURLToPath(import.meta.url), ['--child'], {
      execPath: executable, execArgv: [], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    child.on('message', (event) => { events.push(event); console.log(JSON.stringify({ name, ...event })); });
    const timeout = setTimeout(() => child.kill(), 20_000);
    const result = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    clearTimeout(timeout);
    console.log(JSON.stringify({ name, ...result }));
    assert.equal(result.code, 0);
    assert.ok(events.some((event) => event.phase === 'terminal-exit'));
  }
}
