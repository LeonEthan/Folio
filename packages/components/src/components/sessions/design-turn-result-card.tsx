import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileWarning,
  FileX2,
  Loader2,
  MapPin,
  Trash2,
  Wand2,
} from 'lucide-react';
import type { SessionId } from '@lody/shared';
import { sessionLivePresenceAtomFamily } from '@/atoms/presence';
import { getIpcServices } from '@/lib/electron-ipc-client';
import {
  buildDesignRepairRequest,
  getDesignCandidateStandingCopy,
  getDesignResultHintCopy,
  getDesignResultNoticeCopy,
  getDesignResultStatusCopy,
  redactDesignText,
  resolveDesignCandidateStanding,
  resolveDesignResultCard,
  resolveDesignResultCardActions,
  resolveDesignThumbnail,
  shortDesignId,
  type DesignCandidateStanding,
  type DesignResultNotice,
  type DesignResultStatus,
  type DesignThumbnailState,
} from '@/lib/design-turn-result';
import { Button } from '@/ui/button';
import { cn } from '@/lib/utils';

/**
 * P2.5 design result card: what one user turn of a design session produced.
 *
 * It hangs on the turn it belongs to and reads the durable `designOutcome`
 * through `sanitizeDesignTurnOutcome` — never by re-reading the workspace, and
 * never by rewriting the entry (adopting or discarding a candidate does not
 * change what the turn produced; the durable record stays true). Everything the
 * card claims comes from a store answer: the candidate's standing is one
 * read-only query, and the outcome status is the recorded verdict.
 *
 * The card offers four actions and invents none of them:
 *
 * - locate: a view action owned by the conversation surface.
 * - apply / discard: only for a candidate that still exists and still differs
 *   from the canvas. Apply asks for an in-card confirmation first, because it
 *   replaces whatever the user has on the canvas now; the write itself is the
 *   store's compare-and-set, so a canvas that moved in between is refused, not
 *   overwritten, and the candidate is kept.
 * - repair: a real user turn through the ordinary send path (same save gate,
 *   same baseline freeze), composed from the status and the bounded
 *   diagnostics. It is never sent on the card's own initiative, and no model
 *   call is ever retried.
 *
 * The card also shows the turn's preview when the outcome carries a thumbnail
 * reference (P2.6): one read through the design channel, rendered as an image
 * while it is there and omitted when it is not. It describes what the turn
 * produced, so it is shown whatever later happened to the candidate file.
 *
 * A turn whose outcome this build cannot read renders nothing.
 */

/** What the candidate store answered for `candidateId`. */
type DesignCandidateStateAnswer = {
  status?: unknown;
  reason?: unknown;
};

type DesignCandidateAdoptionAnswer = {
  status?: unknown;
  revisionId?: unknown;
  alreadyCurrent?: unknown;
} | null;

type DesignCandidateDiscardAnswer = { removed?: unknown } | null;

/** What the design channel answered for a recorded thumbnail reference. */
type DesignThumbnailAnswer = { status?: unknown; dataUri?: unknown };

export type DesignTurnResultCardActions = {
  /** Focus this design's canvas in the side panel. */
  onLocate?: () => void;
  /** Send the composed repair request as a new user turn; false when blocked. */
  onRepair?: (request: string) => Promise<boolean>;
  candidateState?: (candidateId: string) => Promise<DesignCandidateStateAnswer>;
  onAdopt?: (candidateId: string) => Promise<DesignCandidateAdoptionAnswer>;
  onDiscard?: (candidateId: string) => Promise<DesignCandidateDiscardAnswer>;
  /** Read a recorded thumbnail reference's bytes, through the design channel. */
  thumbnail?: (reference: string) => Promise<DesignThumbnailAnswer>;
};

/**
 * Session-scoped actions the conversation surface injects, so a row further
 * down the tree does not have to thread callbacks through every virtual row.
 */
