// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const state = vi.hoisted(() => ({
  visible: false,
  previewVisible: false,
  refresh: async (): Promise<unknown> => ({ status: 'ready', source: '/synthetic/design.pptd' }),
  attach: async () => {},
}));
vi.mock('jotai', async (original) => ({ ...await original<typeof import('jotai')>(), useAtomValue: (key: string) => key === 'machine' ? { machineId: 'machine' } : key === 'workspace' ? 'workspace' : null }));
vi.mock('../src/atoms', () => ({ userAtom: 'user', currentWorkspaceIdAtom: 'workspace' }));
vi.mock('../src/atoms/runtime', () => ({ activeWorkspaceRuntimeAtom: 'runtime' }));
vi.mock('../src/atoms/local-probe', () => ({ localProbeResultAtom: 'machine' }));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => () => {}, useBlocker: () => {} }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }));
vi.mock('../src/hooks/use-session-doc', () => ({ useSessionDoc: () => ({ doc: { history: [] } }) }));
vi.mock('../src/lib/electron-ipc-client', () => ({ getIpcServices: () => ({ design: {
  attach: async () => { await state.attach(); state.visible = true; },
  hide: async () => { state.visible = false; },
  refreshPreview: () => state.refresh(),
  attachPreview: async () => { state.previewVisible = true; },
  hidePreview: async () => { state.previewVisible = false; },
  closePreview: async () => { state.previewVisible = false; },
} }) }));
import { DesignCanvas } from '../src/components/sessions/design-canvas';
let root: Root;
let container: HTMLDivElement;
beforeEach(async () => {
  state.visible = false; state.previewVisible = false; state.attach = async () => {};
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, width: 400, height: 300, top: 0, bottom: 300, left: 0, right: 400, toJSON() { return this; } });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const mount = () => act(async () => root.render(<DesignCanvas sessionId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" active workspaceSlug="local" name="Synthetic" />));
const click = (label: string) => act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === label)!.click());
test('reselecting source during refresh keeps the pending response consumable', async () => {
  let complete!: (result: unknown) => void;
  state.refresh = () => new Promise(resolve => { complete = resolve; });
  await mount(); await click('Unsubmitted preview'); await click('Unsubmitted preview');
  await act(async () => complete({ status: 'ready', source: '/synthetic/design.pptd' }));
  expect(container.textContent).toContain('Showing the observed document and assets.');
  expect([...container.querySelectorAll('button')].find(button => button.textContent === 'Refresh preview')!.disabled).toBe(false);
});
test('old attachment cleanup cannot hide the current artwork after a rapid switch', async () => {
  let finishAttach!: () => void;
  const delayed = new Promise<void>(resolve => { finishAttach = resolve; });
  state.attach = () => delayed;
  state.refresh = async () => ({ status: 'ready', source: '/synthetic/design.pptd' });
  await mount(); await click('Unsubmitted preview'); await click('Current artwork');
  await act(async () => finishAttach());
  expect(state.visible).toBe(true);
  expect(state.previewVisible).toBe(false);
});
