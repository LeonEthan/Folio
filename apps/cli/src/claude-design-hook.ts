import { Effect } from 'effect';
import { z } from 'zod';
import { makeLocalControlClientAuto, getLocalControlSocketPath } from '@lody/shared/node/local-ipc';
import { ClaudeDesignHookSchema, DesignToolHookResultSchema } from '@lody/shared/local-machine-rpc';

// Each native command hook is short-lived; the daemon owns batch/attempt state.
// Deliberately discard prompts, transcripts and unrelated tool arguments.
const NativeHook = z.object({
  hook_event_name: ClaudeDesignHookSchema.shape.event,
  agent_id: z.string().optional(),
  tool_use_id: z.string().optional(),
  tool_name: z.string().optional(),
  tool_input: z
    .object({
      file_path: z.string().optional(),
      offset: z.number().optional(),
      limit: z.number().optional(),
    })
    .optional(),
  tool_calls: z
    .array(z.object({ tool_use_id: z.string(), tool_response: z.unknown().optional() }))
    .optional(),
});
try {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += Buffer.byteLength(chunk);
    if (size > 2 * 1024 * 1024) throw Error('Claude hook payload too large; read smaller ranges');
    chunks.push(Buffer.from(chunk));
  }
  const native = NativeHook.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  const event = ClaudeDesignHookSchema.parse({
    phase: 'claude',
    event: native.hook_event_name,
    runtimeVersion: process.env.FOLIO_DESIGN_CLAUDE_VERSION ?? 'unknown',
    agentId: native.agent_id,
    callId: native.tool_use_id,
    tool: native.tool_name,
    path: native.tool_input?.file_path,
    offset: native.tool_input?.offset,
    limit: native.tool_input?.limit,
    calls: native.tool_calls?.map((call) => ({
      id: call.tool_use_id,
      response:
        typeof call.tool_response === 'string' && call.tool_response.length <= 100_000
          ? call.tool_response
          : undefined,
    })),
  });
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
  if (!answer.ok || !answer.supported) throw Error(answer.error ?? 'Design hooks unavailable');
  process.stdout.write('{}');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
