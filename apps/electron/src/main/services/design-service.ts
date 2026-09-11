import { isDeepStrictEqual } from 'node:util'
import { app, BrowserWindow, WebContentsView, session, dialog } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID, createHash } from 'node:crypto'
import { readFile, open, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { DesignPayload, DesignRequest } from '../../../../cli/src/design/store'
import { openDesignCanvasNeedsReload, selectCanvasInstance } from './design-canvas-sync-core'
import { DesignCanvasAccess, type CanvasInstance } from './design-canvas-access'

/** P2.5 candidate handling rides the existing design worker channel. */
type DesignCandidateRequest = { sessionId: string; candidateId: string }

const resources = () =>
  app.isPackaged
    ? join(process.resourcesPath, 'app.asar.unpacked/resources')
    : join(app.getAppPath(), 'resources')
type RecordEntry = {
  artworkId: string
  access: CanvasInstance
  view: WebContentsView
  owner: BrowserWindow
  dispose(): void
  revisionId: string
}
export const designCanvasAccess = new DesignCanvasAccess()
let queryCanvasState: (() => Promise<void>) | undefined
export function setDesignCanvasStateQuery(query: () => Promise<void>) {
  queryCanvasState = query
}
const records = new Map<string, RecordEntry>()
const recordsFor = (id: string) => [...records.values()].filter((record) => record.artworkId === id)
const loading = new Map<string, Promise<RecordEntry>>()
const syncing = new Map<string, Promise<void>>()
const hosts = new Map<string, string>()
let worker: ChildProcessWithoutNullStreams | undefined
let pending: { resolve(value: unknown): void; reject(error: Error): void } | undefined
let queue: Promise<unknown> = Promise.resolve()

export function designRequest<T = DesignPayload>(
  request:
    | DesignRequest
    | { operation: 'source-preview'; workdir: string; previousSourceIdentity?: string }
    | { operation: 'pending' }
    | { operation: 'acknowledge'; sessionId: string }
    | ({ operation: 'candidate-file' } & DesignCandidateRequest)
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

export async function surface(
  payload: DesignPayload,
  editable: boolean,
  hostId?: string,
  preview = false
) {
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
        const saved = await designCanvasAccess.write(id, input.writePermit, () =>
          designRequest({
            operation: 'save',
            sessionId: id,
            baseRevisionId: input.baseRevisionId,
            content: { doc: input.doc, assets: input.assets }
          })
        )
        payload = saved
        const record = hostId ? records.get(hostId) : undefined
        if (record) record.revisionId = saved.revisionId
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
    url: origin + '/editor.html?ws=' + id + (editable || preview ? '&autosave=1&folio=1' : ''),
    dispose: () => isolated.protocol.unhandle('folio-design')
  }
}

export async function attachDesign(
  owner: BrowserWindow,
  id: string,
  bounds: Electron.Rectangle,
  hostId = id,
  reconcile = true
) {
  hosts.set(hostId, id)
  let record = records.get(hostId)
  if (!record) {
    let opening = loading.get(hostId)
    if (!opening) {
      opening = (async () => {
        const payload = await designRequest({ operation: 'read', sessionId: id })
        const source = await surface(payload, true, hostId)
        const view = new WebContentsView({
          webPreferences: {
            session: source.isolated,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false
          }
        })
        const access: CanvasInstance = {
          artworkId: id,
          setReadonly: async (value, reason) => {
            await view.webContents.executeJavaScript(
              'window.folio?.setReadonly(' +
                JSON.stringify(value) +
                ',' +
                JSON.stringify(reason) +
                ')'
            )
          },
          flush: async (permit) => {
            const result = await view.webContents.executeJavaScript(
              'window.folio?.flush(' + JSON.stringify(permit) + ')'
            )
            if (!result?.ok) throw Error(result?.error ?? 'Canvas is not ready; edits are retained')
          }
        }
        const entry = {
          artworkId: id,
          access,
          view,
          owner,
          dispose: source.dispose,
          revisionId: payload.revisionId
        }
        records.set(hostId, entry)
        owner.contentView.addChildView(view)
        view.setVisible(false)
        view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
        view.webContents.on('will-navigate', (event) => event.preventDefault())
        view.webContents.on('will-redirect', (event) => event.preventDefault())
        view.webContents.on('will-prevent-unload', (event) => event.preventDefault())
        try {
          await view.webContents.loadURL(source.url)
        } catch (error) {
          destroyDesignInstance(hostId)
          throw error
        }
        await designCanvasAccess.register(access)
        if (!reconcile)
          await access.setReadonly(designCanvasAccess.isReadonly(id), '只读 / Read-only')
        try {
          if (reconcile) await queryCanvasState?.()
        } catch {
          await designCanvasAccess.disconnected()
        }
        installCloseGuard(owner)
        return entry
      })()
      loading.set(hostId, opening)
      void opening.finally(() => loading.delete(hostId)).catch(() => {})
    }
    record = await opening
  }
  if (hosts.get(hostId) !== id) return
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
  // Cancel visibility intent even while the first native instance is still loading.
  for (const [key, artworkId] of hosts)
    if (artworkId === id && (hostId === undefined || hostId === key)) hosts.delete(key)
  for (const [key, record] of records) {
    if (record.artworkId !== id || (hostId && key !== hostId)) continue
    hosts.delete(key)
    record.view.setVisible(false)
  }
}
function destroyDesignInstance(key: string) {
  const record = records.get(key)
  if (!record) return
  records.delete(key)
  hosts.delete(key)
  designCanvasAccess.unregister(record.access)
  if (!record.owner.isDestroyed()) record.owner.contentView.removeChildView(record.view)
  if (!record.view.webContents.isDestroyed())
    record.view.webContents.close({ waitForBeforeUnload: false })
  record.dispose()
}
export function destroyDesign(id: string) {
  for (const [key, record] of records) if (record.artworkId === id) destroyDesignInstance(key)
}
export async function saveDesign(id: string) {
  if (designCanvasAccess.isReadonly(id)) throw Error('Canvas is read-only; edits are retained')
  await designCanvasAccess.prepareForSend(id)
}
export async function saveDesignForDispatch(id: string) {
  await queryCanvasState?.()
  await designCanvasAccess.prepareForSend(id)
}
/** Resolve one historical file; the existing local file capability serves its bytes. */
export async function readDesignCandidateFile(
  id: string,
  candidateId: string
): Promise<{ path: string }> {
  return await designRequest<{ path: string }>({
    operation: 'candidate-file',
    sessionId: id,
    candidateId
  })
}

/**
 * P2-A2: if this artwork's editor is open on a superseded revision, tear it
 * down and re-create it from the store.
 *
 * The daemon commits in-process after a turn; this process's editor does not
 * see that write. The renderer calls here when session history records a
 * committed outcome. A canvas that was never attached this run is left
 * untouched — the next attach reads the store. An editor whose loaded
 * revision already matches is left untouched, so a historical committed receipt
 * on first mount or a later manual save does not
 * destroy undo. Two callers are serialized per artwork so a second signal
 * cannot tear down the reload of the first.
 *
 * Any exceptional dirty/composing/saving instance blocks reloading all instances;
 * no draft is discarded to make the saved revision visible. A canvas the user does not have on screen
 * stays closed: destroy is enough, and the next attach reads the store.
 */
export async function syncDesignCanvasFromStore(id: string): Promise<void> {
  const previous = syncing.get(id) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(() => syncDesignCanvasFromStoreOnce(id))
  syncing.set(id, next)
  try {
    await next
  } finally {
    if (syncing.get(id) === next) syncing.delete(id)
  }
}

async function syncDesignCanvasFromStoreOnce(id: string): Promise<void> {
  const saved = await designRequest({ operation: 'read', sessionId: id })
  if (
    recordsFor(id).some((record) =>
      openDesignCanvasNeedsReload(record.revisionId, saved.revisionId)
    )
  )
    await reloadDesignCanvas(id)
}

async function reloadDesignCanvas(id: string) {
  const entries = [...records].filter(([, record]) => record.artworkId === id)
  // Check every instance before destroying any: exceptional dirty content is never discarded.
  for (const [, record] of entries) {
    const state = await record.view.webContents.executeJavaScript('window.folio?.state()')
    if (!state || state.dirty || state.saving || state.composing)
      throw Error('Canvas has unsaved edits; preserve or save them before reloading')
  }
  for (const [key, record] of entries) {
    const visible = hosts.has(key)
    const bounds = record.view.getBounds()
    destroyDesignInstance(key)
    if (visible) await attachDesign(record.owner, id, bounds, key, false)
  }
}

export async function leaveDesign(id: string, hostId?: string): Promise<boolean> {
  const entries = [...records].filter(
    ([key, record]) => record.artworkId === id && (hostId === undefined || hostId === key)
  )
  for (const [key, record] of entries) {
    try {
      if (!designCanvasAccess.isReadonly(id)) await saveDesign(id)
      const state = await record.view.webContents.executeJavaScript('window.folio?.state()')
      if (!state || state.dirty || state.saving || state.composing)
        throw Error('Canvas still has unsaved edits')
    } catch (error) {
      // A different instance's failed flush is not permission to discard this one.
      const state = await record.view.webContents.executeJavaScript('window.folio?.state()')
      if (state && !state.dirty && !state.saving && !state.composing) continue
      const answer = await dialog.showMessageBox(record.owner, {
        type: 'warning',
        message: '此画布尚未保存 / This canvas is not saved',
        detail: String(error),
        buttons: [
          '返回编辑 / Keep editing',
          '重试 / Retry',
          '放弃此画布修改 / Discard this canvas edits'
        ],
        defaultId: 0,
        cancelId: 0
      })
      if (answer.response === 1) {
        if (!(await leaveDesign(id, key))) return false
      } else if (answer.response === 2) destroyDesignInstance(key)
      else {
        await unfreezeDesigns()
        return false
      }
    }
  }
  return true
}
export async function copyDesign(
  id: string,
  association: Extract<DesignRequest, { operation: 'create' }>['association'],
  hostId?: string
) {
  const record = selectCanvasInstance(records, id, hostId)?.[1]
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
    for (const [key, record] of records) if (record.owner === owner) destroyDesignInstance(key)
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
      for (const [key, record] of records)
        if (record.owner === owner && !(await leaveDesign(record.artworkId, key))) return
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
  if (!designCanvasAccess.isReadonly(id)) await saveDesign(id)
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

export async function finishDesignCopy(sourceId: string, targetId: string, hostId?: string) {
  const selected = selectCanvasInstance(records, sourceId, hostId)
  if (!selected) return
  const [key, record] = selected
  const current = await record.view.webContents.executeJavaScript('window.folio.snapshot()')
  const saved = await designRequest({ operation: 'read', sessionId: targetId })
  if (!isDeepStrictEqual(current.doc, saved.doc))
    throw Error('Drawing changed during copy; save the newer edits before leaving')
  destroyDesignInstance(key)
}
export async function renameDesign(id: string, name: string) {
  await saveDesign(id)
  const saved = await designRequest({ operation: 'read', sessionId: id })
  const renamed = await designCanvasAccess.write(id, undefined, () =>
    designRequest({
      operation: 'save',
      sessionId: id,
      baseRevisionId: saved.revisionId,
      name,
      content: { doc: saved.doc, assets: saved.assets }
    })
  )
  for (const record of recordsFor(id)) {
    if (record.revisionId !== saved.revisionId) continue
    await record.view.webContents.executeJavaScript(
      'window.folio.rebase(' +
        JSON.stringify(saved.revisionId) +
        ',' +
        JSON.stringify(renamed.revisionId) +
        ')'
    )
    record.revisionId = renamed.revisionId
  }
  await syncDesignCanvasFromStore(id)
  return renamed
}
export function hasOpenDesigns() {
  return records.size > 0
}
export async function prepareDesignQuit(): Promise<boolean> {
  for (const id of new Set([...records.values()].map((entry) => entry.artworkId)))
    if (!(await leaveDesign(id))) return false
  for (const key of [...records.keys()]) destroyDesignInstance(key)
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
