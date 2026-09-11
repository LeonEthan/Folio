// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_PLATFORM_CAPABILITIES } from '@lody/platform';
import { PlatformContext } from '@lody/platform/react';
import { TEST_CLOUD_PLATFORM } from './test-platform';
import { useWorkspaceMembers } from '../src/hooks/use-workspace-members';

const state = vi.hoisted(() => ({ forbidAuth: false }));
vi.mock('../src/providers/convex-provider', () => ({
  useAuthClient: () => {
    if (state.forbidAuth) throw new Error('Local members must not request product-cloud auth');
    return {
      useActiveOrganization: () => ({
        data: {
          members: [
            { userId: 'two', user: { name: 'Zed' } },
            { userId: 'one', user: { name: 'Ada' } },
          ],
        },
      }),
    };
  },
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
});
function Probe() {
  const { members, isMultiMember } = useWorkspaceMembers();
  return <output>{JSON.stringify({ members, isMultiMember })}</output>;
}
describe('workspace ownership consumers', () => {
  it('keeps local ownership independent of cloud organization queries', async () => {
    state.forbidAuth = true;
    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () =>
      root!.render(
        <PlatformContext.Provider
          value={{
            ...TEST_CLOUD_PLATFORM,
            kind: 'local',
            capabilities: LOCAL_PLATFORM_CAPABILITIES,
          }}
        >
          <Probe />
        </PlatformContext.Provider>
      )
    );
    expect(JSON.parse(container.textContent!)).toEqual({ members: [], isMultiMember: false });
  });
  it('preserves the sorted team owner choices when team sharing is supported', async () => {
    state.forbidAuth = false;
    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () =>
      root!.render(
        <PlatformContext.Provider value={TEST_CLOUD_PLATFORM}>
          <Probe />
        </PlatformContext.Provider>
      )
    );
    const result = JSON.parse(container.textContent!);
    expect(result.isMultiMember).toBe(true);
    expect(result.members.map((member: { name: string }) => member.name)).toEqual(['Ada', 'Zed']);
  });
});
