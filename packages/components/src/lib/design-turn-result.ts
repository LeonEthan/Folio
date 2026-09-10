import {
  sanitizeDesignTurnOutcome,
  type DesignTurnOutcome,
  type DesignTurnOutcomeStatus,
} from '@lody/shared';
import type { TFunction } from 'i18next';

/**
 * Read side of the P2.5 design result card.
 *
 * The card answers one question per user turn of a design session: what did
 * that turn produce, and what may the user do about it? Everything here is pure
 * so the answer is testable without a DOM, a store, or a clock:
 *
 * - `resolveDesignResultCard` sanitizes the durable `designOutcome` (the only
 *   supported read) and decides between a live card, a result card, and nothing.
 * - `resolveDesignCandidateStanding` maps a candidate read to what the card may
 *   honestly offer: only a candidate that still exists and differs from the
 *   canvas can be applied; a missing/unreadable/unknown one offers nothing.
 * - `resolveDesignThumbnail` turns the design channel's answer into the one
 *   image URL the card will render, so a missing or unexpected answer is an
 *   absent picture rather than a broken or substituted one.
 * - `redactDesignText` keeps filesystem paths and credential-looking tokens out
 *   of both the rendered diagnostics and the repair request the agent receives.
 * - `buildDesignRepairRequest` composes the repair turn's text from the status
 *   and the bounded diagnostics, in the product language.
 *
 * No hook or store lives here; the component owns rendering, the caller owns
 * `t`.
 */

/** How many diagnostics may travel in one repair request. */
export const MAX_DESIGN_REPAIR_DIAGNOSTICS = 10;
/** Hard bound on the composed repair request, so one turn cannot carry an essay. */
export const MAX_DESIGN_REPAIR_REQUEST_LENGTH = 4000;

export type DesignResultCardState =
  | { kind: 'none' }
  | { kind: 'live' }
  | { kind: 'result'; outcome: DesignTurnOutcome };

/**
 * What this entry renders.
 *
 * An outcome that this build cannot read — a future `version`, a payload a
 * buggy writer left behind — reads as absent and renders nothing rather than as
 * a broken card. A live card requires that no outcome was recorded at all:
 * claiming "generating" over an outcome we merely cannot parse would be a
 * guess, not a fact.
 */
export const resolveDesignResultCard = (
  rawOutcome: unknown,
  generating: boolean
): DesignResultCardState => {
  const outcome = sanitizeDesignTurnOutcome(rawOutcome);
  if (outcome) return { kind: 'result', outcome };
  if (rawOutcome !== undefined && rawOutcome !== null) return { kind: 'none' };
  return generating ? { kind: 'live' } : { kind: 'none' };
};

/**
 * What the card knows about a kept candidate, as the card renders it.
 *
 * `pending`/`adopted`/`missing`/`unreadable` mirror the store's answer;
 * `loading` is the single read in flight; `unknown` is every other answer,
 * including one this build does not recognize, and offers no action.
 */
export type DesignCandidateStanding =
  | { status: 'loading' }
  | { status: 'pending' }
  | { status: 'adopted' }
  | { status: 'missing' }
  | { status: 'unreadable' }
  | { status: 'unknown' };

/** The subset of the store's candidate-state answer this card consumes. */
type DesignCandidateStateAnswer = {
  status?: unknown;
  reason?: unknown;
};

export const resolveDesignCandidateStanding = (
  answer: DesignCandidateStateAnswer | null | undefined
): DesignCandidateStanding => {
  if (!answer || typeof answer !== 'object') return { status: 'unknown' };
  if (answer.status === 'pending' || answer.status === 'adopted') {
    return { status: answer.status };
  }
  if (answer.status === 'unavailable') {
    if (answer.reason === 'missing') return { status: 'missing' };
    if (answer.reason === 'unreadable') return { status: 'unreadable' };
  }
  return { status: 'unknown' };
};

/**
 * What the card knows about the preview image of a turn's document.
 *
 * `ready` carries the bytes the design channel returned; `none` is every
 * absence — no reference was recorded, the read failed, or the answer was not
 * something this build will put in an `<img>` — and the card renders no image
 * rather than an error, because a missing preview never changes the verdict.
 */
