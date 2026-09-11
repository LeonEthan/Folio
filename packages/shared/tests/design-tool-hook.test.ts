import { describe, expect, it } from 'vitest';
import { DesignToolHookEventSchema } from '../src/local-machine-rpc';

describe('native design Read range contract', () => {
  it('preserves native range parameters for path-scoped validation', () => {
    const continuation = {
      phase: 'call',
      generation: 'assistant-2',
      callId: 'read-2',
      tool: 'read',
      path: 'design-current/pages/design.page',
      offset: 2001,
      limit: 1000,
    };
    expect(DesignToolHookEventSchema.parse(continuation)).toEqual(continuation);
    expect(DesignToolHookEventSchema.safeParse({ ...continuation, offset: 0 }).success).toBe(true);
    expect(DesignToolHookEventSchema.safeParse({ ...continuation, limit: 1.5 }).success).toBe(
      true
    );
  });
});
