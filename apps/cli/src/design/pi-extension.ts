import { randomUUID } from 'node:crypto';
import { Effect } from 'effect';
import { makeLocalControlClientAuto, getLocalControlSocketPath } from '@lody/shared/node/local-ipc';
import { DesignToolHookResultSchema } from '@lody/shared/local-machine-rpc';
import type { DesignToolEvent } from './sync-service';

/** Structural adapter for Pi 0.85.1's documented extension events. No Pi SDK copy. */
interface PiEvent {
  message?: { role?: string };
  toolName?: string;
  toolCallId?: string;
  input?: { path?: string; offset?: number; limit?: number };
  content?: { type: string; text?: string }[];
  isError?: boolean;
  details?: { truncation?: { truncated?: boolean; firstLineExceedsLimit?: boolean } };
}
interface PiExtensionApi {
  on(event: string, handler: (event: PiEvent) => Promise<unknown>): void;
}

export default function folioDesignExtension(pi: PiExtensionApi): void {
  let generation = '';
  let generationError: string | undefined;
  let supported = true;
  const request = async (event: DesignToolEvent): Promise<boolean> => {
    const result = await Effect.runPromise(
      makeLocalControlClientAuto({
        socketPath: process.env.FOLIO_DESIGN_CONTROL_SOCKET ?? getLocalControlSocketPath(),
      }).machineRpc(
        {
          method: 'design/tool-hook',
          machineId: process.env.FOLIO_DESIGN_MACHINE_ID ?? '',
          workspaceId: process.env.FOLIO_DESIGN_WORKSPACE_ID ?? '',
          ownerSessionId: process.env.LODY_SESSION_ID,
          params: { version: 1, event },
        },
        { timeoutMs: 30_000 }
      )
    );
    if (!result.ok) throw Error(result.error);
    const answer = DesignToolHookResultSchema.parse(result.result);
    supported = answer.supported;
    if (!answer.ok) throw Error(answer.error ?? 'Design hook refused');
    return answer.supported;
  };
  pi.on('message_start', async (event) => {
    if (event.message?.role !== 'assistant') return undefined;
    generation = randomUUID();
    generationError = undefined;
    try {
      supported = await request({
        phase: 'generation',
        generation,
        runtimeVersion: process.env.FOLIO_DESIGN_PI_VERSION ?? 'unknown',
      });
    } catch (error) {
      generationError = error instanceof Error ? error.message : String(error);
    }
    return undefined;
  });
  pi.on('tool_call', async (event) => {
    if (
      !['read', 'write', 'edit'].includes(event.toolName ?? '') ||
      !event.input?.path ||
      !event.toolCallId
    )
      return undefined;
    // A failed handshake cannot pretend ordinary file writes are covered.
    if (generationError && supported) return { block: true, reason: generationError };
    if (!supported) return undefined;
    try {
      await request({
        phase: 'call',
        generation,
        callId: event.toolCallId,
        tool: event.toolName as 'read' | 'write' | 'edit',
        path: event.input.path,
        offset: event.input.offset,
        limit: event.input.limit,
      });
    } catch (error) {
      return { block: true, reason: error instanceof Error ? error.message : String(error) };
    }
    return undefined;
  });
  pi.on('tool_result', async (event) => {
    if (
      !supported ||
      !['read', 'write', 'edit'].includes(event.toolName ?? '') ||
      !event.toolCallId
    )
      return undefined;
    let text =
      event.content?.length === 1 && event.content[0]?.type === 'text'
        ? event.content[0].text
        : undefined;
    if (
      text !== undefined &&
      (event.details?.truncation?.truncated || event.input?.limit !== undefined)
    ) {
      // Remove only native continuation framing. Shared service independently
      // checks every delivered line against the captured projection and offset.
      text = text.replace(
        /\n\n\[(?:Showing lines \d+-\d+ of \d+(?: \(50\.0KB limit\))?|\d+ more lines in file)\. Use offset=\d+ to continue\.\]$/,
        ''
      );
    }
    try {
      await request({
        phase: 'result',
        callId: event.toolCallId,
        isError: event.isError === true,
        text,
        partial: event.details?.truncation?.firstLineExceedsLimit === true,
      });
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
      };
    }
    return undefined;
  });
}