export type DesignThumbnailState =
  | { status: 'loading' }
  | { status: 'ready'; dataUri: string }
  | { status: 'none' };

/**
 * The only image URL this card will render.
 *
 * The reference in the durable outcome and the bytes behind it are produced by
 * this build, but the outcome rides an unvalidated field, so the prefix is
 * pinned to a PNG data URI: whatever arrives, `src` can never become a remote
 * URL, a `blob:`, or another media type. Nothing here re-encodes or resizes —
 * the daemon already bounded the file, and the card lays it out.
 */
const DESIGN_THUMBNAIL_DATA_URI_PREFIX = 'data:image/png;base64,';
/** Matches `MAX_THUMBNAIL_BYTES` after base64 expansion, plus slack. */
const MAX_DESIGN_THUMBNAIL_DATA_URI_LENGTH = 8 * 1024 * 1024;

/** The subset of the design channel's answer this card consumes. */
type DesignThumbnailAnswer = { status?: unknown; dataUri?: unknown };

export const resolveDesignThumbnail = (
  answer: DesignThumbnailAnswer | null | undefined
): DesignThumbnailState => {
  if (!answer || typeof answer !== 'object' || answer.status !== 'ok') return { status: 'none' };
  const { dataUri } = answer;
  if (typeof dataUri !== 'string' || !dataUri.startsWith(DESIGN_THUMBNAIL_DATA_URI_PREFIX)) {
    return { status: 'none' };
  }
  if (dataUri.length > MAX_DESIGN_THUMBNAIL_DATA_URI_LENGTH) return { status: 'none' };
  return { status: 'ready', dataUri };
};

export type DesignResultCardActionAvailability = {
  locate: boolean;
  adopt: boolean;
  discard: boolean;
  repair: boolean;
};

/**
 * Which actions a card state may offer.
 *
 * `locate` is a view action, always available; repair exists only for an
 * artifact the storage layer rejected AND that carried diagnostics to act on —
 * it is never offered for a turn that produced nothing;
 * adopt/discard need a candidate that still exists and a host that can reach
 * the design store, and a candidate the canvas already matches cannot be
 * applied again (`alreadyCurrent` is the store's own answer, not this card's).
 */
export const resolveDesignResultCardActions = ({
  state,
  standing,
  canLocate,
  canRepair,
  canReachDesign,
  hasCandidateId,
}: {
  state: DesignResultCardState;
  standing: DesignCandidateStanding;
  canLocate: boolean;
  canRepair: boolean;
  canReachDesign: boolean;
  hasCandidateId: boolean;
}): DesignResultCardActionAvailability => {
  const candidateActions =
    state.kind === 'result' &&
    state.outcome.status === 'candidate' &&
    hasCandidateId &&
    canReachDesign &&
    (standing.status === 'pending' || standing.status === 'adopted');
  return {
    locate: canLocate,
    adopt: candidateActions && standing.status === 'pending',
    discard: candidateActions,
    repair:
      state.kind === 'result' &&
      state.outcome.status === 'invalid' &&
      canRepair &&
      (state.outcome.diagnostics?.length ?? 0) > 0,
  };
};

/**
 * Drop filesystem paths and credential-looking tokens from text that leaves the
 * app — rendered diagnostics and, more importantly, the repair request handed
 * to a model.
 *
 * The delimiter is part of the match because a path is only a path at a word
 * boundary: `https://host/a/b` and `pages/1/text` survive, `/Users/me/x` and
 * `C:\Users\me\x` do not. Inside a path, a space is absorbed only when a path
 * separator follows the next word (`Library/Application Support/Folio`), so a
 * real macOS or `C:\Users\First Last` path is elided whole while `open /x please
 * retry` keeps its prose. Redaction is deliberately conservative and never the
 * whole message: a validator message stays readable, with its paths elided.
 */
