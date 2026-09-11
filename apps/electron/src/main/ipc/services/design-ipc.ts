import { getIpcContext, IpcMethod, IpcService } from 'electron-ipc-decorator'
import {
  DesignSessionIdSchema as id,
  DesignCandidateIdSchema as candidateId,
  DesignAssociationSchema as association,
  DesignCreationSchema as creation,
  DesignBoundsSchema,
  DesignExportFormatSchema,
  type DesignCreationInput,
  type DesignAssociationInput
} from '@lody/shared/electron-ipc'
import { getIpcServiceDeps } from '../ipc-service-deps'
import {
  attachDesign,
  hideDesign,
  destroyDesign,
  designRequest,
  leaveDesign,
  copyDesign,
  exportDesign,
  finishDesignCopy,
  readDesignCandidateFile,
  renameDesign,
  saveDesignForDispatch,
  syncDesignCanvasFromStore
} from '../../services/design-service'

function owner() {
  const { event } = getIpcContext()
  const window = getIpcServiceDeps().getMainWindow()
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== event.sender.mainFrame
  )
    throw Error('Untrusted design IPC')
  return window
}
export class DesignIpc extends IpcService {
  static override readonly groupName = 'design'
  @IpcMethod() async create(raw: DesignCreationInput) {
    owner()
    return designRequest({ operation: 'create', ...creation.parse(raw) })
  }
  @IpcMethod() async pending() {
    owner()
    return designRequest<import('../../../../../cli/src/design/store').DesignPayload[]>({
      operation: 'pending'
    })
  }
  @IpcMethod() async acknowledge(sessionId: string) {
    owner()
    await designRequest({ operation: 'acknowledge', sessionId: id.parse(sessionId) })
  }
  @IpcMethod() async finishCopy(sourceId: string, targetId: string, hostId?: string) {
    owner()
    await finishDesignCopy(
      id.parse(sourceId),
      id.parse(targetId),
      hostId === undefined ? undefined : id.parse(hostId)
    )
  }
  @IpcMethod() async rename(sessionId: string, name: string) {
    owner()
    return renameDesign(id.parse(sessionId), association.shape.name.parse(name))
  }
  @IpcMethod() async read(sessionId: string) {
    owner()
    return designRequest({ operation: 'read', sessionId: id.parse(sessionId) })
  }
  @IpcMethod() async save(sessionId: string) {
    owner()
    await saveDesignForDispatch(id.parse(sessionId))
  }
  /**
   * P2-A2: reload this artwork's open editor from the store when a turn has
   * committed a new revision. No-op when the canvas is not open or already
   * matches the store; the renderer calls this from the committed outcome, not
   * on a timer.
   */
  @IpcMethod() async syncFromStore(sessionId: string) {
    owner()
    await syncDesignCanvasFromStore(id.parse(sessionId))
  }
  /** Existing historical content, addressed by artwork and its recorded digest. */
  @IpcMethod() async candidateFile(sessionId: string, rawCandidateId: string) {
    owner()
    return readDesignCandidateFile(id.parse(sessionId), candidateId.parse(rawCandidateId))
  }
  @IpcMethod() async attach(
    sessionId: string,
    bounds: { x: number; y: number; width: number; height: number },
    hostId: string
  ) {
    const window = owner()
    return attachDesign(
      window,
      id.parse(sessionId),
      DesignBoundsSchema.parse(bounds),
      id.parse(hostId)
    )
  }
  @IpcMethod() async hide(sessionId: string, hostId: string) {
    owner()
    hideDesign(id.parse(sessionId), id.parse(hostId))
  }
  @IpcMethod() async leave(sessionId: string, hostId?: string) {
    owner()
    return leaveDesign(id.parse(sessionId), hostId === undefined ? undefined : id.parse(hostId))
  }
  @IpcMethod() async close(sessionId: string) {
    owner()
    const key = id.parse(sessionId)
    if (!(await leaveDesign(key))) return false
    destroyDesign(key)
    return true
  }
  @IpcMethod() async copy(sessionId: string, raw: DesignAssociationInput, hostId?: string) {
    owner()
    return copyDesign(
      id.parse(sessionId),
      association.parse(raw),
      hostId === undefined ? undefined : id.parse(hostId)
    )
  }
  @IpcMethod() async export(sessionId: string, format: 'png' | 'jpeg', title: string) {
    owner()
    return exportDesign(
      id.parse(sessionId),
      DesignExportFormatSchema.parse(format),
      association.shape.name.parse(title)
    )
  }
}
