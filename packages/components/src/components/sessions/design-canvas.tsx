import { useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useBlocker, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getSessionRoomId, type SessionId } from '@lody/shared';
import { activeWorkspaceRuntimeAtom } from '@/atoms/runtime';
import { localProbeResultAtom } from '@/atoms/local-probe';
import { userAtom } from '@/atoms';
import { getIpcServices } from '@/lib/electron-ipc-client';
import { latestCommittedDesignRevision, syncOpenDesignCanvas } from '@/lib/design-canvas-sync';
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
  return async (name: string, width: number, height: number, source?: string) => {
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
      ? await service.copy(source, association)
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
    if (source) await service.finishCopy(source, association.sessionId);
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
}: {
  sessionId: string;
  active: boolean;
  workspaceSlug: string;
  name: string;
}) {
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement>(null);
  const hostId = useRef(crypto.randomUUID()).current;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const create = useDesignCreation(workspaceSlug);
  const [focused, setFocused] = useState(false);
  const { doc } = useSessionDoc(sessionId as SessionId, { enabled: sessionId.length > 0 });
  const committedRevisionId = latestCommittedDesignRevision(doc.history, sessionId);
  useBlocker({
    enableBeforeUnload: false,
    shouldBlockFn: async ({ current, next }) => {
      if (current.pathname === next.pathname) return false;
      try {
        return !(await getIpcServices()?.design.leave(sessionId));
      } catch (e) {
        setError(String(e));
        return true;
      }
    },
  });
  useEffect(() => {
    let disposed = false;
    const service = getIpcServices()?.design;
    if (!service) return undefined;
    let work = Promise.resolve();
    const update = () => {
      work = work
        .catch(() => {})
        .then(async () => {
          if (disposed || !active || !host.current || document.querySelector('[role="dialog"]')) {
            await service.hide(sessionId, hostId);
            return;
          }
          const { x, y, width, height } = host.current.getBoundingClientRect();
          if (width > 0 && height > 0)
            await service.attach(sessionId, { x, y, width, height }, hostId);
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
      void work.then(() => service.hide(sessionId, hostId)).catch((cause) => console.error(cause));
    };
  }, [sessionId, active, hostId]);
  useEffect(() => {
    if (committedRevisionId === undefined) return undefined;
    let cancelled = false;
    void syncOpenDesignCanvas(sessionId).catch((cause) => {
      if (!cancelled) setError(String(cause));
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, committedRevisionId]);
  const run = (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    void action()
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false));
  };
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
        <Button size="sm" variant="outline" onClick={() => setFocused((value) => !value)}>
          {focused ? t('design.showChat', 'Show conversation') : t('design.focus', 'Focus canvas')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            run(() => create(name + t('design.copySuffix', ' — copy'), 800, 600, sessionId))
          }
        >
          {t('design.saveCopy', 'Save as new design')}
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => run(async () => getIpcServices()?.design.export(sessionId, 'png', name))}
        >
          PNG
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => run(async () => getIpcServices()?.design.export(sessionId, 'jpeg', name))}
        >
          JPEG
        </Button>
      </div>
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
