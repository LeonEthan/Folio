/** Manual acceptance probe. Reuses the existing Electron harness; only provider wire is synthetic.
 * Build desktop first, then run with tsx and FOLIO_PROBE_PI. Not a registered regression journey. */
import { ElectronHarness } from '../../../e2e/src/support/electron-harness.ts';
import { OnboardingPage } from '../../../e2e/src/support/pages/onboarding-page.ts';
import { createRequire } from 'node:module';
const { expect } = createRequire(new URL('../../../e2e/package.json', import.meta.url))(
  '@playwright/test'
);
const recoveryMode = process.env.FOLIO_PROBE_RECOVERY === '1';
const resubmitMode = process.env.FOLIO_PROBE_RESUBMIT === '1';
const pi = process.env.FOLIO_PROBE_PI;
if (!pi) throw Error('Set FOLIO_PROBE_PI to the verified Pi executable');
import { createServer } from 'node:http';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, writeFile, readFile, readdir, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { designOperation } from '../src/design/store.ts';
import { readDesignArtifactDigest } from '../src/design/artifact.ts';
const root = await mkdtemp(
  path.join(tmpdir(), resubmitMode ? 'folio-t06-desktop-' : 'folio-t05-desktop-')
);
const scenarioDir = path.join(root, 'evidence');
await mkdir(scenarioDir);
let editCalls = 0;
let resubmitCalls = 0;
let artworkId;
let dataRoot;
let externalRevision;
let draft = '';
let sourceFiles = new Map();
let blocked = false;
let recoveryStep = 0;
let recoveryModeName = '';
let modelRequests = 0;
let switchCalls = 0;
let heldResponse;
let reachedHold;
let holdReached = new Promise((resolve) => {
  reachedHold = resolve;
});

