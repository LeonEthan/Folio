import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { ClaudeDesignHookSchema } from '@lody/shared/local-machine-rpc';
import type { DesignSyncService } from './sync-service';

export type ClaudeDesignHook = z.infer<typeof ClaudeDesignHookSchema>;

/** Native batch boundaries, never tool arrival, advance shared read eligibility. */
export class ClaudeDesignHooks {
  private generation: string | undefined;
  private readonly calls = new Map<
    string,
    { generation: string; tool: string; success?: boolean }
  >();
  private pending = Promise.resolve();

  constructor(private readonly service: DesignSyncService) {}

  handle(event: ClaudeDesignHook): Promise<void> {
    const operation = this.pending.then(() => this.apply(event));
    this.pending = operation.catch(() => {});
    return operation;
  }

  resubmit(): Promise<void> {
    const operation = this.pending.then(async () => {
      const calls = [...this.calls].filter(
        ([, call]) => call.tool === 'mcp__lody__folio_resubmit_draft'
      );
      const call = calls.length === 1 ? calls[0] : undefined;
      if (!call || call[1].generation !== this.generation)
        throw Error('DESIGN_RESUBMIT_UNAVAILABLE: missing unambiguous native call');
      this.calls.delete(call[0]);
      await this.service.handle({
        phase: 'resubmit',
        generation: call[1].generation,
        callId: call[0],
      });
    });
    this.pending = operation.catch(() => {});
    return operation;
  }

  private async advance(runtimeVersion: string) {
    this.generation = undefined;
    const generation = randomUUID();
    await this.service.handle({ phase: 'generation', generation, runtimeVersion });
    this.generation = generation;
  }

  private async apply(event: ClaudeDesignHook) {
    if (event.agentId)
      throw Error(
        'Design hooks require the main Claude session; subagent reads cannot authorize its writes'
      );
    if (event.event === 'UserPromptSubmit') {
      this.calls.clear();
      await this.advance(event.runtimeVersion);
      return;
    }
    if (event.event === 'PostToolBatch') {
      for (const call of event.calls ?? []) {
        const pending = this.calls.get(call.id);
        this.calls.delete(call.id);
        if (!pending || pending.generation !== this.generation) continue;
        // Batch responses are the final model-visible text, after other hooks.
        // Accept only native numbered Read output; common service checks bytes/ranges.
        const text =
          pending.tool === 'Read' && typeof call.response === 'string'
            ? call.response
                .split('\n')
                .map((line) => (/^\d+\t/.test(line) ? line.replace(/^\d+\t/, '') : '\u0000'))
                .join('\n')
            : undefined;
        await this.service.handle({
          phase: 'result',
          callId: call.id,
          isError: !pending.success || call.response === undefined,
          text,
        });
      }
      this.calls.clear();
      await this.advance(event.runtimeVersion);
      return;
    }
    if (!event.callId) throw Error('Missing Claude tool identity');
    if (event.event === 'PostToolUseFailure') {
      this.calls.delete(event.callId);
      await this.service.handle({ phase: 'result', callId: event.callId, isError: true });
      return;
    }
    if (event.event === 'PostToolUse') {
      const call = this.calls.get(event.callId);
      if (call) call.success = true;
      return;
    }
    if (event.event !== 'PreToolUse') return;
    if (this.calls.size >= 10000) throw Error('Design call limit reached');
    if (event.tool === 'mcp__lody__folio_resubmit_draft') {
      if (!this.generation) throw Error('Claude generation missing');
      this.calls.set(event.callId, { generation: this.generation, tool: event.tool });
      return;
    }
    const tool =
      event.tool === 'Read'
        ? 'read'
        : event.tool === 'Write'
          ? 'write'
          : event.tool === 'Edit'
            ? 'edit'
            : undefined;
    if (!tool || !event.path) return;
    if (!this.generation)
      throw Error('DESIGN_HOOK_UNAVAILABLE: Claude batch initialization failed');
    await this.service.handle({
      phase: 'call',
      generation: this.generation,
      callId: event.callId,
      tool,
      path: event.path,
      offset: event.offset,
      limit: event.limit,
    });
    this.calls.set(event.callId, { generation: this.generation, tool: event.tool ?? '' });
  }
}
