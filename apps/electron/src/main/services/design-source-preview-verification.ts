import { WebContentsView, nativeImage, type BrowserWindow } from 'electron'
import { strict as assert } from 'node:assert'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { attachDesign, designCanvasAccess, designRequest, hideDesign } from './design-service'
import {
  refreshSourcePreview,
  attachSourcePreview,
  hideSourcePreview,
  closeSourcePreview
} from './design-source-preview'

/** Synthetic native evidence: production collector, worker, Bento and access gate. */
export async function verifySourcePreview(
  owner: BrowserWindow,
  artworkId: string,
  canonical: WebContentsView,
  directory: string
) {
  const root = join(directory, 'authoring')
  await mkdir(join(root, 'pages'), { recursive: true })
  await mkdir(join(root, 'media'), { recursive: true })
  const source = join(root, 'design.pptd')
  const host = randomUUID()
  const bounds = { x: 0, y: 0, width: 1200, height: 800 }
  const saved = await designRequest({ operation: 'read', sessionId: artworkId })
  await canonical.webContents.executeJavaScript(
    'document.querySelector(\'[data-c2a-kind="shape"]\').click(); window.folio.setReadonly(true)'
  )
  const editedSnapshot = await canonical.webContents.executeJavaScript(
    'window.bento.visual.snapshot()'
  )
  const missing = await refreshSourcePreview(owner, artworkId, host, async () => source)
  assert.equal(missing.status, 'waiting')
  assert.equal(canonical.webContents.isDestroyed(), false)
  const page =
    'background: {type: solid, color: "#FFFFFF"}\nelements:\n  - elementId: photo\n    elementType: image\n    bounds: [0, 0, 100, 100]\n    src: media/pic.png\n    fit: {mode: cover}\n'
  await writeFile(
    source,
    'version: v2\ntitle: Synthetic source preview\nsize: [320, 200]\npages: [pages/main.page]\n'
  )
  await writeFile(join(root, 'pages/main.page'), page)
  const writeImage = async (color: number) =>
    writeFile(
      join(root, 'media/pic.png'),
      nativeImage.createFromBitmap(Buffer.from([color, 0, 0, 255]), { width: 1, height: 1 }).toPNG()
    )
  await writeImage(255)
  const first = await refreshSourcePreview(owner, artworkId, host, async () => source)
  assert.equal(first.status, 'ready', JSON.stringify(first))
  hideDesign(artworkId)
  attachSourcePreview(host, bounds)
  const getPreview = () =>
    owner.contentView.children.find(
      (child) => child instanceof WebContentsView && child !== canonical
    ) as WebContentsView
  const preview = getPreview()
  await writeFile(
    join(directory, 'source-preview.png'),
    (await preview.webContents.capturePage()).toPNG()
  )
  assert.equal((await preview.webContents.executeJavaScript('window.folio.state()')).readonly, true)
  assert.equal(
    await preview.webContents.executeJavaScript(
      "fetch('/ws/' + new URLSearchParams(location.search).get('ws') + '/save', {method:'POST', body:'{}'}).then(r => r.status)"
    ),
    403
  )
  await designCanvasAccess.update([
    { artworkId, turnId: 'synthetic-preview-execution', preparing: false }
  ])
  hideSourcePreview(host)
  await attachDesign(owner, artworkId, bounds, artworkId, false)
  assert.equal(
    (await canonical.webContents.executeJavaScript('window.folio.state()')).readonly,
    true
  )
  const before = await canonical.webContents.executeJavaScript('window.bento.visual.snapshot()')
  await canonical.webContents.executeJavaScript('window.bento.undo()')
  assert.equal(
    await canonical.webContents.executeJavaScript('window.bento.visual.snapshot()'),
    before
  )
  await writeFile(join(root, 'pages/main.page'), 'invalid: [')
  const invalid = await refreshSourcePreview(owner, artworkId, host, async () => source)
  assert.equal(invalid.status, 'waiting')
  assert.equal(getPreview(), preview, 'Invalid source retains the last rendered instance')
  await writeFile(join(root, 'pages/main.page'), page)
  await writeImage(100)
  const replacement = await refreshSourcePreview(owner, artworkId, host, async () => source)
  assert.equal(replacement.status, 'ready')
  if (replacement.status !== 'ready' || first.status !== 'ready')
    throw Error('Preview was not ready')
  assert.notEqual(replacement.sourceIdentity, first.sourceIdentity)
  const image = await getPreview().webContents.executeJavaScript(
    "(async () => { const image = document.querySelector('.bento-slide img'); if (image && (!image.complete || !image.naturalWidth)) throw Error('Preview image not loaded'); return window.folio.snapshot(); })()"
  )
  assert.ok(
    Object.values(image.assets).includes(
      'data:image/png;base64,' + (await readFile(join(root, 'media/pic.png'))).toString('base64')
    )
  )
  let resolveLate!: (value: string) => void
  const late = refreshSourcePreview(
    owner,
    artworkId,
    host,
    () =>
      new Promise((resolve) => {
        resolveLate = resolve
      })
  )
  hideSourcePreview(host)
  resolveLate(source)
  assert.equal((await late).status, 'superseded')
  assert.equal(getPreview().getVisible(), false)
  assert.deepEqual(await designRequest({ operation: 'read', sessionId: artworkId }), saved)
  assert.equal(canonical.webContents.isDestroyed(), false)
  closeSourcePreview(host)
  await designCanvasAccess.update([])
  await attachDesign(owner, artworkId, bounds)
  const undoRedo = await canonical.webContents.executeJavaScript(`(() => {
    window.bento.undo(); const undone = window.bento.visual.snapshot();
    window.bento.redo(); const redone = window.bento.visual.snapshot();
    window.bento.undo(); return {undone, redone};
  })()`)
  assert.deepEqual(JSON.parse(undoRedo.undone), saved.doc)
  assert.equal(undoRedo.redone, editedSnapshot)
  await canonical.webContents.executeJavaScript('window.folio.save()')
  await writeFile(
    join(directory, 'source-preview-result.json'),
    JSON.stringify(
      {
        status: 'passed',
        initialWaiting: true,
        invalidRetainsSurface: true,
        samePathAssetChanges: true,
        lateResultDiscarded: true,
        readonlyDuringExecution: true,
        noPreviewSaveRoute: true,
        canonicalUnchanged: true,
        canonicalInstancePreserved: true,
        canonicalUndoRedoPreserved: true,
        authorCompletionNotInferred: true
      },
      null,
      2
    )
  )
}