export type DesignTurnResultHostActions = {
  onLocate?: () => void;
  onRepair?: (request: string) => Promise<boolean>;
};

const DesignTurnResultActionsContext = createContext<DesignTurnResultHostActions | undefined>(
  undefined
);

export function DesignTurnResultActionsProvider({
  onLocate,
  onRepair,
  children,
}: {
  onLocate?: () => void;
  onRepair?: (request: string) => Promise<boolean>;
  children: ReactNode;
}) {
  // Keyed on the callbacks, not an object literal: the conversation surface
  // re-renders often, and every result card below it must not re-render with it.
  const value = useMemo<DesignTurnResultHostActions>(
    () => ({ ...(onLocate ? { onLocate } : {}), ...(onRepair ? { onRepair } : {}) }),
    [onLocate, onRepair]
  );
  return (
    <DesignTurnResultActionsContext.Provider value={value}>
      {children}
    </DesignTurnResultActionsContext.Provider>
  );
}

/**
 * The row-facing card. It reads the host actions from context and the candidate
 * actions from the design IPC (the same channel the canvas uses), then renders
 * the presentational view.
 */
export function DesignTurnResultCard({
  sessionId,
  artworkId,
  outcome,
  isLatestUserTurn,
}: {
  sessionId: SessionId;
  /** `SessionMeta.design.artworkId` — the design store's key for this session. */
  artworkId: string;
  outcome: unknown;
  /** The trailing user turn: the only one that can still be generating. */
  isLatestUserTurn: boolean;
}) {
  const host = useContext(DesignTurnResultActionsContext);
  const service = useMemo(() => getIpcServices()?.design ?? null, []);
  // Each candidate callback is memoized on its own: the conversation surface
  // hands down a fresh repair callback often, and rebuilding the candidate
  // callbacks with it would re-run the card's read-only candidate query.
  const readCandidateState = useMemo(
    () =>
      service ? (candidateId: string) => service.candidateState(artworkId, candidateId) : undefined,
    [artworkId, service]
  );
  const adoptCandidate = useMemo(
    () =>
      service ? (candidateId: string) => service.adoptCandidate(artworkId, candidateId) : undefined,
    [artworkId, service]
  );
  const discardCandidate = useMemo(
    () =>
      service
        ? (candidateId: string) => service.discardCandidate(artworkId, candidateId)
        : undefined,
    [artworkId, service]
  );
  // A read-only fetch of the recorded preview, kept separate from the candidate
  // group: the image describes what the turn produced, which stays true no
  // matter what later happened to the candidate file.
  const readThumbnail = useMemo(
    () => (service ? (reference: string) => service.thumbnail(artworkId, reference) : undefined),
    [artworkId, service]
  );
  const actions = useMemo<DesignTurnResultCardActions>(
    () => ({
      ...(host?.onLocate ? { onLocate: host.onLocate } : {}),
      ...(host?.onRepair ? { onRepair: host.onRepair } : {}),
      ...(readCandidateState
        ? {
            candidateState: readCandidateState,
            onAdopt: adoptCandidate,
            onDiscard: discardCandidate,
          }
        : {}),
      ...(readThumbnail ? { thumbnail: readThumbnail } : {}),
    }),
    [
      adoptCandidate,
      discardCandidate,
      host?.onLocate,
      host?.onRepair,
      readCandidateState,
      readThumbnail,
    ]
  );

  return isLatestUserTurn ? (
    <LiveDesignTurnResultCard sessionId={sessionId} outcome={outcome} actions={actions} />
  ) : (
    <DesignTurnResultCardView outcome={outcome} generating={false} actions={actions} />
  );
}

/**
 * Live state for the trailing turn. Presence — never `SessionMeta.status` — is
 * the fact source for "working now", and the card only claims to be generating
 * while no outcome has been recorded for the turn.
 */
