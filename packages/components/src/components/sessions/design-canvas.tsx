import type { DesignElementReference } from '@lody/shared/design-element-reference';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useBlocker, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getSessionRoomId, type SessionId } from '@lody/shared';
import { activeWorkspaceRuntimeAtom } from '@/atoms/runtime';
import { localProbeResultAtom } from '@/atoms/local-probe';
import { userAtom, currentWorkspaceIdAtom } from '@/atoms';
import { getIpcServices, onIpcEvent } from '@/lib/electron-ipc-client';
import { latestCommittedDesignReceipt, syncOpenDesignCanvas } from '@/lib/design-canvas-sync';
import { useSessionDoc } from '@/hooks/use-session-doc';
import { Button } from '@/ui/button';
import { writeStoredLastActiveTabState } from '@/lib/session-draft-tabs';

type Association = {
  sessionId: string;
  name: string;
  userId: string;
  machineId: string;
  createdAt: string;
};
export function useDesignCreation(workspaceSlug: string) {
  const runtime = useAtomValue(activeWorkspaceRuntimeAtom);
  const user = useAtomValue(userAtom);
  const machine = useAtomValue(localProbeResultAtom);
  const navigate = useNavigate();
  const pending = useRef<Association | null>(null);
  usePendingDesignRecovery();
  return async (name: string, width: number, height: number, source?: string, sourceHostId?: string) => {
    const service = getIpcServices()?.design;
    if (!service || !runtime || !user || !machine?.machineId)
      throw Error('Local workspace is not ready');
    const association = pending.current ?? {
      sessionId: crypto.randomUUID(),
      name,
      userId: user.id,
      machineId: machine.machineId,
      createdAt: new Date().toISOString(),
    };
    pending.current = association;
    const saved = source
      ? await service.copy(source, association, sourceHostId)
      : await service.create({ association, width, height });
    await runtime.writer.upsertDocMeta(getSessionRoomId(association.sessionId as SessionId), {
      id: association.sessionId,
      machineId: association.machineId,
      userId: association.userId,
      title: saved.association.name,
      titleSource: 'user',
      createdAt: association.createdAt,
      isArchived: false,
      cliType: 'builtin',
      agentType: '',
      design: { artworkId: association.sessionId, path: 'design.json' },
    });
    writeStoredLastActiveTabState(association.sessionId as SessionId, {
      sessionTabId: association.sessionId,
      viewerTab: null,
      sidePanel: { open: true, tab: 'design', tabs: ['design'], sideSessionId: null },
    });
    await service.acknowledge(association.sessionId);
    pending.current = null;
    if (source) await service.finishCopy(source, association.sessionId, sourceHostId);
    await navigate({
      to: '/$workspaceName/sessions/$sessionId',
      params: { workspaceName: workspaceSlug, sessionId: association.sessionId },
    });
  };
}
export function DesignCanvas({
  sessionId,
  active,
  workspaceSlug,
  name,
  onReferenceSelection,
}: {
  sessionId: string;
  active: boolean;
  workspaceSlug: string;
  name: string;
  onReferenceSelection?: (reference: DesignElementReference, prompt?: string) => void;
}) {
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement>(null);
  const hostId = useRef(crypto.randomUUID()).current;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const create = useDesignCreation(workspaceSlug);
  const [focused, setFocused] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewStatus, setPreviewStatus] = useState<'waiting' | 'ready' | 'refreshing'>('waiting');
  const [previewSource, setPreviewSource] = useState('');
  const [previewIdentity, setPreviewIdentity] = useState<string>();
  const [previewError, setPreviewError] = useState('');
  const [automaticError, setAutomaticError] = useState('');
  const previewGeneration = useRef(0);
  const viewChoiceGeneration = useRef(0);
  const observedReceipt = useRef<{ value: string | undefined; pending: boolean; choice: number } | undefined>(undefined);
  const attachmentGeneration = useRef(0);
  const workspaceId = useAtomValue(currentWorkspaceIdAtom);
  const machine = useAtomValue(localProbeResultAtom);
  const refreshPreview = useCallback(async () => {
    const generation = ++previewGeneration.current;
    setPreviewStatus('refreshing');
    setPreviewError('');
    try {
      const service = getIpcServices()?.design;
      if (!service || !workspaceId || !machine?.machineId) throw Error('Local workspace is not ready');
      const result = await service.refreshPreview(sessionId, hostId, {
        machineId: machine.machineId, workspaceId, ownerSessionId: sessionId as SessionId,
        method: 'design/source-path', params: {},
      });
      if (generation !== previewGeneration.current || result.status === 'superseded') return;
      setPreviewSource(result.source);
      setPreviewIdentity(result.sourceIdentity);
      setPreviewStatus(result.status);
      if (result.status === 'waiting') setPreviewError(result.error ?? '');
      setAutomaticError(result.automaticError ?? '');
      if (host.current && !document.querySelector('[role="dialog"]')) {
        const {x, y, width, height} = host.current.getBoundingClientRect();
        await service.attachPreview(hostId, {x, y, width, height});
      }
    } catch (cause) {
      if (generation !== previewGeneration.current) return;
      setPreviewStatus('waiting'); setPreviewError(String(cause));
    }
  }, [workspaceId, machine?.machineId, sessionId, hostId]);
  const switchPreview = (value: boolean) => {
    if (value === preview) return;
    ++viewChoiceGeneration.current;
    ++previewGeneration.current;
    setPreview(value);
    if (!value) void getIpcServices()?.design.hidePreview(hostId);
  };
  useEffect(() => {
    if (preview && active) void refreshPreview();
    else { ++previewGeneration.current; void getIpcServices()?.design.hidePreview(hostId); }
  }, [preview, active, sessionId, hostId, refreshPreview]);
  useEffect(() => () => {
    ++previewGeneration.current;
    void getIpcServices()?.design.closePreview(hostId);
  }, [hostId, sessionId]);
  const { doc, synced } = useSessionDoc(sessionId as SessionId, { enabled: sessionId.length > 0 });
  const finalized = doc.history?.filter(entry => entry.role === 'assistant' && (entry.finished || typeof entry.endedAt === 'number')).map(entry => `${entry.id}:${entry.endedAt}:${JSON.stringify(entry.designOutcome)}`).join('|');
  useEffect(() => {
    if (!preview || !active) return undefined;
    const reconcile = () => { void refreshPreview(); };
    const stop = onIpcEvent('design.preview', result => {
      if (result.hostId !== hostId) return;
      setPreviewSource(result.source);
      setPreviewIdentity(result.sourceIdentity); setPreviewStatus(result.status);
      setPreviewError(result.error ?? ''); setAutomaticError(result.automaticError ?? '');
    });
    const reconnect = onIpcEvent('loro.status', connected => { if (connected) reconcile(); });
    window.addEventListener('focus', reconcile);
    return () => { stop(); reconnect(); window.removeEventListener('focus', reconcile); };
  }, [preview, active, hostId, refreshPreview]);
  useEffect(() => { if (preview && active && finalized) void refreshPreview(); }, [finalized, preview, active, refreshPreview]);
  const committedReceipt = latestCommittedDesignReceipt(doc.history, sessionId);
  useBlocker({
    enableBeforeUnload: false,
    shouldBlockFn: async ({ current, next }) => {
      if (current.pathname === next.pathname) return false;
      try {
        return !(await getIpcServices()?.design.leave(sessionId, hostId));
      } catch (e) {
        setError(String(e));
        return true;
      }
    },
  });
  useEffect(() => {
    let disposed = false;
    const generation = ++attachmentGeneration.current;
    const ownsAttachment = () => attachmentGeneration.current === generation;
    const service = getIpcServices()?.design;
    if (!service) return undefined;
    let work = Promise.resolve();
    const update = () => {
      work = work
        .catch(() => {})
        .then(async () => {
          if (attachmentGeneration.current !== generation) return;
          if (disposed || !active || !host.current || document.querySelector('[role="dialog"]')) {
            await service.hide(sessionId, hostId);
            await service.hidePreview(hostId, false);
            return;
          }
          const { x, y, width, height } = host.current.getBoundingClientRect();
          if (width > 0 && height > 0) {
            if (preview) {
              await service.hide(sessionId, hostId);
              await service.attachPreview(hostId, { x, y, width, height });
            } else {
              await service.attach(sessionId, { x, y, width, height }, hostId);
            }
          }
        })
        .catch((e) => {
          if (!disposed) setError(String(e));
        });
    };
    const resize = new ResizeObserver(update);
    const dialogs = new MutationObserver(update);
    if (host.current) resize.observe(host.current);
    dialogs.observe(document.body, { childList: true, subtree: true });
    update();
    return () => {
      disposed = true;
      resize.disconnect();
      dialogs.disconnect();
      void work.then(async () => {
        if (ownsAttachment()) await service.hide(sessionId, hostId);
      }).catch((cause) => console.error(cause));
    };
  }, [sessionId, active, hostId, preview]);
  useEffect(() => {
    // Seed from hydrated history: opening an old session is not a new commit.
    if (!synced) return undefined;
    if (observedReceipt.current?.value !== committedReceipt || !observedReceipt.current) {
      observedReceipt.current = {
        value: committedReceipt,
        pending: observedReceipt.current !== undefined,
        choice: viewChoiceGeneration.current,
      };
    }
    const receipt = observedReceipt.current;
    if (committedReceipt === undefined) return undefined;
    let cancelled = false;
    const choice = receipt.choice;
    void syncOpenDesignCanvas(sessionId).then(() => {
      if (cancelled) return;
      const shouldShowCanonical = receipt.pending;
      receipt.pending = false;
      if (!shouldShowCanonical || choice !== viewChoiceGeneration.current) return;
      // Only the guarded canonical reload succeeding changes the visible source.
      // Preview snapshots never enter this path's save or completion decisions.
      ++previewGeneration.current;
      setPreview(false);
      void getIpcServices()?.design.hidePreview(hostId);
    }).catch((cause) => {
      if (!cancelled) setError(String(cause));
    });
    return () => { cancelled = true; };
  }, [sessionId, committedReceipt, synced, hostId]);
  const run = (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    void action()
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false));
  };
  const referenceSelection = (prompt?: string, kind?: 'image') =>
    run(async () => {
      const service = getIpcServices()?.design;
      if (!service) throw Error('Local workspace is not ready');
      const generation = attachmentGeneration.current;
      const reference = await service.selection(sessionId, hostId, kind);
      if (generation !== attachmentGeneration.current)
        throw Error(t('design.selectionChanged', 'Artwork view changed; select the current elements again'));
      setFocused(false);
      onReferenceSelection?.(reference, prompt);
    });
  return (
    <div
      data-design-canvas-focus={active && focused}
      className="flex h-full min-h-0 flex-col bg-background"
    >
      <style>
        {
          '[data-panel-group]:has([data-design-canvas-focus="true"]) > [data-panel-id="chat"], [data-panel-group]:has([data-design-canvas-focus="true"]) > [data-panel-resize-handle-id]{display:none}'
        }
      </style>
      <div className="flex flex-wrap items-center gap-2 border-b p-2">
        {onReferenceSelection && <>
          <Button size="sm" variant="outline" disabled={busy || preview} onClick={() => referenceSelection()}>
            {t('design.referenceSelection', 'Reference selected elements')}
          </Button>
          <Button size="sm" variant="outline" disabled={busy || preview} onClick={() => referenceSelection(
            t('design.generateImagesPrompt', 'Generate a new image for each selected image, using the current design as context. Replace only the selected images with the resulting assets.'), 'image'
          )}>{t('design.generateSelectedImages', 'Generate selected images')}</Button>
          <Button size="sm" variant="outline" disabled={busy || preview} onClick={() => referenceSelection(
            t('design.editImagesPrompt', 'Edit each selected image using its current image as the source. Replace only the selected images with the resulting assets. Requested changes: '), 'image'
          )}>{t('design.editSelectedImages', 'Edit selected images')}</Button>
          <Button size="sm" variant="outline" disabled={busy || preview} onClick={() => referenceSelection(
            t('design.adjustStylePrompt', 'Adjust the style of the selected elements while preserving their content. Requested style: ')
          )}>{t('design.adjustSelectedStyle', 'Adjust selected style')}</Button>
          <Button size="sm" variant="outline" disabled={busy || preview} onClick={() => referenceSelection(
            t('design.regenerateSelectionPrompt', 'Regenerate the selected elements using the current design and our conversation as context. Preserve the rest of the artwork.')
          )}>{t('design.regenerateSelection', 'Regenerate selection')}</Button>
        </>}

        <Button size="sm" variant={preview ? 'outline' : 'default'} onClick={() => switchPreview(false)}>
          {t('design.currentCanvas', 'Current artwork')}
        </Button>
        <Button size="sm" variant={preview ? 'default' : 'outline'} onClick={() => switchPreview(true)}>
          {t('design.sourcePreview', 'Unsubmitted preview')}
        </Button>
        {preview && <Button size="sm" variant="outline" disabled={previewStatus === 'refreshing'} onClick={() => void refreshPreview()}>
          {t('design.refreshPreview', 'Refresh preview')}
        </Button>}
        {preview && <Button size="sm" disabled={busy || !previewIdentity || previewStatus === 'refreshing'} onClick={() => run(async () => {
          const service = getIpcServices()?.design;
          if (!service || !previewIdentity) throw Error('Preview is not available');
          const saved = await service.importPreview(sessionId, hostId, previewIdentity);
          if (saved.reloadError) throw Error(t('design.importSavedReloadFailed', 'Imported and saved, but the canvas could not reload: ') + saved.reloadError);
          switchPreview(false);
        })}>
          {t('design.importPreview', 'Import as current artwork')}
        </Button>}
        <Button size="sm" variant="outline" onClick={() => setFocused((value) => !value)}>
          {focused ? t('design.showChat', 'Show conversation') : t('design.focus', 'Focus canvas')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || preview}
          onClick={() =>
            run(() => create(name + t('design.copySuffix', ' — copy'), 800, 600, sessionId, hostId))
          }
        >
          {t('design.saveCopy', 'Save as new design')}
        </Button>
        <Button
          size="sm"
          disabled={busy || preview}
          onClick={() => run(async () => getIpcServices()?.design.export(sessionId, 'png', name))}
        >
          PNG
        </Button>
        <Button
          size="sm"
          disabled={busy || preview}
          onClick={() => run(async () => getIpcServices()?.design.export(sessionId, 'jpeg', name))}
        >
          JPEG
        </Button>
      </div>
      {preview && <div role="status" className="border-b p-2 text-xs text-muted-foreground">
        <p>{t('design.previewReadonly', 'Read-only authoring files · not submitted. Valid drafts may still be unfinished.')}</p>
        {previewSource && <p className="break-all">{previewSource}</p>}
        <p>{previewStatus === 'ready' ? t('design.previewReady', 'Showing the observed document and assets.') : previewStatus === 'refreshing' ? t('design.previewRefreshing', 'Reading files…') : t('design.previewWaiting', 'Waiting for valid files. The last valid preview, if any, is retained.')}</p>
        {automaticError && <p>{t('design.previewAutomaticUnavailable', 'Automatic updates unavailable. Use Refresh preview.')} {automaticError}</p>}
        {previewError && <p>{previewError}</p>}
      </div>}
      {error && (
        <p role="alert" className="p-2 text-destructive">
          {error}
        </p>
      )}
      <div ref={host} className="min-h-0 flex-1" aria-label={t('design.canvas', 'Design canvas')} />
    </div>
  );
}

export function usePendingDesignRecovery() {
  const runtime = useAtomValue(activeWorkspaceRuntimeAtom);
  const user = useAtomValue(userAtom);
  useEffect(() => {
    const service = getIpcServices()?.design;
    if (!runtime || !user || !service) return;
    void service
      .pending()
      .then(async (designs) => {
        for (const { association } of designs) {
          if (association.userId !== user.id) continue;
          const roomId = getSessionRoomId(association.sessionId as SessionId);
          const existing = await runtime.repo.getDocMeta(roomId);
          await runtime.writer.upsertDocMeta(roomId, {
            ...(!existing?.meta
              ? {
                  id: association.sessionId,
                  ...association,
                  title: association.name,
                  titleSource: 'draft',
                  isArchived: false,
                  cliType: 'builtin',
                  agentType: '',
                }
              : {}),
            design: { artworkId: association.sessionId, path: 'design.json' },
          });
          await service.acknowledge(association.sessionId);
        }
      })
      .catch((error) => toast.error(String(error)));
  }, [runtime, user]);
}
