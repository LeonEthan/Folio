import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vitest';
import { registerPiMcpTools } from './pi-mcp-extension';

type Pi = Parameters<typeof registerPiMcpTools>[0];
type Tool = Parameters<Pi['registerTool']>[0];

async function fixture() {
  const client = new Client({ name: 'test', version: '1' });
  const server = new Server({ name: 'lody', version: '1' }, { capabilities: { tools: {} } });
  const tools = new Map<string, Tool>();
  const handlers = new Map<string, () => Promise<void>>();
  const state = {
    names: [
      'folio_generate_image',
      'folio_edit_image',
      'folio_render_preview',
      'lody_session_create',
    ],
    active: ['read', 'write'],
    error: false,
  };
  const calls: unknown[] = [];
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: state.names.map((name) => ({
      name,
      description: `${name} actual description`,
      inputSchema: {
        type: 'object' as const,
        properties: { prompt: { type: 'string' } },
        required: ['prompt'],
      },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    calls.push(request.params);
    return {
      content: [
        { type: 'text', text: state.error ? 'actual upstream failure' : 'actual asset result' },
      ],
      isError: state.error,
    };
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  let bound = false;
  const pi: Pi = {
    registerTool: (tool) => {
      tools.set(tool.name, tool);
    },
    getActiveTools: () => {
      if (!bound) throw Error('Pi runtime not initialized');
      return state.active;
    },
    setActiveTools: (names) => {
      state.active = names;
    },
    on: (event, handler) => {
      handlers.set(event, handler);
    },
  };
  await registerPiMcpTools(pi, client);
  bound = true;
  await handlers.get('session_start')?.();
  return {
    state,
    tools,
    calls,
    handlers,
    close: async () => {
      await handlers.get('session_shutdown')?.();
      await server.close();
    },
  };
}

describe('Pi existing Folio MCP tools', () => {
  it('exposes only the live Folio catalog and forwards actual arguments/results', async () => {
    const f = await fixture();
    try {
      expect([...f.tools.keys()]).toEqual([
        'folio_generate_image',
        'folio_edit_image',
        'folio_render_preview',
      ]);
      const tool = f.tools.get('folio_edit_image');
      expect(tool?.parameters).toMatchObject({ required: ['prompt'] });
      expect(
        await tool?.execute('native-id', { prompt: 'synthetic', images: ['/owned/input.png'] })
      ).toEqual({ content: [{ type: 'text', text: 'actual asset result' }], details: {} });
      expect(f.calls).toEqual([
        {
          name: 'folio_edit_image',
          arguments: { prompt: 'synthetic', images: ['/owned/input.png'] },
        },
      ]);
      f.state.error = true;
      await expect(tool?.execute('next', { prompt: 'error' })).rejects.toThrow(
        'actual upstream failure'
      );
    } finally {
      await f.close();
    }
  });
  it('removes unavailable tools before the next generation and retains explicit inactive choices', async () => {
    const f = await fixture();
    try {
      f.state.active = f.state.active.filter((name) => name !== 'folio_edit_image');
      f.state.names = ['folio_edit_image'];
      await f.handlers.get('before_agent_start')?.();
      expect(f.state.active).toEqual(['read', 'write']);
      await expect(
        f.tools.get('folio_generate_image')?.execute('old', { prompt: 'no' })
      ).rejects.toThrow('unavailable');
      expect(f.calls).toEqual([]);
      await f.handlers.get('session_shutdown')?.();
      await expect(
        f.tools.get('folio_edit_image')?.execute('closed', { prompt: 'no' })
      ).rejects.toThrow('unavailable');
    } finally {
      await f.close();
    }
  });
});
