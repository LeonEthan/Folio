import { WebContentsView, type BrowserWindow } from 'electron'
import { dirname } from 'node:path'
import { designRequest, surface } from './design-service'
import type { DesignPreviewPayloadResult } from '../../../../cli/src/design/render-preview'
import { PreviewRequests } from './design-source-preview-core'

const requests = new PreviewRequests()
const consumers = new Map<string, BrowserWindow>()
const observedOwners = new WeakSet<BrowserWindow>()
const views = new Map<
  string,
  {
    owner: BrowserWindow
    artworkId: string
    source: string
    view: WebContentsView
    dispose(): void
  }
>()

export function hideSourcePreview(hostId: string, cancel = true) {
  if (cancel) requests.cancel(hostId)
  views.get(hostId)?.view.setVisible(false)
}
export function closeSourcePreview(hostId: string) {
  hideSourcePreview(hostId)
  consumers.delete(hostId)
  const previous = views.get(hostId)
  if (!previous) return
  views.delete(hostId)
  if (!previous.owner.isDestroyed()) previous.owner.contentView.removeChildView(previous.view)
  if (!previous.view.webContents.isDestroyed())
    previous.view.webContents.close({ waitForBeforeUnload: false })
  previous.dispose()
}

export function attachSourcePreview(hostId: string, bounds: Electron.Rectangle) {
  const current = views.get(hostId)
  if (!current || !requests.visible(hostId)) return
  current.view.setBounds({
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height))
  })
  current.view.setVisible(true)
}

/** Resolve source inside the request generation: even a late resolver cannot reopen a hidden view. */
export async function refreshSourcePreview(
  owner: BrowserWindow,
  artworkId: string,
  hostId: string,
  resolveSource: () => Promise<string>
) {
  if (!observedOwners.has(owner)) {
    observedOwners.add(owner)
    owner.once('closed', () => {
      for (const [key, window] of consumers) if (window === owner) closeSourcePreview(key)
    })
  }
  const retained = views.get(hostId)
  if (retained && (retained.artworkId !== artworkId || retained.owner !== owner))
    closeSourcePreview(hostId)
  consumers.set(hostId, owner)
  const token = requests.begin(hostId, artworkId)
  let source = ''
  try {
    source = await resolveSource()
    if (!requests.current(token)) return { status: 'superseded' as const }
    const built = await designRequest<DesignPreviewPayloadResult>({
      operation: 'source-preview',
      workdir: dirname(source)
    })
    if (!requests.current(token)) return { status: 'superseded' as const }
    if (built.status !== 'ok' || !built.sourceIdentity)
      throw Error(built.status === 'refused' ? built.error : 'Missing snapshot identity')
    const saved = await designRequest({ operation: 'read', sessionId: artworkId })
    const resource = await surface(
      {
        doc: built.doc,
        assets: built.assets,
        association: saved.association,
        revisionId: built.sourceIdentity
      },
      false,
      undefined,
      true
    )
    if (!requests.current(token) || owner.isDestroyed()) {
      resource.dispose()
      return { status: 'superseded' as const }
    }
    const view = new WebContentsView({
      webPreferences: {
        session: resource.isolated,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    })
    const [width, height] = owner.getContentSize()
    view.setBounds({ x: 0, y: 0, width, height })
    owner.contentView.addChildView(view)
    view.setVisible(false)
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    view.webContents.on('will-navigate', (event) => event.preventDefault())
    view.webContents.on('will-redirect', (event) => event.preventDefault())
    try {
      await view.webContents.loadURL(resource.url)
      await view.webContents.executeJavaScript(`new Promise((resolve, reject) => {
        const timer = setTimeout(() => { observer.disconnect(); reject(Error('Preview rendering timed out')); }, 30000);
        let started = false;
        const observer = new MutationObserver(check);
        observer.observe(document, { childList: true, subtree: true });
        async function check() {
          if (started || !window.folio || !window.bento?.doc || !document.querySelector('.bento-slide')) return;
          started = true; observer.disconnect();
          try {
            window.folio.setReadonly(true, '未提交预览 · 只读 / Unsubmitted preview · Read-only');
            document.querySelector('.bento-slide').getBoundingClientRect();
            await Promise.all([...document.fonts].filter(font => font.status === 'loading').map(font => font.load()));
            if ([...document.fonts].some(font => font.status === 'error')) throw Error('Preview font failed to load');
            const images = [...document.querySelectorAll('.bento-slide img')];
            for (const node of document.querySelectorAll('.bento-slide image')) { const image = new Image(); image.src = node.getAttribute('href') || node.getAttribute('xlink:href') || ''; images.push(image); }
            await Promise.all(images.map(image => new Promise((loaded, failed) => {
              const check = () => image.naturalWidth > 0 ? loaded(true) : failed(Error('Preview image failed to load'));
              if (image.complete) check();
              else { image.addEventListener('load', check, { once: true }); image.addEventListener('error', () => failed(Error('Preview image failed to load')), { once: true }); }
            })));
            clearTimeout(timer); resolve(true);
          } catch(error) { clearTimeout(timer); reject(error); }
        }
        check();
      })`)
      if (!requests.current(token) || owner.isDestroyed()) {
        if (!owner.isDestroyed()) owner.contentView.removeChildView(view)
        if (!view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false })
        resource.dispose()
        return { status: 'superseded' as const }
      }
    } catch (error) {
      if (!owner.isDestroyed()) owner.contentView.removeChildView(view)
      if (!view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false })
      resource.dispose()
      throw error
    }
    const previous = views.get(hostId)
    if (previous) {
      owner.contentView.removeChildView(previous.view)
      previous.view.webContents.close({ waitForBeforeUnload: false })
      previous.dispose()
    }
    views.set(hostId, { owner, artworkId, source, view, dispose: resource.dispose })
    return { status: 'ready' as const, source, sourceIdentity: built.sourceIdentity }
  } catch (error) {
    if (!requests.current(token)) return { status: 'superseded' as const }
    return {
      status: 'waiting' as const,
      source: views.get(hostId)?.source ?? source,
      error: String(error),
      retained: views.has(hostId)
    }
  }
}
