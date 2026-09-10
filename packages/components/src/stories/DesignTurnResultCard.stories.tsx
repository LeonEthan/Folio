import type { Meta, StoryObj } from '@storybook/react';
import {
  DesignTurnResultCardView,
  type DesignTurnResultCardActions,
} from '@/components/sessions/design-turn-result-card';

/* The card answers one question per user turn of a design session: what did that
   turn produce, and what may the user do about it? Every story injects the store
   answers the card would really receive — that is the whole input surface — and
   renders the real view, so appearance lives in the component. The durable
   statuses come from `designOutcome`; a candidate's standing comes from the
   read-only query, which is why the candidate stories differ only in its answer. */

const sha = (seed: string) => seed.repeat(64).slice(0, 64);
const CANDIDATE_ID = sha('c');
const REVISION_ID = sha('e');
const ARTWORK_ID = 'storybook-artwork';

/** The thumbnail a recorded outcome points at, and the bytes the channel returns
    for it: a real 320x200 PNG, so the story shows what the card really renders
    rather than a placeholder box. */
const THUMBNAIL = { path: `design-thumbnail/${sha('f')}.png`, width: 320, height: 200 };
const THUMBNAIL_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAUAAAADICAIAAAAWZq/8AAAD2klEQVR42u3TMRHAIBQFQZzERywxg5CvIiKoqampIyYi0rxib87CtqtX+PeYyfdaydezw5/rJP9m1wAGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIABBhhggAEGGGCAAQYYYIAB/tMHVrvck9v5hk0AAAAASUVORK5CYII=';

/** The store's candidate answer, as the card receives it (extra fields ignored). */
type CandidateStanding = {
  status?: unknown;
  reason?: unknown;
  revisionId?: unknown;
  baselineRevisionId?: unknown;
  createdAt?: unknown;
};

const outcome = (status: string, extra: Record<string, unknown> = {}) => ({
  version: 1,
  status,
  turnId: 'turn-1',
  artworkId: ARTWORK_ID,
  timestamp: '2026-09-10T00:00:00.000Z',
  ...extra,
});

/** What the design channel answers for a recorded thumbnail reference. */
type ThumbnailAnswer = { status?: unknown; dataUri?: unknown; reason?: unknown };

/** The actions the card would receive from the conversation surface + design IPC. */
function cardActions(
  standing: CandidateStanding,
  thumbnail: ThumbnailAnswer
): DesignTurnResultCardActions {
  return {
    onLocate: () => undefined,
    onRepair: async () => true,
    candidateState: async () => standing,
    onAdopt: async () => ({ status: 'adopted', revisionId: REVISION_ID }),
    onDiscard: async () => ({ removed: true }),
    thumbnail: async () => thumbnail,
  };
}

type StoryProps = {
  outcome: unknown;
  generating?: boolean;
  /** The candidate's answer, when the status is `candidate`. */
  standing?: CandidateStanding;
  /** The thumbnail read's answer, when the outcome carries a reference. */
  thumbnailAnswer?: ThumbnailAnswer;
};

function StoryWrapper({
  outcome: value,
  generating = false,
  standing = { status: 'pending' },
  thumbnailAnswer = { status: 'ok', dataUri: THUMBNAIL_DATA_URI },
}: StoryProps) {
  return (
    <div className="w-[420px]">
      <DesignTurnResultCardView
        outcome={value}
        generating={generating}
        actions={cardActions(standing, thumbnailAnswer)}
      />
    </div>
  );
}

const meta = {
  title: 'Sessions/DesignTurnResultCard',
  component: StoryWrapper,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof StoryWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing recorded yet and the session is working: the only "generating" state. */
export const Generating: Story = {
  args: { outcome: undefined, generating: true },
};

/** The turn's design was written to the canvas. */
export const Committed: Story = {
  args: { outcome: outcome('committed', { revisionId: REVISION_ID }) },
};

/** The same turn, with the preview the desktop rendered for it. */
export const CommittedWithPreview: Story = {
  args: {
    outcome: outcome('committed', { revisionId: REVISION_ID, thumbnail: THUMBNAIL }),
  },
};

/** A recorded reference whose file is gone: the card shows no image and is
    otherwise exactly the same card — a lost preview is never an error. */
export const PreviewUnavailable: Story = {
  args: {
    outcome: outcome('committed', { revisionId: REVISION_ID, thumbnail: THUMBNAIL }),
    thumbnailAnswer: { status: 'unavailable', reason: 'missing' },
  },
};

/** The user saved while the agent worked: the document waits as a candidate. */
export const CandidatePending: Story = {
  args: { outcome: outcome('candidate', { candidateId: CANDIDATE_ID }) },
};

/** The same candidate after the user applied it: the canvas matches it. */
export const CandidateApplied: Story = {
  args: {
    outcome: outcome('candidate', { candidateId: CANDIDATE_ID }),
    standing: { status: 'adopted', revisionId: REVISION_ID },
  },
};

/** Discarded (or otherwise gone): the card says so and offers nothing. */
export const CandidateGone: Story = {
  args: {
    outcome: outcome('candidate', { candidateId: CANDIDATE_ID }),
    standing: { status: 'unavailable', reason: 'missing' },
  },
};

/** A candidate file this build cannot verify is not offered on trust. */
export const CandidateUnreadable: Story = {
  args: {
    outcome: outcome('candidate', { candidateId: CANDIDATE_ID }),
    standing: { status: 'unavailable', reason: 'unreadable' },
  },
};

/** The storage layer rejected the artifact: diagnostics are collapsed, and the
    only repair path is the user asking the agent to fix it. */
export const ArtifactRejected: Story = {
  args: {
    outcome: outcome('invalid', {
      diagnostics: [
        { code: 'Duplicate element IDs', message: 'two elements share the id "title"' },
        { code: 'Missing or unsupported asset', message: 'asset:9f2c is not in the snapshot' },
      ],
    }),
  },
};

/** A rejected artifact with nothing to act on: no diagnostics, no repair. */
export const RejectedWithoutDiagnostics: Story = {
  args: { outcome: outcome('invalid') },
};

/** The turn produced no design.pptd; the canvas is unchanged. */
export const NoArtifact: Story = {
  args: { outcome: outcome('no_artifact') },
};

/** Generation failed before anything could be collected. */
export const Failed: Story = {
  args: { outcome: outcome('failed') },
};

/** The user stopped the turn. */
export const Cancelled: Story = {
  args: { outcome: outcome('cancelled') },
};

/** A payload this build cannot read renders nothing rather than a guess. */
export const UnreadableOutcome: Story = {
  args: { outcome: { version: 99, status: 'committed', turnId: 'turn-1' } },
};