function LiveDesignTurnResultCard({
  sessionId,
  outcome,
  actions,
}: {
  sessionId: SessionId;
  outcome: unknown;
  actions: DesignTurnResultCardActions;
}) {
  const presence = useAtomValue(sessionLivePresenceAtomFamily(sessionId));
  return (
    <DesignTurnResultCardView outcome={outcome} generating={presence != null} actions={actions} />
  );
}

const STATUS_ICONS: Record<DesignResultStatus, { icon: ReactNode; className: string }> = {
  live: {
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    className: 'text-muted-foreground',
  },
  committed: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, className: 'text-primary' },
  candidate: { icon: <AlertTriangle className="h-3.5 w-3.5" />, className: 'text-amber-500' },
  invalid: { icon: <FileWarning className="h-3.5 w-3.5" />, className: 'text-destructive' },
  no_artifact: { icon: <FileX2 className="h-3.5 w-3.5" />, className: 'text-muted-foreground' },
  failed: { icon: <Ban className="h-3.5 w-3.5" />, className: 'text-destructive' },
  cancelled: { icon: <Ban className="h-3.5 w-3.5" />, className: 'text-muted-foreground' },
};

export function DesignTurnResultCardView({
  outcome: rawOutcome,
  generating,
  actions = {},
}: {
  /** Raw `SessionHistoryInput.designOutcome`; sanitized here. */
  outcome: unknown;
  /** The session reports this turn as running right now. */
  generating: boolean;
  actions?: DesignTurnResultCardActions;
}) {
  const { t } = useTranslation();
  const state = resolveDesignResultCard(rawOutcome, generating);
  const outcome = state.kind === 'result' ? state.outcome : undefined;
  const candidateId = outcome?.status === 'candidate' ? outcome.candidateId : undefined;
  const diagnostics = outcome?.diagnostics ?? [];

  const [standing, setStanding] = useState<DesignCandidateStanding>({ status: 'loading' });
  const [standingNonce, setStandingNonce] = useState(0);
  const readCandidateState = actions.candidateState;

  // One read-only query per mount (and after an action changed the answer):
  // whether the candidate still exists and whether the canvas already matches
  // it. Nothing here writes, and a failure is reported as "cannot tell".
  useEffect(() => {
    if (!candidateId || !readCandidateState) {
      setStanding({ status: 'unknown' });
      return undefined;
    }
    let cancelled = false;
    setStanding({ status: 'loading' });
    readCandidateState(candidateId).then(
      (answer) => {
        if (!cancelled) setStanding(resolveDesignCandidateStanding(answer));
      },
      (error: unknown) => {
        if (!cancelled) {
          console.warn('Design candidate state could not be read', { candidateId, error });
          setStanding({ status: 'unknown' });
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [candidateId, readCandidateState, standingNonce]);

  const thumbnailImage = outcome?.thumbnail;
  const thumbnailRef = thumbnailImage?.path;
  const [thumbnail, setThumbnail] = useState<DesignThumbnailState>({ status: 'loading' });
  const readThumbnail = actions.thumbnail;

  // One read per recorded reference, and only when the durable outcome actually
  // carries one. A reference this build will not fetch, or an answer that is not
  // a PNG data URI, leaves the card with no image — never with an error: the
  // status and hint above already say what the turn produced, and a preview the
  // card cannot show does not make them any less true.
  useEffect(() => {
    if (!thumbnailRef || !readThumbnail) {
      setThumbnail({ status: 'none' });
      return undefined;
    }
    let cancelled = false;
    setThumbnail({ status: 'loading' });
    readThumbnail(thumbnailRef).then(
      (answer) => {
        if (!cancelled) setThumbnail(resolveDesignThumbnail(answer));
      },
      (error: unknown) => {
        if (!cancelled) {
          console.warn('Design thumbnail could not be read', { reference: thumbnailRef, error });
          setThumbnail({ status: 'none' });
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [readThumbnail, thumbnailRef]);

  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [confirmingAdopt, setConfirmingAdopt] = useState(false);
  const [pendingAction, setPendingAction] = useState<'adopt' | 'discard' | 'repair' | null>(null);
  const [notice, setNotice] = useState<DesignResultNotice | null>(null);

  const handleAdopt = useCallback(async () => {
    if (!candidateId || !actions.onAdopt || pendingAction) return;
    setPendingAction('adopt');
    setConfirmingAdopt(false);
    try {
      const answer = await actions.onAdopt(candidateId);
      if (answer?.status === 'adopted') {
        setNotice(
          answer.alreadyCurrent === true
            ? { kind: 'alreadyCurrent' }
            : {
                kind: 'adopted',
                revisionId: typeof answer.revisionId === 'string' ? answer.revisionId : '',
              }
        );
      } else if (answer?.status === 'rejected') {
        setNotice({ kind: 'refused' });
      } else {
        setNotice({ kind: 'failed' });
      }
    } catch (error) {
      console.warn('Design candidate could not be applied', { candidateId, error });
      setNotice({ kind: 'failed' });
    } finally {
      setPendingAction(null);
      setStandingNonce((nonce) => nonce + 1);
    }
  }, [actions, candidateId, pendingAction]);

  const handleDiscard = useCallback(async () => {
    if (!candidateId || !actions.onDiscard || pendingAction) return;
    setPendingAction('discard');
    try {
      const answer = await actions.onDiscard(candidateId);
      setNotice(answer?.removed === false ? { kind: 'discardMissing' } : { kind: 'discarded' });
    } catch (error) {
      console.warn('Design candidate could not be discarded', { candidateId, error });
      setNotice({ kind: 'failed' });
    } finally {
      setPendingAction(null);
      setStandingNonce((nonce) => nonce + 1);
    }
  }, [actions, candidateId, pendingAction]);

  const handleRepair = useCallback(async () => {
    if (!outcome || !actions.onRepair || pendingAction) return;
    setPendingAction('repair');
    try {
      const sent = await actions.onRepair(buildDesignRepairRequest(outcome, t));
      setNotice(sent ? { kind: 'repairSent' } : { kind: 'repairBlocked' });
    } catch (error) {
      console.warn('Design repair request could not be sent', { error });
      setNotice({ kind: 'repairBlocked' });
    } finally {
      setPendingAction(null);
    }
  }, [actions, outcome, pendingAction, t]);

  // Everything above runs unconditionally (hooks); a card with nothing to say
  // renders nothing — an unreadable future payload never becomes a guess.
  if (state.kind === 'none') return null;

  const status: DesignResultStatus = state.kind === 'live' ? 'live' : state.outcome.status;
  const statusCopy = getDesignResultStatusCopy(status);
  const hintCopy = getDesignResultHintCopy(status);
  const standingCopy = getDesignCandidateStandingCopy(standing);
  const noticeCopy = notice ? getDesignResultNoticeCopy(notice) : null;
  const availability = resolveDesignResultCardActions({
    state,
    standing,
    canLocate: actions.onLocate != null,
    canRepair: actions.onRepair != null,
    canReachDesign: actions.onAdopt != null && actions.onDiscard != null,
    hasCandidateId: candidateId != null,
  });
  const busy = pendingAction != null;

  return (
    <div
      className="mt-1.5 w-full min-w-0 rounded-lg border border-border/70 bg-card/60 px-2.5 py-2 text-left"
      data-design-result-status={status}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={cn('shrink-0', STATUS_ICONS[status].className)}>
          {STATUS_ICONS[status].icon}
        </span>
        <span className="truncate text-xs font-medium text-foreground">
          {t(statusCopy.key, statusCopy.defaultValue)}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        {t(hintCopy.key, hintCopy.defaultValue)}
      </p>
      {thumbnailImage && thumbnail.status === 'ready' ? (
        // The recorded pixel size goes on the element as well as the stylesheet,
        // so the card reserves the right box before the data URI decodes and
        // never relayouts the conversation under the reader.
        <img
          src={thumbnail.dataUri}
          alt={t('design.result.thumbnailAlt', "Preview of this turn's design")}
          width={thumbnailImage.width}
          height={thumbnailImage.height}
          className="mt-1.5 max-h-40 w-auto max-w-full rounded border border-border/60 bg-muted/30 object-contain"
          data-design-result-thumbnail
        />
      ) : null}
      {outcome?.revisionId || candidateId ? (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
          {outcome?.revisionId ? (
            <code
              title={outcome.revisionId}
              className="max-w-full truncate rounded bg-muted px-1 py-0.5 font-mono"
            >
              {t('design.result.revisionRef', 'Revision {{revisionId}}', {
                revisionId: shortDesignId(outcome.revisionId),
              })}
            </code>
          ) : null}
          {candidateId ? (
            <code
              title={candidateId}
              className="max-w-full truncate rounded bg-muted px-1 py-0.5 font-mono"
            >
              {t('design.result.candidateRef', 'Candidate {{candidateId}}', {
                candidateId: shortDesignId(candidateId),
              })}
            </code>
          ) : null}
        </div>
      ) : null}
      {diagnostics.length > 0 ? (
        <div className="mt-1.5">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            aria-expanded={diagnosticsOpen}
            onClick={() => setDiagnosticsOpen((open) => !open)}
          >
            {diagnosticsOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {diagnosticsOpen
              ? t('design.result.diagnostics.hide', 'Hide diagnostics')
              : t('design.result.diagnostics.show', 'Diagnostics ({{count}})', {
                  count: diagnostics.length,
                })}
          </button>
          {diagnosticsOpen ? (
            <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded border border-border/60 bg-muted/40 p-1.5">
              {diagnostics.map((diagnostic, index) => (
                <li key={`${diagnostic.code}-${index}`} className="text-[10px] leading-snug">
                  <code className="font-mono text-muted-foreground">
                    {redactDesignText(diagnostic.code)}
                  </code>
                  <span className="ml-1 break-words text-foreground/80">
                    {redactDesignText(diagnostic.message)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {candidateId ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t(standingCopy.key, standingCopy.defaultValue)}
        </p>
      ) : null}
      {availability.locate || availability.adopt || availability.discard || availability.repair ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {availability.locate ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              disabled={busy}
              onClick={actions.onLocate}
            >
              <MapPin className="h-3 w-3" />
              {t('design.result.locate', 'Show on canvas')}
            </Button>
          ) : null}
          {confirmingAdopt ? (
            <>
              <span className="text-[11px] text-foreground">
                {t('design.result.adoptConfirm', 'Apply and replace the current canvas?')}
              </span>
              <Button
                type="button"
                size="sm"
                className="h-7 px-2 text-[11px]"
                disabled={busy}
                onClick={() => void handleAdopt()}
              >
                {t('design.result.adoptConfirmAction', 'Apply')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                disabled={busy}
                onClick={() => setConfirmingAdopt(false)}
              >
                {t('design.result.adoptCancel', 'Cancel')}
              </Button>
            </>
          ) : availability.adopt ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              disabled={busy}
              onClick={() => setConfirmingAdopt(true)}
            >
              {t('design.result.adopt', 'Apply')}
            </Button>
          ) : null}
          {availability.discard ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px]"
              disabled={busy}
              onClick={() => void handleDiscard()}
            >
              <Trash2 className="h-3 w-3" />
              {t('design.result.discard', 'Discard')}
            </Button>
          ) : null}
          {availability.repair ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              disabled={busy}
              onClick={() => void handleRepair()}
            >
              <Wand2 className="h-3 w-3" />
              {t('design.result.repair', 'Ask the agent to fix')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {notice && noticeCopy ? (
        <p role="status" className="mt-1.5 text-[11px] text-muted-foreground">
          {t(noticeCopy.key, noticeCopy.defaultValue, noticeCopy.values ?? {})}
        </p>
      ) : null}
    </div>
  );
}
