/** Manual synthetic-provider probe: pinned Claude ACP/native hooks and Folio store. */
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
import { ClaudeDesignHooks } from '../src/design/claude-hooks';
import { claudeDesignSettings } from '../src/design/claude-launch';
import { DesignSyncService } from '../src/design/sync-service';
import { designOperation } from '../src/design/store';
import { resolveDesignWorkspace } from '../src/design/workspace';
import { materializeDesignTurnInput } from '../src/design/turn-input';
import { collectDesignTurnOutcome } from '../src/design/turn-outcome';
import type { SessionMeta, SessionHistoryInput } from '@lody/shared';

const subagentProbe = process.env.FOLIO_PROBE_SUBAGENT === '1';
const resubmit = true;
const executable = process.env.FOLIO_PROBE_CLAUDE;
if (!executable) throw Error('Set FOLIO_PROBE_CLAUDE to the pinned Claude executable');
const root = await mkdtemp(path.join(tmpdir(), 'folio-claude-probe-'));
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
    name: 'Synthetic Claude probe',
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
const files = exportPptd(saved.doc, new Map());
if (resubmit) {
  for (const [file, bytes] of files) {
    const target = path.join(workspace.artifactWorkdir, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(bytes).toString().replace('#223344', '#556677'));
  }
}
await materializeDesignTurnInput({
  workdir: workspace.inputWorkdir,
  artifactWorkdir: workspace.artifactWorkdir,
  artworkId: sessionId,
  turnId: 'probe-turn',
  prompt: 'Synthetic provider probe',
  skillSourceIdentity: 'a'.repeat(64),
  dataRoot: root,
});
const ordinary = path.join(root, 'ordinary.txt');
if (subagentProbe) {
  await writeFile(ordinary, 'ordinary-before');
  // A published projection is readable without granting the parent read evidence.
  for (const [file, bytes] of files) {
    const target = path.join(workspace.projectionWorkdir, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
}
const frozenPath = path.join(workspace.inputWorkdir, 'design-input/probe-turn/manifest.json');
const frozen = await readFile(frozenPath);
const service = new DesignSyncService({
  artworkId: sessionId,
  workspace,
  dataRoot: root,
  assertActive: () => {},
  runtimeVersion: '2.1.258',
});
const adapter = new ClaudeDesignHooks(service);
const generationDurations: number[] = [];
const events: { phase: string; tool?: string; agentId?: string; ok: boolean; error?: string }[] =
  [];
const socket = path.join(root, 'control.sock');
const control = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const request = JSON.parse(Buffer.concat(chunks).toString());
  let error: string | undefined;
  try {
    LocalMachineRpcRequestSchema.parse(request);
    assert.equal(request.ownerSessionId, sessionId);
    const started = performance.now();
    if (request.params.event.phase === 'claude-resubmit') await adapter.resubmit();
    else await adapter.handle(request.params.event);
    if (request.params.event.phase === 'generation')
      generationDurations.push(performance.now() - started);
  } catch (caught) {
    error = String(caught);
  }
  events.push({
    phase: request.params.event.event ?? request.params.event.phase,
    tool: request.params.event.tool,
    agentId: request.params.event.agentId,
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
// Existing user/project hooks must coexist with the added session hooks.
const marker = path.join(root, 'existing-hooks.txt');
const markerScript = path.join(root, 'existing-hook.cjs');
await writeFile(
  markerScript,
  `require('fs').appendFileSync(${JSON.stringify(marker)}, process.argv[2]+'\\n');process.stdout.write('{}');`
);
await mkdir(path.join(root, '.claude'), { recursive: true });
await mkdir(path.join(root, 'config'), { recursive: true });
for (const [directory, label] of [
  ['.claude', 'project'],
  ['config', 'user'],
]) {
  await writeFile(
    path.join(root, directory, 'settings.json'),
    JSON.stringify({
      hooks: {
        PreToolUse: [
          {
            hooks: [
              { type: 'command', command: `'${process.execPath}' '${markerScript}' ${label}` },
            ],
          },
        ],
      },
    })
  );
}
let requests = 0;
let absentRequests = 0;
let childRequests = 0;
let parentRequests = 0;
const provider = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString();
  if (!raw) {
    res.end('{}');
    return;
  }
  const body = JSON.parse(raw);
  if (!Array.isArray(body.messages)) {
    res.end('{}');
    return;
  }
  const noHooks = JSON.stringify(body.messages).includes('NO_HOOK_SCENARIO');
  const n = noHooks ? absentRequests++ : requests++;

  const text = JSON.stringify(body.messages);
  const tool = (name: string, input: unknown, i: number) => ({
    type: 'tool_use',
    id: `toolu_${n}_${i}`,
    name,
    input,
  });
  let content: unknown[];
  if (subagentProbe) {
    const isChild = JSON.stringify(body.messages[0]).includes('SUBAGENT_NATIVE_CHILD');
    const step = isChild ? childRequests++ : parentRequests++;
    console.log('SUBAGENT_REQUEST', { isChild, step });
    if (!isChild)
      content =
        step === 0
          ? [
              tool(
                'Agent',
                {
                  subagent_type: 'general-purpose',
                  run_in_background: false,
                  description: 'Synthetic native boundary',
                  prompt: 'SUBAGENT_NATIVE_CHILD: Execute synthetic tool fixture.',
                },
                0
              ),
            ]
          : step === 1
            ? [
                tool(
                  'Write',
                  {
                    file_path: path.join(workspace.artifactWorkdir, 'design.pptd'),
                    content: 'INVALID PARENT BORROWED READ',
                  },
                  0
                ),
              ]
            : [{ type: 'text', text: 'Parent completed.' }];
    else if (step === 0)
      content = [
        tool('Bash', { command: `printf ordinary-shell > '${path.join(root, 'shell.txt')}'` }, 0),
        tool('Read', { file_path: ordinary }, 1),
        ...[...files.keys()].map((f, i) =>
          tool('Read', { file_path: path.join(workspace.projectionWorkdir, f) }, i + 2)
        ),
      ];
    else if (step === 1)
      content = [
        tool(
          'Edit',
          { file_path: ordinary, old_string: 'ordinary-before', new_string: 'ordinary-after' },
          0
        ),
        tool(
          'Write',
          { file_path: path.join(root, 'ordinary-created.txt'), content: 'ordinary-created' },
          1
        ),
        tool(
          'Write',
          {
            file_path: path.join(workspace.artifactWorkdir, 'design.pptd'),
            content: 'INVALID SUBAGENT DRAFT',
          },
          2
        ),
        tool(
          'Edit',
          {
            file_path: path.join(workspace.projectionWorkdir, 'pages/design.page'),
            old_string: '#223344',
            new_string: '#FFFFFF',
          },
          3
        ),
        tool('mcp__lody__folio_resubmit_draft', {}, 4),
      ];
    else content = [{ type: 'text', text: 'Child completed.' }];
  } else if (noHooks)
    content =
      n === 0
        ? [...files.keys()].map((f, i) =>
            tool('Read', { file_path: path.join(workspace.artifactWorkdir, f) }, i)
          )
        : n === 1
          ? [...files].map(([f, bytes], i) =>
              tool(
                'Write',
                {
                  file_path: path.join(workspace.artifactWorkdir, f),
                  content: Buffer.from(bytes).toString().replace('#223344', '#AABBCC'),
                },
                i
              )
            )
          : [{ type: 'text', text: 'Unhooked run finished.' }];
  else if (n === 0)
    content = [
      tool('Bash', { command: 'printf synthetic-shell-read' }, 0),
      tool('Read', { file_path: path.join(root, 'missing.txt') }, 1),
      tool(
        'Read',
        { file_path: path.join(workspace.projectionWorkdir, 'design.pptd'), limit: 1 },
        2
      ),
      tool(
        'Write',
        {
          file_path: path.join(workspace.artifactWorkdir, 'design.pptd'),
          content: 'INVALID AFTER SHELL/PARTIAL READ',
        },
        3
      ),
    ];
  else if (n === 1)
    content = [...files.keys()]
      .map((f, i) => tool('Read', { file_path: path.join(workspace.projectionWorkdir, f) }, i))
      .concat([
        tool(
          'Write',
          {
            file_path: path.join(workspace.artifactWorkdir, 'design.pptd'),
            content: 'INVALID SAME BATCH',
          },
          99
        ),
      ]);
  else if (n === 2) {
    assert(text.includes('DESIGN_READ_REQUIRED'));
    content = [...files].map(([f, bytes], i) =>
      tool(
        'Write',
        {
          file_path: path.join(workspace.artifactWorkdir, f),
          content: Buffer.from(bytes).toString().replace('#223344', '#556677'),
        },
        i
      )
    );
  } else if (n === 3 || n === 4) {
    content = [
      tool(
        'Edit',
        {
          file_path: path.join(workspace.artifactWorkdir, 'pages/design.page'),
          old_string: n === 3 ? '#556677' : '#112233',
          new_string: n === 3 ? '#112233' : '#556677',
        },
        0
      ),
    ];
  } else if (n === 5) {
    await designOperation(root, {
      operation: 'save',
      sessionId,
      baseRevisionId: saved.revisionId,
      content: {
        doc: { ...saved.doc, background: { type: 'solid', color: '#778899' } },
        assets: {},
      },
    });
    content = [
      tool(
        'Write',
        {
          file_path: path.join(workspace.artifactWorkdir, 'design.pptd'),
          content: 'INVALID STALE WRITE',
        },
        0
      ),
    ];
  } else if (n === 6) {
    assert(text.includes('DESIGN_READ_STALE'));
    content = [...files.keys()].map((f, i) =>
      tool('Read', { file_path: path.join(workspace.projectionWorkdir, f) }, i)
    );
  } else if (n === 7) content = [tool('mcp__lody__folio_resubmit_draft', {}, 0)];
  else content = [{ type: 'text', text: 'Finished synthetic design.' }];
  const stopReason = content.some((c) => (c as { type: string }).type === 'tool_use')
    ? 'tool_use'
    : 'end_turn';
  const msg = {
    id: `msg_${n}`,
    type: 'message',
    role: 'assistant',
    model: body.model,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  };
  if (body.stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    const send = (type: string, data: object) =>
      res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
    send('message_start', { message: { ...msg, content: [], stop_reason: null } });
    for (const [i, c] of (
      content as { type: string; input?: unknown; text?: string }[]
    ).entries()) {
      send('content_block_start', {
        index: i,
        content_block: c.type === 'tool_use' ? { ...c, input: {} } : { type: 'text', text: '' },
      });
      send('content_block_delta', {
        index: i,
        delta:
          c.type === 'tool_use'
            ? { type: 'input_json_delta', partial_json: JSON.stringify(c.input) }
            : { type: 'text_delta', text: c.text },
      });
      send('content_block_stop', { index: i });
    }
    send('message_delta', { delta: { stop_reason: stopReason }, usage: { output_tokens: 10 } });
    send('message_stop', {});
    res.end();
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(msg));
  }
});
provider.listen(0, '127.0.0.1');
await once(provider, 'listening');
const address = provider.address();
if (!address || typeof address === 'string') throw Error('Missing address');
const hook = path.resolve('apps/cli/dist-dev/claude-design-hook.js');
// Tiny synthetic MCP peer; its no-arg operation calls the production hook service.
const mcp = path.join(root, 'mcp.cjs');
await writeFile(
  mcp,
  `const rl=require('readline').createInterface({input:process.stdin});rl.on('line',async line=>{const q=JSON.parse(line);let result;if(q.method==='initialize')result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'lody',version:'probe'}};else if(q.method==='tools/list')result={tools:[{name:'folio_resubmit_draft',description:'Explicit draft resubmission',inputSchema:{type:'object',properties:{}}}]};else if(q.method==='tools/call'){result=await new Promise((resolve)=>{const r=require('http').request({socketPath:${JSON.stringify(socket)},method:'POST',path:'/'},s=>{let b='';s.on('data',c=>b+=c);s.on('end',()=>{const a=JSON.parse(b).result;resolve({content:[{type:'text',text:a.ok?'Attempt recorded':a.error}],isError:!a.ok});});});r.end(JSON.stringify({method:'design/tool-hook',machineId:'probe',workspaceId:'probe',ownerSessionId:${JSON.stringify(sessionId)},params:{version:1,event:{phase:'claude-resubmit'}}}));});}else return;if(q.id!==undefined)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,result})+'\\n');});`
);
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !key.startsWith('ANTHROPIC_') && !key.startsWith('CLAUDE_CODE_USE_')
  )
);
Object.assign(env, {
  ANTHROPIC_API_KEY: 'synthetic',
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${address.port}`,
  CLAUDE_CONFIG_DIR: path.join(root, 'config'),
  CLAUDE_CODE_EXECUTABLE: executable,
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  FOLIO_DESIGN_CLAUDE_VERSION: '2.1.258',
  FOLIO_DESIGN_CONTROL_SOCKET: socket,
  FOLIO_DESIGN_MACHINE_ID: 'probe',
  FOLIO_DESIGN_WORKSPACE_ID: 'probe',
  LODY_SESSION_ID: sessionId,
  LODY_DATA_DIR: root,
});
const child = spawn(process.execPath, [path.resolve('apps/cli/dist-dev/claude-acp.js')], {
  cwd: root,
  env,
  stdio: ['pipe', 'pipe', 'pipe'],
});
const exited = once(child, 'exit');
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let id = 0;
readline.createInterface({ input: child.stdout }).on('line', (line) => {
  const value = JSON.parse(line);
  if (value.method === 'session/request_permission') {
    child.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: value.id,
        result: { outcome: { outcome: 'selected', optionId: 'allow_always' } },
      }) + '\n'
    );
    return;
  }
  const waiter = pending.get(value.id);
  if (!waiter) return;
  pending.delete(value.id);
  if (value.error) waiter.reject(Error(JSON.stringify(value.error)));
  else waiter.resolve(value.result);
});
child.stderr.on('data', (chunk) => process.stderr.write(chunk));
child.once('exit', () => {
  for (const p of pending.values()) p.reject(Error('ACP exited'));
});
const call = (method: string, params: unknown): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const n = ++id;
    const timer = setTimeout(() => reject(Error(`ACP ${method} timeout`)), 120000);
    pending.set(n, {
      resolve: (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n');
  });
try {
  await call('initialize', { protocolVersion: 1, clientCapabilities: {} });
  const session = (await call('session/new', {
    cwd: root,
    mcpServers: [{ name: 'lody', command: process.execPath, args: [mcp], env: [] }],
    _meta: {
      claudeCode: {
        options: { settings: claudeDesignSettings(`'${process.execPath}' '${hook}'`) },
      },
      lody: {
        sessionConfig: {
          version: 1,
          configOptionValues: { model: 'claude-sonnet-4-6', _permission: 'bypassPermissions' },
        },
      },
    },
  })) as { sessionId: string };
  const completion = (await call('session/prompt', {
    sessionId: session.sessionId,
    prompt: [{ type: 'text', text: 'Execute the synthetic design scenario.' }],
  })) as { stopReason: string };
  assert.equal(completion.stopReason, 'end_turn');
  const existing = await readFile(marker, 'utf8');
  assert(existing.includes('project'));
  assert(existing.includes('user'));
  if (subagentProbe) {
    console.log(JSON.stringify({ events, parentRequests, childRequests, root }));
    assert.equal(await readFile(path.join(root, 'shell.txt'), 'utf8'), 'ordinary-shell');
    assert.equal(await readFile(ordinary, 'utf8'), 'ordinary-after');
    assert.equal(
      await readFile(path.join(root, 'ordinary-created.txt'), 'utf8'),
      'ordinary-created'
    );
    assert.equal(service.getAttempt(), undefined);
    assert(events.some((e) => e.agentId && e.phase === 'PostToolUse' && e.tool === 'Bash' && e.ok));
    assert(events.some((e) => e.agentId && e.tool === 'Write' && !e.ok));
    assert(events.some((e) => e.agentId && e.tool === 'Edit' && !e.ok));
    assert(events.some((e) => e.agentId && e.tool === 'mcp__lody__folio_resubmit_draft' && !e.ok));
    assert(
      events.some(
        (e) => !e.agentId && e.tool === 'Write' && e.error?.includes('DESIGN_READ_REQUIRED')
      )
    );
    assert.equal(
      await readFile(path.join(workspace.projectionWorkdir, 'pages/design.page'), 'utf8'),
      Buffer.from(files.get('pages/design.page')!).toString()
    );
    assert.equal(
      await readFile(path.join(workspace.artifactWorkdir, 'design.pptd'), 'utf8'),
      Buffer.from(files.get('design.pptd')!).toString()
    );
    console.log(
      JSON.stringify({ status: 'passed', subagentProbe, parentRequests, childRequests, root })
    );
  } else {
    assert(service.getAttempt()?.explicitResubmission);
    assert.equal(
      service.getAttempt()?.artifactDigest,
      JSON.parse(frozen.toString()).artifactAtSend.digest
    );
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
            cliType: 'builtin',
            agentType: 'claude',
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
    await materializeDesignTurnInput({
      workdir: workspace.inputWorkdir,
      artifactWorkdir: workspace.artifactWorkdir,
      artworkId: sessionId,
      turnId: 'absent-turn',
      prompt: 'NO_HOOK_SCENARIO',
      skillSourceIdentity: 'a'.repeat(64),
      dataRoot: root,
    });
    const unhooked = (await call('session/new', {
      cwd: root,
      mcpServers: [],
      _meta: {
        lody: {
          sessionConfig: {
            version: 1,
            configOptionValues: { model: 'claude-sonnet-4-6', _permission: 'bypassPermissions' },
          },
        },
      },
    })) as { sessionId: string };
    await call('session/prompt', {
      sessionId: unhooked.sessionId,
      prompt: [{ type: 'text', text: 'NO_HOOK_SCENARIO' }],
    });
    let absentHistory: SessionHistoryInput[] = [
      { id: 'absent-turn', role: 'user', content: [], timestamp: 2 } as SessionHistoryInput,
    ];
    const refused = await collectDesignTurnOutcome({
      sessionId,
      turnId: 'absent-turn',
      workdir: workspace.inputWorkdir,
      workspaceRoot: root,
      dataRoot: root,
      sessionDoc: {
        getMetaState: async () =>
          ({
            id: sessionId,
            cliType: 'builtin',
            agentType: 'claude',
            userId: 'local:probe',
            design: { artworkId: sessionId, path: 'design.json' },
          }) as SessionMeta,
        getHistory: async () => absentHistory,
        updateHistory: async (update) => {
          absentHistory = update(absentHistory);
        },
      },
    });
    assert.equal(refused.status, 'recorded');
    if (refused.status === 'recorded') assert.equal(refused.outcome.status, 'invalid');
    assert.equal(
      (await designOperation(root, { operation: 'read', sessionId })).revisionId,
      final.revisionId
    );
    assert(
      (await readFile(path.join(workspace.artifactWorkdir, 'pages/design.page'), 'utf8')).includes(
        '#AABBCC'
      )
    );
    console.log(
      JSON.stringify({
        status: 'passed',
        boundary:
          'Real Claude2.1.258/SDK0.3.258/ACP0.70.0 + native command hooks and shared service/store; synthetic provider/MCP/control host; no Electron claim',
        requests,
        absentRequests,
        hookAbsenceProtected: true,
        events,
        root,
      })
    );
  }
} finally {
  child.kill();
  await exited.catch(() => {});
  control.close();
  provider.close();
}
