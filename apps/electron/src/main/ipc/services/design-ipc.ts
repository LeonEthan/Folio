import { getIpcContext, IpcMethod, IpcService } from 'electron-ipc-decorator'
import {
  DesignSessionIdSchema as id,
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
  renameDesign
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
  @IpcMethod() async finishCopy(sourceId: string, targetId: string) {
    owner()
    await finishDesignCopy(id.parse(sourceId), id.parse(targetId))
  }
  @IpcMethod() async rename(sessionId: string, name: string) {
    owner()
    return renameDesign(id.parse(sessionId), association.shape.name.parse(name))
  }
  @IpcMethod() async read(sessionId: string) {
    owner()
    return designRequest({ operation: 'read', sessionId: id.parse(sessionId) })
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
  @IpcMethod() async leave(sessionId: string) {
    owner()
    return leaveDesign(id.parse(sessionId))
  }
  @IpcMethod() async close(sessionId: string) {
    owner()
    const key = id.parse(sessionId)
    if (!(await leaveDesign(key))) return false
    destroyDesign(key)
    return true
  }
  @IpcMethod() async copy(sessionId: string, raw: DesignAssociationInput) {
    owner()
    return copyDesign(id.parse(sessionId), association.parse(raw))
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
