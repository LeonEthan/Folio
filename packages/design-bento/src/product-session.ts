/** Product editor persistence and its fixed, revision-bound parent bridge. */
export function createProductSession(options: {
  sessionId: string;
  revisionId: string;
  snapshot(): unknown;
  assets(): Record<string, string>;
  commitPending(): void;
  setReadonly(value: boolean): void;
  setDirty(dirty: boolean): void;
}) {
  const editorInstanceId = new URLSearchParams(location.search).get('editorInstance') ?? '';
  const embedded = window.parent !== window && /^[a-f0-9-]{36}$/.test(editorInstanceId);
  let revisionId = options.revisionId;
  let selection: unknown[] = [];
  let editSeq = 0;
  let savedSeq = 0;
  let pendingText = false;
  let pendingTextNode: HTMLElement | null = null;
  let composing = false;
  let conflict = false;
  let saving: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let state = 'loading';
  let ready = false;
  let error = '';
  let readonly = true;
  let readonlyMessage = '只读 / Read-only';
  let writePermit: string | undefined;
  options.setReadonly(true);
  const style = document.createElement('style');
  style.textContent = `:root{color-scheme:light dark}.ed-panel-toggle,.ed-resizer,.ed-logo,.ed-title,.ed-insert,.ed-group-right,.ed-sidebar,.ed-present-pill,.ed-phone-only,.ed-props{display:none!important}.ed-topbar{background:Canvas!important;color:CanvasText!important}.c2a-btn,.c2a-select,.c2a-number,.c2a-text,.c2a-textarea,.c2a-color{background:Field!important;color:FieldText!important}.c2a-label,.c2a-section{color:CanvasText!important;opacity:.8}.c2a-surface{left:auto!important;right:8px!important;bottom:44px!important;width:min(300px,calc(100vw - 20px))!important;background:Canvas!important;color:CanvasText!important}.molly-properties-hidden .c2a-surface{display:none!important}`;
  document.head.append(style);
  const properties = document.createElement('button');
  properties.textContent = '属性 / Properties';
  properties.style.cssText = 'position:fixed;right:12px;top:8px;z-index:2147483100;padding:5px 10px';
  properties.onclick = () => document.body.classList.toggle('molly-properties-hidden');
  document.body.append(properties);
  const status = document.createElement('div');
  status.id = 'autosave-status';
  status.setAttribute('role', 'status');
  status.style.cssText = 'position:fixed;bottom:10px;right:16px;z-index:9999;padding:5px 10px;background:Canvas;color:CanvasText;border:1px solid #8886;border-radius:6px;font:12px system-ui';
  document.body.appendChild(status);
  const dirty = () => pendingText || editSeq !== savedSeq;
  const identity = () => ({ sessionId: options.sessionId, editorInstanceId, revisionId, editSeq, savedSeq });
  const emit = (type: string, extra: Record<string, unknown> = {}) => {
    if (embedded) window.parent.postMessage({ type, ...identity(), ...extra }, location.origin);
  };
  const mark = (next: string, message: string) => {
    if (conflict && next !== 'conflict') { next = 'conflict'; message = error || message; }
    state = next;
    error = next === 'error' || next === 'conflict' || next === 'waiting' ? message : '';
    status.dataset.state = next;
    status.textContent = readonly && next !== 'error' && next !== 'conflict' ? readonlyMessage : message;
    options.setDirty(dirty());
    emit('editor-status', { state, dirty: dirty(), error, ready, composing });
  };
  const schedule = (delay = 500) => {
    clearTimeout(timer);
    if (!conflict && !readonly) timer = setTimeout(() => void flush(false).catch(() => {}), delay);
  };
  const changed = () => {
    if (!pendingTextNode?.isConnected || !pendingTextNode.isContentEditable) pendingText = false;
    editSeq++;
    mark('pending', '修改尚未保存');
    schedule();
  };
  const saveOne = async () => {
    const submittedSeq = editSeq;
    const submittedRevision = revisionId;
    mark('saving', '正在保存…');
    try {
      const reply = await fetch(`/ws/${encodeURIComponent(options.sessionId)}/save`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ doc: options.snapshot(), assets: options.assets(), baseRevisionId: submittedRevision, writePermit }),
        signal: AbortSignal.timeout(15_000),
      });
      const result = await reply.json() as { ok?: boolean; code?: string; error?: string; revisionId?: string };
      if (!reply.ok || result.ok !== true || typeof result.revisionId !== 'string') {
        conflict = reply.status === 409 && result.code !== 'JOB_RUNNING';
        mark(conflict ? 'conflict' : result.code === 'JOB_RUNNING' ? 'waiting' : 'error',
          result.error ?? '保存失败，请重试');
        throw new Error(error);
      }
      revisionId = result.revisionId;
      savedSeq = submittedSeq;
      mark(dirty() ? 'pending' : 'saved', dirty() ? '修改尚未保存' : '已自动保存');
    } catch (cause) {
      if (!conflict && state !== 'waiting') mark('error', cause instanceof Error ? cause.message : '保存失败，请重试');
      if (!conflict) schedule(2000);
      throw cause;
    }
  };
  const flush = async (commitBuffered = true): Promise<void> => {
    clearTimeout(timer);
    if (composing && commitBuffered) throw new Error('请先完成输入法输入，再保存或离开画布');
    if (commitBuffered && !readonly) { options.commitPending(); pendingText = false; }
    if (conflict) throw new Error(error || '画稿版本冲突，当前修改仍保留');
    const hasQueuedSave = () => editSeq !== savedSeq || saving !== undefined;
    while (hasQueuedSave()) {
      if (!saving) saving = saveOne().finally(() => { saving = undefined; });
      await saving;
      if (composing && commitBuffered) throw new Error('请先完成输入法输入');
      if (commitBuffered && !readonly) { options.commitPending(); pendingText = false; }
    }
    mark(dirty() ? 'editing' : 'saved', dirty() ? '正在编辑…' : '已自动保存');
  };
  const setReadonly = (value: boolean, message = '只读 / Read-only') => {
    readonlyMessage = message;
    if (value === readonly) { if (readonly) status.textContent = readonlyMessage; return; }
    // Block new input before committing the already-buffered text synchronously.
    readonly = value;
    try {
      if (value) {
        clearTimeout(timer);
        if (!composing) { options.commitPending(); pendingText = false; }
      }
    } finally { options.setReadonly(value); }
    document.body.dataset.readonly = String(value);
    status.textContent = value ? readonlyMessage : (dirty() ? '修改尚未保存' : '已自动保存');
    if (!value && dirty()) schedule();
  };
  const blockInput = (event: Event) => {
    if (!readonly) return;
    event.preventDefault(); event.stopImmediatePropagation();
  };
  for (const type of ['beforeinput', 'paste', 'cut', 'drop']) document.addEventListener(type, blockInput, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' || event.key === 'Tab' || event.key === ' ' ||
      ((event.metaKey || event.ctrlKey) && ['c', '+', '-', '=', '0'].includes(event.key.toLowerCase()))) return;
    blockInput(event);
  }, true);
  document.addEventListener('pointerdown', (event) => {
    if ((event.target as Element | null)?.closest('input,textarea,[contenteditable="true"],.c2a-surface')) blockInput(event);
  }, true);
  window.addEventListener('beforeunload' , (event) => {
    if (dirty()) { event.preventDefault(); event.returnValue = ''; }
  });
  window.addEventListener('online', () => { if (dirty()) schedule(); });
  document.addEventListener('compositionstart', () => { composing = true; mark('editing', '输入法输入中…'); });
  document.addEventListener('compositionend', () => {
    composing = false;
    mark(dirty() ? 'editing' : 'saved', dirty() ? '正在编辑…' : '已自动保存');
    if (dirty()) schedule();
  });
  document.addEventListener('input', (event) => {
    const editable = (event.target as Element | null)?.closest<HTMLElement>('[contenteditable="true"]');
    if (editable) {
      pendingTextNode = editable;
      pendingText = true;
      mark('editing', '正在编辑…');
    }
  });
  document.addEventListener('blur', (event) => {
    if (event.target !== pendingTextNode) return;
    queueMicrotask(() => {
      if (!pendingTextNode?.isConnected || !pendingTextNode.isContentEditable) {
        pendingText = false;
        options.setDirty(dirty());
        if (!dirty() && !saving) mark('saved', '已自动保存');
      }
    });
  }, true);
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!embedded || event.origin !== location.origin || event.source !== window.parent ||
      !data || data.type !== 'editor-save' || data.sessionId !== options.sessionId || data.editorInstanceId !== editorInstanceId ||
      typeof data.requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(data.requestId) ||
      typeof data.revisionId !== 'string' || data.revisionId.length > 100) return;
    void flush().then(() => emit('editor-save-result', { requestId: data.requestId, requestedRevisionId: data.revisionId, ok: true }),
      (cause) => emit('editor-save-result', { requestId: data.requestId, requestedRevisionId: data.revisionId, ok: false,
        error: cause instanceof Error ? cause.message : '保存失败' }));
  });
  mark('loading', '画布载入中…');
  void document.fonts.ready.then(() => {
    ready = true;
    document.getElementById('bento-splash')?.remove();
    if (state === 'loading') mark('saved', '已自动保存');
    else mark(state, status.textContent ?? '');
    window.dispatchEvent(new Event('molly:ready'));
  });
  Object.assign(window, { molly: {
    setReadonly,
    selection() { return selection; },
    state() { return { ready, dirty: dirty(), composing, saving: saving !== undefined, readonly, revisionId }; },
    async flush(permit: string) {
      writePermit = permit;
      try { await flush(); return { ok: true }; }
      catch (cause) { return { ok: false, error: String(cause) }; }
      finally { writePermit = undefined; }
    },
    async save() { try { if (readonly) throw Error('Canvas is read-only'); await flush(); return { ok: true }; } catch (cause) { return { ok: false, error: String(cause) }; } },
    rebase(previous: string, next: string) { if (revisionId !== previous || saving) throw Error('Concurrent name change'); revisionId = next; },
    async snapshot() {
      if (composing) throw Error('Finish composing text before copying');
      if (saving) await saving.catch(() => {});
      if (!readonly) options.commitPending();
      const value = options.snapshot();
      return { doc: typeof value === 'string' ? JSON.parse(value) : value, assets: options.assets() };
    }
  } });
  return {
    changed,
    async save() {
      try { if (readonly) throw Error('Canvas is read-only'); await flush(); return { ok: true }; }
      catch (cause) { return { ok: false, error: cause instanceof Error ? cause.message : '保存失败' }; }
    },
    selection(elements: unknown[]) { selection = elements; emit('selection', { elements }); },
  };
}
