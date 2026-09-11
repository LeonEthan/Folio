/** Manual acceptance probe. Reuses the existing Electron harness; only provider wire is synthetic.
 * Build desktop first, then run with tsx and FOLIO_PROBE_PI. Not a registered regression journey. */
import { ElectronHarness } from '../../../e2e/src/support/electron-harness.ts';
import { OnboardingPage } from '../../../e2e/src/support/pages/onboarding-page.ts';
import { createRequire } from 'node:module';
const { expect } = createRequire(new URL('../../../e2e/package.json', import.meta.url))(
  '@playwright/test'
);
const pi = process.env.FOLIO_PROBE_PI;
if (!pi) throw Error('Set FOLIO_PROBE_PI to the verified Pi executable');
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdir, mkdtemp, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = await mkdtemp(path.join(tmpdir(), 'folio-t05-desktop-'));
const scenarioDir = path.join(root, 'evidence');
await mkdir(scenarioDir);
let editCalls = 0;
let draft = '';
let sourceFiles = new Map();
let blocked = false;
const provider = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString());
  const userMessages = body.messages
    .filter((m) => m.role === 'user')
    .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
    .join('\n');
  const editing = userMessages.includes('SYNTHETIC_EDIT');
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
const h = new ElectronHarness({ rootDir: root, scenarioDir, stableId: 'FOLIO-T05' });
try {
  await h.launch();
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
  console.log(
    JSON.stringify({
      status: 'passed',
      boundary: 'Electron IPC/MessageHandler/Session actual Pi ACP runtime natural finalization',
      editCalls,
      blocked,
      finalRevision: final.revisionId,
      elementCount: final.doc.elements.length,
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
