// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createProductSession } from '../../design-bento/src/product-session';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

it('freezes semantic commands after committing buffered input and flushes without admitting new input', async () => {
  vi.useFakeTimers();
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } });
  let content = 'before', buffered = '', readonly = false;
  const saved: unknown[] = [];
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    saved.push(JSON.parse(String(init.body)));
    return { ok: true, json: async () => ({ ok: true, revisionId: 'next' }) };
  });
  const session = createProductSession({
    sessionId: 'art', revisionId: 'old', snapshot: () => ({ content }), assets: () => ({}),
    setDirty: () => {}, setReadonly: (value) => { readonly = value; },
    commitPending: () => { if (buffered && !readonly) { content = buffered; buffered = ''; session.changed(); } },
  });
  const api = (window as unknown as { folio: {
    setReadonly(value: boolean): void;
    state(): { dirty: boolean; readonly: boolean };
    flush(permit: string): Promise<{ ok: boolean }>;
    save(): Promise<{ ok: boolean }>;
  } }).folio;
  expect(readonly).toBe(true);
  api.setReadonly(false); buffered = 'buffered human text';
  api.setReadonly(true);
  expect(content).toBe('buffered human text');
  expect(readonly).toBe(true);
  const input = new InputEvent('beforeinput', { bubbles: true, cancelable: true, data: 'blocked' });
  document.dispatchEvent(input);
  expect(input.defaultPrevented).toBe(true);
  expect(await api.save()).toMatchObject({ ok: false });
  expect(await api.flush('one-save-permit')).toEqual({ ok: true });
  expect(saved).toEqual([{ doc: { content: 'buffered human text' }, assets: {}, baseRevisionId: 'old', writePermit: 'one-save-permit' }]);
  expect(api.state()).toMatchObject({ dirty: false, readonly: true });
  api.setReadonly(false);
  expect(readonly).toBe(false);
  buffered = 'unfinished composition';
  document.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  api.setReadonly(true);
  expect(await api.flush('composition-permit')).toMatchObject({ ok: false });
  expect(buffered).toBe('unfinished composition');
  expect(content).toBe('buffered human text');
  api.setReadonly(false);
  document.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  api.setReadonly(true);
  expect(content).toBe('unfinished composition');
  vi.stubGlobal('fetch', async () => ({ ok: false, status: 500, json: async () => ({ ok: false, error: 'disk unavailable' }) }));
  expect(await api.flush('failed-save')).toMatchObject({ ok: false });
  expect(api.state()).toMatchObject({ dirty: true, readonly: true });
  expect(content).toBe('unfinished composition');
});
