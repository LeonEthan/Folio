import { randomUUID } from 'node:crypto'
import type { DesignCanvasReport, DesignCanvasState } from '@lody/shared/local-machine-rpc'

export type CanvasInstance = {
  artworkId: string
  setReadonly(value: boolean, reason: string): Promise<void>
  flush(permit: string): Promise<void>
}

/** Desktop adapter: execution ownership comes exclusively from the daemon snapshot. */
export class DesignCanvasAccess {
  private known = false
  private active = new Map<string, DesignCanvasState>()
  private readonly instances = new Set<CanvasInstance>()
  private readonly permits = new Map<string, string>()
  private readonly writes = new Map<string, Set<Promise<unknown>>>()
  private readonly reported = new Set<string>()

  isReadonly(id: string): boolean {
    return !this.known || this.active.has(id) || this.permits.has(id)
  }
  isActive(id: string): boolean {
    return this.active.has(id)
  }

  async register(instance: CanvasInstance): Promise<void> {
    this.instances.add(instance)
    await instance.setReadonly(
      true,
      '执行状态待确认，画布只读 / Checking execution state — read-only'
    )
  }
  unregister(instance: CanvasInstance): void {
    this.instances.delete(instance)
  }

  async disconnected(): Promise<void> {
    this.known = false
    await this.refresh()
  }

  async update(
    states: readonly DesignCanvasState[],
    beforeRelease?: (id: string) => Promise<void>
  ): Promise<DesignCanvasReport[]> {
    const next = new Map(states.map((state) => [state.artworkId, state]))
    for (const [id, previous] of this.active) {
      if (next.has(id)) continue
      try {
        await beforeRelease?.(id)
      } catch {
        next.set(id, { ...previous, preparing: false })
      }
    }
    this.active = next
    this.known = true
    await this.refresh()
    const reports: DesignCanvasReport[] = []
    for (const state of states) {
      if (!state.preparing || this.reported.has(state.turnId)) continue
      try {
        await this.flush(state.artworkId)
        reports.push({ artworkId: state.artworkId, turnId: state.turnId, ok: true })
      } catch (error) {
        reports.push({
          artworkId: state.artworkId,
          turnId: state.turnId,
          ok: false,
          error: String(error).slice(0, 500)
        })
      }
      this.reported.add(state.turnId)
    }
    const live = new Set(states.map((state) => state.turnId))
    for (const id of this.reported) if (!live.has(id)) this.reported.delete(id)
    return reports
  }

  /** Every actual human persistence entry registers before its first await. */
  write<T>(id: string, permit: unknown, action: () => Promise<T>): Promise<T> {
    if (this.isReadonly(id) && (typeof permit !== 'string' || this.permits.get(id) !== permit))
      return Promise.reject(new Error('Canvas is read-only; edits are retained'))
    const pending = Promise.resolve().then(action)
    const set = this.writes.get(id) ?? new Set<Promise<unknown>>()
    set.add(pending)
    this.writes.set(id, set)
    void pending
      .finally(() => {
        set.delete(pending)
        if (!set.size) this.writes.delete(id)
      })
      .catch(() => {})
    return pending
  }

  /** Frontend preflight preserves composer errors; real dispatch repeats this after claiming. */
  async prepareForSend(id: string): Promise<void> {
    if (this.known && this.isActive(id)) return // Existing queue/steer owns routing.
    if (this.isReadonly(id))
      throw Error('Canvas execution state is unknown or saving; retry when connected')
    await this.flush(id)
  }

  private reason(): string {
    return this.known
      ? '处理中，画布只读 / Processing — read-only'
      : '执行状态待确认，画布只读 / Checking execution state — read-only'
  }

  private async refresh(): Promise<void> {
    await Promise.all(
      [...this.instances].map((instance) =>
        instance.setReadonly(this.isReadonly(instance.artworkId), this.reason())
      )
    )
  }

  private async flush(id: string): Promise<void> {
    if (this.permits.has(id)) throw Error('Canvas save is already in progress')
    const permit = randomUUID()
    this.permits.set(id, permit)
    try {
      await this.refresh()
      // Includes accepted imports/renames and requests whose responses have not arrived yet.
      await Promise.all([...(this.writes.get(id) ?? [])])
      for (const instance of this.instances)
        if (instance.artworkId === id) await instance.flush(permit)
    } finally {
      this.permits.delete(id)
      await this.refresh()
    }
  }
}
