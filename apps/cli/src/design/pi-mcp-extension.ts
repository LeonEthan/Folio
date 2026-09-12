import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';

const configSchema = z.union([
  z.object({
    type: z.literal('http'),
    url: z.string().url(),
    headers: z.array(z.object({ name: z.string(), value: z.string() })),
  }),
  z.object({
    type: z.literal('stdio'),
    command: z.string(),
    args: z.array(z.string()),
    env: z.record(z.string(), z.string()),
  }),
]);
// Image HTTP work has a 180s production deadline; allow 30s for MCP delivery.
const IMAGE_TOOL_TIMEOUT_MS = 210_000;
const callOptions = (name: string, signal?: AbortSignal) => ({
  signal,
  ...(['folio_generate_image', 'folio_edit_image'].includes(name)
    ? { timeout: IMAGE_TOOL_TIMEOUT_MS }
    : {}),
});
const names = new Set(['folio_generate_image', 'folio_edit_image', 'folio_render_preview']);

interface PiMcpApi {
  registerTool(tool: {
    name: string;
    label: string;
    description: string;
    parameters: Record<string, unknown>;
    execute(
      id: string,
      args: Record<string, unknown>,
      signal?: AbortSignal
    ): Promise<{
      content: (
        | { type: 'text'; text: string }
        | { type: 'image'; data: string; mimeType: string }
      )[];
      details: Record<string, never>;
    }>;
  }): void;
  getActiveTools(): string[];
  setActiveTools(names: string[]): void;
  on(
    event: 'session_start' | 'before_agent_start' | 'session_shutdown',
    handler: () => Promise<void>
  ): void;
}

/** Only the existing Folio tools: no external MCP catalog, image provider or server. */
export async function registerPiMcpTools(
  pi: PiMcpApi,
  client: Client,
  invoke: (
    args: Parameters<Client['callTool']>[0],
    signal?: AbortSignal
  ) => ReturnType<Client['callTool']> = (args, signal) =>
    client.callTool(args, undefined, callOptions(args.name, signal))
): Promise<void> {
  let available = new Set<string>();
  let closed = false;
  const refresh = async () => {
    const activeBefore = pi.getActiveTools();
    const previouslyAvailable = available;
    available = new Set();
    pi.setActiveTools(activeBefore.filter((name) => !names.has(name)));
    const listed = await client.listTools();
    const selected = listed.tools.filter((tool) => names.has(tool.name));
    available = new Set(selected.map((tool) => tool.name));
    for (const tool of selected) {
      pi.registerTool({
        name: tool.name,
        label: tool.title ?? tool.name,
        description: tool.description ?? tool.name,
        parameters: tool.inputSchema,
        async execute(_id, args, signal) {
          if (closed || !available.has(tool.name)) throw Error('Folio MCP tool is unavailable');
          const result = await invoke({ name: tool.name, arguments: args }, signal);
          if (!('content' in result) || !Array.isArray(result.content))
            throw Error('Invalid Folio MCP result');
          const content = z
            .array(
              z.union([
                z.object({ type: z.literal('text'), text: z.string() }),
                z.object({ type: z.literal('image'), data: z.string(), mimeType: z.string() }),
              ])
            )
            .parse(result.content);
          if (result.isError)
            throw Error(
              content
                .filter((c) => c.type === 'text')
                .map((c) => c.text)
                .join('\n') || 'Folio MCP tool failed'
            );
          return { content, details: {} };
        },
      });
    }
    pi.setActiveTools([
      ...activeBefore.filter((name) => !names.has(name)),
      ...[...available].filter(
        (name) => activeBefore.includes(name) || !previouslyAvailable.has(name)
      ),
    ]);
  };
  pi.on('session_shutdown', async () => {
    if (closed) return;
    closed = true;
    available.clear();
    await client.close();
  });
  pi.on('before_agent_start', refresh);
  pi.on('session_start', refresh);
}

export default async function folioPiMcpExtension(pi: PiMcpApi): Promise<void> {
  const raw = process.env.FOLIO_PI_MCP_CONFIG;
  if (!raw) return;
  const client = new Client({ name: 'folio-pi-tools', version: '1.0.0' });
  try {
    const config = configSchema.parse(JSON.parse(raw));
    if (config.type === 'http') {
      const url = new URL(config.url);
      if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1')
        throw Error('Invalid local MCP endpoint');
      const transport = () =>
        new StreamableHTTPClientTransport(url, {
          requestInit: {
            headers: Object.fromEntries(config.headers.map(({ name, value }) => [name, value])),
          },
        });
      const activeCalls = new Set<Client>();
      pi.on('session_shutdown', async () => {
        await Promise.all([...activeCalls].map((call) => call.close()));
      });
      await client.connect(transport());
      await registerPiMcpTools(pi, client, async (args, signal) => {
        signal?.throwIfAborted();
        const callClient = new Client({ name: 'folio-pi-tool-call', version: '1.0.0' });
        activeCalls.add(callClient);
        let closing: Promise<void> | undefined;
        const abort = () => {
          closing ??= callClient.close();
          void closing.catch(() => undefined);
        };
        signal?.addEventListener('abort', abort, { once: true });
        try {
          await callClient.connect(transport());
          signal?.throwIfAborted();
          return await callClient.callTool(args, undefined, callOptions(args.name, signal));
        } finally {
          signal?.removeEventListener('abort', abort);
          try {
            await (closing ?? callClient.close());
          } finally {
            activeCalls.delete(callClient);
          }
        }
      });
    } else {
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: config.env,
        stderr: 'pipe',
      });
      // Consume diagnostics without exposing inherited credentials or blocking the child.
      transport.stderr?.on('data', () => undefined);
      await client.connect(transport);
      await registerPiMcpTools(pi, client);
    }
  } catch {
    await client.close();
    // Never include headers, endpoints, or provider credentials in startup errors.
    throw Error('Folio MCP tools could not initialize');
  }
}
