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

/** The actions the card would receive from the conversation surface + design IPC. */
function cardActions(standing: CandidateStanding): DesignTurnResultCardActions {
  return {
    onLocate: () => undefined,
    onRepair: async () => true,
    candidateState: async () => standing,
    onAdopt: async () => ({ status: 'adopted', revisionId: REVISION_ID }),
    onDiscard: async () => ({ removed: true }),
  };
}

type StoryProps = {
  outcome: unknown;
  generating?: boolean;
  /** The candidate's answer, when the status is `candidate`. */
  standing?: CandidateStanding;
};

function StoryWrapper({
  outcome: value,
  generating = false,
  standing = { status: 'pending' },
}: StoryProps) {
  return (
    <div className="w-[420px]">
      <DesignTurnResultCardView
        outcome={value}
        generating={generating}
        actions={cardActions(standing)}
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
