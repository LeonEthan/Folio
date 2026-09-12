import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it, vi } from 'vitest';
import { registerPiMcpTools } from './pi-mcp-extension';

type Pi = Parameters<typeof registerPiMcpTools>[0];
type Tool = Parameters<Pi['registerTool']>[0];

async function fixture(hold?: () => Promise<void>) {
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
    await hold?.();
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
  it.each(['folio_generate_image', 'folio_edit_image'])(
    '%s waits beyond the SDK default for the existing image service',
    async (name) => {
      vi.useFakeTimers();
      let release = () => {};
      let started = () => {};
      const waiting = new Promise<void>((resolve) => {
        release = resolve;
      });
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      const f = await fixture(async () => {
        started();
        await waiting;
      });
      try {
        const result = f.tools.get(name)?.execute('long-image', { prompt: 'synthetic' });
        const checked = expect(result).resolves.toMatchObject({
          content: [{ text: 'actual asset result' }],
        });
        await entered;
        await vi.advanceTimersByTimeAsync(180_000);
        release();
        await checked;
      } finally {
        release();
        await f.close();
        vi.useRealTimers();
      }
    }
  );

  it('retains native cancellation while an image request is pending', async () => {
    let started = () => {};
    let release = () => {};
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const f = await fixture(async () => {
      started();
      await held;
    });
    try {
      const controller = new AbortController();
      const result = f.tools
        .get('folio_edit_image')
        ?.execute('cancel-image', { prompt: 'synthetic' }, controller.signal);
      const checked = expect(result).rejects.toThrow('user cancelled');
      await entered;
      controller.abort(Error('user cancelled'));
      await checked;
    } finally {
      release();
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
