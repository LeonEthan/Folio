/** Manual synthetic-provider probe: real pinned pi-acp/Pi tools + Folio service/store. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { LocalMachineRpcRequestSchema } from '@lody/shared/local-machine-rpc';
import { exportPptd } from '@folio/design-authoring';
import { DesignSyncService } from '../src/design/sync-service';
import { designOperation } from '../src/design/store';
import { resolveDesignWorkspace } from '../src/design/workspace';
import { materializeDesignTurnInput } from '../src/design/turn-input';
import { collectDesignTurnOutcome } from '../src/design/turn-outcome';
import type { SessionMeta, SessionHistoryInput } from '@lody/shared';

const pi = process.env.FOLIO_PROBE_PI;
const acp = process.env.FOLIO_PROBE_PI_ACP;
if (!pi || !acp)
  throw Error(
    'Set FOLIO_PROBE_PI and FOLIO_PROBE_PI_ACP to exact installed executable/script paths'
  );
const root = await mkdtemp(path.join(tmpdir(), 'folio-pi-probe-'));
const sessionId = randomUUID();
const workspace = resolveDesignWorkspace({
  workspaceRoot: root,
  sessionId,
  artworkId: sessionId,
  legacyWorkdir: path.join(root, 'chats', sessionId),
});
const initial = await designOperation(root, {
  operation: 'create',
  association: {
    sessionId,
    name: 'Synthetic Pi probe',
    userId: 'local:probe',
    machineId: 'probe',
    createdAt: '2026-09-11T00:00:00Z',
  },
});
const saved = await designOperation(root, {
  operation: 'save',
  sessionId,
  baseRevisionId: initial.revisionId,
  content: {
    doc: {
      ...initial.doc,
      ...(process.env.FOLIO_PROBE_LARGE === '1'
        ? {
            elements: [
              {
                id: 'long',
                kind: 'text',
                bounds: [0, 0, 100, 100],
                zIndex: 0,
                text: { paragraphs: [{ runs: [{ text: 'A'.repeat(180000) }] }] },
              },
            ],
          }
        : {}),
      background: { type: 'solid', color: '#223344' },
    },
    assets: {},
  },
});
await materializeDesignTurnInput({
  workdir: workspace.inputWorkdir,
  artifactWorkdir: workspace.artifactWorkdir,
  artworkId: sessionId,
  turnId: 'probe-turn',
  prompt: 'Synthetic provider probe',
  skillSourceIdentity: 'a'.repeat(64),
  dataRoot: root,
});
const frozenPath = path.join(workspace.inputWorkdir, 'design-input/probe-turn/manifest.json');
const frozen = await readFile(frozenPath);
const files = exportPptd(saved.doc, new Map());
const service = new DesignSyncService({
  artworkId: sessionId,
  workspace,
  dataRoot: root,
  assertActive: () => {},
});
const events: { phase: string; tool?: string; ok: boolean; error?: string }[] = [];
const socket = path.join(root, 'control.sock');
const control = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const request = JSON.parse(Buffer.concat(chunks).toString());
  let error: string | undefined;
  try {
    LocalMachineRpcRequestSchema.parse(request);
    assert.equal(request.ownerSessionId, sessionId);
    await service.handle(request.params.event);
  } catch (caught) {
    error = String(caught);
  }
  events.push({
    phase: request.params.event.phase,
    tool: request.params.event.tool,
    ok: !error,
    ...(error ? { error } : {}),
  });
  res.setHeader('content-type', 'application/json');
  res.end(
    JSON.stringify({
      ok: true,
      result: {
        type: 'design/tool-hook',
        version: 1,
        supported: true,
        ok: !error,
        ...(error ? { error } : {}),
      },
    })
  );
});
control.listen(socket);
await once(control, 'listening');
let requests = 0;
let wrote = false;
let continuations = 0;
const provider = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const body = JSON.parse(Buffer.concat(chunks).toString());
  const lastAssistant = body.messages.findLastIndex(
    (message: { role: string }) => message.role === 'assistant'
  );
  const recentTools = body.messages
    .slice(lastAssistant + 1)
    .filter((message: { role: string }) => message.role === 'tool');
  const continuation = recentTools
    .map((message: { content: unknown }) =>
      typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
    )
    .map((text: string) => text.match(/Use offset=(\d+) to continue\./)?.[1])
    .find(Boolean);
  const tool = (name: string, args: unknown, index: number) => ({
    index,
    id: `call_${requests}_${index}`,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  });
  const toolCalls =
    requests === 0
      ? [...files.keys()]
          .map((file, i) => tool('read', { path: path.join(workspace.projectionWorkdir, file) }, i))
          .concat([
            tool(
              'write',
              {
                path: path.join(workspace.artifactWorkdir, 'design.pptd'),
                content: 'ILLEGAL SAME BATCH',
              },
              files.size
            ),
          ])
      : continuation
        ? [
            tool(
              'read',
              {
                path: path.join(workspace.projectionWorkdir, 'pages/design.page'),
                offset: Number(continuation),
              },
              0
            ),
          ]
        : !wrote
          ? [...files].map(([file, bytes], i) =>
              tool(
                'write',
                {
                  path: path.join(workspace.artifactWorkdir, file),
                  content: Buffer.from(bytes).toString().replace('#223344', '#556677'),
                },
                i
              )
            )
          : [];
  if (continuation) continuations++;
  if (requests > 0 && !continuation && !wrote) wrote = true;
  requests++;
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const send = (delta: unknown, finish_reason: string | null) =>
    res.write(
      `data: ${JSON.stringify({ id: 'synthetic', object: 'chat.completion.chunk', created: 1, model: 'synthetic', choices: [{ index: 0, delta, finish_reason }] })}\n\n`
    );
  send(
    {
      role: 'assistant',
      ...(toolCalls.length ? { tool_calls: toolCalls } : { content: 'Synthetic completion.' }),
    },
    null
  );
  send({}, toolCalls.length ? 'tool_calls' : 'stop');
  res.end('data: [DONE]\n\n');
});
provider.listen(0, '127.0.0.1');
await once(provider, 'listening');
const address = provider.address();
assert(address && typeof address !== 'string');
const agentDir = path.join(root, 'pi-agent');
await mkdir(agentDir);
await writeFile(
  path.join(agentDir, 'models.json'),
  JSON.stringify({
    providers: {
      synthetic: {
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        api: 'openai-completions',
        apiKey: 'synthetic-only',
        models: [{ id: 'synthetic', contextWindow: 1000000, maxTokens: 100000 }],
      },
    },
  })
);
await writeFile(
  path.join(agentDir, 'settings.json'),
  JSON.stringify({ defaultProvider: 'synthetic', defaultModel: 'synthetic', quietStartup: true })
);
const wrapper = path.join(root, 'pi');
await writeFile(wrapper, '#!/bin/sh\nexec "$FOLIO_DESIGN_NODE" "$FOLIO_DESIGN_LAUNCHER" "$@"\n', {
  mode: 0o700,
});
const env = { ...process.env };
for (const key of Object.keys(env))
  if (key.startsWith('ANTHROPIC_') || key.startsWith('CLAUDE_CODE_USE_')) delete env[key];
Object.assign(env, {
  HOME: root,
  PI_CODING_AGENT_DIR: agentDir,
  PI_ACP_PI_COMMAND: wrapper,
  FOLIO_DESIGN_PI_COMMAND: pi,
  FOLIO_DESIGN_NODE: process.execPath,
  FOLIO_DESIGN_LAUNCHER: path.resolve('apps/cli/dist-dev/pi-design-launcher.js'),
  FOLIO_DESIGN_EXTENSION: path.resolve('apps/cli/dist-dev/pi-design-extension.js'),
  FOLIO_DESIGN_CONTROL_SOCKET: socket,
  FOLIO_DESIGN_MACHINE_ID: 'probe',
  FOLIO_DESIGN_WORKSPACE_ID: 'probe',
  LODY_SESSION_ID: sessionId,
  LODY_DATA_DIR: root,
});
const child = spawn(process.execPath, [acp], { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'] });
const exited = once(child, 'exit');
const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();
let id = 0;
readline.createInterface({ input: child.stdout }).on('line', (line) => {
  const value = JSON.parse(line);
  const waiter = pending.get(value.id);
  if (!waiter) return;
  pending.delete(value.id);
  if (value.error) waiter.reject(Error(JSON.stringify(value.error)));
  else waiter.resolve(value.result);
});
child.stderr.resume();
child.once('exit', () => {
  for (const waiter of pending.values()) waiter.reject(Error('ACP exited'));
});
const call = (method: string, params: unknown): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const requestId = ++id;
    const deadline = setTimeout(() => {
      pending.delete(requestId);
      reject(Error(`ACP ${method} timed out`));
    }, 120000);
    pending.set(requestId, {
      resolve: (value) => {
        clearTimeout(deadline);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(deadline);
        reject(error);
      },
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }) + '\n');
  });
try {
  await call('initialize', { protocolVersion: 1, clientCapabilities: {} });
  const session = (await call('session/new', { cwd: root, mcpServers: [] })) as {
    sessionId: string;
  };
  const completion = (await call('session/prompt', {
    sessionId: session.sessionId,
    prompt: [{ type: 'text', text: 'Execute the synthetic design scenario.' }],
  })) as { stopReason: string };
  assert.equal(completion.stopReason, 'end_turn');

  if (process.env.FOLIO_PROBE_LARGE === '1') assert(continuations > 0);
  assert(
    events.some((event) => event.tool === 'write' && event.error?.includes('DESIGN_READ_REQUIRED'))
  );
  assert(service.getAttempt()?.artifactDigest);
  assert.deepEqual(await readFile(frozenPath), frozen);
  let history: SessionHistoryInput[] = [
    { id: 'probe-turn', role: 'user', content: [], timestamp: 1 } as SessionHistoryInput,
  ];
  const outcome = await collectDesignTurnOutcome({
    sessionId,
    turnId: 'probe-turn',
    workdir: workspace.inputWorkdir,
    workspaceRoot: root,
    dataRoot: root,
    designReadBaseline: service.getAttempt(),
    sessionDoc: {
      getMetaState: async () =>
        ({
          id: sessionId,
          agentType: 'pi-acp',
          userId: 'local:probe',
          design: { artworkId: sessionId, path: 'design.json' },
        }) as SessionMeta,
      getHistory: async () => history,
      updateHistory: async (update) => {
        history = update(history);
      },
    },
  });
  assert.equal(outcome.status, 'recorded');
  if (outcome.status === 'recorded') assert.equal(outcome.outcome.status, 'committed');
  const final = await designOperation(root, { operation: 'read', sessionId });
  assert.equal(final.doc.background.color, '#556677');
  process.stdout.write(
    JSON.stringify({
      status: 'passed',
      boundary:
        'real Pi ACP/extension/tools + shared design service/store; synthetic provider and control host; no Electron claim',
      requests,
      continuations,
      events,
      finalRevision: final.revisionId,
    }) + '\n'
  );
} finally {
  child.kill();
  await exited.catch(() => {});
  control.close();
  provider.close();
  await rm(root, { recursive: true, force: true });
}