const provider = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
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
  if (req.url.includes('/messages')) {
    const n = switchCalls++;
    const tool = (name, input, i) => ({
      type: 'tool_use',
      id: `toolu_switch_${n}_${i}`,
      name,
      input,
    });
    let content;
    if (n === 0) {
      content = ['design.pptd', 'pages/design.page'].map((f, i) =>
        tool('Read', { file_path: path.join(draft, 'design-current', f) }, i)
      );
      content.push(
        tool(
          'Write',
          { file_path: path.join(draft, 'design.pptd'), content: 'MUST NOT INHERIT PI READS' },
          2
        )
      );
    } else if (n === 1) {
      assert(JSON.stringify(body.messages).includes('DESIGN_READ_REQUIRED'));
      content = [];
      for (const [i, f] of ['design.pptd', 'pages/design.page'].entries()) {
        const text = await readFile(path.join(draft, 'design-current', f), 'utf8');
        content.push(
          tool(
            'Write',
            { file_path: path.join(draft, f), content: text.replace(/#667788/gi, '#7788AA') },
            i
          )
        );
      }
    } else content = [{ type: 'text', text: 'SYNTHETIC_SWITCH_FINISHED' }];
    const stopReason = content[0].type === 'tool_use' ? 'tool_use' : 'end_turn';
    const msg = {
      id: `msg_switch_${n}`,
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
      const send = (type, data) =>
        res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
      send('message_start', { message: { ...msg, content: [], stop_reason: null } });
      content.forEach((c, i) => {
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
      });
      send('message_delta', { delta: { stop_reason: stopReason }, usage: { output_tokens: 10 } });
      send('message_stop', {});
      res.end();
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(msg));
    }
    return;
  }
  const userMessages = body.messages
    .filter((m) => m.role === 'user')
    .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
    .join('\n');
  modelRequests++;
  const latestUser = body.messages.filter((m) => m.role === 'user').at(-1);
  const latestText = JSON.stringify(latestUser?.content ?? '');
  const recovering = recoveryMode && latestText.includes('SYNTHETIC_RECOVERY_');
  const editing = !recovering && userMessages.includes('SYNTHETIC_EDIT');
  let calls = [];
  let text = 'SYNTHETIC_INITIAL_FINISHED';
  if (editing) {
    const tool = (name, args, i) => ({
      index: i,
      id: `call_${editCalls}_${i}`,
      type: 'function',
      function: { name, arguments: JSON.stringify(args) },
    });
    if (editCalls === 0) {
      draft = userMessages.match(/Design authoring directory: (.+?)\. Write/)?.[1];
      assert(draft);
      calls = ['design.pptd', 'pages/design.page'].map((file, i) =>
        tool('read', { path: path.join(draft, 'design-current', file) }, i)
      );
      calls.push(tool('write', { path: path.join(draft, 'design.pptd'), content: 'ILLEGAL' }, 2));
    } else if (editCalls === 1) {
      for (const m of body.messages.filter((m) => m.role === 'tool')) {
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        if (m.tool_call_id === 'call_0_0') sourceFiles.set('design.pptd', content);
        if (m.tool_call_id === 'call_0_1') sourceFiles.set('pages/design.page', content);
        if (content.includes('DESIGN_READ_REQUIRED')) blocked = true;
      }
      await writeFile(
        path.join(scenarioDir, 'synthetic-tool-results.json'),
        JSON.stringify(body.messages.filter((m) => m.role === 'tool'))
      );
      if (!blocked)
        console.log(
          'BLOCK MISSING',
          JSON.stringify(body.messages.filter((m) => m.role === 'tool'))
        );
      assert.equal(sourceFiles.size, 2);
      calls = [...sourceFiles].map(([file, content], i) =>
        tool(
          'write',
          { path: path.join(draft, file), content: content.replace(/#ffffff/i, '#8899AA') },
          i
        )
      );
    } else {
      text = 'SYNTHETIC_DESIGN_FINISHED';
    }
    editCalls++;
  }
  if (resubmitMode && userMessages.includes('SYNTHETIC_RESUBMIT')) {
    const tool = (name, args, i) => ({
      index: i,
      id: `retry_${resubmitCalls}_${i}`,
      type: 'function',
      function: { name, arguments: JSON.stringify(args) },
    });
    const latestAssistant = body.messages.findLastIndex((m) => m.role === 'assistant');
    const returned = JSON.stringify(
      body.messages.slice(latestAssistant + 1).filter((m) => m.role === 'tool')
    );
    if (resubmitCalls === 0) {
      calls = ['design.pptd', 'pages/design.page'].map((file, i) =>
        tool('read', { path: path.join(draft, 'design-current', file) }, i)
      );
    } else if (resubmitCalls === 1) {
      calls = [...sourceFiles].map(([file, content], i) =>
        tool(
          'write',
          { path: path.join(draft, file), content: content.replace(/#ffffff/i, '#8899AA') },
          i
        )
      );
    } else if (resubmitCalls === 2) {
      const current = await designOperation(dataRoot, { operation: 'read', sessionId: artworkId });
      const saved = await designOperation(dataRoot, {
        operation: 'save',
        sessionId: artworkId,
        baseRevisionId: current.revisionId,
        content: {
          doc: { ...current.doc, background: { type: 'solid', color: '#778899' } },
          assets: current.assets,
        },
      });
      externalRevision = saved.revisionId;
      calls = [
        tool('write', { path: path.join(draft, 'design.pptd'), content: 'MUST NOT WRITE' }, 0),
      ];
    } else if (resubmitCalls === 3) {
      assert(returned.includes('DESIGN_READ_STALE'));
      calls = [
        'design-current/design.pptd',
        'design-current/pages/design.page',
        'design.pptd',
        'pages/design.page',
      ].map((file, i) => tool('read', { path: path.join(draft, file) }, i));
    } else if (resubmitCalls === 4) {
      assert(returned.includes('#778899') && returned.includes('#8899AA'));
      calls = [tool('folio_resubmit_draft', {}, 0)];
    } else {
      assert(returned.includes('Explicit attempt recorded'));
      calls = [];
      text = 'SYNTHETIC_RESUBMIT_FINISHED';
    }
    resubmitCalls++;
  }
  if (recovering) {
    const mode = latestText.match(/SYNTHETIC_RECOVERY_(CANCEL|FAIL|CONFLICT|CONTINUE)/)?.[1];
    assert(mode);
    if (recoveryModeName !== mode) {
      recoveryModeName = mode;
      recoveryStep = 0;
    }
    const n = recoveryStep++;
    const tool = (name, args, i) => ({
      index: i,
      id: `recovery_${mode}_${n}_${i}`,
      type: 'function',
      function: { name, arguments: JSON.stringify(args) },
    });
    if (n === 0) {
      calls = [
        'design-current/design.pptd',
        'design-current/pages/design.page',
        'design.pptd',
        'pages/design.page',
      ].map((file, i) => tool('read', { path: path.join(draft, file) }, i));
    } else if (n === 1) {
      if (mode === 'CONTINUE') calls = [tool('folio_resubmit_draft', {}, 0)];
      else
        calls = [...sourceFiles].map(([file, content], i) =>
          tool(
            'write',
            {
              path: path.join(draft, file),
              content: content.replace(
                /#ffffff/i,
                { CANCEL: '#445566', FAIL: '#556677', CONFLICT: '#667788' }[mode]
              ),
            },
            i
          )
        );
    } else if (mode === 'CANCEL') {
      heldResponse = res;
      reachedHold();
      return;
    } else if (mode === 'FAIL') {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          error: {
            message: 'Synthetic unrecoverable provider failure',
            type: 'invalid_request_error',
          },
        })
      );
      return;
    } else {
      if (mode === 'CONFLICT') {
        const current = await designOperation(dataRoot, {
          operation: 'read',
          sessionId: artworkId,
        });
        const saved = await designOperation(dataRoot, {
          operation: 'save',
          sessionId: artworkId,
          baseRevisionId: current.revisionId,
          content: {
            doc: { ...current.doc, background: { type: 'solid', color: '#AABBCC' } },
            assets: current.assets,
          },
        });
        externalRevision = saved.revisionId;
      }
      text = `SYNTHETIC_RECOVERY_${mode}_FINISHED`;
      calls = [];
    }
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const send = (delta, finish_reason) =>
    res.write(
      `data: ${JSON.stringify({ id: 'synthetic', object: 'chat.completion.chunk', created: 1, model: 'synthetic', choices: [{ index: 0, delta, finish_reason }] })}\n\n`
    );
  send({ role: 'assistant', ...(calls.length ? { tool_calls: calls } : { content: text }) }, null);
  send({}, calls.length ? 'tool_calls' : 'stop');
  res.end('data: [DONE]\n\n');
});
provider.listen(0, '127.0.0.1');
await once(provider, 'listening');
const port = provider.address().port;
const agentDir = path.join(root, 'pi-agent');
await mkdir(agentDir);
await writeFile(
  path.join(agentDir, 'models.json'),
  JSON.stringify({
    providers: {
      synthetic: {
        baseUrl: `http://127.0.0.1:${port}/v1`,
        api: 'openai-completions',
        apiKey: 'synthetic-only',
        models: [{ id: 'synthetic', contextWindow: 100000, maxTokens: 4096 }],
      },
    },
  })
);
await writeFile(
  path.join(agentDir, 'settings.json'),
  JSON.stringify({ defaultProvider: 'synthetic', defaultModel: 'synthetic', quietStartup: true })
);
const h = new ElectronHarness({
  rootDir: root,
  scenarioDir,
  stableId: resubmitMode ? 'FOLIO-T06' : 'FOLIO-T05',
});
try {
  await h.launch();
  dataRoot = await h.app.evaluate(() => process.env.LODY_DATA_DIR);
  assert(dataRoot);
  // Prepare the actual pinned adapter before capability probing and main launch
  // can race installation into this probe's private npm cache. No model call.
  await promisify(execFile)(
    'npm',
    ['exec', '--yes', '--package=pi-acp@0.0.33', '--', 'node', '-e', 'process.exit(0)'],
    {
      env: { ...process.env, npm_config_cache: path.join(dataRoot, 'npm-cache') },
    }
  );
  const page = h.page;
  const onboarding = new OnboardingPage(page);
  await onboarding.waitForLocalBootstrap();
  await onboarding.skipConfigurationAndEnterProduct();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Agents', exact: true }).click();
  await page
    .getByRole('button', { name: /^(Add provider|添加 Provider)$/ })
    .first()
    .click();
  await page.getByRole('option', { name: 'pi ACP', exact: true }).click();
  await page.locator('#agent-config-name').fill('Synthetic Pi');
  await page.getByRole('button', { name: 'Environment variables', exact: true }).click();
  await page
    .locator('textarea')
    .last()
    .fill(`PI_CODING_AGENT_DIR=${agentDir}\nPI_ACP_PI_COMMAND=${pi}`);
  await page.getByRole('button', { name: /^(Create|创建)$/ }).click();
  await expect(page.getByText('Synthetic Pi', { exact: true }).first()).toBeVisible({
    timeout: 60000,
  });
  await page.keyboard.press('Escape');
  await page.locator('#chat-prompt').fill('SYNTHETIC_INITIAL');
  await page.getByRole('button', { name: /^(Send|发送)$/ }).click();
  await expect(page.locator('p').filter({ hasText: 'SYNTHETIC_INITIAL_FINISHED' })).toBeVisible({
    timeout: 120000,
  });
  console.log('INITIAL', page.url());
  const id = page.url().match(/sessions\/([^/?#]+)/)?.[1];
  assert(id);
  artworkId = id;
  await expect
    .poll(
      async () =>
        h.app.evaluate(async ({ BrowserWindow }) => {
          const owner = BrowserWindow.getAllWindows().find((w) =>
            w.webContents.getURL().includes('#/local/')
          );
          const view = owner.contentView.children.find((v) =>
            v.webContents?.getURL().includes('design')
          );
          return view
            ? await view.webContents.executeJavaScript('window.folio?.state().readonly')
            : true;
        }),
      { timeout: 60000 }
    )
    .toBe(false);
  await h.app.evaluate(async ({ BrowserWindow }) => {
    const owner = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes('#/local/')
    );
    const views = owner.contentView.children;
    const view = views.find((v) => v.webContents?.getURL().includes('design'));
    if (!view) throw Error('No Bento view');
    await view.webContents.executeJavaScript(
      `document.querySelector('[data-c2a-kind="shape"]').click()`
    );
  });
  await page.evaluate(async (id) => window.ipc.invoke('design.save', id), id);
  const edited = await page.evaluate(async (id) => window.ipc.invoke('design.read', id), id);
  assert(edited.doc.elements.length > 0);
  console.log('SAVED', edited.revisionId);
  await page.getByRole('combobox').fill('SYNTHETIC_EDIT');
  await page.getByRole('button', { name: /^(Send|发送)$/ }).click();
  await expect(page.locator('p').filter({ hasText: 'SYNTHETIC_DESIGN_FINISHED' })).toBeVisible({
    timeout: 120000,
  });
  await expect
    .poll(
      async () => {
        const saved = await page.evaluate(async (id) => window.ipc.invoke('design.read', id), id);
        return saved.revisionId;
      },
      { timeout: 60000 }
    )
    .not.toBe(edited.revisionId);
  const final = await page.evaluate(async (id) => window.ipc.invoke('design.read', id), id);
  assert.equal(final.doc.elements.length, edited.doc.elements.length);
  assert(blocked);
  assert.equal(final.doc.background.color, '#8899AA');
  await expect
    .poll(
      async () =>
        h.app.evaluate(async ({ BrowserWindow }) => {
          const owner = BrowserWindow.getAllWindows().find((w) =>
            w.webContents.getURL().includes('#/local/')
          );
          const view = owner.contentView.children.find((v) =>
            v.webContents?.getURL().includes('design')
          );
          return view
            ? await view.webContents.executeJavaScript('window.folio?.state().readonly')
            : true;
        }),
      { timeout: 60000 }
    )
    .toBe(false);
  if (resubmitMode) {
    const originalDraft = await readDesignArtifactDigest(draft);
    assert.equal(originalDraft.status, 'present');
    await page.getByRole('combobox').fill('SYNTHETIC_RESUBMIT');
    await page.getByRole('button', { name: /^(Send|发送)$/ }).click();
    await expect(page.locator('p').filter({ hasText: 'SYNTHETIC_RESUBMIT_FINISHED' })).toBeVisible({
      timeout: 120000,
    });
    await expect
      .poll(
        async () => {
          const saved = await page.evaluate(async (id) => window.ipc.invoke('design.read', id), id);
          return saved.doc.background.color;
        },
        { timeout: 60000 }
      )
      .toBe('#8899AA');
    await expect
      .poll(
        async () =>
          h.app.evaluate(async ({ BrowserWindow }) => {
            const owner = BrowserWindow.getAllWindows().find((w) =>
              w.webContents.getURL().includes('#/local/')
            );
            const view = owner.contentView.children.find((v) =>
              v.webContents?.getURL().includes('design')
            );
            return view
              ? await view.webContents.executeJavaScript('window.folio?.state().readonly')
              : true;
          }),
        { timeout: 60000 }
      )
      .toBe(false);
    const retained = await page.evaluate(async (id) => window.ipc.invoke('design.read', id), id);
    assert.equal(retained.revisionId, final.revisionId);
    assert.notEqual(retained.revisionId, externalRevision);
    assert.deepEqual(await readDesignArtifactDigest(draft), originalDraft);
    assert.equal(retained.doc.elements.length, edited.doc.elements.length);
  }
  if (recoveryMode) {
    const readonly = async () =>
      h.app.evaluate(async ({ BrowserWindow }) => {
        const owner = BrowserWindow.getAllWindows().find((w) =>
          w.webContents.getURL().includes('#/local/')
        );
        const view = owner?.contentView.children.find((v) =>
          v.webContents?.getURL().includes('design')
        );
        return view
          ? await view.webContents.executeJavaScript('window.folio?.state().readonly')
          : true;
      });
    const readSaved = () => page.evaluate(async (id) => window.ipc.invoke('design.read', id), id);
    const receipts = async () => {
      const directory = path.join(dataRoot, 'chats', id, 'design-input');
      const names = await readdir(directory);
      return (
        await Promise.all(
          names.map(async (name) => {
            try {
              return JSON.parse(await readFile(path.join(directory, name, 'receipt.json'), 'utf8'));
            } catch {
              return null;
            }
          })
        )
      ).filter(Boolean);
    };
    const submit = async (mode) => {
      await page.getByRole('combobox').fill(`SYNTHETIC_RECOVERY_${mode}`);
      await page.getByRole('button', { name: /^(Send|发送)$/ }).click();
    };
    for (const mode of ['CANCEL', 'FAIL', 'CONFLICT']) {
      const before = await readSaved();
      const previous = new Set((await receipts()).map((r) => r.turnId));
      await submit(mode);
      if (mode === 'CANCEL') {
        await holdReached;
        assert.equal(await readonly(), true);
        const url = page.url();
        await page.reload();
        await expect(page.getByRole('button', { name: /^(Stop|停止)$/ })).toBeVisible({
          timeout: 60000,
        });
        assert.equal(page.url(), url);
        assert.equal(await readonly(), true);
        await page.getByRole('button', { name: /^(Stop|停止)$/ }).click();
        heldResponse.destroy();
      }
      await expect
        .poll(async () => (await receipts()).find((r) => !previous.has(r.turnId))?.status, {
          timeout: 120000,
        })
        .toBe(mode === 'CANCEL' ? 'cancelled' : mode === 'FAIL' ? 'failed' : 'invalid');
      await expect.poll(readonly, { timeout: 60000 }).toBe(false);
      const after = await readSaved();
      assert.equal(after.revisionId, mode === 'CONFLICT' ? externalRevision : before.revisionId);
      const retained = await readDesignArtifactDigest(draft);
      assert.equal(retained.status, 'present');
      const requestCount = modelRequests;
      await page.reload();
      await expect.poll(readonly, { timeout: 60000 }).toBe(false);
      assert.equal(modelRequests, requestCount);
      assert.equal((await readSaved()).revisionId, after.revisionId);
      assert.deepEqual(await readDesignArtifactDigest(draft), retained);
      const beforeContinue = new Set((await receipts()).map((r) => r.turnId));
      await submit('CONTINUE');
      await expect(
        page.locator('p').filter({ hasText: 'SYNTHETIC_RECOVERY_CONTINUE_FINISHED' }).last()
      ).toBeVisible({ timeout: 120000 });
      await expect
        .poll(async () => (await receipts()).find((r) => !beforeContinue.has(r.turnId))?.status, {
          timeout: 120000,
        })
        .toBe('committed');
      await expect.poll(readonly, { timeout: 60000 }).toBe(false);
      assert.equal(
        (await readSaved()).doc.background.color,
        { CANCEL: '#445566', FAIL: '#556677', CONFLICT: '#667788' }[mode]
      );
      assert.deepEqual(await readDesignArtifactDigest(draft), retained);
      console.log('RECOVERY', mode, 'preserved, reopened, explicitly continued');
    }
    if (process.env.FOLIO_PROBE_CLAUDE) {
      await page.addLocatorHandler(
        page.getByRole('button', { name: 'Allow Once', exact: true }).first(),
        async () => {
          await page.getByRole('button', { name: 'Allow Once', exact: true }).first().click();
        },
        { noWaitAfter: true }
      );
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('button', { name: 'Agents', exact: true }).click();
      await page
        .getByRole('button', { name: /^(Add provider|添加 Provider)$/ })
        .first()
        .click();
      await page.getByRole('option', { name: 'Claude', exact: true }).click();
      await page.locator('#agent-config-name').fill('Synthetic Claude');
      await page.locator('#builtin-runtime-path').fill(process.env.FOLIO_PROBE_CLAUDE);
      await page.getByRole('button', { name: 'Environment variables', exact: true }).click();
      await page
        .locator('textarea')
        .last()
        .fill(
          `ANTHROPIC_API_KEY=synthetic-only\nANTHROPIC_BASE_URL=http://127.0.0.1:${port}\nCLAUDE_CONFIG_DIR=${root}/claude-config\nCLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`
        );
      await page.getByRole('button', { name: /^(Create|创建)$/ }).click();
      await expect(page.getByText('Synthetic Claude', { exact: true }).first()).toBeVisible({
        timeout: 60000,
      });
      await expect(page.locator('#agent-config-name')).toBeHidden();
      await page.getByRole('button', { name: 'Close', exact: true }).last().click();
      await page.getByRole('button', { name: 'Run configuration', exact: true }).click();
      await page
        .getByRole('menuitem')
        .filter({ hasText: /^Agent/ })
        .hover();
      await page.getByRole('menuitemradio').filter({ hasText: 'Synthetic Claude' }).click();
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      const beforeSwitch = new Set((await receipts()).map((r) => r.turnId));
      assert.equal(switchCalls, 0, 'Selecting an Agent must not call a model');
      await page.getByRole('combobox').fill('SYNTHETIC_SWITCH');
      await page.getByRole('button', { name: /^(Send|发送)$/ }).click();
      await expect
        .poll(async () => (await receipts()).find((r) => !beforeSwitch.has(r.turnId))?.status, {
          timeout: 120000,
        })
        .toBe('committed');
      await expect.poll(readonly, { timeout: 60000 }).toBe(false);
      assert.equal((await readSaved()).doc.background.color, '#7788AA');
      assert.equal((await readSaved()).doc.elements.length, edited.doc.elements.length);
      console.log('SWITCH Pi to Claude reacquired current design and committed');
    }
    await writeFile(
      path.join(scenarioDir, 'recovery-receipts.json'),
      JSON.stringify(await receipts(), null, 2)
    );
  }
  const canvasImage = await h.app.evaluate(async ({ BrowserWindow }) => {
    const owner = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes('#/local/')
    );
    const view = owner.contentView.children.find((v) => v.webContents?.getURL().includes('design'));
    return (await view.webContents.capturePage()).toDataURL();
  });
  await writeFile(
    path.join(scenarioDir, 'canvas.png'),
    Buffer.from(canvasImage.split(',')[1], 'base64')
  );

  await page.screenshot({ path: path.join(scenarioDir, 'committed.png') });
  const observedFinal = await page.evaluate(
    async (canvasId) => window.ipc.invoke('design.read', canvasId),
    id
  );
  await writeFile(
    path.join(scenarioDir, 'final-canvas.json'),
    JSON.stringify(observedFinal, null, 2)
  );
  await cp(path.join(dataRoot, 'logs'), path.join(scenarioDir, 'cli-logs'), { recursive: true });
  console.log(
    JSON.stringify({
      status: 'passed',
      boundary:
        recoveryMode && process.env.FOLIO_PROBE_CLAUDE
          ? 'Electron IPC/MessageHandler/Session actual Pi and Claude ACP native runtimes'
          : 'Electron IPC/MessageHandler/Session actual Pi ACP runtime natural finalization',
      preparedPiAcpCache: true,
      syntheticExternalProvider: true,
      editCalls,
      resubmitCalls,
      externalRevision,
      blocked,
      finalRevision: observedFinal.revisionId,
      elementCount: observedFinal.doc.elements.length,
      root,
    })
  );
} catch (error) {
  console.error('PROBE ERROR', error);
  const ownData = await h.app.evaluate(({ app }) => app.getPath('userData'));
  await cp(
    path.join(path.dirname(ownData), 'lody-data', 'logs'),
    path.join(scenarioDir, 'cli-logs'),
    { recursive: true }
  ).catch(() => {});
  await writeFile(
    path.join(scenarioDir, 'cli-backlog.json'),
    JSON.stringify(await h.captureCliBacklog())
  );
  await writeFile(
    path.join(scenarioDir, 'body.txt'),
    (await h.page?.locator('body').innerText()) ?? ''
  );
  await writeFile(path.join(scenarioDir, 'logs.json'), JSON.stringify(h.logs));
  console.error('ARTIFACTS', root);
  throw error;
} finally {
  provider.close();
  await h.close();
}
