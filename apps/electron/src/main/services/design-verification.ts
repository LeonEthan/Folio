import { app, BrowserWindow, WebContentsView, nativeImage } from 'electron'
import { strict as assert } from 'node:assert'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  attachDesign,
  hideDesign,
  destroyDesign,
  designRequest,
  saveDesign,
  copyDesign,
  finishDesignCopy,
  renderSavedDesign,
  prepareDesignQuit
} from './design-service'

/** Opt-in synthetic acceptance journey using the production editor and persistence path. */
export async function verifyDesign(directory: string) {
  await mkdir(directory, { recursive: true })
  const owner = new BrowserWindow({ width: 1200, height: 800, show: false })
  const association = {
    sessionId: randomUUID(),
    name: 'P1 synthetic design',
    userId: 'local:verification',
    machineId: 'verification',
    createdAt: new Date().toISOString()
  }
  const id = association.sessionId
  const created = await designRequest({ operation: 'create', association, width: 800, height: 600 })
  await attachDesign(owner, id, { x: 0, y: 0, width: 1200, height: 800 })
  const view = owner.contentView.children.find(
    (child) => child instanceof WebContentsView
  ) as WebContentsView
  await view.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const timer = setTimeout(() => { observer.disconnect(); reject(Error('Editor not ready')); }, 30000);
    const observer = new MutationObserver(check); observer.observe(document, { childList:true, subtree:true });
    function check() { if (window.folio && document.querySelector('[data-c2a-kind="text"]')) { clearTimeout(timer); observer.disconnect(); resolve(true); } } check();
  })`)
  await view.webContents.executeJavaScript(
    `document.querySelector('[data-c2a-kind="text"]').click(); document.querySelector('[data-c2a-kind="shape"]').click();`
  )
  await saveDesign(id)
  const edited = await designRequest({ operation: 'read', sessionId: id })
  assert.equal(edited.doc.elements.length, 2)
  assert.notEqual(edited.revisionId, created.revisionId)
  await view.webContents.executeJavaScript('window.bento.undo()')
  await saveDesign(id)
  assert.equal((await designRequest({ operation: 'read', sessionId: id })).doc.elements.length, 1)
  hideDesign(id)
  await attachDesign(owner, id, { x: 0, y: 0, width: 1200, height: 800 })
  await view.webContents.executeJavaScript('window.bento.redo()')
  await saveDesign(id)
  assert.equal((await designRequest({ operation: 'read', sessionId: id })).doc.elements.length, 2)
  const beforeConflict = await designRequest({ operation: 'read', sessionId: id })
  await designRequest({
    operation: 'save',
    sessionId: id,
    baseRevisionId: beforeConflict.revisionId,
    content: {
      doc: { ...beforeConflict.doc, background: { type: 'solid', color: '#00000000' } },
      assets: beforeConflict.assets
    }
  })
  await view.webContents.executeJavaScript('window.bento.undo()')
  await assert.rejects(saveDesign(id), /DESIGN_CONFLICT/)
  const copy = await copyDesign(id, {
    ...association,
    sessionId: randomUUID(),
    name: 'Independent copy'
  })
  assert.equal(copy.doc.elements.length, 1)
  await finishDesignCopy(id, copy.association.sessionId)
  const original = await designRequest({ operation: 'read', sessionId: id })
  assert.equal(original.doc.elements.length, 2)
  assert.deepEqual(original.doc.background, { type: 'solid', color: '#00000000' })
  await attachDesign(owner, id, { x: 0, y: 0, width: 1200, height: 800 })
  const reopenedView = owner.contentView.children.find(
    (child) => child instanceof WebContentsView
  ) as WebContentsView
  await saveDesign(id)
  await reopenedView.webContents.executeJavaScript('window.bento.undo()')
  assert.deepEqual(
    JSON.parse(await reopenedView.webContents.executeJavaScript('window.bento.visual.snapshot()')),
    original.doc
  )
  hideDesign(id, randomUUID())
  assert.equal(reopenedView.getVisible(), true, 'A stale host cannot hide the active editor')
  for (const format of ['png', 'jpeg'] as const) {
    const bytes = await renderSavedDesign(original, format)
    const image = nativeImage.createFromBuffer(bytes)
    assert.deepEqual(image.getSize(), { width: 800, height: 600 })
    const pixel = image.toBitmap().subarray(0, 4)
    if (format === 'png') assert.equal(pixel[3], 0)
    else assert.ok(pixel[0] > 250 && pixel[1] > 250 && pixel[2] > 250)
    await writeFile(join(directory, 'design.' + format), bytes)
  }
  await designRequest({ operation: 'acknowledge', sessionId: id })
  await designRequest({ operation: 'acknowledge', sessionId: copy.association.sessionId })
  destroyDesign(id)
  await prepareDesignQuit()
  owner.destroy()
  await writeFile(
    join(directory, 'result.json'),
    JSON.stringify(
      {
        status: 'passed',
        packaged: app.isPackaged,
        electron: process.versions.electron,
        create: true,
        edit: true,
        undoRedoAcrossHide: true,
        reopenWithoutUndo: true,
        staleHostIgnored: true,
        conflictPreserved: true,
        independentCopy: true,
        pngTransparency: true,
        jpegWhite: true
      },
      null,
      2
    ) + '\n'
  )
}
