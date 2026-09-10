import { isDeepStrictEqual } from 'node:util'
import { app, BrowserWindow, WebContentsView, session, dialog } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID, createHash } from 'node:crypto'
import { readFile, open, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { DesignPayload, DesignRequest } from '../../../../cli/src/design/store'

const resources = () =>
  app.isPackaged
    ? join(process.resourcesPath, 'app.asar.unpacked/resources')
    : join(app.getAppPath(), 'resources')
type RecordEntry = { view: WebContentsView; owner: BrowserWindow; dispose(): void }
const records = new Map<string, RecordEntry>()
const loading = new Map<string, Promise<RecordEntry>>()
const hosts = new Map<string, string>()
let worker: ChildProcessWithoutNullStreams | undefined
let pending: { resolve(value: unknown): void; reject(error: Error): void } | undefined
let queue: Promise<unknown> = Promise.resolve()

export function designRequest<T = DesignPayload>(
  request:
    | DesignRequest
    | { operation: 'pending' }
    | { operation: 'acknowledge'; sessionId: string }
): Promise<T> {
  const result = queue
    .catch(() => {})
    .then(
      () =>
        new Promise<T>((resolve, reject) => {
          if (!worker) {
            const child = spawn(process.execPath, [join(resources(), 'cli/design.js')], {
              env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
              stdio: ['pipe', 'pipe', 'pipe']
            })
            worker = child
            const lines = createInterface({ input: child.stdout })
            lines.on('line', (line) => {
              const current = pending
              pending = undefined
              try {
                const response = JSON.parse(line)
                if (response.ok) current?.resolve(response.value)
                else current?.reject(Error(response.error))
              } catch {
                current?.reject(Error('Invalid design service response'))
              }
            })
            child.stderr.resume()
            const failed = () => {
              if (worker !== child) return
              worker = undefined
              pending?.reject(Error('Design service stopped; retry to check the saved drawing'))
              pending = undefined
              lines.close()
            }
            child.once('error', failed)
            child.once('exit', failed)
          }
          pending = { resolve: (value) => resolve(value as T), reject }
          worker.stdin.write(JSON.stringify(request) + '\n', (error) => {
            if (error) {
              pending = undefined
              reject(error)
            }
          })
        })
    )
  queue = result
  return result
}

async function surface(payload: DesignPayload, editable: boolean) {
  const shell = await readFile(join(resources(), 'design/editor.html'))
  const manifest = JSON.parse(await readFile(join(resources(), 'design/build.json'), 'utf8'))
  if (createHash('sha256').update(shell).digest('hex') !== manifest.shellSha256)
    throw Error('Bento resource integrity failure')
  const isolated = session.fromPartition('folio-canvas-' + randomUUID())
  const host = 'canvas-' + randomUUID()
  const origin = 'folio-design://' + host
  const id = payload.association.sessionId
  isolated.setPermissionRequestHandler((_c, _p, done) => done(false))
  isolated.setPermissionCheckHandler(() => false)
  isolated.webRequest.onBeforeRequest((details, done) =>
    done({ cancel: !details.url.startsWith(origin + '/') && !/^(data|blob):/.test(details.url) })
  )
  await isolated.protocol.handle('folio-design', async (request) => {
    const url = new URL(request.url)
    const headers = {
      'Cache-Control': 'no-store',
      'Content-Security-Policy':
        "default-src 'none'; script-src 'self' 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'self' data:; worker-src blob:; base-uri 'none'; form-action 'none'"
    }
    if (url.protocol !== 'folio-design:' || url.host !== host)
      return new Response(null, { status: 403 })
    if (request.method === 'GET' && url.pathname === '/editor.html')
      return new Response(shell, { headers: { ...headers, 'Content-Type': 'text/html' } })
    if (request.method === 'GET' && url.pathname === '/ws/' + id)
      return Response.json(payload, { headers })
    if (editable && request.method === 'POST' && url.pathname === '/ws/' + id + '/save') {
      try {
        const text = await request.text()
        if (text.length > 64 * 1024 * 1024) throw Error('Design exceeds 64 MiB')
        const input = JSON.parse(text)
        const saved = await designRequest({
          operation: 'save',
          sessionId: id,
          baseRevisionId: input.baseRevisionId,
          content: { doc: input.doc, assets: input.assets }
        })
        payload = saved
        return Response.json({ ok: true, revisionId: saved.revisionId }, { headers })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return Response.json(
          { ok: false, code: message, error: message },
          { status: message === 'DESIGN_CONFLICT' ? 409 : 400, headers }
        )
      }
    }
    return new Response(null, { status: 403 })
  })
  return {
    isolated,
    url: origin + '/editor.html?ws=' + id + (editable ? '&autosave=1&folio=1' : ''),
    dispose: () => isolated.protocol.unhandle('folio-design')
  }
}

export async function attachDesign(
  owner: BrowserWindow,
  id: string,
  bounds: Electron.Rectangle,
  hostId = id
) {
  hosts.set(id, hostId)
  let record = records.get(id)
  if (!record) {
    let opening = loading.get(id)
    if (!opening) {
      opening = (async () => {
        const payload = await designRequest({ operation: 'read', sessionId: id })
        const source = await surface(payload, true)
        const view = new WebContentsView({
          webPreferences: {
            session: source.isolated,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false
          }
        })
        const entry = { view, owner, dispose: source.dispose }
        records.set(id, entry)
        owner.contentView.addChildView(view)
        view.setVisible(false)
        view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
        view.webContents.on('will-navigate', (event) => event.preventDefault())
        view.webContents.on('will-redirect', (event) => event.preventDefault())
        view.webContents.on('will-prevent-unload', (event) => event.preventDefault())
        try {
          await view.webContents.loadURL(source.url)
        } catch (error) {
          destroyDesign(id)
          throw error
        }
        installCloseGuard(owner)
        return entry
      })()
      loading.set(id, opening)
      void opening.finally(() => loading.delete(id)).catch(() => {})
    }
    record = await opening
  }
  if (hosts.get(id) !== hostId) return
  if (record.owner !== owner) throw Error('Design owner mismatch')
  const [width, height] = owner.getContentSize()
  const x = Math.max(0, Math.round(bounds.x)),
    y = Math.max(0, Math.round(bounds.y))
  record.view.setBounds({
    x,
    y,
    width: Math.max(1, Math.min(width - x, Math.round(bounds.width))),
    height: Math.max(1, Math.min(height - y, Math.round(bounds.height)))
  })
  await record.view.webContents.executeJavaScript('document.body.inert = false')
  record.view.setVisible(true)
}
export function hideDesign(id: string, hostId?: string) {
  if (hostId && hosts.get(id) !== hostId) return
  hosts.delete(id)
  records.get(id)?.view.setVisible(false)
}
export function destroyDesign(id: string) {
  const record = records.get(id)
  if (!record) return
  records.delete(id)
  hosts.delete(id)
  if (!record.owner.isDestroyed()) record.owner.contentView.removeChildView(record.view)
  if (!record.view.webContents.isDestroyed())
    record.view.webContents.close({ waitForBeforeUnload: false })
  record.dispose()
}
export async function saveDesign(id: string) {
  const record = records.get(id)
  if (!record) return
  const result = await record.view.webContents.executeJavaScript('window.folio?.save()')
  if (!result?.ok) throw Error(result?.error ?? 'Canvas is not ready')
}
/**
 * P2.2 send gate: flush pending canvas edits before a design turn is
 * dispatched. A missing record means no editor was ever opened this run, so no
 * unsaved edits can exist; an editor whose bridge has not finished loading
 * cannot have been edited yet either. Both proceed; a real save failure
 * rejects so the renderer can block the send and keep the user's draft.
 */
export async function saveDesignForDispatch(id: string) {
  const record = records.get(id)
  if (!record) return
  const result = await record.view.webContents.executeJavaScript(
    'window.folio ? window.folio.save() : undefined'
  )
  if (result === undefined || result === null) return
  if (!result.ok) throw Error(result.error ?? 'Canvas save failed')
}
export async function leaveDesign(id: string): Promise<boolean> {
  try {
    await records.get(id)?.view.webContents.executeJavaScript('document.body.inert = true')
    await saveDesign(id)
    return true
  } catch (error) {
    const record = records.get(id)
    if (!record) throw error
    const answer = await dialog.showMessageBox(record.owner, {
      type: 'warning',
      message: '画稿尚未保存 / Drawing not saved',
      detail: String(error),
      buttons: ['返回编辑 / Keep editing', '重试 / Retry', '放弃修改 / Discard edits'],
      defaultId: 0,
      cancelId: 0
    })
    if (answer.response === 1) return leaveDesign(id)
    if (answer.response === 2) {
      destroyDesign(id)
      return true
    }
    await unfreezeDesigns()
    return false
  }
}
export async function copyDesign(
  id: string,
  association: Extract<DesignRequest, { operation: 'create' }>['association']
) {
  const record = records.get(id)
  if (!record) throw Error('Canvas is not open')
  const copy = await record.view.webContents.executeJavaScript('window.folio.snapshot()')
  return designRequest({
    operation: 'create',
    association,
    width: copy.doc.canvas.width,
    height: copy.doc.canvas.height,
    copy
  })
}
const guarded = new WeakSet<BrowserWindow>()
function installCloseGuard(owner: BrowserWindow) {
  if (guarded.has(owner)) return
  guarded.add(owner)
  let leaving = false
  let allowed = false
  owner.on('show', () => {
    void unfreezeDesigns()
  })
  owner.once('closed', () => {
    for (const [id, record] of records) if (record.owner === owner) destroyDesign(id)
  })
  owner.prependListener('close', (event) => {
    if (allowed) {
      allowed = false
      return
    }
    if (!records.size) return
    event.preventDefault()
    if (leaving) return
    leaving = true
    void (async () => {
      for (const id of records.keys()) if (!(await leaveDesign(id))) return
      allowed = true
      owner.close()
    })()
      .catch((error) => dialog.showErrorBox('Folio', String(error)))
      .finally(() => {
        leaving = false
      })
  })
}

export async function exportDesign(id: string, format: 'png' | 'jpeg', title: string) {
  await saveDesign(id)
  const payload = await designRequest({ operation: 'read', sessionId: id })
  const target = await dialog.showSaveDialog({
    defaultPath:
      // oxlint-disable-next-line no-control-regex -- File names cannot contain control characters.
      title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') + (format === 'png' ? '.png' : '.jpg'),
    filters: [{ name: format.toUpperCase(), extensions: [format === 'png' ? 'png' : 'jpg'] }]
  })
  if (target.canceled || !target.filePath) return
  const bytes = await renderSavedDesign(payload, format)
  const temporary = target.filePath + '.' + randomUUID() + '.tmp'
  try {
    const file = await open(temporary, 'wx', 0o600)
    try {
      await file.writeFile(bytes)
      await file.sync()
    } finally {
      await file.close()
    }
    await rename(temporary, target.filePath)
  } finally {
    await unlink(temporary).catch(() => {})
  }
}

export async function renderSavedDesign(
  payload: DesignPayload,
  format: 'png' | 'jpeg'
): Promise<Buffer> {
  const source = await surface(payload, false)
  const { width, height } = payload.doc.canvas
  const window = new BrowserWindow({
    show: false,
    width,
    height,
    useContentSize: true,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      session: source.isolated,
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  try {
    await window.loadURL(source.url)
    await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const timer = setTimeout(() => { observer.disconnect(); reject(Error('Canvas rendering timed out')); }, 30000);
      const observer = new MutationObserver(check); observer.observe(document, { childList:true, subtree:true });
      async function check() {
        const stage = document.querySelector('.ed-stage-scale .bento-slide');
        if (!window.bento?.doc || !stage) return;
        observer.disconnect();
        try {
          await document.fonts.ready;
          if ([...document.fonts].some(font => font.status === 'error')) throw Error('Font failed to load');
          await Promise.all([...stage.querySelectorAll('img')].map(image => image.decode()));
          await Promise.all([...stage.querySelectorAll('image')].map(node => { const image = new Image(); image.src = node.getAttribute('href') || node.getAttribute('xlink:href') || ''; return image.decode(); }));
          if (stage.offsetWidth !== ${width} || stage.offsetHeight !== ${height}) throw Error('Canvas dimensions differ');
          document.documentElement.style.cssText = 'margin:0;background:${format === 'jpeg' ? '#fff' : 'transparent'}!important;overflow:hidden';
          document.body.style.cssText = 'margin:0;background:transparent!important;overflow:hidden';
          stage.style.cssText += ';transform:none;position:absolute;left:0;top:0'; stage.inert = true;
          document.body.replaceChildren(stage);
          await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
          clearTimeout(timer); resolve(true);
        } catch(error) { clearTimeout(timer); reject(error); }
      } check();
    })`)
    const image = await window.webContents.capturePage({ x: 0, y: 0, width, height })
    const exact = image.resize({ width, height })
    return format === 'png' ? exact.toPNG() : exact.toJPEG(95)
  } finally {
    window.destroy()
    source.dispose()
  }
}

export async function finishDesignCopy(sourceId: string, targetId: string) {
  const record = records.get(sourceId)
  if (!record) return
  const current = await record.view.webContents.executeJavaScript('window.folio.snapshot()')
  const saved = await designRequest({ operation: 'read', sessionId: targetId })
  if (!isDeepStrictEqual(current.doc, saved.doc))
    throw Error('Drawing changed during copy; save the newer edits before leaving')
  destroyDesign(sourceId)
}
export async function renameDesign(id: string, name: string) {
  await saveDesign(id)
  const saved = await designRequest({ operation: 'read', sessionId: id })
  const renamed = await designRequest({
    operation: 'save',
    sessionId: id,
    baseRevisionId: saved.revisionId,
    name,
    content: { doc: saved.doc, assets: saved.assets }
  })
  await records
    .get(id)
    ?.view.webContents.executeJavaScript(
      'window.folio.rebase(' +
        JSON.stringify(saved.revisionId) +
        ',' +
        JSON.stringify(renamed.revisionId) +
        ')'
    )
  return renamed
}
export function hasOpenDesigns() {
  return records.size > 0
}
export async function prepareDesignQuit(): Promise<boolean> {
  for (const id of records.keys()) if (!(await leaveDesign(id))) return false
  for (const id of [...records.keys()]) destroyDesign(id)
  worker?.stdin.end()
  return true
}

async function unfreezeDesigns() {
  await Promise.all(
    [...records.values()].map((record) =>
      record.view.webContents.executeJavaScript('document.body.inert = false').catch(() => {})
    )
  )
}