const DESIGN_TEXT_PATH =
  /(^|[\s"'`(=,:;[\]])((?:\/(?:[\w.@+-]+(?:\s+(?=[\w.@+-]+[\\/])[\w.@+-]+)*\/)+[\w.@+-]*)|(?:[A-Za-z]:\\(?:[\w.@+-]+(?:\s+(?=[\w.@+-]+[\\/])[\w.@+-]+)*\\)*[\w.@+-]*))/g;
const DESIGN_TEXT_CREDENTIAL =
  /(?:\b(?:sk|pk|ghp|gho|ghs|ghr|github_pat|xox[abprs])[-_][A-Za-z0-9_-]{8,}|\bBearer\s+[A-Za-z0-9._-]{8,}|\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|secret|password|authorization)\b\s*[:=]\s*(?:(?:Bearer|Basic|Token)\s+)?\S+)/gi;

export const redactDesignText = (text: string): string =>
  text.replace(DESIGN_TEXT_PATH, '$1[path]').replace(DESIGN_TEXT_CREDENTIAL, '[redacted]');

/**
 * The repair turn's text: what failed, plus the bounded diagnostics, in the
 * product language.
 *
 * It is composed here rather than by the model or the caller so the same text
 * reaches the transcript every time, and it is only ever sent because the user
 * asked for it — the card never dispatches it on its own.
 */
export const buildDesignRepairRequest = (outcome: DesignTurnOutcome, t: TFunction): string => {
  const diagnostics = (outcome.diagnostics ?? []).slice(0, MAX_DESIGN_REPAIR_DIAGNOSTICS);
  const lines = [
    t(
      'design.result.repairIntro',
      'The previous turn\u2019s design artifact failed validation and could not be written to the canvas (status: artifact rejected). Please fix the problems below, regenerate design.pptd, and submit it again.'
    ),
  ];
  if (diagnostics.length > 0) {
    lines.push(
      t('design.result.repairHint', 'Bounded diagnostics (up to {{count}}):', {
        count: diagnostics.length,
      })
    );
    diagnostics.forEach((diagnostic, index) => {
      lines.push(
        `${index + 1}. [${redactDesignText(diagnostic.code)}] ${redactDesignText(diagnostic.message)}`
      );
    });
  }
  const request = lines.join('\n');
  return request.length > MAX_DESIGN_REPAIR_REQUEST_LENGTH
    ? `${request.slice(0, MAX_DESIGN_REPAIR_REQUEST_LENGTH - 1)}\u2026`
    : request;
};

/**
 * A content address is 64 hex characters: long enough to be unreadable in a
 * card. The card shows this prefix and keeps the full value in the element's
 * `title`, so the id is still there to check against the store.
 */
export const shortDesignId = (id: string): string => (id.length > 12 ? `${id.slice(0, 12)}…` : id);

/** A copy triplet resolved by the renderer through `t(key, default, values)`. */
export type DesignResultCopy = {
  key: string;
  defaultValue: string;
  values?: Record<string, string | number>;
};

export type DesignResultStatus = DesignTurnOutcomeStatus | 'live';

const STATUS_COPY: Record<DesignResultStatus, DesignResultCopy> = {
  live: { key: 'design.result.live', defaultValue: 'Generating' },
  committed: { key: 'design.result.status.committed', defaultValue: 'Committed' },
  candidate: { key: 'design.result.status.candidate', defaultValue: 'Candidate kept' },
  invalid: { key: 'design.result.status.invalid', defaultValue: 'Artifact rejected' },
  no_artifact: { key: 'design.result.status.no_artifact', defaultValue: 'No artifact' },
  failed: { key: 'design.result.status.failed', defaultValue: 'Failed' },
  cancelled: { key: 'design.result.status.cancelled', defaultValue: 'Cancelled' },
};

const HINT_COPY: Record<DesignResultStatus, DesignResultCopy> = {
  live: {
    key: 'design.result.liveHint',
    defaultValue: "The agent is working on this turn's design; the result will show up here.",
  },
  committed: {
    key: 'design.result.hint.committed',
    defaultValue: "This turn's design was saved to the canvas.",
  },
  candidate: {
    key: 'design.result.hint.candidate',
    defaultValue:
      "You saved the canvas while the agent was working, so this turn's design was kept as a candidate instead of overwriting it.",
  },
  invalid: {
    key: 'design.result.hint.invalid',
    defaultValue:
      'The artifact failed the storage-layer structure check. It was not written to the canvas and was not repaired.',
  },
  no_artifact: {
    key: 'design.result.hint.no_artifact',
    defaultValue: 'This turn produced no design.pptd; the canvas is unchanged.',
  },
  failed: {
    key: 'design.result.hint.failed',
    defaultValue: 'This turn failed before an artifact could be collected.',
  },
  cancelled: {
    key: 'design.result.hint.cancelled',
    defaultValue: 'This turn was stopped; nothing was collected or written.',
  },
};

const CANDIDATE_STANDING_COPY: Record<DesignCandidateStanding['status'], DesignResultCopy> = {
  loading: { key: 'design.result.candidate.loading', defaultValue: 'Reading candidate state…' },
  pending: {
    key: 'design.result.candidate.pending',
    defaultValue: 'Not applied: the canvas currently differs from this candidate.',
  },
  adopted: {
    key: 'design.result.candidate.adopted',
    defaultValue: 'Applied: the canvas matches this candidate.',
  },
  missing: {
    key: 'design.result.candidate.missing',
    defaultValue: 'This candidate was discarded or no longer exists; there is nothing to do here.',
  },
  unreadable: {
    key: 'design.result.candidate.unreadable',
    defaultValue: 'This candidate file cannot be read, so it cannot be applied.',
  },
  unknown: {
    key: 'design.result.candidate.unavailable',
    defaultValue: 'The candidate state could not be read.',
  },
};

/** What the card says after an action settled. */
export type DesignResultNotice =
  | { kind: 'adopted'; revisionId: string }
  | { kind: 'alreadyCurrent' }
  | { kind: 'refused' }
  | { kind: 'discarded' }
  | { kind: 'discardMissing' }
  | { kind: 'repairSent' }
  | { kind: 'repairBlocked' }
  | { kind: 'failed' };

export const getDesignResultStatusCopy = (status: DesignResultStatus): DesignResultCopy =>
  STATUS_COPY[status];

export const getDesignResultHintCopy = (status: DesignResultStatus): DesignResultCopy =>
  HINT_COPY[status];

export const getDesignCandidateStandingCopy = (
  standing: DesignCandidateStanding
): DesignResultCopy => CANDIDATE_STANDING_COPY[standing.status];

export const getDesignResultNoticeCopy = (notice: DesignResultNotice): DesignResultCopy => {
  switch (notice.kind) {
    case 'adopted':
      return {
        key: 'design.result.notice.adopted',
        defaultValue: 'Applied: the canvas now shows the candidate (revision {{revisionId}}).',
        values: { revisionId: shortDesignId(notice.revisionId) },
      };
    case 'alreadyCurrent':
      return {
        key: 'design.result.notice.alreadyCurrent',
        defaultValue: 'The canvas already matched this candidate; no new revision was written.',
      };
    case 'refused':
      return {
        key: 'design.result.notice.refused',
        defaultValue:
          'The canvas changed again after your confirmation, so nothing was overwritten. The candidate is still kept.',
      };
    case 'discarded':
      return {
        key: 'design.result.notice.discarded',
        defaultValue: 'Candidate discarded; the canvas is unchanged.',
      };
    case 'discardMissing':
      return {
        key: 'design.result.notice.discardMissing',
        defaultValue: 'The candidate was already gone; the canvas is unchanged.',
      };
    case 'repairSent':
      return { key: 'design.result.notice.repairSent', defaultValue: 'Repair request sent.' };
    case 'repairBlocked':
      return {
        key: 'design.result.notice.repairBlocked',
        defaultValue:
          'The repair request could not be sent; the canvas and your draft are unchanged.',
      };
    case 'failed':
      return {
        key: 'design.result.notice.failed',
        defaultValue: 'The action failed; nothing was changed.',
      };
  }
  // Every notice a card can hold is cased above; this keeps the return total if
  // a new one is added without a copy, instead of rendering an empty string.
  return assertNever(notice);
};

function assertNever(value: never): never {
  throw new Error(`Unhandled design result notice: ${String(value)}`);
}

/** The statuses the card renders, shared with the outcome vocabulary. */
export const DESIGN_RESULT_STATUSES: readonly DesignTurnOutcomeStatus[] = [
  'committed',
  'candidate',
  'invalid',
  'no_artifact',
  'failed',
  'cancelled',
];
